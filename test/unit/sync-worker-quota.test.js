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
test('shrinking an existing store succeeds even when legacy usage exceeds the quota',async()=>{
 const h=await environment({ACCOUNT_STORAGE_QUOTA_BYTES:'500',ACCOUNT_STORAGE_MAX_STORES:'1'});
 h.records.set(`blob:${account}:${sid(1)}`,JSON.stringify({version:'legacy',blob:{ct:'x'.repeat(800)}}));
 h.records.set(`blob:${account}:spaces`,JSON.stringify({version:'index',blob:{ct:'x'}}));
 const response=await h.worker.fetch(new Request(`https://sync.test/v1/blob/${account}/${sid(1)}`,{method:'PUT',body:JSON.stringify({ifVersion:'legacy',blob:{}})}),h.env);
 assert.equal(response.status,200);
});
test('release waits for an in-flight legacy bootstrap before removing its store',async()=>{
 const mod=await modulePromise,storage=state(),legacy=sid(1);let resume,started;
 const waiting=new Promise(resolve=>{started=resolve;}),gate=new Promise(resolve=>{resume=resolve;});
 const env={ACCOUNT_STORAGE_QUOTA_BYTES:'1000',ACCOUNT_STORAGE_MAX_STORES:'1',SYNC:{
  list:async()=>{started();await gate;return {keys:[{name:`blob:${account}:${legacy}`}],list_complete:true};},get:async()=> 'legacy',
 }};
 const quota=new mod.AccountQuota(storage,env),post=(path,body)=>quota.fetch(new Request('https://quota.invalid/'+path,{method:'POST',body:JSON.stringify(body)}));
 const bootstrap=post('reserve',{accountId:account,store:sid(2),bytes:100});await waiting;
 let released=false;const release=post('release',{accountId:account,store:legacy}).then(r=>{released=true;return r;});
 await new Promise(resolve=>setImmediate(resolve));assert.equal(released,false);
 resume();assert.equal((await bootstrap).status,507);assert.equal((await release).status,200);
 assert.equal((await post('reserve',{accountId:account,store:sid(2),bytes:100})).status,200);
});
test('daily account creation default is ten and is independent of storage quota',async()=>{
 const h=await environment({NEW_ACCOUNT_DAILY_LIMIT:undefined,ACCOUNT_STORAGE_QUOTA_BYTES:'10000',ACCOUNT_STORAGE_MAX_STORES:'10'});
 h.records.set(`new:${new Date().toISOString().slice(0,10)}`,'9');assert.equal((await put(h,'spaces')).status,200);
 const other='b'.repeat(64);const response=await h.worker.fetch(new Request(`https://sync.test/v1/blob/${other}/spaces`,{method:'PUT',body:JSON.stringify({ifVersion:null,blob:{}}),duplex:'half'}),h.env);
 assert.equal(response.status,503);
});
test('a slow ciphertext write cannot land after a smaller replacement has released its quota',async()=>{
 const h=await environment({ACCOUNT_STORAGE_QUOTA_BYTES:'2000',ACCOUNT_STORAGE_MAX_STORES:'3'});
 const first=await put(h,sid(1));const version=(await first.json()).version;
 let release,started;const ready=new Promise(r=>{started=r;}),gate=new Promise(r=>{release=r;}),original=h.env.SYNC.put;
 h.env.SYNC.put=async(k,v)=>{if(k===`blob:${account}:${sid(1)}`&&JSON.parse(v).blob.ct.length===900){started();await gate;}return original(k,v);};
 const replace=ct=>h.worker.fetch(new Request(`https://sync.test/v1/blob/${account}/${sid(1)}`,{method:'PUT',body:JSON.stringify({ifVersion:version,blob:{ct}})}),h.env);
 const larger=replace('x'.repeat(900));await ready;
 let smallerFinished=false;const smaller=replace('x').then(r=>{smallerFinished=true;return r;});
 await new Promise(r=>setImmediate(r));assert.equal(smallerFinished,false);
 release();assert.equal((await larger).status,200);assert.equal((await smaller).status,200);
 assert.equal(JSON.parse(h.records.get(`blob:${account}:${sid(1)}`)).blob.ct,'x');
 assert.equal((await put(h,sid(2),{ct:'x'.repeat(900)})).status,200);
 const bytes=[...h.records].filter(([k])=>k.startsWith(`blob:${account}:`)).reduce((sum,[,v])=>sum+Buffer.byteLength(v)+256,0);assert.ok(bytes<=2000);
});
