'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {attachQuota,blobView}=require('../support/sync-quota.cjs');
const modulePromise=import('data:text/javascript;base64,'+fs.readFileSync('cloudflare/sync-worker/src/index.js').toString('base64'));
const account='a'.repeat(64),space='space-'+'1'.repeat(32);
async function setup(){
 const mod=await modulePromise,records=new Map(),env={SYNC:{get:async(k,o)=>{const v=records.get(k)??null;return v&&o?.type==='json'?JSON.parse(v):v;},put:async(k,v)=>records.set(k,String(v)),delete:async k=>records.delete(k),list:async()=>({keys:[],list_complete:true})}};
 const quota=attachQuota(env,mod.AccountQuota),blobs=blobView(records,quota.states);
 const request=(method,store,body)=>mod.default.fetch(new Request(`https://test.invalid/v1/blob/${account}${store?'/'+store:''}`,{method,...(body?{body:JSON.stringify(body)}:{})}),env);
 const put=(blob={ct:'one'})=>request('PUT',space,{blob,ifVersion:JSON.parse(blobs.get(`blob:${account}:${space}`)??'null')?.version??null});
 return {env,quota,blobs,records,request,put};
}
for(const afterCommit of [false,true])test(`Space upload failure ${afterCommit?'after':'before'} atomic commit recovers across eviction and erases`,async()=>{
 const h=await setup();await h.request('GET',space);
 const state=h.quota.states.get(account),transaction=state.storage.transaction;let fail=true;
 state.storage.transaction=async fn=>{if(fail){fail=false;if(afterCommit)await transaction(fn);throw Error('transaction response lost');}return transaction(fn);};
 assert.equal((await h.put()).status,503);h.quota.objects.clear();
 const stored=h.blobs.get(`blob:${account}:${space}`),ledger=await state.storage.get('ledger');
 assert.equal(Boolean(stored),Boolean(ledger.stores[space]));
 assert.equal((await h.put({ct:'recovered'})).status,200);
 assert.equal(h.records.has(`blob:${account}:${space}`),false,'Space ciphertext is never mirrored into KV');
 assert.equal((await h.request('DELETE')).status,204);assert.equal(state.values.size,0);
});
test('missing accountant refuses Space writes, reads, selective deletion and account erasure without mutating data',async()=>{
 const h=await setup();await h.put();const binding=h.env.ACCOUNT_QUOTA;delete h.env.ACCOUNT_QUOTA;
 for(const [method,store,body] of [['PUT',space,{blob:{}}],['GET',space],['DELETE',space],['DELETE',undefined]])assert.equal((await h.request(method,store,body)).status,503);
 assert.ok(h.blobs.has(`blob:${account}:${space}`));
 assert.equal((await h.request('PUT','settings',{blob:{}})).status,200,'legacy fixed sync remains available');
 h.env.ACCOUNT_QUOTA=binding;assert.equal((await h.request('DELETE')).status,204);
});
test('a missing Space GET creates no persistent ledger or ciphertext',async()=>{
 const h=await setup();assert.equal((await h.request('GET',space)).status,404);
 assert.equal(h.quota.states.get(account).values.size,0);
 assert.equal((await h.put()).status,200);assert.ok(h.quota.states.get(account).values.has('ledger'));
});
test('failure between the two staged SQLite writes rolls back ciphertext and charge together',async()=>{
 const h=await setup();await h.request('GET',space);const st=h.quota.states.get(account),transaction=st.storage.transaction;let fail=true;
 st.storage.transaction=fn=>transaction(tx=>fn({...tx,put:async(k,v)=>{if(fail&&k==='ledger'){fail=false;throw Error('ledger write failed');}return tx.put(k,v);}}));
 assert.equal((await h.put()).status,503);h.quota.objects.clear();
 assert.equal(st.values.has('blob:'+space),false);assert.deepEqual((await st.storage.get('ledger')).stores,{});
 assert.equal((await h.put()).status,200);assert.equal((await h.request('DELETE')).status,204);
});
for(const afterCommit of [false,true])test(`failed final SQLite wipe ${afterCommit?'after':'before'} commit retries safely after eviction`,async()=>{
 const h=await setup();await h.put();await h.request('PUT','settings',{blob:{ct:'fixed'}});
 const st=h.quota.states.get(account),clear=st.storage.deleteAll;let fail=true;
 st.storage.deleteAll=async()=>{if(fail){fail=false;if(afterCommit)await clear();throw Error('wipe response lost');}return clear();};
 assert.equal((await h.request('DELETE')).status,503);h.quota.objects.clear();
 if(!afterCommit){assert.ok(h.blobs.has(`blob:${account}:${space}`));assert.equal((await h.put()).status,503);}
 assert.equal((await h.request('DELETE')).status,204);assert.equal(st.values.size,0);
 assert.equal(h.records.has(`blob:${account}:settings`),false);
});

test('Space compare-and-set admits exactly one same-version write, including compaction',async()=>{
 const h=await setup();await h.put();const version=JSON.parse(h.blobs.get(`blob:${account}:${space}`)).version;
 const replies=await Promise.all([{ct:'edit'},{ct:'empty compacted Space'}].map(blob=>h.request('PUT',space,{blob,ifVersion:version})));
 assert.deepEqual(replies.map(r=>r.status).sort(),[200,409]);
 const current=JSON.parse(h.blobs.get(`blob:${account}:${space}`));
 assert.deepEqual(await replies.find(r=>r.status===409).json(),{error:'conflict',version:current.version});
 assert.equal((await h.request('PUT',space,{blob:{ct:'retry'},ifVersion:current.version})).status,200);
});
test('failed account erasure preserves its distinct error on fixed and Space writes',async()=>{
 const h=await setup();await h.put();h.env.SYNC.delete=async()=>{throw Error('offline');};
 assert.equal((await h.request('DELETE')).status,503);
 for(const store of ['settings',space]){
  const res=await h.request('PUT',store,{blob:{ct:'later'},ifVersion:store===space?JSON.parse(h.blobs.get(`blob:${account}:${space}`)).version:null});
  assert.equal(res.status,503);assert.deepEqual(await res.json(),{error:'quota erasure pending'});
 }
});
