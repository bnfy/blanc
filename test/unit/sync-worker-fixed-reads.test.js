'use strict';
// Fixed stores are read and compared in the account object, so a KV read
// cached at the reader's location can neither be served nor win a conflict
// (design 2026-11-02, Worker part 1). KV is still written for rollback.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {attachQuota}=require('../support/sync-quota.cjs');
const modulePromise=import('data:text/javascript;base64,'+fs.readFileSync('cloudflare/sync-worker/src/index.js').toString('base64'));
const account='a'.repeat(64),key=store=>`blob:${account}:${store}`;
async function setup(){
  const mod=await modulePromise,records=new Map(),stale=new Map(),reads=new Map();
  // A stale entry stands for this location's KV cache: reads see it, writes don't move it.
  const env={SYNC:{
    get:async(k,o)=>{reads.set(k,(reads.get(k)??0)+1);const v=stale.has(k)?stale.get(k):records.get(k)??null;return v&&o?.type==='json'?JSON.parse(v):v;},
    put:async(k,v)=>records.set(k,String(v)),delete:async k=>records.delete(k),list:async()=>({keys:[],list_complete:true})}};
  const quota=attachQuota(env,mod.AccountQuota);
  const request=(method,store,body)=>mod.default.fetch(new Request(`https://test.invalid/v1/blob/${account}/${store}`,{method,...(body?{body:JSON.stringify(body)}:{})}),env);
  const put=async(store,blob,ifVersion)=>{const r=await request('PUT',store,{blob,ifVersion});return {status:r.status,body:await r.json()};};
  const freeze=store=>stale.set(key(store),records.get(key(store))??null);
  return {env,quota,records,stale,reads,request,put,freeze};
}
const later=(t,ms)=>{const start=Date.now();t.mock.method(Date,'now',()=>start+ms);};
test('a GET right after a PUT returns the new value even when KV is stale',async()=>{
  const h=await setup(),first=await h.put('settings',{ct:'one'},null);h.freeze('settings');
  const second=await h.put('settings',{ct:'two'},first.body.version);assert.equal(second.status,200);
  const read=await h.request('GET','settings');assert.equal(read.status,200);
  assert.equal((await read.json()).version,second.body.version);
});
test('a PUT whose ifVersion matches only stale KV is refused',async()=>{
  const h=await setup(),a=await h.put('spaces',{ct:'A'},null);
  // This location still caches "no index yet" from before device A wrote it.
  h.stale.set(key('spaces'),null);
  const b=await h.put('spaces',{ct:'B'},null);
  assert.equal(b.status,409);assert.equal(b.body.version,a.body.version);
  assert.equal(JSON.parse(h.records.get(key('spaces'))).version,a.body.version,'A\'s write survives');
});
test('a KV-only fixed store is copied into the object, checked against KV for two minutes, then settled',async t=>{
  const h=await setup();await h.put('settings',{ct:'creates the ledger'},null);
  h.records.set(key('bookmarks'),JSON.stringify({version:'written-before-this-deploy',blob:{ct:'old'}}));h.reads.clear();
  const read=async()=>{const r=await h.request('GET','bookmarks');assert.equal(r.status,200);assert.equal((await r.json()).version,'written-before-this-deploy');};
  await read();await read();assert.equal(h.reads.get(key('bookmarks')),2,'a provisional copy is checked against KV each time');
  later(t,3*60_000);await read();await read();assert.equal(h.reads.get(key('bookmarks')),3,'settled after two minutes: KV is not read again');
});
test('an unknown account\'s GET creates no object storage',async()=>{
  const h=await setup();assert.equal((await h.request('GET','settings')).status,404);
  assert.equal(h.quota.states.get(account)?.values.size??0,0);
});
test('KV keeps every fixed-store value',async()=>{
  const h=await setup();let version=null;
  for(const ct of ['one','two','three']){const r=await h.put('closed',{ct},version);assert.equal(r.status,200);version=r.body.version;}
  assert.equal(JSON.parse(h.records.get(key('closed'))).version,version);
});
test('after a rollback, a new FIXED_COPY_EPOCH re-reads the copies from KV',async()=>{
  const h=await setup(),first=await h.put('settings',{ct:'one'},null);
  // The rolled-back Worker wrote KV alone; the object's copy still says "one".
  h.records.set(key('settings'),JSON.stringify({version:'written-during-rollback',blob:{ct:'two'}}));
  assert.equal((await (await h.request('GET','settings')).json()).version,first.body.version,'same epoch: the copy wins');
  h.env.FIXED_COPY_EPOCH='2';
  assert.equal((await (await h.request('GET','settings')).json()).version,'written-during-rollback');
});
test('a deleted account\'s store does not come back once the KV cache expires',async t=>{
  const h=await setup();await h.put('settings',{ct:'erased'},null);const erased=h.records.get(key('settings'));
  const mod=await modulePromise;
  assert.equal((await mod.default.fetch(new Request(`https://test.invalid/v1/blob/${account}`,{method:'DELETE'}),h.env)).status,204);
  h.stale.set(key('settings'),erased);await h.put('sends',{ct:'another device'},null);
  await h.request('GET','settings');
  h.stale.delete(key('settings'));later(t,3*60_000);
  assert.equal((await h.request('GET','settings')).status,404);
});
test('a write made just before the first read is not pinned to its older value',async t=>{
  const h=await setup();await h.put('sends',{ct:'creates the ledger'},null);
  h.records.set(key('closed'),JSON.stringify({version:'v1',blob:{}}));h.freeze('closed');
  h.records.set(key('closed'),JSON.stringify({version:'v2',blob:{}}));
  assert.equal((await (await h.request('GET','closed')).json()).version,'v1','this location still caches v1, as before');
  h.stale.delete(key('closed'));later(t,3*60_000);
  assert.equal((await (await h.request('GET','closed')).json()).version,'v2');
  h.records.set(key('closed'),JSON.stringify({version:'v3-written-around-the-object',blob:{}}));
  assert.equal((await (await h.request('GET','closed')).json()).version,'v2','settled: the copy is the source from then on');
});
test('a failed KV write leaves the old value served',async()=>{
  const h=await setup(),first=await h.put('settings',{ct:'one'},null),put=h.env.SYNC.put;let fail=true;
  h.env.SYNC.put=async(k,v)=>{if(fail&&k===key('settings')){fail=false;throw new Error('KV write failed');}return put(k,v);};
  assert.equal((await h.put('settings',{ct:'two'},first.body.version)).status,503);
  assert.equal((await (await h.request('GET','settings')).json()).version,first.body.version);
});
test('a PUT to a store that exists only in KV checks against its KV version',async()=>{
  const h=await setup();await h.put('sends',{ct:'creates the ledger'},null);
  h.records.set(key('bookmarks'),JSON.stringify({version:'legacy',blob:{}}));
  assert.equal((await h.put('bookmarks',{ct:'x'},'not-legacy')).status,409);
  assert.equal((await h.put('bookmarks',{ct:'x'},'legacy')).status,200);
});
test('a versions check reads only the small version keys',async()=>{
  const h=await setup();for(const store of ['settings','session','spaces'])await h.put(store,{ct:'x'.repeat(1000)},null);
  const state=h.quota.states.get(account),get=state.storage.get,keys=[];state.storage.get=async k=>{keys.push(k);return get(k);};
  const mod=await modulePromise;await mod.default.fetch(new Request(`https://test.invalid/v1/versions/${account}`),h.env);
  assert.ok(keys.length>0);assert.equal(keys.some(k=>k.startsWith('fixed:')),false,keys.join(','));
});
test('wrangler.toml pins FIXED_COPY_EPOCH',()=>{
  assert.match(fs.readFileSync('cloudflare/sync-worker/wrangler.toml','utf8'),/^FIXED_COPY_EPOCH = "\d+"$/m);
});
