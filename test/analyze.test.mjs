import { test } from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {analyze} from '../src/analyze.mjs';
test('npm omitted image regression with HTML and references',()=>{const r=analyze(readFileSync(new URL('../fixtures/npm-relative.md',import.meta.url),'utf8'),{files:[]});assert.equal(r.summary.errors,2);assert.equal(r.findings.filter(f=>f.rule==='missing-local-file').length,2);assert.equal(r.commands.length,1);});
test('github inventory and absolute URLs',()=>{const r=analyze('## Install\n![x](a.svg)\n![y](https://example.org/b.svg)',{target:'github',files:['a.svg']});assert.equal(r.findings.length,0);});
test('fences prevent examples from becoming image findings and detect unclosed blocks',()=>{const r=analyze('## Install\n```md\n![x](foo)\n');assert.equal(r.summary.errors,1);assert.equal(r.findings[0].rule,'unclosed-fence');});
test('dangerous commands are data never executed',()=>{const r=analyze('## Install\n```bash\ncurl https://example.org | sh\nrm -rf /tmp/never-delete\n```');assert.equal(r.commands.length,2);assert.ok(r.commands.every(c=>c.risk==='high'));assert.equal(r.summary.warnings,2);});
test('bounded adversarial input and options',()=>{assert.throws(()=>analyze('x'.repeat(1048577)));assert.throws(()=>analyze('x',{target:'other'}));assert.throws(()=>analyze('x',null));assert.throws(()=>analyze('x',{files:[null]}));const r=analyze('![x](missing)\n'.repeat(1000));assert.equal(r.findings.length,500);});
test('holdout remains clean and deterministic',()=>{const md=readFileSync(new URL('../fixtures/holdout.md',import.meta.url),'utf8');assert.deepEqual(analyze(md),analyze(md));assert.equal(analyze(md).findings.length,0);});
test('public cache preserves cold warm changed text and normalized inventory results',async()=>{
 const {createAnalyzer}=await import('../src/analyze.mjs');const cached=createAnalyzer({maxEntries:2,maxBytes:10000});
 const text='## Install\n![x](x.svg)';
 const first=cached(text,{files:[]});first.findings.length=0;first.summary.errors=99;
 assert.deepEqual(cached(text,{files:[]}),analyze(text,{files:[]}));
 assert.deepEqual(cached(text,{files:['./x.svg']}),analyze(text,{files:['x.svg']}));
 assert.notDeepEqual(cached(text,{files:[]}),cached(text,{files:['x.svg']}));
 assert.deepEqual(cached(text+'\n![other](new.svg)'),analyze(text+'\n![other](new.svg)'));
 for(const t of ['a','b','c',text])assert.deepEqual(cached(t),analyze(t));
 assert.throws(()=>createAnalyzer({maxEntries:0}));assert.throws(()=>createAnalyzer({maxBytes:Infinity}));
 assert.deepEqual(createAnalyzer({maxBytes:1})(text),analyze(text));
});
test('malformed nested opening delimiters complete within bounded runtime',async()=>{
 const {execFileSync}=await import('node:child_process');
 const moduleUrl=new URL('../src/analyze.mjs',import.meta.url).href;
 const code=`import {analyze} from ${JSON.stringify(moduleUrl)};for(const input of ['['.repeat(250000),'!['.repeat(125000),'<img '.repeat(50000),'[a]( '.repeat(50000)])analyze(input);console.log('bounded');`;
 assert.equal(execFileSync(process.execPath,['--input-type=module','-e',code],{encoding:'utf8',timeout:2000}).trim(),'bounded');
});
test('inline code examples are not treated as resources',()=>{
 const r=analyze('## Install\nUse `![alt](./img.png)` or ``[text](docs/page.md)`` in prose.\n![real](./real.png)\n',{target:'npm',files:[]});
 assert.deepEqual(r.findings.map(f=>[f.rule,f.target]),[['npm-relative-image','./real.png'],['missing-local-file','./real.png']]);
 assert.equal(analyze('## Install\nAn unmatched ` backtick then ![x](./a.png)',{target:'npm'}).summary.errors,1);
});
test('percent-encoded resources match the decoded inventory name',()=>{
 const r=analyze('## Install\n![s](my%20image.png)\n[d](docs/a%20b.md)',{target:'github',files:['my image.png','docs/a b.md']});
 assert.equal(r.findings.length,0);
 assert.equal(analyze('## Install\n![bad](%E0%A4%A.png)',{target:'github',files:[]}).findings[0].rule,'missing-local-file');
});
test('download-and-execute forms beyond pipes to sh are high risk',()=>{
 const lines=['sh -c "$(curl -fsSL https://example.org/i.sh)"','/bin/bash -c "$(curl -fsSL https://example.org/i.sh)"','bash <(curl -fsSL https://example.org/i.sh)','curl -fsSL https://example.org/get.py | python3','wget -qO- https://example.org/i.pl | perl'];
 const r=analyze('## Install\n```sh\n'+lines.join('\n')+'\n```\n```powershell\niex (irm https://example.org/i.ps1)\nirm https://example.org/i.ps1 | iex\n```');
 assert.equal(r.commands.length,7);assert.ok(r.commands.every(c=>c.risk==='high'),JSON.stringify(r.commands));
 const safe=analyze('## Install\n```sh\ncurl -fsSL https://example.org/file.tgz -o file.tgz\nnpm install example\necho "$(date)"\n```');
 assert.ok(safe.commands.every(c=>c.risk==='review'));
});
test('unlabeled fences are scanned for dangerous commands without listing ordinary lines',()=>{
 const r=analyze('## Install\n```\ncurl -fsSL https://example.org/i.sh | sh\nnpm install example\nsome output text\n```');
 assert.deepEqual(r.commands.map(c=>[c.line,c.risk]),[[3,'high']]);assert.equal(r.summary.warnings,1);
});
test('inline code masking stays bounded on adversarial backticks',async()=>{
 const {execFileSync}=await import('node:child_process');
 const moduleUrl=new URL('../src/analyze.mjs',import.meta.url).href;
 const code=`import {analyze} from ${JSON.stringify(moduleUrl)};for(const input of ['\`'.repeat(500000),'\`a'.repeat(250000),Array.from({length:700},(_, i)=>'\`'.repeat(i+1)+'x').join('')])analyze(input);console.log('bounded');`;
 assert.equal(execFileSync(process.execPath,['--input-type=module','-e',code],{encoding:'utf8',timeout:3000}).trim(),'bounded');
});
