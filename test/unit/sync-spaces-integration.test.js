'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createSyncFixture}=require('../desktop/support/sync-fixture');
const {syncDevice,virtualClock}=require('./support/sync-device');
const model=require('../../src/main/shared-spaces-model');
const {encrypt,decrypt}=require('../../src/main/sync-crypto');
const key=Buffer.alloc(32,9),account='a'.repeat(64),id=n=>n.toString(16).padStart(32,'0'),sid=id(99),store='space-'+sid;
const field=(v,c=100,by='A')=>({v,c,by});
const tab=n=>({nav:field({url:'https://example.test/'+n,title:'T'+n}),name:field(null),pinned:field(false),groupId:field(null),pos:field(model.keyFor('','',id(n))),deleted:field(false)});
const blob=()=>({v:1,spaceId:sid,groups:{},tabs:{[id(1)]:tab(1)}});
const index=()=>({v:1,spaces:{[sid]:{name:field('Work'),color:field('#426c4c'),symbol:field('briefcase'),pos:field(model.keyFor('','',sid)),deleted:field(false)}}});
const tick=()=>new Promise(r=>setTimeout(r,5));
async function environment(t) {
  let wall=1800000000000;t.mock.method(Date,'now',()=>wall);
  const fixture=await createSyncFixture(),devices=[];
  function device(name,{seed=true,legacyDelete=false,files={},afterFetch=null}={}) {
    const clock=virtualClock(wall);
    const d=syncDevice({clock,key,files,endpoint:fixture.url,record:{deviceId:name},fetch:async(url,options)=>{
      assert.ok(String(url).startsWith(fixture.url+'/'),'integration requests must never leave the local fixture');
      if(legacyDelete&&options?.method==='DELETE'&&String(url).includes('/space-'))throw new Error('legacy Worker would wipe the whole account');
      const response=await fetch(url,options);afterFetch?.(String(url),options);if(!legacyDelete)return response;
      const headers=new Headers(response.headers);headers.delete('X-Blanc-Space-Delete');return new Response(response.body,{status:response.status,headers});
    }});
    d.ctx={accountId:account,deviceId:name,deviceName:name,platform:'darwin'};d.clock=clock;
    if(seed)d.spaces.setEnabled(true,d.ctx);devices.push(d);return d;
  }
  async function drive(promise) {
    let done=false,value,failure;promise.then(x=>{done=true;value=x;},e=>{done=true;failure=e;});
    for(let n=0;n<2000&&!done;n++) {
      await tick();
      const delay=Math.min(...devices.map(d=>d.clock.nextDelay()));
      if(Number.isFinite(delay)){wall+=delay;for(const d of devices)await d.clock.advance(delay);}
    }
    assert.equal(done,true,'sync must settle through the request queue');if(failure)throw failure;return value;
  }
  t.after(async()=>{for(const d of devices){await d.sync.disable({wipeRemote:true});await d.dispose();}await fixture.close();});
  return {fixture,device,drive,read:store=>{const raw=fixture.env.records.get(`blob:${account}:${store}`);return raw?JSON.parse(decrypt(key,JSON.parse(raw).blob)):null;}};
}
function createSpace(d) {const local=blob();d.spaces.noteLocalSpace(sid,local,{tabs:local.tabs},d.ctx);d.spaces.setIndex(index(),d.ctx);}
test('cold-start retirement cancels queued Space work before stale reads can restore deleted content',async t=>{
 const e=await environment(t),a=e.device('A');createSpace(a);await e.drive(a.sync.syncNow([store]));
 const saved=a.spaces.snapshot(a.ctx);saved.index.spaces[sid].deleted=field(true,Date.now()-model.LIMITS.tombstoneMs-1);saved.nextClass='I';saved.requestLog=[];
 await e.drive(a.sync.disable({wipeRemote:false}));
 const b=e.device('B',{seed:false,files:{'shared-spaces.json':saved}});
 e.fixture.inject({type:'stale',accountId:account,store,times:1});
 await e.drive(b.sync.syncNow());
 assert.equal(e.fixture.env.records.has(`blob:${account}:${store}`),false);
 assert.equal(b.spaces.snapshot(b.ctx).blobs[sid],undefined);assert.equal(b.spaces.snapshot(b.ctx).pending[sid],undefined);
 const removed=e.fixture.requests.findIndex(r=>r.method==='DELETE'&&r.store===store);assert.ok(removed>=0);
 assert.equal(e.fixture.requests.slice(removed+1).some(r=>r.store===store),false,'no queued request may follow successful retirement');
 await e.drive(b.sync.syncNow());assert.equal(e.fixture.requests.slice(removed+1).some(r=>r.store===store),false,'later full passes must not retain phantom work');
});
test('a pass that goes stale before retirement sends no per-Space DELETE',async t=>{
  // Retirement DELETEs run outside the request queue; the stale check after
  // the index PUT (with no await before the first DELETE) must keep a credential
  // or consent change from reaching the server.
  let disableOnSpacesPut=false,a;
  const e=await environment(t);
  a=e.device('A',{afterFetch:(url,options)=>{if(disableOnSpacesPut&&options?.method==='PUT'&&url.endsWith('/spaces')){disableOnSpacesPut=false;a.sync.disable({wipeRemote:false});}}});
  createSpace(a);await e.drive(a.sync.syncNow([store]));
  a.spaces.rebind(account).update(d=>{d.index.spaces[sid].deleted=field(true,Date.now()-model.LIMITS.tombstoneMs-1);d.pending[sid]={...(d.pending[sid]??{}),index:true};});
  disableOnSpacesPut=true;
  await e.drive(a.sync.syncNow(['spaces']).catch(()=>null));
  assert.equal(disableOnSpacesPut,false,'the index upload ran and turned sync off');
  assert.equal(e.fixture.requests.some(r=>r.method==='DELETE'&&r.store===store),false);
  assert.ok(e.fixture.env.records.has(`blob:${account}:${store}`));
});
test('a Worker without selective DELETE capability never receives a per-Space DELETE',async t=>{
  const e=await environment(t),a=e.device('A',{legacyDelete:true});createSpace(a);await e.drive(a.sync.syncNow([store]));
  a.spaces.rebind(account).update(d=>{d.index.spaces[sid].deleted=field(true,Date.now()-model.LIMITS.tombstoneMs-1);});
  await e.drive(a.sync.syncNow(['spaces']));
  assert.equal(e.fixture.requests.some(r=>r.method==='DELETE'&&r.store===store),false);
  assert.ok(e.fixture.env.records.has(`blob:${account}:${store}`));
  assert.ok(a.spaces.snapshot(a.ctx).index.spaces[sid],'retain the id until a capable Worker permits cleanup');
});
test('expired deletion frees its server slot despite an old pending index receipt',async t=>{
  const e=await environment(t),a=e.device('A');createSpace(a);await e.drive(a.sync.syncNow([store]));
  a.spaces.rebind(account).update(d=>{d.index.spaces[sid].deleted=field(true,Date.now()-model.LIMITS.tombstoneMs-1);d.pending[sid]={index:{rev:'old-publication'}};});
  await e.drive(a.sync.syncNow(['spaces']));
  assert.equal(e.fixture.env.records.has(`blob:${account}:${store}`),false);
  assert.equal(a.spaces.snapshot(a.ctx).index.spaces[sid],undefined);
  assert.equal(a.spaces.snapshot(a.ctx).pending[sid],undefined);
});
test('optional Space quota failure reaches the account status and clears after successful retry',async t=>{
  const e=await environment(t),a=e.device('A');createSpace(a);await e.drive(a.sync.syncNow([store]));
  e.fixture.env.ACCOUNT_STORAGE_QUOTA_BYTES='1';
  const local=blob();local.tabs[id(1)].name=field('A longer local name',200,'A');a.spaces.noteLocalSpace(sid,local,{tabs:{[id(1)]:{name:local.tabs[id(1)].name}}},a.ctx);
  const failed=await e.drive(a.sync.syncNow([store]));assert.equal(failed.ok,false);assert.equal(failed.error,'account-quota');assert.equal(a.sync.sharedStatus().accountFull,true);
  e.fixture.env.ACCOUNT_STORAGE_QUOTA_BYTES=String(20*1024*1024);
  assert.equal((await e.drive(a.sync.syncNow([store]))).ok,true);assert.equal(a.sync.sharedStatus().accountFull,false);
});
test('deleting a Space compacts its encrypted blob immediately and frees a full account for the next write',async t=>{
  const e=await environment(t),a=e.device('A');createSpace(a);
  await e.drive(a.sync.syncNow([store]));
  const before=e.fixture.env.records.get(`blob:${account}:${store}`);
  const used=[...e.fixture.env.records].filter(([k])=>k.startsWith(`blob:${account}:`)).reduce((sum,[,v])=>sum+Buffer.byteLength(v)+256,0);
  e.fixture.env.ACCOUNT_STORAGE_QUOTA_BYTES=String(used);
  const write=()=>fetch(`${e.fixture.url}/v1/blob/${account}/bookmarks`,{method:'PUT',body:JSON.stringify({ifVersion:null,blob:{ct:'x'.repeat(100)}})});
  assert.equal((await write()).status,507);
  const deleted=index();deleted.spaces[sid].deleted=field(true,Date.now()+1,'A');a.spaces.setIndex(deleted,a.ctx);
  await e.drive(a.sync.syncNow([store]));
  assert.deepEqual(e.read(store),{v:1,spaceId:sid,groups:{},tabs:{}});
  assert.ok(Buffer.byteLength(e.fixture.env.records.get(`blob:${account}:${store}`))<Buffer.byteLength(before));
  assert.equal((await write()).status,200,'deletion frees bytes without advancing the 30-day clock');
  assert.equal(a.spaces.snapshot(a.ctx).index.spaces[sid].deleted.v,true,'the index tombstone remains');
  assert.ok(e.fixture.env.records.has(`blob:${account}:${store}`),'the retained store slot is removed after expiry');
});
test('the endpoint override requires explicit unpackaged acceptance mode and a loopback origin',async t=>{
  for(const [packaged,testMode,endpoint,wantLocal] of [[false,'1','http://127.0.0.1:12345',true],[true,'1','http://127.0.0.1:12345',false],[false,'true','http://127.0.0.1:12345',false],[false,'1','https://example.test',false]]) {
    const calls=[],d=syncDevice({packaged,testMode,endpoint,fetch:async(url,opts={})=>{calls.push(String(url));return {status:(opts.method??'GET')==='GET'?404:opts.method==='DELETE'?204:200,ok:(opts.method??'GET')!=='GET',text:async()=> 'not found'};}});
    t.after(async()=>{await d.sync.disable({wipeRemote:true});await d.dispose();});await d.sync.syncNow(['sends']);
    assert.equal(calls[0].startsWith('http://127.0.0.1:12345/'),wantLocal);
    await d.sync.disable({wipeRemote:true});
  }
});
test('two desktop sync instances converge through the real Worker and acknowledge fetched writes',async t=>{
  const e=await environment(t),a=e.device('A'),b=e.device('B');createSpace(a);
  assert.equal((await e.drive(a.sync.syncNow([store]))).ok,true);
  assert.equal((await e.drive(b.sync.syncNow())).ok,true);
  assert.equal(b.spaces.snapshot(b.ctx).blobs[sid].blob.tabs[id(1)].nav.v.url,'https://example.test/1');
  const local=structuredClone(b.spaces.snapshot(b.ctx).blobs[sid].blob);local.tabs[id(1)].pinned=field(true,200,'B');
  b.spaces.noteLocalSpace(sid,local,{tabs:{[id(1)]:{pinned:local.tabs[id(1)].pinned}}},b.ctx);
  await e.drive(b.sync.syncNow([store]));await e.drive(a.sync.syncNow([store]));await e.drive(b.sync.syncNow([store]));
  assert.equal(a.spaces.snapshot(a.ctx).blobs[sid].blob.tabs[id(1)].pinned.v,true);
  assert.equal(b.spaces.snapshot(b.ctx).pending[sid].tabs,undefined);
  assert.equal(e.read(store).tabs[id(1)].pinned.v,true);
});
test('a real 409 re-enters the queue and preserves both devices independent field edits',async t=>{
  const e=await environment(t),a=e.device('A'),b=e.device('B');createSpace(a);await e.drive(a.sync.syncNow([store]));await e.drive(b.sync.syncNow());
  const al=structuredClone(a.spaces.snapshot(a.ctx).blobs[sid].blob),bl=structuredClone(b.spaces.snapshot(b.ctx).blobs[sid].blob);
  al.tabs[id(1)].name=field('Named on A',300,'A');bl.tabs[id(1)].pinned=field(true,301,'B');
  a.spaces.noteLocalSpace(sid,al,{tabs:{[id(1)]:{name:al.tabs[id(1)].name}}},a.ctx);b.spaces.noteLocalSpace(sid,bl,{tabs:{[id(1)]:{pinned:bl.tabs[id(1)].pinned}}},b.ctx);
  e.fixture.beforeNextPut(store,async()=>{await b.sync.syncNow([store]);});
  await e.drive(a.sync.syncNow([store]));
  assert.ok(e.fixture.requests.some(x=>x.store===store&&x.method==='PUT'&&x.status===409));
  assert.equal(e.read(store).tabs[id(1)].name.v,'Named on A');assert.equal(e.read(store).tabs[id(1)].pinned.v,true);
});
test('a real 409 cannot replay long-stale recovery records into the next upload',async t=>{
  const e=await environment(t),a=e.device('A'),b=e.device('B');createSpace(a);
  await e.drive(a.sync.syncNow([store]));await e.drive(b.sync.syncNow());
  const local=structuredClone(a.spaces.snapshot(a.ctx).blobs[sid].blob);
  local.tabs[id(1)].name=field('Retained edit',300,'A');local.tabs[id(2)]=tab(2);
  a.spaces.noteLocalSpace(sid,local,{tabs:{[id(1)]:{name:local.tabs[id(1)].name},[id(2)]:local.tabs[id(2)]}},a.ctx);
  a.spaces.rebind(account).update(d=>{d.blobs[sid].mergedAt=Date.now()-model.LIMITS.tombstoneMs-1;});
  const peer=structuredClone(b.spaces.snapshot(b.ctx).blobs[sid].blob);peer.tabs[id(1)].pinned=field(true,301,'B');
  b.spaces.noteLocalSpace(sid,peer,{tabs:{[id(1)]:{pinned:peer.tabs[id(1)].pinned}}},b.ctx);
  e.fixture.beforeNextPut(store,async()=>{await b.sync.syncNow([store]);});
  await e.drive(a.sync.syncNow([store]));
  assert.ok(e.fixture.requests.some(x=>x.store===store&&x.method==='PUT'&&x.status===409));
  assert.equal(e.read(store).tabs[id(2)],undefined);
  assert.equal(e.read(store).tabs[id(1)].name.v,'Retained edit');assert.equal(e.read(store).tabs[id(1)].pinned.v,true);
  const saved=a.spaces.snapshot(a.ctx);
  assert.equal(saved.pending[sid].tabs?.[id(2)],undefined);assert.ok(saved.recoveries[sid].tabs[id(2)]);
});
test('reconciliation discovers a blob update even when its acknowledged index write disappears',async t=>{
  const e=await environment(t),a=e.device('A'),b=e.device('B');createSpace(a);await e.drive(a.sync.syncNow([store]));await e.drive(b.sync.syncNow());
  const local=structuredClone(a.spaces.snapshot(a.ctx).blobs[sid].blob);local.tabs[id(1)].name=field('Missed index update',400,'A');
  a.spaces.noteLocalSpace(sid,local,{tabs:{[id(1)]:{name:local.tabs[id(1)].name}}},a.ctx);
  e.fixture.inject({type:'disappear',store:'spaces'});await e.drive(a.sync.syncNow([store]));
  assert.equal(e.read('spaces'),null);
  await e.drive(b.sync.syncNow());assert.equal(b.spaces.snapshot(b.ctx).blobs[sid].blob.tabs[id(1)].name.v,'Missed index update');
});
test('without a surviving local copy, an acknowledged disappearing write remains unrecoverable',async t=>{
  const e=await environment(t),a=e.device('A');createSpace(a);await e.drive(a.sync.syncNow([store]));await e.drive(a.sync.syncNow([store]));
  assert.equal(a.spaces.snapshot(a.ctx).pending[sid].tabs,undefined);
  const old=JSON.parse(e.fixture.env.records.get(`blob:${account}:${store}`));
  e.fixture.inject({type:'disappear',store});
  const ack=await fetch(e.fixture.url+`/v1/blob/${account}/${store}`,{method:'PUT',body:JSON.stringify({ifVersion:old.version,blob:encrypt(key,JSON.stringify(blob()))}),headers:{'content-type':'application/json'}});
  assert.equal(ack.status,200);assert.equal(e.read(store),null);
  const fresh=e.device('fresh');await e.drive(fresh.sync.syncNow());
  assert.deepEqual(fresh.spaces.snapshot(fresh.ctx).blobs[sid].blob.tabs,{});assert.equal(e.read(store),null);
});
test('all actual HTTP GETs, including a best-effort leave, respect the same request window',async t=>{
  const e=await environment(t),a=e.device('A');
  for(let n=0;n<10;n++)await a.sync.syncNow(['sends']);
  await a.sync.disable();
  assert.equal(e.fixture.requests.filter(x=>x.method==='GET').length,10);
});
test('departure publishes the Recently closed retraction when request budget is available',async t=>{
  const e=await environment(t),a=e.device('A');
  a.closed.addOwnItem(a.ctx,{id:'closed-1',url:'https://example.test/',title:'Closed',closedAt:Date.now(),spaceId:sid});
  await e.drive(a.sync.syncNow(['closed']));assert.equal(e.read('closed').devices.A.items.length,1);
  await a.sync.disable();assert.equal(e.read('closed').devices.A.retracted,true);
});
test('a successful index PUT updates the cache so the next unchanged pass cannot undo its revision',async t=>{
  const e=await environment(t),a=e.device('A');createSpace(a);await e.drive(a.sync.syncNow([store]));await e.drive(a.sync.syncNow([store]));
  const oldRev=e.read('spaces').spaces[sid].rev,local=structuredClone(a.spaces.snapshot(a.ctx).blobs[sid].blob);
  for(let n=0;n<1000;n++){local.tabs[id(1)].name=field('New name '+n,400,'A');if(model.revisionOf(local)>oldRev)break;}
  assert.ok(model.revisionOf(local)>oldRev);
  a.spaces.noteLocalSpace(sid,local,{tabs:{[id(1)]:{name:local.tabs[id(1)].name}}},a.ctx);await e.drive(a.sync.syncNow([store]));
  const published=e.read('spaces').spaces[sid].rev;assert.ok(published>oldRev);const before=e.fixture.requests.length;
  await e.drive(a.sync.syncNow(['spaces']));
  assert.equal(e.read('spaces').spaces[sid].rev,published);
  assert.equal(e.fixture.requests.slice(before).some(x=>x.store==='spaces'&&x.method==='PUT'),false);
});
