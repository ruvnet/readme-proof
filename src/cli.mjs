#!/usr/bin/env node
import { readSync,writeFileSync,realpathSync,openSync,closeSync,fstatSync,constants,lstatSync,existsSync } from 'node:fs';
import {resolve,parse,dirname} from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyze } from './analyze.mjs';
const safe=s=>String(s).replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g,'');
function readBounded(path) {
  const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  try{const stat=fstatSync(fd);if(!stat.isFile()||stat.size>1048576)throw Error('Input exceeds bound');const data=Buffer.alloc(1048577);let size=0;while(size<data.length){const count=readSync(fd,data,size,data.length-size,null);if(!count)break;size+=count;}if(size>1048576)throw Error('Input exceeds bound');return data.subarray(0,size).toString('utf8');}finally{closeSync(fd);}
}
// macOS ships /tmp, /var and /etc as symlinks into /private, so refusing every symlink
// refused every temp path. Only root can own a symlink, so a root-owned link in a
// root-owned directory nobody else can write is the OS's, not one a user planted.
function systemSymlink(path,stat){if(stat.uid!==0)return false;const parent=lstatSync(dirname(path));return parent.uid===0&&(parent.mode&0o022)===0;}
function writeOutput(path,value) {
  const absolute=resolve(path);let current=parse(absolute).root;
  for(const component of absolute.slice(current.length).split('/').filter(Boolean)){current=resolve(current,component);if(!existsSync(current))continue;const stat=lstatSync(current);if(stat.isSymbolicLink()&&!systemSymlink(current,stat))throw Error('Output symlink');}
  writeFileSync(absolute,value,{flag:'wx',mode:0o600});
}
export function main(args) {
  if(!args.length||args[0]==='--help'){console.log('readme-proof analyze|tui|plan README [--target npm|github] [--files inventory.json] [--json] [--out FILE]\nStatic inspection only. README commands are never executed.');return 0;}
  const [command,path,...rest]=args;
  if(!['analyze','tui','plan'].includes(command)||!path||path.startsWith('--'))throw Error('Invalid command or README path');
  const opts={},flags={};
  for(let i=0;i<rest.length;i++){const k=rest[i];if(!['--target','--files','--json','--out'].includes(k)||Object.hasOwn(flags,k))throw Error('Invalid or repeated option');flags[k]=k==='--json'?true:rest[++i];if(flags[k]===undefined)throw Error('Missing option value');}
  if(flags['--target'])opts.target=flags['--target'];
  if(flags['--files'])opts.files=JSON.parse(readBounded(flags['--files']));
  const result=analyze(readBounded(path),opts);
  let output;
  if(command==='plan')output=JSON.stringify({schemaVersion:1,status:'requires-review',executesCommands:false,steps:result.findings.map(f=>({line:f.line,rule:f.rule,action:f.message})),commandsForManualReview:result.commands},null,2);
  else if(flags['--json'])output=JSON.stringify(result,null,2);
  else output=[`README PROOF | ${result.summary.errors} errors | ${result.summary.warnings} warnings`,...result.findings.map(f=>`${f.severity.toUpperCase()} L${f.line} ${f.rule}: ${f.message}${f.target?' '+f.target:''}`),'Static inspection only. Commands were not executed.'].map(safe).join('\n');
  if(flags['--out'])writeOutput(flags['--out'],output+'\n');else console.log(output);
  return result.summary.errors?1:0;
}
let direct=false;try{direct=!!process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url);}catch{}
if(direct){try{process.exitCode=main(process.argv.slice(2));}catch{console.error('readme-proof failed: check input, options, inventory or output collision.');process.exitCode=2;}}
