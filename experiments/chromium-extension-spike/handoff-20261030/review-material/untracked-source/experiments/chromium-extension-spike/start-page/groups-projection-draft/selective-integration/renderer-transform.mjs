// Isolated proof of a hash-bound in-memory transform for the exact tested
// 158 combined-base renderer. This is not wired into prepare.mjs.
import {createHash} from 'node:crypto';
const expected={input:'ab12f106b14675816316de3ec99e22fc4d9720ff5767feb1cc6129264091fddb',patch:'c6ca45a078ea0d8bf71d7d8a8486f3694a746d8b03ee768b595f1694cf71baca',output:'d986a76148ede29bfc3429f03c9557238ac88f5a37471b6f8e4f8337dc5f9f89'};
const hash=s=>createHash('sha256').update(s).digest('hex');
export function transformRenderer(source,patch) {
 if(typeof source!=='string'||typeof patch!=='string'||hash(source)!==expected.input||hash(patch)!==expected.patch)throw Error('renderer or patch identity mismatch');
 const split=s=>s.match(/[^\n]*\n|[^\n]+$/g)||[];
 const input=split(source),lines=split(patch),out=[];
 if(lines.shift()!=='--- a/pages/newtab.js\n'||lines.shift()!=='+++ b/pages/newtab.js\n')throw Error('unexpected patch target');
 let cursor=0,hunks=0;
 while(lines.length){
  const header=lines.shift(),m=/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(?:.*)\n$/.exec(header||'');
  if(!m)throw Error('invalid patch hunk');
  const oldStart=Number(m[1])-1,oldCount=Number(m[2]??1),newStart=Number(m[3])-1,newCount=Number(m[4]??1);
  if(oldStart<cursor||oldStart>input.length)throw Error('invalid source range');
  out.push(...input.slice(cursor,oldStart));cursor=oldStart;
  if(out.length!==newStart)throw Error('invalid target range');
  let oldUsed=0,newUsed=0;
  while(lines.length&&!lines[0].startsWith('@@ ')){
   const line=lines.shift(),op=line[0],value=line.slice(1);
   if(![' ','-','+'].includes(op))throw Error('unsupported patch operation');
   if(op!=='+'&&(cursor>=input.length||input[cursor]!==value))throw Error('patch context mismatch');
   if(op!=='+' ){cursor++;oldUsed++;}
   if(op!=='-'){out.push(value);newUsed++;}
  }
  if(oldUsed!==oldCount||newUsed!==newCount)throw Error('patch hunk count mismatch');
  hunks++;
 }
 if(!hunks)throw Error('empty patch');out.push(...input.slice(cursor));const result=out.join('');
 if(hash(result)!==expected.output)throw Error('renderer output identity mismatch');
 return result;
}
