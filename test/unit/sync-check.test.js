'use strict';
// checkVersions(): the change check against the Worker (design 2026-11-02).
const test=require('node:test'),assert=require('node:assert/strict');
const {createSyncFixture}=require('../desktop/support/sync-fixture');
const {syncDevice}=require('./support/sync-device');
async function environment(t,options) {
  const fixture=await createSyncFixture(options),devices=[];
  const device=(name,{respond}={})=>{const d=syncDevice({endpoint:fixture.url,fetch:respond??((url,init)=>fetch(url,init)),record:{deviceId:name}});devices.push(d);return d;};
  t.after(async()=>{for(const d of devices){await d.sync.disable({wipeRemote:false}).catch(()=>{});await d.dispose();}await fixture.close();});
  return {fixture,device};
}
test('the check names each fixed store\'s version',async t=>{
  const e=await environment(t),a=e.device('A');await a.sync.syncNow(['settings']);a.sync.resetRequestWindowForTest();
  const result=await a.sync.checkVersions();
  assert.equal(result.supported,true);assert.equal(result.named.settings,a.sync.seenVersions().settings);
  assert.equal(result.named.bookmarks,a.sync.seenVersions().bookmarks??null);
  assert.equal(e.fixture.requests.filter(r=>r.store==='versions').length,1);
});
test('an older Worker reads as unsupported',async t=>{
  const e=await environment(t,{versions:false}),a=e.device('A');await a.sync.syncNow(['settings']);
  assert.deepEqual(await a.sync.checkVersions(),{supported:false});
});
test('stores:null reads as unsupported',async t=>{
  const e=await environment(t),a=e.device('A');
  assert.deepEqual(await a.sync.checkVersions(),{supported:false},'an account with no ledger yet');
});
test('a network error or a bad body reads as unsupported',async t=>{
  for(const respond of [async()=>{throw new Error('offline');},async()=>new Response('not json',{status:200})]) {
    const e=await environment(t),a=e.device('A',{respond});
    assert.deepEqual(await a.sync.checkVersions(),{supported:false});
  }
});
test('a check that cannot reach the Worker is skipped, not unsupported',async t=>{
  const e=await environment(t),off=syncDevice({endpoint:e.fixture.url,fetch:(url,init)=>fetch(url,init),record:{deviceId:'off',enabled:false}});
  t.after(()=>off.dispose());
  assert.deepEqual(await off.sync.checkVersions(),{skipped:true});
  assert.equal(e.fixture.requests.length,0);
});
test('a check never takes the request kept for the Choose Spaces sheet',async t=>{
  // Eight background GETs (all routine work may use with one request kept for
  // checks) and the sheet's own urgent one make nine: only the reserve is left.
  const e=await environment(t),a=e.device('A');await a.sync.syncNow(['settings']);
  for(let n=0;n<3;n++)await a.sync.syncNow(['settings','bookmarks']);
  await a.sync.syncNow(['bookmarks']);await a.sync.sharedIndexPreview();
  let done=false;const pending=a.sync.checkVersions().then(()=>{done=true;});
  await new Promise(r=>setTimeout(r,50));
  assert.equal(done,false,'the window\'s last request stays free');
  assert.equal(e.fixture.requests.filter(r=>r.store==='versions').length,0);
  a.sync.resetRequestWindowForTest();await pending;
  assert.equal(e.fixture.requests.filter(r=>r.store==='versions').length,1);
});
