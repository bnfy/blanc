'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const modulePromise=import(`data:text/javascript;base64,${fs.readFileSync(require.resolve('../../cloudflare/sync-worker/src/index.js')).toString('base64')}`);
const account='a'.repeat(64),sid=n=>'space-'+n.toString(16).padStart(32,'0'),BASE=8391120;
function state(){const values=new Map();return {storage:{get:async k=>structuredClone(values.get(k)),put:async(k,v)=>values.set(k,structuredClone(v)),deleteAll:async()=>values.clear()}};}
async function environment(vars={}) {
 const mod=await modulePromise,records=new Map(),objects=new Map(),states=new Map();
 const env={ACCOUNT_STORAGE_QUOTA_BYTES:String(BASE+2000),ACCOUNT_STORAGE_MAX_STORES:'10',NEW_ACCOUNT_DAILY_LIMIT:'10',...vars,SYNC:{
  get:async(k,o)=>{const v=records.get(k)??null;return v&&o?.type==='json'?JSON.parse(v):v;},
  put:async(k,v)=>records.set(k,String(v)),delete:async k=>records.delete(k),
  list:async({prefix=''})=>({keys:[...records.keys()].filter(k=>k.startsWith(prefix)).map(name=>({name})),list_complete:true}),
 }};
 env.ACCOUNT_QUOTA={idFromName:name=>name,get:id=>({fetch:(url,init)=>{let row=objects.get(id);if(!row){if(!states.has(id))states.set(id,state());row=new mod.AccountQuota(states.get(id),env);objects.set(id,row);}return row.fetch(new Request(url,init));}})};
 return {worker:mod.default,env,records,states};
}
const put=(h,store,blob={ct:'x'},ifVersion=null)=>h.worker.fetch(new Request(`https://sync.test/v1/blob/${account}/${store}`,{method:'PUT',body:JSON.stringify({ifVersion,blob})}),h.env);

test('a transient durable bootstrap read failure is retried on the next write',async()=>{
 const h=await environment(),s=state(),get=s.storage.get;let attempts=0;
 s.storage.get=async k=>{if(++attempts===1)throw new Error('temporary storage failure');return get(k);};h.states.set(account,s);
 assert.equal((await put(h,sid(1))).status,503);assert.equal((await put(h,sid(1))).status,200);assert.equal(attempts,2);
});
test('blob reads advertise selective DELETE support for present and absent stores',async()=>{
 const h=await environment(),get=()=>h.worker.fetch(new Request(`https://sync.test/v1/blob/${account}/spaces`),h.env);
 let response=await get();assert.equal(response.status,404);assert.equal(response.headers.get('X-Blanc-Space-Delete'),'1');
 assert.equal((await put(h,'spaces')).status,200);response=await get();assert.equal(response.status,200);assert.equal(response.headers.get('X-Blanc-Space-Delete'),'1');
});
test('eight fixed slots plus tracked dynamic stores enforce the store allowance',async()=>{
 const h=await environment({ACCOUNT_STORAGE_MAX_STORES:'9'});assert.equal((await put(h,'spaces')).status,200);assert.equal((await put(h,sid(1))).status,200);
 const refused=await put(h,sid(2));assert.equal(refused.status,507);assert.deepEqual(await refused.json(),{error:'account-quota'});assert.equal(h.records.has(`blob:${account}:${sid(2)}`),false);
});
test('deleting individual Space stores frees dynamic slots across repeated churn',async()=>{
 const h=await environment({ACCOUNT_STORAGE_MAX_STORES:'9'});await put(h,'spaces');
 for(let n=1;n<=10;n++){
  assert.equal((await put(h,sid(n))).status,200);
  assert.equal((await h.worker.fetch(new Request(`https://sync.test/v1/blob/${account}/${sid(n)}`,{method:'DELETE'}),h.env)).status,204);
  assert.equal(h.records.has(`blob:${account}:${sid(n)}`),false);
 }
 assert.equal((await put(h,sid(11))).status,200);
});
test('default capacity covers all legacy Unicode bounds and admits only 23 full-cap Space blobs',async()=>{
 const h=await environment({ACCOUNT_STORAGE_QUOTA_BYTES:String(20*1048576),ACCOUNT_STORAGE_MAX_STORES:'256'}),full={ct:'x'.repeat(524279)};
 for(const store of ['bookmarks','settings','session','icons'])h.records.set(`blob:${account}:${store}`,JSON.stringify({version:'x'.repeat(36),blob:{ct:'€'.repeat(524279)}}));
 for(const store of ['sends','spaces','closed','shared'])assert.equal((await put(h,store,full)).status,200);
 for(let n=1;n<=23;n++)assert.equal((await put(h,sid(n),full)).status,200);
 assert.equal((await put(h,sid(24),full)).status,507);
 const bytes=[...h.records].filter(([k])=>k.startsWith(`blob:${account}:`)).reduce((sum,[,v])=>sum+Buffer.byteLength(v)+256,0);assert.ok(bytes<=20*1048576);
});
test('daily account creation default is ten and remains independent of storage quota',async()=>{
 const h=await environment({NEW_ACCOUNT_DAILY_LIMIT:undefined});h.records.set(`new:${new Date().toISOString().slice(0,10)}`,'9');assert.equal((await put(h,'spaces')).status,200);
 const other='b'.repeat(64),response=await h.worker.fetch(new Request(`https://sync.test/v1/blob/${other}/spaces`,{method:'PUT',body:JSON.stringify({ifVersion:null,blob:{}})}),h.env);assert.equal(response.status,503);
});
test('a slow larger write cannot land after a smaller replacement releases its quota',async()=>{
 const h=await environment({ACCOUNT_STORAGE_MAX_STORES:'11'}),first=await put(h,sid(1)),version=(await first.json()).version;
 let release,started;const ready=new Promise(r=>{started=r;}),gate=new Promise(r=>{release=r;}),original=h.env.SYNC.put;
 h.env.SYNC.put=async(k,v)=>{if(k===`blob:${account}:${sid(1)}`&&JSON.parse(v).blob.ct.length===900){started();await gate;}return original(k,v);};
 const replace=ct=>put(h,sid(1),{ct},version),larger=replace('x'.repeat(900));await ready;
 let smallerFinished=false;const smaller=replace('x').then(r=>{smallerFinished=true;return r;});await new Promise(r=>setImmediate(r));assert.equal(smallerFinished,false);
 release();assert.equal((await larger).status,200);assert.equal((await smaller).status,200);assert.equal(JSON.parse(h.records.get(`blob:${account}:${sid(1)}`)).blob.ct,'x');assert.equal((await put(h,sid(2),{ct:'x'.repeat(900)})).status,200);
});
test('account erasure drains an in-flight write before deleting its ledger-known key',async()=>{
 const h=await environment(),original=h.env.SYNC.put;let release,started;const ready=new Promise(r=>{started=r;}),gate=new Promise(r=>{release=r;});
 h.env.SYNC.put=async(k,v)=>{if(k.endsWith(sid(1))){started();await gate;}return original(k,v);};
 const writing=put(h,sid(1));await ready;let erased=false;
 const wipe=h.worker.fetch(new Request(`https://sync.test/v1/blob/${account}`,{method:'DELETE'}),h.env).then(r=>{erased=true;return r;});
 await new Promise(r=>setImmediate(r));assert.equal(erased,false);release();assert.equal((await writing).status,200);assert.equal((await wipe).status,204);assert.equal(h.records.has(`blob:${account}:${sid(1)}`),false);
});
test('a configured allowance below the permanent reserve fails closed',async()=>{
 for(const vars of [{ACCOUNT_STORAGE_QUOTA_BYTES:String(BASE-1)},{ACCOUNT_STORAGE_MAX_STORES:'7'}]){const h=await environment(vars);assert.equal((await put(h,'settings')).status,503);assert.equal(h.records.size,0);}
});
