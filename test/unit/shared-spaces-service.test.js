'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {syncDevice}=require('./support/sync-device');
const sharing=require('../../src/main/shared-spaces-sharing');
let createSharingService;try{({createSharingService}=require('../../src/main/shared-spaces-service'));}catch(error){if(error.code!=='MODULE_NOT_FOUND')throw error;}
const id=n=>n.toString(16).padStart(32,'0');
function setup(t,{packaged=false}={}) {
  assert.equal(typeof createSharingService,'function');
  const d=syncDevice();t.after(()=>d.dispose());let rows=[{id:'local',name:'Work',color:'#426c4c',symbol:'briefcase',urls:['https://one.test/'],meta:[{title:'One'}],pinned:[false],groups:[],groupIds:[null],activeIndex:0}];
  const events=[];let next=100;
  const repo={list:()=>rows,flushPending:()=>({ok:true}),setSharedLink:(id,patch)=>{const row=rows.find(w=>w.id===id);Object.assign(row,structuredClone(patch));events.push('link-flushed');return {ok:true,workspace:row};},
    upsertShared:spec=>{let row=rows.find(w=>spec.recoveredFrom?w.recoveredFrom===spec.recoveredFrom:w.sharedId===spec.sharedId);if(!row){row={id:'remote-'+rows.length};rows.push(row);}Object.assign(row,spec.capture,spec);events.push('copy-flushed');return {ok:true,workspace:row};},
    clearSharedLinks:()=>{for(const row of rows){delete row.sharedId;delete row.sharedLink;}return {ok:true};}};
  const sync={sharedContext:()=>({accountId:d.record.accountId,deviceId:'desktop'}),sharedIndexPreview:async()=>({ok:true}),sharedPayloadFits:()=>true,
    setSyncSpaces:on=>{d.spaces.setEnabled(on,sync.sharedContext());events.push(on?'on':'off');return {enabled:on};},
    syncNow:async names=>{events.push(['sync',names]);return {ok:true};}};
  const service=createSharingService({sync,spaces:d.spaces,workspaces:repo,offered:()=>!packaged,now:()=>1000,ids:()=>id(next++),
    isOpen:()=>false,bind:()=>events.push('bind'),changed:()=>{},recoverNative:()=>events.push('move'),recoveryName:name=>name+' · kept on this device'});
  return {d,service,sync,repo,events,get rows(){return rows;},setRows:value=>{rows=value;}};
}
test('a refused offering gate exposes no sharing sheet or mutation',async t=>{
  const h=setup(t,{packaged:true});assert.equal((await h.service.preview()).offered,false);
  assert.equal((await h.service.apply({enabled:true,selections:[{id:'local',mode:'copy'}]})).ok,false);
  assert.deepEqual(h.events,[]);
});
test('confirmation binds a fresh Space before any publication and off preserves its dormant edits',async t=>{
  const h=setup(t),view=await h.service.preview();assert.equal(view.choices[0].checked,true);
  const result=await h.service.apply({enabled:true,selections:[{id:'local',mode:'copy'}]});assert.equal(result.ok,true);
  const row=h.rows[0];assert.ok(row.sharedId);assert.equal(row.sharedLink,'active');
  assert.ok(h.events.indexOf('link-flushed')<h.events.indexOf('on'));
  const before=h.d.spaces.snapshot(h.sync.sharedContext()).pending[row.sharedId];
  await h.service.apply({enabled:false});assert.equal(row.sharedLink,'dormant');
  assert.deepEqual(h.d.spaces.snapshot(h.sync.sharedContext()).pending[row.sharedId],before);
  assert.equal(h.d.spaces.isEnabled(h.sync.sharedContext()),false);
});
test('Rejoin keeps record clocks and starts with the ordinary fetch/merge cycle',async t=>{
  const h=setup(t);await h.service.apply({enabled:true,selections:[{id:'local',mode:'copy'}]});await h.service.apply({enabled:false});
  const before=h.d.spaces.snapshot(h.sync.sharedContext()),sid=h.rows[0].sharedId;
  await h.service.apply({enabled:true,selections:[{id:'local',mode:'rejoin'}]});
  assert.equal(h.rows[0].sharedId,sid);assert.deepEqual(h.d.spaces.snapshot(h.sync.sharedContext()).blobs[sid].blob,before.blobs[sid].blob);
  assert.deepEqual(h.events.at(-1),['sync',['space-'+sid]]);
});
test('recovery copy is flushed before native removal and repeated recovery adds no duplicate',async t=>{
  const h=setup(t);await h.service.apply({enabled:true,selections:[{id:'local',mode:'copy'}]});const sid=h.rows[0].sharedId;
  const entry=h.d.spaces.snapshot(h.sync.sharedContext()).blobs[sid].blob;
  h.d.spaces.rebind(h.sync.sharedContext().accountId).update(d=>{d.recoveries[sid]={tabs:entry.tabs,groups:{}};});
  h.events.length=0;await h.service.reconcile();assert.ok(h.events.indexOf('copy-flushed')<h.events.indexOf('move'));
  const recovery=h.rows.find(row=>row.recoveredFrom===sid);assert.ok(recovery);assert.equal(recovery.urls.length,1);
  await h.service.reconcile();assert.equal(h.rows.filter(row=>row.recoveredFrom===sid).length,1);assert.equal(recovery.urls.length,1);
});
test('a failed local binding leaves staged records excluded after restart',async t=>{
  const h=setup(t);h.repo.setSharedLink=()=>({ok:false});
  const result=await h.service.apply({enabled:true,selections:[{id:'local',mode:'copy'}]});
  assert.equal(result.ok,false);assert.equal(result.error,'save-failed');
  assert.equal(h.events.includes('on'),false);
  const ctx=h.sync.sharedContext(),state=h.d.spaces.snapshot(ctx);
  assert.equal(Object.keys(state.blobs).length,1);
  assert.deepEqual(h.d.spaces.spaceIds(ctx),[]);
  assert.equal(state.draftIds.length,1);
});
test('pairing question is remembered per device and only offered while sharing is off',async t=>{
 const h=setup(t),devices=[],options={sync:h.sync,spaces:h.d.spaces,workspaces:h.repo,offered:()=>true,devices:()=>devices};
 const service=createSharingService(options);assert.equal(service.question(),null);service.armPairing();devices.push({deviceId:'peer',name:'Laptop'});assert.equal(service.question().name,'Laptop');
 assert.equal(service.acknowledge('peer'),true);assert.equal(service.question(),null);
 assert.equal(createSharingService(options).question(),null);
 h.d.spaces.setEnabled(true,h.sync.sharedContext());assert.equal(createSharingService({...options,devices:()=>[{deviceId:'new',name:'New'}]}).question(),null);
});
test('an account change during the index fetch cannot bind or enable a Space',async t=>{
 const h=setup(t),original=h.sync.sharedContext();let ctx=original;h.sync.sharedContext=()=>ctx;
 h.sync.sharedIndexPreview=async()=>{ctx={...original,accountId:'b'.repeat(64)};return {ok:true};};
 const result=await h.service.apply({enabled:true,selections:[{id:'local',mode:'copy'}]});
 assert.equal(result.error,'account-changed');assert.equal(h.rows[0].sharedId,undefined);assert.equal(h.events.includes('on'),false);
});
test('local Space identity edits and deletion publish field clocks, including while dormant',async t=>{
 const h=setup(t);await h.service.apply({enabled:true,selections:[{id:'local',mode:'copy'}]});await h.service.apply({enabled:false});
 const row=h.rows[0],sid=row.sharedId,before=h.d.spaces.snapshot(h.sync.sharedContext()).index.spaces[sid];
 assert.equal(h.service.metadata(row,{name:'Renamed'}),true);
 const renamed=h.d.spaces.snapshot(h.sync.sharedContext()).index.spaces[sid];assert.equal(renamed.name.v,'Renamed');assert.ok(renamed.name.c>before.name.c);
 assert.equal(h.service.metadata(row,{deleted:true}),true);assert.equal(h.d.spaces.snapshot(h.sync.sharedContext()).index.spaces[sid].deleted.v,true);
});
test('a reordered library has valid positions in the local Space order',async t=>{
 const h=setup(t);h.setRows([...h.rows,{...structuredClone(h.rows[0]),id:'second',name:'Two'}]);
 await h.service.apply({enabled:true,selections:[{id:'local',mode:'copy'},{id:'second',mode:'copy'}]});h.setRows([...h.rows].reverse());
 assert.equal(h.service.reorder(),true);const state=h.d.spaces.snapshot(h.sync.sharedContext());
 assert.ok(state.index.spaces[h.rows[0].sharedId].pos.v<state.index.spaces[h.rows[1].sharedId].pos.v);
});
test('restoring a deleted shared Space keeps it local instead of reviving its final tombstone',async t=>{
 const h=setup(t);await h.service.apply({enabled:true,selections:[{id:'local',mode:'copy'}]});const row=h.rows[0];h.service.metadata(row,{deleted:true});
 assert.equal(h.service.restored(row.id),true);assert.equal(row.sharedLink,'dormant');assert.equal(h.d.spaces.isDormant(row.sharedId,h.sync.sharedContext()),true);
 assert.equal(h.d.spaces.snapshot(h.sync.sharedContext()).index.spaces[row.sharedId].deleted.v,true);
});
test('retrying a partial first share reuses staged identities and does not publish duplicates',async t=>{
 const h=setup(t);h.setRows([...h.rows,{...structuredClone(h.rows[0]),id:'second',name:'Two'}]);
 const save=h.repo.setSharedLink;let failed=false;h.repo.setSharedLink=(id,patch)=>{if(id==='second'&&!failed){failed=true;return {ok:false};}return save(id,patch);};
 const selections=[{id:'local',mode:'copy'},{id:'second',mode:'copy'}];
 assert.equal((await h.service.apply({enabled:true,selections})).ok,false);const first=h.rows[0].sharedId;
 assert.equal((await h.service.apply({enabled:true,selections})).ok,true);assert.equal(h.rows[0].sharedId,first);
 assert.equal(Object.keys(h.d.spaces.snapshot(h.sync.sharedContext()).index.spaces).length,2);
});
test('account rebinding clears staged plans, pairing decisions and recovery notices',async t=>{
 const h=setup(t),store=h.d.spaces.rebind(h.sync.sharedContext().accountId);
 store.update(data=>{data.draftPlans={secret:{blob:'old account content'}};data.draftIds=['a'.repeat(32)];data.askedDeviceIds=['old-peer'];data.pairingBaseline=['old-peer'];data.recoveryNoticeSeen=true;});
 const next=h.d.spaces.rebind('b'.repeat(64)).data;
 assert.deepEqual(next.draftPlans,{});assert.deepEqual(next.draftIds,[]);assert.deepEqual(next.askedDeviceIds,[]);assert.equal(next.pairingBaseline,null);assert.equal(next.recoveryNoticeSeen,false);
});
test('completed recovery is not replayed after the user removes its tabs or Space',async t=>{
 const h=setup(t);await h.service.apply({enabled:true,selections:[{id:'local',mode:'copy'}]});const sid=h.rows[0].sharedId,blob=h.d.spaces.snapshot(h.sync.sharedContext()).blobs[sid].blob;
 h.d.spaces.rebind(h.sync.sharedContext().accountId).update(d=>{d.recoveries[sid]={tabs:blob.tabs,groups:{}};});await h.service.reconcile();
 const recovered=h.rows.find(row=>row.recoveredFrom===sid);for(const k of ['urls','tabIds','meta','pinned','groupIds'])recovered[k]=[];await h.service.reconcile();assert.equal(recovered.urls.length,0);
 h.setRows(h.rows.filter(row=>row!==recovered));await h.service.reconcile();assert.equal(h.rows.some(row=>row.recoveredFrom===sid),false);
});
test('a tombstoned Space without a runtime moves out of the local library',async t=>{
 const h=setup(t);h.repo.remove=id=>{h.setRows(h.rows.filter(row=>row.id!==id));return {ok:true};};
 await h.service.apply({enabled:true,selections:[{id:'local',mode:'copy'}]});h.service.metadata(h.rows[0],{deleted:true});await h.service.reconcile();assert.equal(h.rows.length,0);
});
const addRow=(h,rowId,name)=>h.rows.push({id:rowId,name,color:'#426c4c',symbol:'briefcase',urls:['https://'+rowId+'.test/'],meta:[{title:name}],pinned:[false],groups:[],groupIds:[null],activeIndex:0});
test('the sheet opens from the saved index without a fetch, then the full preview fetches',async t=>{
  const h=setup(t);let fetches=0;h.sync.sharedIndexPreview=async()=>{fetches++;return {ok:true};};
  const local=await h.service.preview({local:true});assert.equal(fetches,0);assert.equal(local.ok,true);assert.equal(local.fresh,false);
  assert.equal(local.choices[0].checked,true);assert.equal(local.choices[0].shared,false);
  const fresh=await h.service.preview();assert.equal(fetches,1);assert.equal(fresh.fresh,true);
});
test('a failed fetch still fails the full preview, not the saved-index one',async t=>{
  const h=setup(t);h.sync.sharedIndexPreview=async()=>({ok:false,error:'unavailable'});
  assert.equal((await h.service.preview({local:true})).ok,true);
  assert.deepEqual(await h.service.preview(),{offered:true,ok:false,error:'unavailable'});
});
test('with the switch on, Choose Spaces adds another Space without switching off or doubling one',async t=>{
  const h=setup(t);await h.service.apply({enabled:true,selections:[{id:'local',mode:'copy'}]});const sid=h.rows[0].sharedId;
  addRow(h,'later','Default');h.events.length=0;
  const view=await h.service.preview({local:true});
  const work=view.choices.find(choice=>choice.id==='local'),later=view.choices.find(choice=>choice.id==='later');
  assert.equal(work.shared,true);assert.equal(work.checked,true);assert.equal(later.shared,false);assert.equal(later.checked,true);
  const result=await h.service.apply({enabled:true,selections:[{id:'local',mode:'copy'},{id:'later',mode:'copy'}]});assert.equal(result.ok,true);
  assert.equal(h.rows[0].sharedId,sid,'the shared Space keeps its library id');
  assert.ok(h.rows[1].sharedId);assert.equal(h.rows[1].sharedLink,'active');
  assert.equal(h.events.includes('on'),false,'the running sync is not restarted');assert.equal(h.events.includes('off'),false);
  assert.deepEqual(h.events.at(-1),['sync',['space-'+h.rows[1].sharedId]]);
  assert.equal(h.d.spaces.spaceCount(h.sync.sharedContext()),2);
});
test('a Space saved while the switch is on is shared by itself; one left unticked stays here',async t=>{
  const h=setup(t);addRow(h,'kept','Private');await h.service.preview({local:true});
  await h.service.apply({enabled:true,selections:[{id:'local',mode:'copy'}]});
  assert.deepEqual(await h.service.autoShare(),{ok:true,shared:[]});assert.equal(h.rows[1].sharedId,undefined,'the unticked Space stays on this device');
  addRow(h,'new','Default');
  assert.deepEqual(await h.service.autoShare(),{ok:true,shared:['new']});
  assert.ok(h.rows[2].sharedId);assert.equal(h.rows[2].sharedLink,'active');assert.equal(h.rows[1].sharedId,undefined);
  assert.deepEqual(await h.service.autoShare(),{ok:true,shared:[]},'nothing is shared twice');
  assert.equal(h.d.spaces.spaceCount(h.sync.sharedContext()),2);
});
test('nothing is shared by itself while the switch is off, or the first time after an update',async t=>{
  const h=setup(t);addRow(h,'new','Default');
  assert.deepEqual(await h.service.autoShare(),{ok:true,shared:[]});assert.equal(h.rows[1].sharedId,undefined);
  // Switched on by an earlier version: no record of what the sheet showed.
  await h.service.apply({enabled:true,selections:[{id:'local',mode:'copy'}]});
  h.d.spaces.rebind(h.sync.sharedContext().accountId).update(d=>{d.knownWorkspaceIds=null;});
  addRow(h,'older','Older');
  assert.deepEqual(await h.service.autoShare(),{ok:true,shared:[]});assert.equal(h.rows[2].sharedId,undefined);
  addRow(h,'newest','Newest');
  assert.deepEqual(await h.service.autoShare(),{ok:true,shared:['newest']});
});
test('a Space too large to share by itself stays here and is not retried',async t=>{
  const h=setup(t);await h.service.apply({enabled:true,selections:[{id:'local',mode:'copy'}]});
  addRow(h,'big','Big');h.sync.sharedPayloadFits=()=>false;let fetches=0;h.sync.sharedIndexPreview=async()=>{fetches++;return {ok:true};};
  assert.deepEqual(await h.service.autoShare(),{ok:true,shared:[]});assert.equal(h.rows[1].sharedId,undefined);
  h.sync.sharedPayloadFits=()=>true;
  assert.deepEqual(await h.service.autoShare(),{ok:true,shared:[]});assert.equal(fetches,0);
});
test('Turn on returns once everything is saved here, without waiting for the upload',async t=>{
  const h=setup(t);let finish;h.sync.syncNow=names=>{h.events.push(['sync',names]);return new Promise(resolve=>{finish=resolve;});};
  let ages=[];h.sync.sharedIndexPreview=async options=>{ages.push(options?.maxAge??0);return {ok:true};};
  const result=await h.service.apply({enabled:true,selections:[{id:'local',mode:'copy'}]});
  assert.deepEqual(result,{ok:true,enabled:true},'resolves while the upload is still running, and no promise crosses IPC');
  assert.ok(h.rows[0].sharedId);assert.equal(h.d.spaces.isEnabled(h.sync.sharedContext()),true);
  assert.deepEqual(h.events.at(-1),['sync',['space-'+h.rows[0].sharedId]]);assert.deepEqual(ages,[30000]);
  let waited=false;const harness=h.service.apply({enabled:true,selections:[]},{waitForUpload:true}).then(()=>{waited=true;});
  await harness;assert.equal(waited,true,'nothing to upload: the harness call returns');finish({ok:true});
});
