'use strict';
// Each device remembers the version it last read or wrote for every fixed
// store (design 2026-11-02, "Remember versions"), per account.
const test=require('node:test'),assert=require('node:assert/strict');
const {createSyncFixture}=require('../desktop/support/sync-fixture');
const {syncDevice}=require('./support/sync-device');
const account='a'.repeat(64);
async function environment(t) {
  const fixture=await createSyncFixture(),devices=[];
  const device=(name,record={})=>{const d=syncDevice({endpoint:fixture.url,fetch:(url,options)=>fetch(url,options),record:{deviceId:name,...record}});devices.push(d);return d;};
  t.after(async()=>{for(const d of devices){await d.sync.disable({wipeRemote:false}).catch(()=>{});await d.dispose();}await fixture.close();});
  return {fixture,device,serverVersion:store=>JSON.parse(fixture.blobs.get(`blob:${account}:${store}`)).version};
}
test('a GET and a PUT record the store\'s version',async t=>{
  const e=await environment(t),a=e.device('A');
  await a.sync.syncNow(['settings']);
  assert.equal(a.sync.seenVersions().settings,e.serverVersion('settings'),'the PUT\'s version');
  const b=e.device('B');a.sync.resetRequestWindowForTest();
  await b.sync.syncNow(['settings']);
  assert.equal(b.sync.seenVersions().settings,e.serverVersion('settings'),'the GET\'s version');
});
test('a missing store records null',async t=>{
  const e=await environment(t),a=e.device('A');a.spaces.setEnabled(true,{accountId:account,deviceId:'A'});
  await a.sync.syncNow(['closed']);
  assert.equal(e.fixture.blobs.has(`blob:${account}:closed`),false,'nothing to publish');
  assert.equal(a.sync.seenVersions().closed,null);
  assert.ok(Object.hasOwn(a.sync.seenVersions(),'closed'));
});
test('another account or sync turned off starts empty',async t=>{
  const e=await environment(t),a=e.device('A');
  await a.sync.syncNow(['settings']);assert.ok(a.sync.seenVersions().settings);
  await a.sync.disable({wipeRemote:false});
  assert.deepEqual(a.sync.seenVersions(),{});
  const b=e.device('B',{seenVersions:{accountId:'b'.repeat(64),stores:{settings:'other-account'}}});
  assert.deepEqual(b.sync.seenVersions(),{});
});
