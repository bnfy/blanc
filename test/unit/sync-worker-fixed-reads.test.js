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
test('a KV-only fixed store is copied into the object once',async()=>{
  const h=await setup();await h.put('settings',{ct:'creates the ledger'},null);
  h.records.set(key('bookmarks'),JSON.stringify({version:'written-before-this-deploy',blob:{ct:'old'}}));h.reads.clear();
  for(let n=0;n<2;n++){const r=await h.request('GET','bookmarks');assert.equal(r.status,200);assert.equal((await r.json()).version,'written-before-this-deploy');}
  assert.equal(h.reads.get(key('bookmarks')),1);
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
