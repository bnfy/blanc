'use strict';
// Broad fault/retention scenarios use isolated instances of the real desktop
// sync graph and the actual Worker fixture. Native window convergence has its
// own @two-clients scenario; this driver never stands in for that evidence.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {createSyncFixture}=require('./sync-fixture');
const {syncDevice,virtualClock}=require('../../unit/support/sync-device');
const m=require('../../../src/main/shared-spaces-model');
const {encrypt,decrypt}=require('../../../src/main/sync-crypto');
const {createSharingService}=require('../../../src/main/shared-spaces-service');
const surfaces=require('../../../src/main/shared-spaces-surfaces');
const key=Buffer.alloc(32,9),account='a'.repeat(64),id=n=>n.toString(16).padStart(32,'0'),sid=id(99),store='space-'+sid;
const f=(v,c=100,by='A')=>({v,c,by});
const tab=n=>({nav:f({url:'https://example.test/'+n,title:'Tab '+n}),name:f(null),pinned:f(false),groupId:f(null),pos:f(m.keyFor('','',id(n))),deleted:f(false)});
const blob=()=>({v:1,spaceId:sid,groups:{},tabs:{[id(1)]:tab(1)}});
const index=(spaceId=sid)=>({name:f('Work'),color:f('#426c4c'),symbol:f('briefcase'),pos:f(m.keyFor('','',spaceId)),deleted:f(false)});
async function runPeerCase(name){
 const fixture=await createSyncFixture(),devices=[],trace=[],realNow=Date.now;let wall=realNow();
 // Scope the wall clock as well as queue timers to this scenario. Retention,
 // Worker counters and the real device models must advance together.
 Date.now=()=>wall;
 async function advance(amount){wall+=amount;for(const d of devices)await d.clock.advance(amount);}
 function device(name,{syncTabs=false}={}){const clock=virtualClock(wall),d=syncDevice({clock,key,endpoint:fixture.url,record:{deviceId:name,syncTabs},fetch:(url,options)=>{assert.ok(String(url).startsWith(fixture.url+'/'));if((options?.method??'GET')==='GET'){const s=d.spaces.snapshot(d.ctx);trace.push({device:name,at:wall,item:String(url).split('/').at(-1),class:({S:'I',F:'S',R:'F',I:'R'})[s.nextClass],cap:s.windowLimit});}return fetch(url,options);}});d.ctx={accountId:account,deviceId:name};d.clock=clock;d.spaces.setEnabled(true,d.ctx);devices.push(d);return d;}
 async function drive(promise){let done=false,result,error;promise.then(v=>{done=true;result=v;},e=>{done=true;error=e;});for(let n=0;n<3000&&!done;n++){await new Promise(r=>setTimeout(r,2));const delay=Math.min(...devices.map(d=>d.clock.nextDelay()));if(Number.isFinite(delay))await advance(delay);}assert.ok(done,'the real request queue must settle');if(error)throw error;return result;}
 const read=s=>{const raw=fixture.blobs.get(`blob:${account}:${s}`);return raw?JSON.parse(decrypt(key,JSON.parse(raw).blob)):null;};
 const seed=(d,b=blob())=>{d.spaces.noteLocalSpace(b.spaceId,b,{tabs:b.tabs},d.ctx);d.spaces.setIndex({v:1,spaces:{[b.spaceId]:index(b.spaceId)}},d.ctx);};
 const a=device('A');
 try {
  if(name==='two Work Spaces'){
   seed(a);seed(a,{...blob(),spaceId:id(98)});await drive(a.sync.syncNow([store,'space-'+id(98)]));const b=device('B');await drive(b.sync.syncNow(['spaces']));
   assert.deepEqual(Object.values(b.spaces.snapshot(b.ctx).index.spaces).map(r=>r.name.v),['Work','Work']);return;
  }
  if(name==='tombstone budget and expiry'){
   const remote={...blob(),tabs:{}},large=n=>{const r=tab(n);r.nav=f({url:'https://example.test/'+n+'?q='+'x'.repeat(1850),title:'T'.repeat(200)});r.name=f('N'.repeat(100));return r;};
   for(let n=10;n<500;n++){remote.tabs[id(n)]={...large(n),deleted:f(true,wall)};if(!m.blobFits(remote,text=>encrypt(key,text))){delete remote.tabs[id(n)];break;}}
   assert.ok(Object.keys(remote.tabs).length>50);seed(a,remote);await drive(a.sync.syncNow([store]));
   const local=structuredClone(remote),edits={};for(const n of [1,2,3]){local.tabs[id(n)]=large(n);edits[id(n)]=local.tabs[id(n)];}
   a.spaces.noteLocalSpace(sid,local,{tabs:edits},a.ctx);await drive(a.sync.syncNow([store]));
   let status=a.sync.spaceStatus(sid);assert.equal(status.reason,'tombstones');assert.ok(status.unsyncedTabIds.length);assert.equal(surfaces.markState(a.sync.sharedStatus(),status),'full');
   assert.equal(a.spaces.rebind(account).flush(),true);const saved=JSON.parse(fs.readFileSync(path.join(a.tmp,'shared-spaces.json'),'utf8'));
   for(const held of status.unsyncedTabIds){assert.ok(saved.pending[sid].tabs[held],'held writes reach disk');assert.ok(saved.blobs[sid].unsynced.includes(held));}
   // A regularly syncing device keeps its merge stamp fresh while waiting
   // for expiry; it must not accidentally exercise the stale-replica path.
   await advance(29*86400000);await drive(a.sync.syncNow([store]));await advance(2*86400000);await drive(a.sync.syncNow([store]));
   status=a.sync.spaceStatus(sid);assert.equal(status.reason,null);assert.deepEqual(status.unsyncedTabIds,[]);assert.notEqual(surfaces.markState(a.sync.sharedStatus(),status),'full');
   const published=read(store);assert.deepEqual(Object.keys(published.tabs).sort(),[id(1),id(2),id(3)]);assert.ok(fixture.requests.some(r=>r.store===store&&r.method==='PUT'&&r.status===200));return;
  }
  seed(a);await drive(a.sync.syncNow([store]));
  if(name==='stale replica recovery at the Space cap'){
   for(let n=0;n<25;n++)assert.equal(a.workspaces.create({name:'Local '+n,capture:{urls:['https://local.test/'+n]}}).ok,true);
   const local=blob();local.tabs[id(2)]=tab(2);a.spaces.noteLocalSpace(sid,local,{tabs:{[id(2)]:local.tabs[id(2)]}},a.ctx);
   a.spaces.rebind(account).update(d=>{d.blobs[sid].mergedAt=Date.now()-m.LIMITS.tombstoneMs-1;});
   await drive(a.sync.syncNow([store]));
   const service=createSharingService({sync:a.sync,spaces:a.spaces,workspaces:a.workspaces,offered:()=>true,isOpen:()=>false,recoveryName:n=>n+' · kept on this device'});
   await service.reconcile();await service.reconcile();const rows=a.workspaces.list().filter(w=>w.recoveredFrom===sid);
   assert.equal(rows.length,1);assert.equal(rows[0].urls.filter(u=>u==='https://example.test/2').length,1);assert.ok(a.workspaces.list().length>25);assert.equal(read(store).tabs[id(2)],undefined);return;
  }
  if(name==='lost index reconciliation'){
   const b=device('B');await drive(b.sync.syncNow(['spaces',store]));
   fixture.inject({type:'disappear',store:'spaces'});const value=blob();value.tabs[id(1)].name=f('Changed',200);a.spaces.noteLocalSpace(sid,value,{tabs:{[id(1)]:{name:value.tabs[id(1)].name}}},a.ctx);await drive(a.sync.syncNow([store]));
   assert.equal(read('spaces'),null);
   await drive(b.sync.syncNow());assert.equal(b.spaces.snapshot(b.ctx).blobs[sid].blob.tabs[id(1)].name.v,'Changed');return;
  }
  if(name==='stale read cannot roll back'){
   fixture.inject({type:'stale',accountId:account,store,times:1});const value=blob();value.tabs[id(1)].name=f('Newest',300);a.spaces.noteLocalSpace(sid,value,{tabs:{[id(1)]:{name:value.tabs[id(1)].name}}},a.ctx);
   await drive(a.sync.syncNow([store]));await drive(a.sync.syncNow([store]));assert.equal(read(store).tabs[id(1)].name.v,'Newest');return;
  }
  if(name==='same-version writes replay pending fields'){
   const b=device('B');await drive(b.sync.syncNow([store]));const al=blob(),bl=blob();al.tabs[id(1)].name=f('A edit',300);bl.tabs[id(1)].pinned=f(true,301,'B');
   a.spaces.noteLocalSpace(sid,al,{tabs:{[id(1)]:{name:al.tabs[id(1)].name}}},a.ctx);b.spaces.noteLocalSpace(sid,bl,{tabs:{[id(1)]:{pinned:bl.tabs[id(1)].pinned}}},b.ctx);
   const from=fixture.requests.length;
   fixture.raceNextPuts({accountId:account,store});await drive(Promise.all([a.sync.syncNow([store]),b.sync.syncNow([store])]));
   const puts=fixture.requests.slice(from).filter(r=>r.method==='PUT'&&r.store===store);
   assert.deepEqual(puts.slice(0,2).map(r=>r.status).sort(),[200,409]);
   assert.ok(puts.slice(2).some(r=>r.status===200),'loser must replay its pending edit on retry');
   await drive(a.sync.syncNow([store]));await drive(b.sync.syncNow([store]));await drive(a.sync.syncNow([store]));
   assert.equal(read(store).tabs[id(1)].name.v,'A edit');assert.equal(read(store).tabs[id(1)].pinned.v,true);return;
  }
  if(name==='unrecoverable write is reported honestly'){
   const local=blob();local.tabs[id(1)].name=f('Lost',500);a.spaces.noteLocalSpace(sid,local,{tabs:{[id(1)]:{name:local.tabs[id(1)].name}}},a.ctx);await drive(a.sync.syncNow([store]));await drive(a.sync.syncNow([store]));
   assert.equal(a.spaces.snapshot(a.ctx).pending[sid]?.tabs,undefined);
   await fixture.loseBlob(account,store);await a.dispose();devices.splice(devices.indexOf(a),1);
   const fresh=device('fresh');assert.equal(read(store),null);assert.equal(fresh.spaces.snapshot(fresh.ctx).blobs[sid],undefined);
   fixture.inject({type:'network',store});fresh.spaces.noteLocalSpace(sid,blob(),{},fresh.ctx);await drive(fresh.sync.syncNow([store]));
   assert.equal(surfaces.markState(fresh.sync.sharedStatus(),fresh.sync.spaceStatus(sid)),'notSynced');assert.ok(fresh.sync.spaceStatus(sid).failed);return;
  }
  if(name==='exact occurrence dedupe and stale sidecar'){
   const list=[{url:'https://example.test/1',title:'Tab 1',sharedSpaceId:sid},{url:'https://example.test/1',title:'Tab 1'}];
   a.tabsync.setSnapshotProvider(()=>({tabList:list,groups:[]}));a.sync.setTabStateReady(true);a.sync.setSyncTabs(true);
   await drive(a.sync.syncNow(['session']));await drive(a.sync.syncNow(['shared']));
   const b=device('B');b.sync.setSharedVisibilityProvider(()=>[sid]);await drive(b.sync.syncNow(['spaces',store,'session','shared']));
   let shown=b.sync.listRemoteDevices().find(d=>d.deviceId==='A');assert.equal(shown.tabs.length,1);assert.equal(shown.tabs[0].url,list[1].url);
   const prior=read('shared').devices.A.forUpdatedAt;list[1].title='Unshared duplicate changed';await advance(1);await drive(a.sync.syncNow(['session']));
   assert.ok(read('session').devices.A.updatedAt>prior);assert.equal(read('shared').devices.A.forUpdatedAt,prior,'the older sidecar remains on the Worker');
   await drive(b.sync.syncNow(['session','shared']));shown=b.sync.listRemoteDevices().find(d=>d.deviceId==='A');assert.equal(shown.tabs.length,2,'a stale binding cannot hide either occurrence');
   assert.ok(fixture.requests.some(r=>r.store==='shared'&&r.method==='GET'&&r.status===200));return;
  }
  if(name==='429 backoff and fair recovery'){
   fixture.inject({type:'429',store,times:2});await drive(a.sync.syncNow([store]));await drive(a.sync.syncNow([store]));assert.equal(a.sync.sharedStatus().backoff,true);
   const local=blob();local.tabs[id(1)].name=f('Pending during backoff',wall);a.spaces.noteLocalSpace(sid,local,{tabs:{[id(1)]:{name:local.tabs[id(1)].name}}},a.ctx);
   const start=trace.length;await drive(a.sync.syncNow());const underBackoff=trace.slice(start).filter(r=>r.cap<10);
   assert.deepEqual(new Set(underBackoff.slice(0,4).map(r=>r.class)),new Set(['I','S','F','R']),'all four waiting classes get a turn before any repeats');
   for(const cls of ['I','S','F','R'])assert.ok(underBackoff.some(r=>r.class===cls),'backoff must serve '+cls+' through the real queue');
   for(const row of underBackoff)assert.ok(trace.filter(r=>r.device==='A'&&r.at>row.at-60000&&r.at<=row.at).length<=row.cap);
   assert.equal(fixture.requests.filter(r=>r.status===429).length,2);assert.equal(read(store).tabs[id(1)].name.v,'Pending during backoff');
   await advance(15*60000);await drive(a.sync.syncNow());assert.equal(a.spaces.snapshot(a.ctx).windowLimit,10);assert.equal(a.sync.sharedStatus().backoff,false);return;
  }
  throw new Error('Unknown Shared Spaces peer scenario: '+name);
 } finally {try{for(const d of devices){await drive(d.sync.disable({wipeRemote:false}));await d.dispose();}await fixture.close();}finally{Date.now=realNow;}}
}
module.exports={runPeerCase};
