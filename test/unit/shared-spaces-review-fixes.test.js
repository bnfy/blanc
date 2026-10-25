'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {syncDevice,virtualClock}=require('./support/sync-device');
const m=require('../../src/main/shared-spaces-model'),adapter=require('../../src/main/shared-spaces-adapter');
const {encrypt}=require('../../src/main/sync-crypto');
const id=n=>n.toString(16).padStart(32,'0'),sid=id(99),f=(v,c=100)=>({v,c,by:'desktop'});
const tab=n=>({nav:f({url:'https://example.test/'+n,title:'T'+n}),name:f(null),pinned:f(false),groupId:f(null),pos:f(m.keyFor('','',id(n))),deleted:f(false)});
const blob=()=>({v:1,spaceId:sid,groups:{},tabs:{[id(1)]:tab(1),[id(2)]:tab(2)},active:f(id(1))});
const response=(status,body='not found')=>({status,ok:status>=200&&status<300,json:async()=>body,text:async()=>typeof body==='string'?body:JSON.stringify(body)});
const seal=()=>({ct:'test'});
function device(t,options={}) {const d=syncDevice(options);t.after(()=>d.dispose());d.ctx={accountId:d.record.accountId,deviceId:'desktop'};return d;}
const sidecarEntry=()=>({forUpdatedAt:Date.now(),tabs:Array.from({length:500},(_,i)=>({i,spaceId:sid}))});

test('selection-only adapter edits persist, replay after restart, and clear only on full-rule acknowledgement',async t=>{
  const d=device(t),b=blob();d.spaces.mergeSpace(sid,b,'v1',d.ctx,seal);
  const capture={urls:['https://example.test/1','https://example.test/2'],meta:[{title:'T1'},{title:'T2'}],tabIds:[id(1),id(2)],groups:[],activeIndex:1};
  const diff=adapter.diffWindow(b,capture,200,'desktop');d.spaces.noteLocalSpace(sid,diff.nextBaseline,diff.edits,d.ctx);
  assert.deepEqual(d.spaces.snapshot(d.ctx).pending[sid].active,f(id(2),200));
  const restarted=device(t,{files:{'shared-spaces.json':d.spaces.snapshot(d.ctx)}});
  const plan=restarted.spaces.mergeSpace(sid,b,'v1',d.ctx,seal);
  assert.deepEqual(plan.upload.blob.active,f(id(2),200));
  restarted.spaces.settleSpace(sid,plan,{blobStored:true},d.ctx);
  assert.deepEqual(restarted.spaces.snapshot(d.ctx).pending[sid].active,f(id(2),200),'a PUT is not a fetched receipt');
  const ack=restarted.spaces.mergeSpace(sid,plan.upload.blob,'v2',d.ctx,seal);
  restarted.spaces.settleSpace(sid,ack,{},d.ctx);assert.equal(restarted.spaces.snapshot(d.ctx).pending[sid].active,undefined);
});
test('selection writes arriving during successful or failed uploads remain pending',t=>{
  for(const blobStored of [true,false]) {
    const d=device(t),local=blob();local.active=f(id(2),200);
    d.spaces.noteLocalSpace(sid,local,{active:local.active},d.ctx);
    const plan=d.spaces.mergeSpace(sid,blob(),'v1',d.ctx,seal);
    local.active=f(id(1),300);d.spaces.noteLocalSpace(sid,local,{active:local.active},d.ctx);
    d.spaces.settleSpace(sid,plan,{blobStored},d.ctx);
    assert.deepEqual(d.spaces.snapshot(d.ctx).pending[sid].active,f(id(1),300));
  }
});
test('a selection-only change gets a Space-sync turn instead of waiting for reconciliation',async t=>{
  const clock=virtualClock(),events=[],remotes={};
  const d=device(t,{clock,fetch:async(url,opts={})=>{
    const name=String(url).split('/').pop();events.push({name,method:opts.method??'GET'});
    return opts.method?response(200,{version:'stored'}):response(200,{version:'v',blob:encrypt(Buffer.alloc(32,9),JSON.stringify(remotes[name]))});
  }});
  d.spaces.setEnabled(true,d.ctx);
  d.spaces.rebind(d.ctx.accountId).update(s=>{
    s.nextClass='S';s.requestLog=Array(9).fill(clock.now());
    for(const spaceId of [...Array.from({length:24},(_,n)=>id(n+10)),sid]) {
      const b={...blob(),spaceId},rev=m.revisionOf(b);remotes['space-'+spaceId]=b;
      s.index.spaces[spaceId]={name:f('Work'),color:f('#426c4c'),symbol:f('briefcase'),pos:f(m.keyFor('','',spaceId)),deleted:f(false),rev};
      s.blobs[spaceId]={blob:b,rev,mergedAt:Date.now(),lastPublishable:b};
    }
  });
  const local={...blob(),active:f(id(2),200)};d.spaces.noteLocalSpace(sid,local,{active:local.active},d.ctx);
  const pass=d.sync.syncNow();await new Promise(r=>setImmediate(r));
  assert.deepEqual(events[0],{name:'space-'+sid,method:'GET'});
  await d.sync.disable({wipeRemote:true});await pass;
});
test('selection acknowledgement retains cleared-marker comparison and invalid-target cleanup',()=>{
  const live=f(id(1),200),cleared={...live,cleared:true};
  assert.deepEqual(m.settlePending({active:cleared},{active:live}),{active:cleared});
  assert.deepEqual(m.settlePending({active:live},{active:cleared}),{});
  assert.deepEqual(m.applyLocalEdits({active:f(id(2),300)},{active:live}),{active:f(id(2),300)});
  const b=blob();b.tabs[id(2)].deleted=f(true,250);
  const plan=m.pushPlan({fetchedBlob:b,localBlob:b,pending:{active:f(id(2),300)},now:400,deviceId:'desktop',encryptFn:seal});
  assert.equal(plan.mergedBlob.active.cleared,true);assert.equal(plan.pendingAfter.active.cleared,true);
});
test('aggregate sidecar budget omits only this device and preserves its full local entry',t=>{
  const d=device(t),entry=sidecarEntry();
  d.spaces.rebind(d.ctx.accountId).update(s=>{s.sidecar={devices:{desktop:entry,peer1:entry,peer2:entry}};});
  const exported=d.spaces.exportSidecar(d.ctx);
  assert.ok(Buffer.byteLength(JSON.stringify(exported))<=65536);
  assert.deepEqual(Object.keys(exported.devices).sort(),['peer1','peer2']);
  assert.equal(d.spaces.snapshot(d.ctx).sidecar.devices.desktop.tabs.length,500);
});
test('mandatory peer sidecars over budget cause no PUT and incoming oversized sidecars are ignored',async t=>{
  const events=[],d=device(t,{fetch:async(url,opts={})=>{events.push(opts.method??'GET');return response(404);}}),entry=sidecarEntry();
  d.spaces.setEnabled(true,d.ctx);
  d.spaces.rebind(d.ctx.accountId).update(s=>{s.sidecar={devices:{peer1:entry,peer2:entry,peer3:entry}};});
  assert.equal(d.spaces.exportSidecar(d.ctx),null,'peer records are not silently trimmed');
  await d.sync.syncNow(['shared']);assert.deepEqual(events,['GET']);
  const fresh=device(t);fresh.spaces.mergeSidecar({devices:{peer1:entry,peer2:entry,peer3:entry}},fresh.ctx);
  assert.deepEqual(fresh.spaces.exportSidecar(fresh.ctx),{devices:{}});
});
test('the encrypted PUT guard also protects fixed-store payloads',async t=>{
  const events=[],d=device(t,{files:{'bookmarks.json':{items:[{id:'large',url:'https://example.test/',title:'t'.repeat(400*1024),addedAt:100}],tombstones:[]}},
    fetch:async(url,opts={})=>{events.push(opts.method??'GET');return response(404);}});
  const result=await d.sync.syncNow(['bookmarks']);assert.equal(result.ok,false);assert.deepEqual(events,['GET']);
});
test('an oversized fetched sidecar cannot be overwritten with a smaller local subset',async t=>{
  const entry=sidecarEntry(),remote={devices:{peer1:entry,peer2:entry,peer3:entry}},events=[];
  const d=device(t,{fetch:async(url,opts={})=>{events.push(opts.method??'GET');return response(200,{version:'v',blob:encrypt(Buffer.alloc(32,9),JSON.stringify(remote))});}});
  d.spaces.setEnabled(true,d.ctx);
  d.spaces.rebind(d.ctx.accountId).update(s=>{s.sidecar={devices:{desktop:{forUpdatedAt:Date.now(),tabs:[{i:0,spaceId:sid}]}}};});
  await d.sync.syncNow(['shared']);assert.deepEqual(events,['GET']);
  assert.equal(d.spaces.snapshot(d.ctx).sidecar.devices.desktop.tabs.length,1);
});
test('preflight and enable probes apply persisted 429 backoff without changing their reply contracts',async t=>{
  for(const kind of ['preflight','enable']) {
    const clock=virtualClock(),d=device(t,{clock,fetch:async()=>response(429)}),credentials={handle:'probe-review',passphrase:'a sufficiently strong review passphrase'};
    let done=false;const operation=d.sync[kind](credentials).finally(()=>{done=true;});
    for(let n=0;n<20&&!done;n++){await new Promise(r=>setImmediate(r));const delay=clock.nextDelay();if(Number.isFinite(delay))await clock.advance(delay);}
    assert.equal(done,true);const result=await operation;
    assert.equal(result.ok,false);assert.equal(result.error,'rate-limited');
    if(kind==='preflight')assert.equal(result.outcome,'rateLimited');
    const keys=require('../../src/main/sync-crypto').deriveKeys(credentials.handle,credentials.passphrase);
    const state=d.spaces.snapshot({accountId:kind==='enable'?keys.accountId:d.record.accountId});keys.key.fill(0);
    assert.ok(state.windowLimit<10);assert.equal(d.sync.sharedStatus().backoff,true);
  }
});
test('disk-loaded malformed index rows cannot break inactive status or supported index exports',t=>{
  const valid={name:f('Work'),color:f('#426c4c'),symbol:f('briefcase'),pos:f(m.keyFor('','',id(97))),deleted:f(false)};
  const d=device(t,{files:{'shared-spaces.json':{accountId:'a'.repeat(64),enabled:false,index:{v:1,spaces:{[sid]:null,[id(98)]:{deleted:{v:false}},[id(97)]:valid}},knownIndex:{[id(97)]:true},blobs:{preserve:{saved:true}}}}});
  assert.equal(d.sync.sharedStatus().spaces,1);
  assert.deepEqual(d.spaces.spaceIds(d.ctx),[id(97),'preserve']);
  assert.deepEqual(d.spaces.exportIndex(d.ctx),{v:1,spaces:{[id(97)]:valid}});
  assert.equal(d.spaces.snapshot(d.ctx).blobs.preserve.saved,true);
});
test('future index versions stay intact and do not break inactive status',t=>{
  const future={v:2,spaces:{[sid]:null},extension:'keep me'};
  const d=device(t,{files:{'shared-spaces.json':{accountId:'a'.repeat(64),enabled:false,index:future}}});
  assert.equal(d.sync.sharedStatus().spaces,0);
  assert.deepEqual(d.spaces.snapshot(d.ctx).index,future);
  assert.throws(()=>d.spaces.exportIndex(d.ctx),/unsupported/);
});
