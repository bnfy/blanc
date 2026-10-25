'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const modulePromise=import(`data:text/javascript;base64,${fs.readFileSync(require.resolve('../../cloudflare/sync-worker/src/index.js')).toString('base64')}`);
const account='a'.repeat(64),sid=n=>'space-'+n.toString(16).padStart(32,'0');
function state(){const values=new Map();return {storage:{get:async k=>structuredClone(values.get(k)),put:async(k,v)=>values.set(k,structuredClone(v)),deleteAll:async()=>values.clear()}};}
async function environment(vars={}) {
 const mod=await modulePromise,records=new Map(),objects=new Map();
 const env={ACCOUNT_STORAGE_QUOTA_BYTES:'1000',ACCOUNT_STORAGE_MAX_STORES:'2',NEW_ACCOUNT_DAILY_LIMIT:'10',...vars,SYNC:{
  get:async(k,o)=>{const v=records.get(k)??null;return v&&o?.type==='json'?JSON.parse(v):v;},
  put:async(k,v)=>records.set(k,String(v)),delete:async k=>records.delete(k),
  list:async({prefix=''})=>({keys:[...records.keys()].filter(k=>k.startsWith(prefix)).map(name=>({name})),list_complete:true}),
 }};
 env.ACCOUNT_QUOTA={idFromName:name=>name,get:id=>({fetch:(url,init)=>{let row=objects.get(id);if(!row){row=new mod.AccountQuota(state(),env);objects.set(id,row);}return row.fetch(new Request(url,init));}})};
 return {worker:mod.default,env,records};
}
const put=(h,store,blob={ct:'x'})=>h.worker.fetch(new Request(`https://sync.test/v1/blob/${account}/${store}`,{method:'PUT',body:JSON.stringify({ifVersion:null,blob}),duplex:'half'}),h.env);

test('per-account quota counts fixed and dynamic stores and refuses growth without storing it',async()=>{
 const h=await environment();assert.equal((await put(h,'spaces')).status,200);assert.equal((await put(h,sid(1))).status,200);
 const refused=await put(h,sid(2));assert.equal(refused.status,507);assert.deepEqual(await refused.json(),{error:'account-quota'});
 assert.equal(h.records.has(`blob:${account}:${sid(2)}`),false);
});
test('quota bootstraps legacy blobs and an account wipe resets its ledger',async()=>{
 const h=await environment({ACCOUNT_STORAGE_MAX_STORES:'1'});h.records.set(`blob:${account}:spaces`,JSON.stringify({version:'old',blob:{ct:'legacy'}}));
 assert.equal((await put(h,sid(1))).status,507);
 assert.equal((await h.worker.fetch(new Request(`https://sync.test/v1/blob/${account}`,{method:'DELETE'}),h.env)).status,204);
 assert.equal((await put(h,sid(1))).status,200);
});
test('deleting individual Space stores frees quota across repeated churn',async()=>{
 const h=await environment({ACCOUNT_STORAGE_MAX_STORES:'2'});
 assert.equal((await put(h,'spaces')).status,200);
 for(let n=1;n<=10;n++){
  assert.equal((await put(h,sid(n))).status,200);
  const removed=await h.worker.fetch(new Request(`https://sync.test/v1/blob/${account}/${sid(n)}`,{method:'DELETE'}),h.env);
  assert.equal(removed.status,204);assert.equal(h.records.has(`blob:${account}:${sid(n)}`),false);
 }
 assert.equal((await put(h,sid(11))).status,200);
});
test('failed KV writes roll quota back for the next reservation',async()=>{
 const h=await environment({ACCOUNT_STORAGE_MAX_STORES:'1'}),putValue=h.env.SYNC.put;let fail=true;
 h.env.SYNC.put=async(k,v)=>{if(fail&&k.startsWith('blob:')){fail=false;throw new Error('write failed');}return putValue(k,v);};
 await assert.rejects(put(h,sid(1)),/write failed/);
 assert.equal((await put(h,sid(2))).status,200);
});
test('daily account creation default is ten and is independent of storage quota',async()=>{
 const h=await environment({NEW_ACCOUNT_DAILY_LIMIT:undefined,ACCOUNT_STORAGE_QUOTA_BYTES:'10000',ACCOUNT_STORAGE_MAX_STORES:'10'});
 h.records.set(`new:${new Date().toISOString().slice(0,10)}`,'9');assert.equal((await put(h,'spaces')).status,200);
 const other='b'.repeat(64);const response=await h.worker.fetch(new Request(`https://sync.test/v1/blob/${other}/spaces`,{method:'PUT',body:JSON.stringify({ifVersion:null,blob:{}}),duplex:'half'}),h.env);
 assert.equal(response.status,503);
});
