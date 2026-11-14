import test from 'node:test';
import assert from 'node:assert/strict';
import {remoteTabsView} from './remote-tabs-view.mjs';
import {PRUNE_MS} from './tab-model.mjs';
const tab = title => ({url:'https://example.org',title,groupId:null,pinned:false});
const entry = (updatedAt, tabs=[tab('one'),tab('two')]) => ({name:'Published',platform:'darwin',updatedAt,tabs,groups:[]});
function view(extra={}) { return remoteTabsView({devices:{peer:entry(100)},ownId:'own',now:101,sidecar:{},visibleSpaceIds:new Set(),names:{},attachIcons:rows=>rows,...extra}); }
test('occurrences hide by exact snapshot timestamp and visible Space, not URL', () => {
  const source={peer:entry(100)};
  const sidecar={devices:{peer:{forUpdatedAt:100,tabs:[{i:0,spaceId:'visible'},{i:1,spaceId:'dormant'}]}}};
  assert.deepEqual(view({devices:source,sidecar,visibleSpaceIds:new Set(['visible'])})[0].tabs,[tab('two')]);
  assert.equal(source.peer.tabs.length,2);
  sidecar.devices.peer.forUpdatedAt=99;
  assert.equal(view({devices:source,sidecar,visibleSpaceIds:new Set(['visible'])})[0].tabs.length,2);
});
test('keeps shipping order: icons, occurrence filtering, local name overrides', () => {
  let calls=0;
  const rows=view({names:{peer:{name:'  Local name  ',at:1,tie:''}},attachIcons:devices=>{calls++;return devices.map(d=>({...d,tabs:d.tabs.map(t=>({...t,icon:'native-icon'}))}));}});
  assert.equal(calls,1); assert.equal(rows[0].name,'Local name'); assert.equal(rows[0].tabs[0].icon,'native-icon');
  assert.equal(view({names:{peer:{name:'',at:2,tie:''}}})[0].name,'Published');
});
test('display excludes self, retracted and expired; retains prune boundary and newest-first order', () => {
  const now=PRUNE_MS+100;
  const rows=view({now,devices:{own:entry(now),old:entry(99),boundary:entry(100),fresh:entry(now),gone:{updatedAt:now,retracted:true}}});
  assert.deepEqual(rows.map(d=>d.deviceId),['fresh','boundary']);
});
test('filtering all occurrences keeps shipping device row and does not mutate groups', () => {
  const sidecar={devices:{peer:{forUpdatedAt:100,tabs:[{i:0,spaceId:'visible'},{i:1,spaceId:'visible'}]}}};
  const rows=view({sidecar,visibleSpaceIds:new Set(['visible'])});
  assert.equal(rows.length,1); assert.deepEqual(rows[0].tabs,[]); assert.deepEqual(rows[0].groups,[]);
});

test('name resolution rejects inherited entries and malformed overrides', () => {
  assert.equal(view({names:Object.create({peer:{name:'Inherited'}})})[0].name,'Published');
  assert.equal(view({names:{peer:{name:42}}})[0].name,'Published');
  assert.equal(view({names:{peer:{name:'x'.repeat(90)}}})[0].name.length,80);
});
