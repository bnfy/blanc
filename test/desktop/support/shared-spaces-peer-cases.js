'use strict';
// Broad fault/retention scenarios use isolated instances of the real desktop
// sync graph and the actual Worker fixture. Native window convergence has its
// own @two-clients scenario; this driver never stands in for that evidence.
const assert=require('node:assert/strict');
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
 const fixture=await createSyncFixture(),devices=[];
 function device(name){const clock=virtualClock(),d=syncDevice({clock,key,endpoint:fixture.url,record:{deviceId:name},fetch:(url,options)=>{assert.ok(String(url).startsWith(fixture.url+'/'));return fetch(url,options);}});d.ctx={accountId:account,deviceId:name};d.clock=clock;d.spaces.setEnabled(true,d.ctx);devices.push(d);return d;}
 async function drive(promise){let done=false,result,error;promise.then(v=>{done=true;result=v;},e=>{done=true;error=e;});for(let n=0;n<3000&&!done;n++){await new Promise(r=>setTimeout(r,2));const delay=Math.min(...devices.map(d=>d.clock.nextDelay()));if(Number.isFinite(delay))for(const d of devices)await d.clock.advance(delay);}assert.ok(done,'the real request queue must settle');if(error)throw error;return result;}
 const read=s=>{const raw=fixture.env.records.get(`blob:${account}:${s}`);return raw?JSON.parse(decrypt(key,JSON.parse(raw).blob)):null;};
 const seed=(d,b=blob())=>{d.spaces.noteLocalSpace(b.spaceId,b,{tabs:b.tabs},d.ctx);d.spaces.setIndex({v:1,spaces:{[b.spaceId]:index(b.spaceId)}},d.ctx);};
 const a=device('A');
 try {
  if(name==='two Work Spaces'){
   seed(a);seed(a,{...blob(),spaceId:id(98)});await drive(a.sync.syncNow([store,'space-'+id(98)]));const b=device('B');await drive(b.sync.syncNow(['spaces']));
   assert.deepEqual(Object.values(b.spaces.snapshot(b.ctx).index.spaces).map(r=>r.name.v),['Work','Work']);return;
  }
  if(name==='tombstone budget and expiry'){
   const now=Date.now(),remote=blob();remote.tabs[id(1)].deleted=f(true,now);
   const local=structuredClone(remote);local.tabs[id(2)]=tab(2);
   // Deliberately tiny capacity keeps this retention vector bounded. The
   // envelope is still produced by the real encryptor before the test limit.
   const limit=Buffer.byteLength(JSON.stringify(encrypt(key,JSON.stringify(remote))))+10;
   const tight=text=>{const value=encrypt(key,text);return Buffer.byteLength(JSON.stringify(value))>limit?{ct:'x'.repeat(m.LIMITS.blobBytes)}:value;};
   const options={localBlob:local,fetchedBlob:remote,pending:{tabs:{[id(2)]:local.tabs[id(2)]}},lastMergeAt:now,deviceId:'A',encryptFn:tight};
   const refused=m.pushPlan({...options,now});assert.equal(refused.reason,'tombstones');assert.ok(refused.unsynced.has(id(2)));
   assert.equal(surfaces.markState({available:true},{reason:refused.reason}),'full');
   const retry=m.pushPlan({...options,lastMergeAt:now+m.LIMITS.tombstoneMs,now:now+m.LIMITS.tombstoneMs+1});assert.equal(retry.reason,null);assert.ok(retry.upload.blob.tabs[id(2)]);assert.equal(retry.upload.blob.tabs[id(1)],undefined);return;
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
   fixture.raceNextPuts({accountId:account,store});await drive(Promise.all([a.sync.syncNow([store]),b.sync.syncNow([store])]));
   await drive(a.sync.syncNow([store]));await drive(b.sync.syncNow([store]));await drive(a.sync.syncNow([store]));
   assert.equal(read(store).tabs[id(1)].name.v,'A edit');assert.equal(read(store).tabs[id(1)].pinned.v,true);return;
  }
  if(name==='unrecoverable write is reported honestly'){
   const local=blob();local.tabs[id(1)].name=f('Lost',500);a.spaces.noteLocalSpace(sid,local,{tabs:{[id(1)]:{name:local.tabs[id(1)].name}}},a.ctx);await drive(a.sync.syncNow([store]));await drive(a.sync.syncNow([store]));
   assert.equal(a.spaces.snapshot(a.ctx).pending[sid]?.tabs,undefined);
   fixture.env.records.delete(`blob:${account}:${store}`);await a.dispose();devices.splice(devices.indexOf(a),1);
   const fresh=device('fresh');assert.equal(read(store),null);assert.equal(fresh.spaces.snapshot(fresh.ctx).blobs[sid],undefined);
   fixture.inject({type:'network',store});fresh.spaces.noteLocalSpace(sid,blob(),{},fresh.ctx);await drive(fresh.sync.syncNow([store]));
   assert.equal(surfaces.markState(fresh.sync.sharedStatus(),fresh.sync.spaceStatus(sid)),'notSynced');assert.ok(fresh.sync.spaceStatus(sid).failed);return;
  }
  if(name==='exact occurrence dedupe and stale sidecar'){
   const devices=[{deviceId:'B',updatedAt:10,tabs:[{url:'https://same.test/'},{url:'https://same.test/'}]}],binding={devices:{B:{forUpdatedAt:10,tabs:[{i:0,spaceId:sid}]}}};
   a.spaces.mergeSidecar({devices:{B:{forUpdatedAt:Date.now(),tabs:[{i:0,spaceId:sid}]}}},a.ctx);
   assert.equal(surfaces.hideOccurrences(devices,binding,new Set([sid]))[0].tabs.length,1);
   binding.devices.B.forUpdatedAt=9;assert.equal(surfaces.hideOccurrences(devices,binding,new Set([sid]))[0].tabs.length,2);return;
  }
  if(name==='429 backoff and fair recovery'){
   fixture.inject({type:'429',store,times:1});await drive(a.sync.syncNow([store]));assert.equal(a.sync.sharedStatus().backoff,true);
   await drive(a.sync.syncNow([store]));assert.equal(fixture.requests.filter(r=>r.status===429).length,1);
   const {createScheduler}=require('../../../src/main/sync-scheduler');const clock=virtualClock();let scheduler=createScheduler({now:clock.now,monotonic:clock.monotonic});scheduler.onRateLimited();
   const seen=[];for(let n=0;n<1000;n++){
    scheduler.markIndexDue();seen.push(scheduler.next({I:true,S:['pending'],F:['bookmarks'],R:[store]}).class);scheduler.record();await clock.advance(60001);
    if(n%50===0)scheduler=createScheduler({...scheduler.snapshot(),now:clock.now,monotonic:clock.monotonic});
   }
   assert.deepEqual(seen.slice(0,4),['I','S','F','R']);for(const cls of ['I','S','F','R'])assert.equal(seen.filter(x=>x===cls).length,250);
   assert.equal(scheduler.snapshot().windowLimit,10);return;
  }
  throw new Error('Unknown Shared Spaces peer scenario: '+name);
 } finally {for(const d of devices){await drive(d.sync.disable({wipeRemote:false}));await d.dispose();}await fixture.close();}
}
module.exports={runPeerCase};
