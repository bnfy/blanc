import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createDeliveryBarrier} from './ubo-static-delivery.mjs';
const source=fs.readFileSync(new URL('./ubo-reload-guard.js',import.meta.url),'utf8');
async function guard(fetch,staticDeliveries=createDeliveryBarrier()){
 const code=source.replace(/^import .*;\n/gm,'').replaceAll('export ', '');
 return vm.runInNewContext(`(async()=>{${code};return {begin,complete,activate,current};})()`,{fetch,staticDeliveries});
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

test('document payload availability is revoked before reset and restored after acknowledgement',async()=>{
 const g=await guard(async()=>({status:204}));assert.equal(g.current().ready,false);
 await g.activate(true);assert.equal(g.current().ready,true);
 await g.begin();assert.equal(g.current().ready,false);assert.equal(g.current().generation,2);
 await g.complete();assert.equal(g.current().ready,true);
});

test('engine reset and ready wait for dispatch drain; timeout keeps ready false',async()=>{
 const b=createDeliveryBarrier(10),calls=[],g=await guard(async url=>{calls.push(url);return {status:204};},b);
 await g.activate(true);const sender={id:'provider',documentId:'doc'},token=b.acquire(sender);let reset=false;
 await assert.rejects(g.begin().then(()=>{reset=true;}),/remains held/);assert(!reset);assert.equal(g.current().ready,false);assert(calls.filter(x=>!x.includes('/delivery-document?')).at(-1).includes('/begin?'));
 await assert.rejects(g.complete(),/remains held/);assert.equal(g.current().ready,false);assert(!calls.at(-1).includes('/ready?'));
 b.acknowledge(token,sender);await g.begin();await g.complete();assert.equal(g.current().ready,true);
});

test('overlapping begin is rejected and stale completion cannot release newer epoch',async()=>{
 const b=createDeliveryBarrier(1000),g=await guard(async()=>({status:204}),b);await g.activate(true);
 const sender={id:'provider',documentId:'doc'},token=b.acquire(sender),first=g.begin();
 await assert.rejects(g.begin(),/already pending/);await assert.rejects(g.complete(),/Superseded/);
 b.acknowledge(token,sender);const old=await first;await g.begin();await assert.rejects(g.complete(old),/Superseded/);assert.equal(g.current().ready,false);
 await g.complete();assert(g.current().ready);
});
test('only exact destroyed-document reply can retire a verified lease',async()=>{
 for(const reply of [{documentId:'doc',exists:false},{documentId:'other',exists:false},{documentId:'doc',exists:true},{documentId:'doc'},null]){
  const b=createDeliveryBarrier(5);const g=await guard(async url=>url.includes('/delivery-document?')?{status:200,json:async()=>reply}:{status:204},b);
  const sender={id:'provider',documentId:'doc'};b.acquire(sender);
  if(reply?.documentId==='doc'&&reply.exists===false){await g.begin();assert.equal(b.size(),0);}else {await assert.rejects(g.begin(),/remains held/);assert.equal(b.size(),1);}
 }
});
