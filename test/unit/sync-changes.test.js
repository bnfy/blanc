'use strict';
// Which fixed stores a change check fetches (design 2026-11-02, "Fetch what
// changed"). The iPhone replays the same cases from the shared vectors.
const test=require('node:test'),assert=require('node:assert/strict');
const changes=require('../../src/main/sync-changes');
const {changedStores,confirmFetched,FIXED_STORES}=changes;
const all=value=>Object.fromEntries(FIXED_STORES.map(store=>[store,value]));
test('the fixed stores and the timings are the design\'s',()=>{
  assert.deepEqual(FIXED_STORES,['bookmarks','settings','session','icons','sends','closed','shared','spaces']);
  assert.deepEqual([changes.CHECK_MS,changes.BACKGROUND_CHECK_MS,changes.FULL_PASS_MS,changes.RETRY_PASS_MS,changes.CHECK_RETRY_AFTER_MS,changes.OPEN_TABS_MS,changes.R_PER_PASS],
    [15000,60000,300000,60000,600000,60000,5]);
});
test('unchanged stores are not fetched',()=>{
  assert.deepEqual(changedStores({named:all('v1'),seen:all('v1'),now:1e6,lastOpenTabsFetch:0}),{fetch:[],deferred:[]});
});
test('a moved store is fetched',()=>{
  assert.deepEqual(changedStores({named:{...all('v1'),spaces:'v2'},seen:all('v1'),now:1e6,lastOpenTabsFetch:0}).fetch,['spaces']);
});
test('a store that appeared or vanished is fetched, and one that never existed is not',()=>{
  const r=changedStores({named:{...all(null),sends:'new',closed:null},seen:{...all(null),closed:'gone'},now:1e6,lastOpenTabsFetch:0});
  assert.deepEqual(r.fetch,['sends','closed']);
});
test('a store never seen on this device is fetched',()=>{
  assert.deepEqual(changedStores({named:{...all(null),settings:'v1'},seen:{},now:1e6,lastOpenTabsFetch:0}).fetch,['settings']);
});
test('open tabs wait for their minute',()=>{
  const moved={...all('v1'),session:'v2',icons:'v2'};
  assert.deepEqual(changedStores({named:moved,seen:all('v1'),now:100_000,lastOpenTabsFetch:80_000}),{fetch:[],deferred:['session','icons']});
  assert.deepEqual(changedStores({named:moved,seen:all('v1'),now:141_000,lastOpenTabsFetch:80_000}),{fetch:['session','icons'],deferred:[]});
});
test('a raced read stays changed',()=>{
  assert.equal(confirmFetched({named:all('v2'),store:'spaces',fetchedVersion:'v1'}),false);
  assert.equal(confirmFetched({named:all('v2'),store:'spaces',fetchedVersion:'v2'}),true);
  assert.equal(confirmFetched({named:all(null),store:'sends',fetchedVersion:null}),true);
});
