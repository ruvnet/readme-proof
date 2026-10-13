// Downloaded code piped, substituted or evaluated into an interpreter, plus destructive commands.
const fetcher='(?:curl|wget)\\b';
const dangerPatterns=[
  new RegExp('\\b'+fetcher+'[^\\n]*\\|\\s*(?:sudo\\s+)?(?:sh|bash|zsh|python3?|perl|ruby|node)\\b','i'),
  new RegExp('[$<]\\(\\s*'+fetcher,'i'),
  /\b(?:iex|Invoke-Expression)\b[^\n]*\b(?:irm|iwr|Invoke-RestMethod|Invoke-WebRequest|DownloadString)\b/i,
  /\b(?:irm|iwr|Invoke-RestMethod|Invoke-WebRequest)\b[^\n]*\|\s*(?:iex|Invoke-Expression)\b/i,
  /\b(?:rm\s+(?:-[a-zA-Z]*[rf][a-zA-Z]*\s+)+|git\s+(?:reset\s+--hard|clean\s+-[a-zA-Z]*f)|(?:sudo\s+)?mkfs\b|Remove-Item\b.*-Recurse|del\s+\/s)/i,
];
const dangerous=command=>dangerPatterns.some(pattern=>pattern.test(command));
// Blank out inline code spans so `![x](y)` examples in prose are not treated as resources.
function maskInlineCode(line) {
  if(!line.includes('`'))return line;
  let out='',i=0;
  while(i<line.length){
    if(line[i]!=='`'){out+=line[i++];continue;}
    let k=i;while(k<line.length&&line[k]==='`')k++;
    const run=line.slice(i,k);let j=k,end=-1;
    while((j=line.indexOf(run,j))!==-1){let e=j+run.length;if(line[e]!=='`'&&line[j-1]!=='`'){end=e;break;}while(line[e]==='`')e++;j=e;}
    if(end===-1){out+=run;i=k;continue;}
    out+=line.slice(i,end).replace(/[^\n]/g,' ');i=end;
  }
  return out;
}
/** Static README checks. No commands, files or URLs are executed or fetched. */
export function analyze(markdown, options = {}) {
  if (typeof markdown !== 'string' || new TextEncoder().encode(markdown).length > 1048576) throw new TypeError('README must be text at most 1 MiB');
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw new TypeError('Invalid options');
  const target = options.target ?? 'npm';
  if (!['npm','github'].includes(target)) throw new TypeError('Invalid target');
  const hasFiles = Object.hasOwn(options, 'files');
  const files = options.files ?? [];
  if (!Array.isArray(files) || files.length > 10000 || files.some(f => typeof f !== 'string' || f.length > 2048)) throw new TypeError('Invalid file inventory');
  const inventory = new Set(files.map(f=>f.replace(/^\.\//,'')));
  const findings=[], commands=[], lines=markdown.split(/\r?\n/);
  const add=(rule,severity,line,message,destination)=>{if(findings.length<500)findings.push({rule,severity,line,message,...(destination===undefined?{}:{target:destination})});};
  const references=new Map(), proseLines=[];
  let fence=null;
  // References are collected outside fenced code, including definitions after usage.
  for(const line of lines) {
    const f=line.match(/^\s{0,3}(`{3,}|~{3,})(.*)$/);
    if(f){if(!fence)fence={char:f[1][0],length:f[1].length};else if(f[1][0]===fence.char&&f[1].length>=fence.length&&!f[2].trim())fence=null;proseLines.push('');continue;}
    if(fence){proseLines.push('');continue;}
    proseLines.push(line);
    const ref=line.match(/^\s{0,3}\[([^\[\]]+)\]:\s*(?:<([^>]+)>|(\S+))/);
    if(ref)references.set(ref[1].trim().replace(/\s+/g,' ').toLowerCase(),ref[2]??ref[3]);
  }
  // A code span can cross a soft line break, but not a paragraph or fenced block.
  const maskedLines=proseLines.join('\n').split(/(\n(?:[ \t]*\n)+)/).map((part,i)=>i%2?part:maskInlineCode(part)).join('').split('\n');
  fence=null; let install=false;
  const check=(url,line,image)=>{
    const value=url.trim();
    if(/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(value))return;
    const path=value.split(/[?#]/,1)[0].replace(/^\.\//,'');
    if(image && target==='npm')add('npm-relative-image','error',line,'Use an absolute public image URL for npm README rendering.',value);
    let decoded=path;try{decoded=decodeURIComponent(path);}catch{}
    if(hasFiles && path && !inventory.has(path) && !inventory.has(decoded))add('missing-local-file','warning',line,'Relative resource is absent from the supplied file inventory.',value);
  };
  for(let i=0;i<lines.length;i++) {
    const line=lines[i], n=i+1, f=line.match(/^\s{0,3}(`{3,}|~{3,})(.*)$/);
    if(f){
      if(!fence)fence={char:f[1][0],length:f[1].length,line:n,language:f[2].trim().split(/\s/)[0].toLowerCase()};
      else if(f[1][0]===fence.char&&f[1].length>=fence.length&&!f[2].trim())fence=null;
      continue;
    }
    if(/\b(?:quick\s*start|install(?:ation)?|getting started|npm\s+(?:i|install)|pip(?:3)?\s+install|cargo\s+(?:add|install))\b/i.test(line))install=true;
    if(fence) {
      const shell=['sh','bash','shell','zsh','console','powershell','ps1','cmd'].includes(fence.language);
      // Unlabeled fences are often shell too: scan them for dangerous commands without listing every line.
      if((shell||fence.language==='')&&line.trim()&&!/^\s*#/.test(line)) {
        const command=line.trim().replace(/^\$\s+/,''), danger=dangerous(command);
        if(!shell&&!danger)continue;
        if(commands.length<500)commands.push({line:n,language:fence.language,command,risk:danger?'high':'review'});
        if(danger)add('dangerous-command','warning',n,'Command may execute downloaded code or destroy data. Review manually; never executed.');
      }
      continue;
    }
    const prose=maskedLines[i];
    for(const match of prose.matchAll(/(!?)\[[^\[\]]*\]\(\s*(?:<([^>]+)>|([^\s()\[\]<>]+))(?:\s+[^()\[\]]*)?\)/g))check(match[2]??match[3],n,match[1]==='!');
    for(const match of prose.matchAll(/!\[([^\[\]]*)\](?:\[([^\[\]]*)\])?(?!\()/g)) {
      const key=(match[2]||match[1]).trim().replace(/\s+/g,' ').toLowerCase();
      if(references.has(key))check(references.get(key),n,true);
      else add('unresolved-image-reference','warning',n,'Image reference has no definition.',key);
    }
    for(const match of prose.matchAll(/<img\b[^<>]*\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^<>]*>/gi))check(match[1]??match[2]??match[3],n,true);
  }
  if(fence)add('unclosed-fence','error',fence.line,'Code fence is not closed.');
  if(!install)add('missing-quickstart','warning',1,'Add installation or quickstart instructions.');
  return {schemaVersion:1,summary:{errors:findings.filter(f=>f.severity==='error').length,warnings:findings.filter(f=>f.severity==='warning').length},findings,commands};
}

/** Bounded LRU cache. Values are defensively cloned; keys never leave memory. */
export function createAnalyzer({ maxEntries = 32, maxBytes = 4 * 1024 * 1024 } = {}) {
  if (!Number.isInteger(maxEntries) || maxEntries < 1 || maxEntries > 128 || !Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > 16 * 1024 * 1024) throw new TypeError('Invalid cache limits');
  const cache = new Map(); let retained = 0;
  const encoder = new TextEncoder();
  return function cachedAnalyze(markdown, options = {}) {
    // Validation must still happen on hits; invalid options never collide with defaults.
    if(typeof markdown!=='string'||encoder.encode(markdown).length>1048576||!options||typeof options!=='object'||Array.isArray(options))return analyze(markdown,options);
    const target=options.target??'npm';
    const files=options.files??[];
    if(!['npm','github'].includes(target)||!Array.isArray(files)||files.length>10000||files.some(f=>typeof f!=='string'||f.length>2048))return analyze(markdown,options);
    const normalized={target,...(Object.hasOwn(options,'files')?{files:[...new Set(files.map(f=>f.replace(/^\.\//,'')))].sort()}: {})};
    const key=JSON.stringify([markdown,normalized]);
    if(cache.has(key)){const entry=cache.get(key);cache.delete(key);cache.set(key,entry);return structuredClone(entry.result);}
    const result=analyze(markdown,normalized);
    const size=encoder.encode(key).length+encoder.encode(JSON.stringify(result)).length;
    if(size<=maxBytes){
      while(cache.size>=maxEntries||retained+size>maxBytes){const oldest=cache.keys().next().value;retained-=cache.get(oldest).size;cache.delete(oldest);}
      cache.set(key,{result,size});retained+=size;
    }
    return structuredClone(result);
  };
}
