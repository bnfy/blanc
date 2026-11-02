'use strict';
// GET /v1/versions/<accountId>: each fixed store's current version, so a
// client downloads only what moved (design 2026-11-02, Worker part 2).
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {attachQuota}=require('../support/sync-quota.cjs');
const modulePromise=import('data:text/javascript;base64,'+fs.readFileSync('cloudflare/sync-worker/src/index.js').toString('base64'));
const account='b'.repeat(64),key=store=>`blob:${account}:${store}`;
const FIXED=['bookmarks','closed','icons','sends','session','settings','shared','spaces'];
async function setup(){
  const mod=await modulePromise,records=new Map(),reads=new Map();
  const env={SYNC:{
    get:async(k,o)=>{reads.set(k,(reads.get(k)??0)+1);const v=records.get(k)??null;return v&&o?.type==='json'?JSON.parse(v):v;},
    put:async(k,v)=>records.set(k,String(v)),delete:async k=>records.delete(k),list:async()=>({keys:[],list_complete:true})}};
  const quota=attachQuota(env,mod.AccountQuota);
  const call=(path,init={})=>mod.default.fetch(new Request('https://test.invalid'+path,init),env);
  const put=async(store,blob,ifVersion=null)=>{const r=await call(`/v1/blob/${account}/${store}`,{method:'PUT',body:JSON.stringify({blob,ifVersion})});return (await r.json()).version;};
  const versions=async()=>{const r=await call(`/v1/versions/${account}`);return {status:r.status,body:await r.json()};};
  return {env,quota,records,reads,call,put,versions};
}
test('versions name every fixed store and nothing else',async()=>{
  const h=await setup(),settings=await h.put('settings',{ct:'s'}),spaces=await h.put('spaces',{ct:'i'});
  await h.put('space-'+'1'.repeat(32),{ct:'blob'});
  const {status,body}=await h.versions();
  assert.equal(status,200);assert.equal(body.v,1);
  assert.deepEqual(Object.keys(body.stores).sort(),FIXED);
  assert.equal(body.stores.settings,settings);assert.equal(body.stores.spaces,spaces);assert.equal(body.stores.bookmarks,null);
  assert.equal(Object.keys(body.stores).some(name=>name.startsWith('space-')),false);
});
test('an unknown account gets stores:null and no ledger',async()=>{
  const h=await setup();assert.deepEqual((await h.versions()).body,{v:1,stores:null});
  assert.equal(h.quota.states.get(account)?.values.size??0,0);
});
test('a version moves on every PUT and stays put otherwise',async()=>{
  const h=await setup(),one=await h.put('sends',{ct:'1'});
  assert.equal((await h.versions()).body.stores.sends,one);assert.equal((await h.versions()).body.stores.sends,one);
  const two=await h.put('sends',{ct:'2'},one);assert.notEqual(two,one);
  assert.equal((await h.versions()).body.stores.sends,two);
});
test('the check counts against the account\'s GET limit',async()=>{
  const h=await setup();await h.put('settings',{ct:'s'});
  for(let n=0;n<30;n++)assert.equal((await h.versions()).status,200);
  assert.equal((await h.versions()).status,429);
  assert.equal((await h.call(`/v1/blob/${account}/settings`)).status,429,'checks and GETs share the budget');
});
test('the per-IP throttle applies to the check',async()=>{
  const h=await setup(),minute=Math.floor(Date.now()/60000);h.records.set(`ip:203.0.113.9:${minute}`,'120');
  const r=await h.call(`/v1/versions/${account}`,{headers:{'CF-Connecting-IP':'203.0.113.9'}});assert.equal(r.status,429);
});
test('a KV-only store is listed from its KV version and copied once',async()=>{
  const h=await setup();await h.put('settings',{ct:'creates the ledger'});
  h.records.set(key('bookmarks'),JSON.stringify({version:'written-before-this-deploy',blob:{ct:'old'}}));h.reads.clear();
  assert.equal((await h.versions()).body.stores.bookmarks,'written-before-this-deploy');
  assert.equal((await h.versions()).body.stores.bookmarks,'written-before-this-deploy');
  assert.equal(h.reads.get(key('bookmarks')),1);
});
test('delete-account empties the list',async()=>{
  const h=await setup();await h.put('settings',{ct:'s'});
  assert.equal((await h.call(`/v1/blob/${account}`,{method:'DELETE'})).status,204);
  assert.deepEqual((await h.versions()).body,{v:1,stores:null});
});
test('only GET is allowed',async()=>{
  const h=await setup();assert.equal((await h.call(`/v1/versions/${account}`,{method:'POST',body:'{}'})).status,405);
});
