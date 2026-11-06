import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListResourcesRequestSchema, ReadResourceRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { createAnalyzer } from './analyze.mjs';
import { createReceipt } from './evidence.mjs';
const analyze = createAnalyzer();
const receipts = new Map();
let bytes=0;
const prefix='ruv://readme-proof/evidence/';
const server=new McpServer({name:'readme-proof',version:'0.1.0-next.1'},{capabilities:{resources:{}}});
const shape={markdown:z.string().max(1048576),target:z.enum(['npm','github']).optional(),files:z.array(z.string().max(2048)).max(10000).optional()};
function run({markdown,...options},plan=false){
 const report=analyze(markdown,options),receipt=createReceipt(report,markdown),text=JSON.stringify(receipt),size=Buffer.byteLength(text);
 if(!receipts.has(receipt.id)&&size<=4194304){while(receipts.size&&(receipts.size>=32||bytes+size>4194304)){const key=receipts.keys().next().value;bytes-=Buffer.byteLength(receipts.get(key));receipts.delete(key);}receipts.set(receipt.id,text);bytes+=size;}
 return {content:[{type:'text',text:JSON.stringify(plan?{commands:report.commands,executed:false,evidenceUri:prefix+receipt.id}:{...receipt,evidenceUri:prefix+receipt.id})}]};
}
server.registerTool('readme_analyze',{description:'Statically inspect README text; never execute commands or fetch URLs.',inputSchema:shape},args=>run(args));
server.registerTool('readme_plan',{description:'Extract commands for human review; does not execute them.',inputSchema:shape},args=>run(args,true));
server.server.setRequestHandler(ListResourcesRequestSchema,async()=>({resources:[...receipts.keys()].map(id=>({uri:prefix+id,name:id,mimeType:'application/json'}))}));
server.server.setRequestHandler(ReadResourceRequestSchema,async({params})=>{const id=params.uri.slice(prefix.length);if(!params.uri.startsWith(prefix)||!/^[a-f0-9]{64}$/.test(id)||!receipts.has(id))throw new Error('Unknown or expired evidence resource');return {contents:[{uri:params.uri,mimeType:'application/json',text:receipts.get(id)}]};});
await server.connect(new StdioServerTransport());
