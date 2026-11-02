'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'blanc-shared-store-'));
const electronId=require.resolve('electron');
require.cache[electronId]={id:electronId,filename:electronId,loaded:true,exports:{app:{getPath:()=>tmp,on:()=>{}}}};
const tracked=require('./support/track-json-stores').trackJsonStores();
let spaces={};try{spaces=require('../../src/main/shared-spaces');}catch(e){if(e.code!=='MODULE_NOT_FOUND')throw e;}
const model=require('../../src/main/shared-spaces-model');
const id=n=>n.toString(16).padStart(32,'0');
const f=(v,c=100,by='a')=>({v,c,by});
const tab=n=>({nav:f({url:'https://example.test/'+n,title:'Example'}),name:f(null),pinned:f(false),groupId:f(null),pos:f(model.keyFor('','',id(n))),deleted:f(false)});
const blob=(tabs={})=>({v:1,spaceId:id(99),groups:{},tabs});
const ctx={accountId:'account-a',deviceId:'a',deviceName:'Mac',platform:'darwin'};
const seal=()=>({ct:'test'});
test.after(async()=>{await tracked.settle();fs.rmSync(tmp,{recursive:true,force:true});});
test('rebind discards the previous account records, pending writes and window baselines',()=>{
  assert.equal(typeof spaces.rebind,'function');
  const s=spaces.rebind('old');
  s.update(d=>{d.blobs.x={private:'old account'};d.pending.x={tabs:{}};d.windows.w={displayed:'old'};});
  const next=spaces.rebind(ctx.accountId).data;
  assert.deepEqual(next.blobs,{});assert.deepEqual(next.pending,{});assert.deepEqual(next.windows,{});
});
test('empty exports do not create a presence-only index or sidecar',()=>{
  spaces.rebind('empty');
  const c={...ctx,accountId:'empty'};
  assert.deepEqual(spaces.exportIndex(c),{v:1,spaces:{}});
  assert.equal(spaces.hasPublishableContent(spaces.exportIndex(c)),false);
  assert.deepEqual(spaces.exportSidecar(c),{devices:{}});
});
test('export uses the upload pipeline and stages acknowledgements until settlement',()=>{
  const c={...ctx,accountId:'pipeline'},local=blob({[id(1)]:tab(1)});
  spaces.noteLocalSpace(id(99),local,{tabs:local.tabs},c);
  const p=spaces.exportSpace(id(99),blob(),null,c,seal);
  assert.equal(p.upload.blob.tabs[id(1)].nav.v.url,'https://example.test/1');
  assert.ok(spaces.rebind(c.accountId).data.pending[id(99)].tabs[id(1)]);
  const beforePublish=Date.now();
  spaces.settleSpace(id(99),p,{blobStored:false},c);
  assert.equal(spaces.rebind(c.accountId).data.blobs[id(99)].lastPublishedAt,undefined);
  assert.ok(spaces.rebind(c.accountId).data.pending[id(99)].tabs[id(1)]);
  spaces.settleSpace(id(99),p,{blobStored:true},c);
  assert.ok(spaces.rebind(c.accountId).data.blobs[id(99)].lastPublishedAt>=beforePublish);
  assert.equal(spaces.rebind(c.accountId).data.blobs[id(99)].rev,p.upload.rev);
  assert.equal(spaces.rebind(c.accountId).data.pending[id(99)].index.rev,p.upload.rev);
  const ack=spaces.exportSpace(id(99),p.upload.blob,'server-v',c,seal);
  spaces.settleSpace(id(99),ack,{indexStored:true},c);
  assert.equal(spaces.rebind(c.accountId).data.pending[id(99)].tabs,undefined);
});
test('merge retains the full blob, fetched revision and merge stamp together',()=>{
  const c={...ctx,accountId:'merge'},local=blob({[id(1)]:tab(1)}),remote=blob({[id(2)]:tab(2)});
  spaces.noteLocalSpace(id(99),local,{tabs:local.tabs},c);
  const p=spaces.mergeSpace(id(99),remote,'remote-v',c,seal);
  const entry=spaces.rebind(c.accountId).data.blobs[id(99)];
  assert.deepEqual(Object.keys(entry.blob.tabs).sort(),[id(1),id(2)]);
  assert.equal(entry.rev,model.revisionOf(remote));assert.equal(entry.mergedAt,p.nextLastMergeAt);
  assert.deepEqual(entry.lastPublishable,remote);
});
test('successful settlement cannot discard an edit made while the upload was in flight',()=>{
  const c={...ctx,accountId:'flight'},local=blob({[id(1)]:tab(1)});
  spaces.noteLocalSpace(id(99),local,{tabs:local.tabs},c);
  const p=spaces.exportSpace(id(99),blob(),null,c,seal);
  const newer=structuredClone(local);newer.tabs[id(1)].name=f('Changed during PUT',200);
  spaces.noteLocalSpace(id(99),newer,{tabs:{[id(1)]:{name:newer.tabs[id(1)].name}}},c);
  spaces.settleSpace(id(99),p,{blobStored:true},c);
  assert.equal(spaces.rebind(c.accountId).data.pending[id(99)].tabs[id(1)].name.v,'Changed during PUT');
});
test('failed recovery uploads and a restart cannot return preserved records to sync',async()=>{
  const c={...ctx,accountId:'recovery-failure'},local=blob({[id(1)]:tab(1),[id(2)]:tab(2)});
  local.tabs[id(1)].pinned=f(true,200);
  spaces.noteLocalSpace(id(99),local,{tabs:local.tabs},c);
  spaces.rebind(c.accountId).update(d=>{d.blobs[id(99)].mergedAt=Date.now()-model.LIMITS.tombstoneMs-1;});
  const remote=blob({[id(1)]:tab(1)});remote.tabs[id(1)].name=f('Remote',101);
  const plan=spaces.mergeSpace(id(99),remote,'remote',c,seal);
  assert.ok(plan.recover.has(id(2)));assert.ok(plan.upload);
  assert.equal(spaces.snapshot(c).pending[id(99)].tabs?.[id(2)],undefined,'exclusion is durable before PUT');
  const late=structuredClone(local);late.tabs[id(2)].name=f('Edited during PUT',200);
  spaces.noteLocalSpace(id(99),late,{tabs:{[id(2)]:{name:late.tabs[id(2)].name}}},c);
  assert.equal(spaces.snapshot(c).pending[id(99)].tabs?.[id(2)],undefined,'in-flight edits stay in recovery before settlement or crash');
  assert.equal(spaces.snapshot(c).blobs[id(99)].blob.tabs[id(2)],undefined);
  spaces.settleSpace(id(99),plan,{blobStored:false},c);
  const saved=spaces.snapshot(c);
  assert.equal(saved.pending[id(99)].tabs?.[id(2)],undefined);
  assert.equal(saved.blobs[id(99)].blob.tabs[id(2)],undefined);
  assert.equal(saved.recoveries[id(99)].tabs[id(2)].name.v,'Edited during PUT');
  const {syncDevice}=require('./support/sync-device');
  const restarted=syncDevice({files:{'shared-spaces.json':saved}});
  try {
    const retry=restarted.spaces.mergeSpace(id(99),remote,'remote',c,seal);
    assert.equal(retry.upload?.blob.tabs[id(2)],undefined);
    assert.equal(restarted.spaces.snapshot(c).recoveries[id(99)].tabs[id(2)].name.v,'Edited during PUT');
  } finally {await restarted.dispose();}
});
test('invalid inactive shared-store containers cannot break the ordinary workspace status',()=>{
  const c={...ctx,accountId:'damaged'},s=spaces.rebind(c.accountId);
  s.update(d=>{d.enabled=false;d.index=null;d.knownIndex=[];d.pending=null;d.windows=7;d.sidecar=null;d.blobs.saved={preserved:true};});
  assert.equal(spaces.isEnabled(c),false);
  assert.equal(spaces.spaceCount(c),0);
  assert.deepEqual(spaces.exportIndex(c),{v:1,spaces:{}});
  assert.deepEqual(spaces.exportSidecar(c),{devices:{}});
  assert.equal(spaces.snapshot(c).blobs.saved.preserved,true,'repair must retain unrelated valid containers');
});
test('expired Space cleanup is not stranded by an obsolete publication receipt',()=>{
  const c={...ctx,accountId:'retired-space'},now=Date.now(),sid=id(77),s=spaces.rebind(c.accountId);
  s.update(d=>{d.index={v:1,spaces:{[sid]:{name:f('Old'),color:f(null),symbol:f(null),pos:f('a'+sid),deleted:f(true,now-model.LIMITS.tombstoneMs-1),rev:'0'.repeat(16),revAt:1,revBy:'a'}}};d.blobs[sid]={blob:blob()};d.pending[sid]={index:{rev:'x'}};});
  assert.deepEqual(spaces.retiredSpaceIds(c,now),[sid]);
  s.update(d=>{delete d.pending[sid].index;});assert.deepEqual(spaces.retiredSpaceIds(c,now),[sid]);
  spaces.forgetRetiredSpace(sid,c);const saved=spaces.snapshot(c);
  assert.equal(saved.index.spaces[sid],undefined);assert.equal(saved.blobs[sid],undefined);assert.equal(saved.pending[sid],undefined);
});
