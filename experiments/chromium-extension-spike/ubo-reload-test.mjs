import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('./ubo-reload-guard.js',import.meta.url),'utf8');
async function guard(fetch){
 const code=source.replaceAll('export async function','async function');
 return vm.runInNewContext(`(async()=>{${code};return {begin,complete,activate};})()`,{fetch});
}
test('startup release requires successful list completion and observer activation',async()=>{
 const calls=[];const g=await guard(async url=>{calls.push(url);return {status:204};});
 assert.deepEqual(calls,['http://blanc-ubo-control.invalid/begin?1']);
 await g.activate(false);assert.equal(calls.length,1);
 await g.begin();await g.complete();assert.equal(calls.at(-1),'http://blanc-ubo-control.invalid/ready?2');
});
test('list completion before activation cannot release startup',async()=>{
 const calls=[];const g=await guard(async url=>{calls.push(url);return {status:204};});
 await g.complete();assert.equal(calls.length,1);await g.activate(false);assert.equal(calls.at(-1),'http://blanc-ubo-control.invalid/ready?1');
});
test('failed acknowledgement rejects before caller can reset engine',async()=>{
 await assert.rejects(guard(async()=>({status:403})),/acknowledgement refused/);
});
test('reload begin waits for browser acknowledgement',async()=>{
 let ack;let n=0;const g=await guard(()=>++n===1?Promise.resolve({status:204}):new Promise(r=>{ack=r;}));
 let reset=false;const task=g.begin().then(()=>{reset=true;});await Promise.resolve();assert.equal(reset,false);ack({status:204});await task;assert.equal(reset,true);
});
