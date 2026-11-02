'use strict';
// The change check's rhythm on desktop (design 2026-11-02): a check every
// 15 s while focused, only changed stores downloaded, open tabs at most once
// a minute, a one-minute retry pass, a five-minute full pass with class R
// capped, and today's minute pass when the Worker can't answer the check.
const test=require('node:test'),assert=require('node:assert/strict');
const {createSyncFixture}=require('../desktop/support/sync-fixture');
const {syncDevice,virtualClock}=require('./support/sync-device');
const model=require('../../src/main/shared-spaces-model');
const {encrypt}=require('../../src/main/sync-crypto');
const key=Buffer.alloc(32,9),account='a'.repeat(64),id=n=>n.toString(16).padStart(32,'0');
const field=(v,c=100,by='B')=>({v,c,by});
const tab=n=>({nav:field({url:'https://example.test/'+n,title:'T'+n}),name:field(null),pinned:field(false),groupId:field(null),pos:field(model.keyFor('','',id(n))),deleted:field(false)});
const tick=()=>new Promise(r=>setTimeout(r,5));
async function environment(t,options={}) {
  let wall=1800000000000;t.mock.method(Date,'now',()=>wall);
  const fixture=await createSyncFixture(options),devices=[];
  function device(name) {
    const clock=virtualClock(wall);
    const d=syncDevice({clock,key,endpoint:fixture.url,record:{deviceId:name},fetch:(url,init)=>fetch(url,init)});
    d.ctx={accountId:account,deviceId:name,deviceName:name,platform:'darwin'};d.clock=clock;d.name=name;
    d.spaces.setEnabled(true,d.ctx);devices.push(d);return d;
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
  async function later(ms){wall+=ms;for(const d of devices)await d.clock.advance(ms);}
  const since=n=>fixture.requests.slice(n).map(r=>`${r.method} ${r.store}`);
  t.after(async()=>{for(const d of devices){await d.sync.disable({wipeRemote:false}).catch(()=>{});await d.dispose();}await fixture.close();});
  return {fixture,device,drive,later,since};
}
function addSpace(d,n) {
  const sid=id(100+n),blob={v:1,spaceId:sid,groups:{},tabs:{[id(n)]:tab(n)}};
  d.spaces.noteLocalSpace(sid,blob,{tabs:blob.tabs},d.ctx);
  d.spaces.setIndex({v:1,spaces:{[sid]:{name:field('S'+n),color:field('#426c4c'),symbol:field('briefcase'),pos:field(model.keyFor('','',sid)),deleted:field(false)}}},d.ctx);
  return sid;
}
async function settled(e,d){await e.drive(d.sync.syncNow());await e.later(60000);}
test('a Space made on B reaches focused A within one check',async t=>{
  const e=await environment(t),a=e.device('A'),b=e.device('B');
  await settled(e,a);await settled(e,b);await e.drive(a.sync.syncNow());
  const sid=addSpace(b,1);await e.drive(b.sync.syncNow(['space-'+sid]));
  a.sync.setForeground(true);await e.later(15000);await e.drive(a.sync.tick());
  assert.ok(a.spaces.snapshot(a.ctx).blobs[sid]?.blob,'A holds the new Space after one check');
});
test('nothing changed downloads nothing but the check',async t=>{
  const e=await environment(t),a=e.device('A');await settled(e,a);await e.drive(a.sync.tick());
  a.sync.setForeground(true);const start=e.fixture.requests.length;
  for(let n=0;n<4;n++){await e.later(15000);await e.drive(a.sync.tick());}
  assert.deepEqual([...new Set(e.since(start))],['GET versions']);
  assert.equal(e.since(start).length,4);
});
test('open tabs arrive within a minute, not every check',async t=>{
  const e=await environment(t),a=e.device('A');await settled(e,a);a.sync.setForeground(true);
  await e.drive(a.sync.syncNow());const start=e.fixture.requests.length;
  const current=JSON.parse(e.fixture.blobs.get(`blob:${account}:session`)??'null')?.version??null;
  const blob=encrypt(key,JSON.stringify({devices:{B:{name:'B',platform:'darwin',updatedAt:Date.now(),tabs:[],groups:[]}}}));
  const put=await fetch(`${e.fixture.url}/v1/blob/${account}/session`,{method:'PUT',body:JSON.stringify({ifVersion:current,blob})});assert.equal(put.status,200);
  for(let n=0;n<4;n++){await e.later(15000);await e.drive(a.sync.tick());}
  assert.equal(e.since(start).filter(r=>r==='GET versions').length,4,'a check every 15 s');
  assert.equal(e.since(start).filter(r=>r==='GET session').length,1,'within the minute, but once, not on every check');
});
test('a failed upload still retries every minute',async t=>{
  const e=await environment(t),a=e.device('A');
  e.fixture.inject({type:'network',accountId:account,store:'bookmarks',method:'PUT'});
  await e.drive(a.sync.syncNow()).catch(()=>{});
  assert.equal(e.fixture.blobs.has(`blob:${account}:bookmarks`),false);
  await e.later(60000);await e.drive(a.sync.tick());
  assert.ok(e.fixture.blobs.has(`blob:${account}:bookmarks`),'the retry pass sent it');
});
test('an older Worker keeps the minute pass',async t=>{
  const e=await environment(t,{versions:false}),a=e.device('A');await settled(e,a);a.sync.setForeground(true);
  await e.drive(a.sync.syncNow());const start=e.fixture.requests.length;
  for(let n=0;n<3;n++){await e.later(15000);await e.drive(a.sync.tick());}
  assert.deepEqual(e.since(start),['GET versions'],'one check, answered 404, then nothing until the minute');
  await e.later(15000);await e.drive(a.sync.tick());
  assert.ok(e.since(start).includes('GET bookmarks'),'the minute pass runs');
});
test('a full pass re-reads at most five Space blobs and continues next time',async t=>{
  const e=await environment(t),a=e.device('A');const ids=[];
  for(let n=1;n<=12;n++)ids.push(addSpace(a,n));
  await e.drive(a.sync.syncNow([...ids.map(sid=>'space-'+sid),'spaces']));await settled(e,a);await e.drive(a.sync.tick());
  const reread=new Set();
  for(let pass=0;pass<3;pass++) {
    await e.later(300000);const start=e.fixture.requests.length;await e.drive(a.sync.tick());
    const blobs=e.since(start).filter(r=>/^GET space-/.test(r));
    assert.ok(blobs.length<=5,`pass ${pass+1} re-read ${blobs.length} Space blobs`);
    for(const r of blobs)reread.add(r);
  }
  assert.equal(reread.size,12,'three passes come round to every Space');
});
test('a Space another device listed without a revision hint is still fetched',async t=>{
  const {decrypt}=require('../../src/main/sync-crypto');
  const e=await environment(t),a=e.device('A');await settled(e,a);a.sync.setForeground(true);await e.drive(a.sync.syncNow());
  const sid=id(777),blob={v:1,spaceId:sid,groups:{},tabs:{[id(7)]:tab(7)}};
  const put=async(store,payload)=>{const current=JSON.parse(e.fixture.blobs.get(`blob:${account}:${store}`)??'null');
    const r=await fetch(`${e.fixture.url}/v1/blob/${account}/${store}`,{method:'PUT',body:JSON.stringify({ifVersion:current?.version??null,blob:encrypt(key,JSON.stringify(payload(current?JSON.parse(decrypt(key,current.blob)):null)))})});
    assert.equal(r.status,200);};
  await put('space-'+sid,()=>blob);
  await put('spaces',index=>({v:1,spaces:{...(index?.spaces??{}),[sid]:{name:field('Hint-less'),color:field('#426c4c'),symbol:field('briefcase'),pos:field(model.keyFor('','',sid)),deleted:field(false)}}}));
  await e.later(15000);await e.drive(a.sync.tick());
  assert.ok(a.spaces.snapshot(a.ctx).blobs[sid]?.blob,'fetched although the index carries no rev');
});
test('the first check finds room right after a full pass',async t=>{
  const e=await environment(t),a=e.device('A');a.sync.setForeground(true);
  await e.drive(a.sync.syncNow());const start=e.fixture.requests.length,wall=Date.now();
  await e.drive(a.sync.tick());
  assert.ok(e.since(start).includes('GET versions'),'routine work left the check a request');
  assert.equal(Date.now(),wall,'without waiting for the window');
});
test('with checks running, a full pass that comes due finishes within two minutes',async t=>{
  const e=await environment(t),a=e.device('A');a.sync.setForeground(true);
  const due=Date.now()+300000;// five minutes after the full pass below
  await settled(e,a);await e.drive(a.sync.tick());
  for(let s=0;s<28;s++){await e.later(15000);await e.drive(a.sync.tick());}
  const fixed=['bookmarks','settings','session','icons','sends','closed','shared','spaces'];
  const late=fixed.filter(store=>!e.fixture.requests.some(r=>r.method==='GET'&&r.store===store&&r.at>=due-1000&&r.at<=due+120000));
  assert.deepEqual(late,[],'every fixed store was read within two minutes of the full pass coming due');
});
test('a pass that comes due a moment early still runs',async t=>{
  const e=await environment(t,{versions:false}),a=e.device('A');await settled(e,a);
  await e.drive(a.sync.syncNow());await e.later(15000);await e.drive(a.sync.tick());
  const start=e.fixture.requests.length;await e.later(44500);await e.drive(a.sync.tick());
  assert.ok(e.since(start).includes('GET bookmarks'),'the minute pass at 59.5 s');
});
test('a focus refresh just after a check sends no second check',async t=>{
  const e=await environment(t),a=e.device('A');await settled(e,a);a.sync.setTabStateReady(true);a.sync.setForeground(true);
  await e.drive(a.sync.tick());const start=e.fixture.requests.length;
  await e.later(6000);a.sync.refreshSession();await e.drive(new Promise(r=>setTimeout(r,50)));
  assert.equal(e.since(start).filter(r=>r==='GET versions').length,0);
});
test('a Space whose listing another pass already downloaded is still fetched at the next check',async t=>{
  const e=await environment(t),a=e.device('A'),b=e.device('B');
  await settled(e,a);await settled(e,b);a.sync.setForeground(true);await e.drive(a.sync.syncNow());await e.drive(a.sync.tick());
  const sid=addSpace(b,3);await e.drive(b.sync.syncNow(['space-'+sid]));
  // Routine work reads the index first (as a full pass's class I turn does),
  // so the check finds the index version already seen.
  await e.drive(a.sync.syncNow(['spaces']));assert.equal(a.spaces.snapshot(a.ctx).blobs[sid],undefined);
  await e.later(15000);await e.drive(a.sync.tick());
  assert.ok(a.spaces.snapshot(a.ctx).blobs[sid]?.blob,'the check fetched the Space the index names');
  const start=e.fixture.requests.length;await e.later(15000);await e.drive(a.sync.tick());
  assert.equal(e.since(start).filter(r=>r==='GET space-'+sid).length,0,'and does not fetch it again');
});
