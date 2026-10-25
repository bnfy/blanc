'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const modulePromise=import(`data:text/javascript;base64,${fs.readFileSync(require.resolve('../../cloudflare/sync-worker/src/index.js')).toString('base64')}`);
const account='a'.repeat(64),sid=n=>'space-'+n.toString(16).padStart(32,'0');
const fixed=['bookmarks','settings','session','icons','sends','spaces','closed','shared'],BASE=8391120;
function state(){const values=new Map();return {values,storage:{get:async k=>structuredClone(values.get(k)),put:async(k,v)=>values.set(k,structuredClone(v)),deleteAll:async()=>values.clear()}};}
async function fixture(vars={}) {
 const mod=await modulePromise,records=new Map(),states=new Map(),objects=new Map(),calls=[];
 const env={ACCOUNT_STORAGE_QUOTA_BYTES:String(BASE+2000),ACCOUNT_STORAGE_MAX_STORES:'10',NEW_ACCOUNT_DAILY_LIMIT:'10',...vars,SYNC:{
  get:async(k,o)=>{calls.push(['get',k]);const v=records.get(k)??null;return v&&o?.type==='json'?JSON.parse(v):v;},
  put:async(k,v)=>{calls.push(['put',k]);records.set(k,String(v));},delete:async k=>{calls.push(['delete',k]);records.delete(k);},
  list:async()=>{calls.push(['list']);return {keys:[],list_complete:true};},
 }};
 const object=()=>{if(!states.has(account))states.set(account,state());if(!objects.has(account))objects.set(account,new mod.AccountQuota(states.get(account),env));return objects.get(account);};
 env.ACCOUNT_QUOTA={idFromName:id=>id,get:id=>{assert.equal(id,account);return {fetch:(url,init)=>object().fetch(new Request(url,init))};}};
 const post=(path,body={})=>object().fetch(new Request('https://quota.invalid/'+path,{method:'POST',body:JSON.stringify({accountId:account,...body})}));
 const put=(store,blob={ct:'x'})=>mod.default.fetch(new Request(`https://local.test/v1/blob/${account}/${store}`,{method:'PUT',body:JSON.stringify({blob,ifVersion:JSON.parse(records.get(`blob:${account}:${store}`)??'null')?.version??null})}),env);
 return {mod,env,records,calls,states,object,post,put,evict:()=>objects.clear(),ledger:async()=>states.get(account)?.storage.get('ledger')};
}
test('all 256 legacy fixed-store combinations initialize eight reserves without KV inventory',async()=>{
 for(let mask=0;mask<256;mask++){
  const h=await fixture();for(let n=0;n<8;n++)if(mask&(1<<n))h.records.set(`blob:${account}:${fixed[n]}`,JSON.stringify({version:'legacy',blob:{ct:'x'}}));
  h.env.SYNC.get=h.env.SYNC.list=async()=>{throw new Error('inventory is forbidden');};
  assert.equal((await h.post('write',{store:sid(1),stored:'{}'})).status,200);
  const ledger=await h.ledger();assert.equal(ledger.schema,1);assert.deepEqual(Object.keys(ledger.stores),[sid(1)]);
  assert.equal(h.mod.AccountQuota.fixedReservationBytes,BASE);assert.equal(h.records.size,mask.toString(2).replace(/0/g,'').length+1);
 }
});
test('historical Unicode values remain covered after fixed writes, stale reads, deletion attempts and eviction',async()=>{
 const h=await fixture({ACCOUNT_STORAGE_MAX_STORES:'8'}),unicode={ct:'€'.repeat(524279)};
 for(const store of fixed.slice(0,4))h.records.set(`blob:${account}:${store}`,JSON.stringify({version:'x'.repeat(36),blob:unicode}));
 for(const store of fixed){assert.equal((await h.put(store)).status,200);assert.equal((await h.post('delete-store',{store})).status,405);}
 h.evict();assert.equal((await h.put('bookmarks')).status,200);
 // A pre-cutover old writer can still land its larger fixed value.
 h.records.set(`blob:${account}:bookmarks`,JSON.stringify({version:'x'.repeat(36),blob:unicode}));
 assert.ok([...h.records.values()].reduce((n,v)=>n+Buffer.byteLength(v)+256,0)<=BASE);
 assert.equal((await h.put(sid(1))).status,507);assert.deepEqual((await h.ledger()).stores,{});
});
test('dynamic capacity counts eight fixed slots and leaves ordinary fixed writes available when full',async()=>{
 const h=await fixture({ACCOUNT_STORAGE_MAX_STORES:'9'});assert.equal((await h.put(sid(1))).status,200);
 assert.equal((await h.put(sid(2))).status,507);assert.equal((await h.put('settings')).status,200);
 assert.equal(h.records.has(`blob:${account}:${sid(2)}`),false);
 assert.equal((await h.post('delete-store',{store:sid(1)})).status,200);assert.equal((await h.put(sid(2))).status,200);
});
test('successful shrinking replacement frees dynamic bytes even after a configured limit is lowered',async()=>{
 const h=await fixture();assert.equal((await h.put(sid(1),{ct:'x'.repeat(900)})).status,200);
 h.env.ACCOUNT_STORAGE_QUOTA_BYTES=String(BASE+800);
 assert.equal((await h.put(sid(2))).status,507);assert.equal((await h.put(sid(1),{})).status,200);assert.equal((await h.put(sid(2),{})).status,200);
});
test('failed reservation persistence sends no KV write and a fresh operation reloads durable state',async()=>{
 const h=await fixture();await h.object().bootstrap(account);const st=h.states.get(account),put=st.storage.put;let fail=true;
 st.storage.put=async(k,v)=>{if(fail){fail=false;throw new Error('disk failed');}return put(k,v);};
 assert.equal((await h.put(sid(1))).status,503);assert.equal(h.records.has(`blob:${account}:${sid(1)}`),false);
 assert.equal((await h.put(sid(2))).status,200);assert.deepEqual(Object.keys((await h.ledger()).stores),[sid(2)]);
});
for(const committed of [false,true])test(`uncertain KV PUT (${committed?'after':'before'} mutation) retains its key and charge across eviction`,async()=>{
 const h=await fixture({ACCOUNT_STORAGE_MAX_STORES:'9'}),put=h.env.SYNC.put;
 h.env.SYNC.put=async(k,v)=>{if(k.endsWith(sid(1))){if(committed)await put(k,v);throw new Error('unknown KV outcome');}return put(k,v);};
 assert.equal((await h.put(sid(1),{ct:'x'.repeat(900)})).status,503);h.evict();
 const row=(await h.ledger()).stores[sid(1)];assert.equal(row.intent,'put');assert.ok(row.bytes>=900);
 assert.equal((await h.put(sid(2))).status,507);
 assert.equal((await h.post('delete-store',{store:sid(1)})).status,503);
 assert.equal((await h.post('delete-account')).status,503,'uncertain writes cannot be forgotten by erasure');
 assert.ok((await h.ledger()).stores[sid(1)]);
});
test('crash after durable reservation and before finalization never loses a possibly stored key',async()=>{
 const h=await fixture(),st=h.object().state,put=st.storage.put;let writes=0;
 st.storage.put=async(k,v)=>{if(++writes===3)throw new Error('finalization lost');return put(k,v);};
 assert.equal((await h.put(sid(1))).status,503);assert.ok(h.records.has(`blob:${account}:${sid(1)}`));h.evict();
 assert.equal((await h.ledger()).stores[sid(1)].intent,'put');assert.equal((await h.post('delete-account')).status,503);
});
test('failed delete is retryable after eviction without releasing its quota early',async()=>{
 const h=await fixture({ACCOUNT_STORAGE_MAX_STORES:'9'});await h.put(sid(1));const del=h.env.SYNC.delete;let fail=true;
 h.env.SYNC.delete=async k=>{if(fail&&k.endsWith(sid(1))){fail=false;throw new Error('delete failed');}return del(k);};
 assert.equal((await h.post('delete-store',{store:sid(1)})).status,503);h.evict();assert.equal((await h.put(sid(2))).status,507);
 assert.equal((await h.post('delete-store',{store:sid(1)})).status,200);assert.equal((await h.put(sid(2))).status,200);
});
test('a late write after an error remains covered and cannot be forgotten by erasure',async()=>{
 const h=await fixture({ACCOUNT_STORAGE_MAX_STORES:'9'}),put=h.env.SYNC.put;let land;
 h.env.SYNC.put=async(k,v)=>{if(k.endsWith(sid(1))){land=()=>put(k,v);throw new Error('completion unknown');}return put(k,v);};
 assert.equal((await h.put(sid(1),{ct:'x'.repeat(900)})).status,503);h.evict();
 assert.equal((await h.post('delete-account')).status,503);await land();
 assert.ok(h.records.has(`blob:${account}:${sid(1)}`));assert.equal((await h.ledger()).stores[sid(1)].intent,'put');
 assert.equal((await h.put(sid(2))).status,507);
});
test('reviewed recovery limits preserve the ledger and fixed sync while refusing dynamic growth',async()=>{
 const h=await fixture();await h.put(sid(1),{ct:'x'.repeat(900)});const before=await h.ledger();
 h.env.ACCOUNT_STORAGE_QUOTA_BYTES=String(BASE);h.env.ACCOUNT_STORAGE_MAX_STORES='8';h.evict();
 assert.equal((await h.put('settings')).status,200);assert.deepEqual(await h.ledger(),before);
 assert.equal((await h.put(sid(2))).status,507);assert.equal((await h.put(sid(1),{ct:'x'.repeat(950)})).status,507);
 assert.equal((await h.put(sid(1),{})).status,200);assert.equal((await h.post('delete-store',{store:sid(1)})).status,200);
 assert.equal((await h.put(sid(2))).status,507);assert.deepEqual((await h.ledger()).stores,{});
});
test('account wipe deletes all fixed and ledger-known dynamic keys even when listings omit everything',async()=>{
 const h=await fixture();await h.put(sid(1));await h.put(sid(2));await h.put('settings');
 h.env.SYNC.list=async()=>{throw new Error('listing must not be needed');};
 assert.equal((await h.post('delete-account')).status,204);
 assert.equal([...h.records.keys()].some(k=>k.startsWith(`blob:${account}:`)),false);
 for(const name of [...fixed,sid(1),sid(2)])assert.ok(h.calls.some(([op,k])=>op==='delete'&&k===`blob:${account}:${name}`));
 h.evict();assert.equal((await h.put(sid(3))).status,200);assert.deepEqual(Object.keys((await h.ledger()).stores),[sid(3)]);
});
test('partial account wipe retains its entire map, blocks new writes, and resumes after eviction',async()=>{
 const h=await fixture();await h.put(sid(1));await h.put(sid(2));const del=h.env.SYNC.delete;let fail=true;
 h.env.SYNC.delete=async k=>{if(fail&&k.endsWith(sid(2))){fail=false;throw new Error('partial wipe');}return del(k);};
 assert.equal((await h.post('delete-account')).status,503);h.evict();
 assert.equal((await h.put('settings')).status,503);assert.equal((await h.put(sid(3))).status,503);assert.equal(Object.keys((await h.ledger()).stores).length,2);
 assert.equal((await h.post('delete-account')).status,204);assert.equal((await h.put(sid(3))).status,200);
});
test('generic reset and legacy cleanup cannot discard charges from a live accountant',async()=>{
 const h=await fixture({CLEANUP_ENABLED:'true'});await h.put(sid(1));
 assert.equal((await h.object().fetch(new Request('https://quota.invalid/',{method:'DELETE'}))).status,405);
 const before=await h.ledger();let work;await h.mod.default.scheduled({},h.env,{waitUntil:p=>{work=p;}});await work;
 assert.deepEqual(await h.ledger(),before);assert.ok(h.records.has(`blob:${account}:${sid(1)}`));
});
test('unknown ledger schema fails closed without mutating customer data',async()=>{
 const h=await fixture();h.object();h.states.get(account).values.set('ledger',{accountId:account,stores:{}});
 assert.equal((await h.put(sid(1))).status,503);assert.equal(h.records.size,0);
});
test('rollout configuration keeps cleanup disabled and the independent daily limit at ten',()=>{
 const config=fs.readFileSync('cloudflare/sync-worker/wrangler.toml','utf8');assert.match(config,/CLEANUP_ENABLED = "false"/);assert.match(config,/NEW_ACCOUNT_DAILY_LIMIT = "10"/);
});
