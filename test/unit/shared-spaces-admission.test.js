'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {syncDevice}=require('./support/sync-device');
const model=require('../../src/main/shared-spaces-model'),adapter=require('../../src/main/shared-spaces-adapter');
const {encrypt}=require('../../src/main/sync-crypto');
const id=n=>n.toString(16).padStart(32,'0'),sid=id(99),key=Buffer.alloc(32,9);
const f=(v,c=100,by='peer')=>({v,c,by});
const tab=(n,{url='https://example.test/'+n,c=100,by='peer',pos=model.keyFor('','',id(n))}={})=>({nav:f({url,title:'T'},c,by),name:f(null,c,by),pinned:f(false,c,by),groupId:f(null,c,by),pos:f(pos,c,by),deleted:f(false,c,by)});
const blob=(tabs={})=>({v:1,spaceId:sid,groups:{},tabs});
const seal=text=>encrypt(key,text),small=()=>({ct:'x'});
function setup(t,fetch=async()=>{throw new Error('unexpected HTTP');}) {
  const d=syncDevice({fetch}),ctx={accountId:d.record.accountId,deviceId:'desktop',deviceName:'Mac',platform:'darwin'};
  t.after(()=>d.dispose());return {...d,ctx};
}
test('long navigation stays local while fitting older work preserves the remote snapshot',t=>{
  const d=setup(t),remote=blob({[id(1)]:tab(1),[id(2)]:tab(2)});
  const budget=s=>({ct:'x'.repeat(Object.values(JSON.parse(s).tabs).some(t=>t.nav.v.url.length>2000)?600000:10)});
  d.spaces.mergeSpace(sid,remote,'v',d.ctx,budget);
  let local=structuredClone(remote);local.tabs[id(2)].pinned=f(true,150,'desktop');
  d.spaces.noteLocalSpace(sid,local,{tabs:{[id(2)]:{pinned:local.tabs[id(2)].pinned}}},d.ctx);
  local=structuredClone(local);local.tabs[id(1)].nav=f({url:'https://example.test/'+ 'x'.repeat(2027),title:'Long'},200,'desktop');
  d.spaces.noteLocalSpace(sid,local,{tabs:{[id(1)]:{nav:local.tabs[id(1)].nav}}},d.ctx);
  const p=d.spaces.exportSpace(sid,remote,'v',d.ctx,budget),entry=d.spaces.rebind(d.ctx.accountId).data.blobs[sid];
  assert.equal(entry.blob.tabs[id(1)].nav.v.url.length,2048);
  assert.deepEqual(adapter.unsyncedTabIds(entry),[id(1)]);
  assert.equal(p.upload.blob.tabs[id(1)].nav.v.url,'https://example.test/1');assert.equal(p.upload.blob.tabs[id(2)].pinned.v,true);
});
test('held work retries in its original order even if it was edited again while held',t=>{
  const d=setup(t),local=blob({[id(1)]:tab(1,{by:'desktop',c:100}),[id(2)]:tab(2,{by:'desktop',c:200})});
  const budget=n=>s=>({ct:'x'.repeat(Object.keys(JSON.parse(s).tabs).length>n?600000:10)});
  d.spaces.noteLocalSpace(sid,local,{tabs:local.tabs},d.ctx);
  const first=d.spaces.exportSpace(sid,blob(),'v',d.ctx,budget(1));d.spaces.settleSpace(sid,first,{blobStored:true},d.ctx);
  const next=structuredClone(local);next.tabs[id(2)].name=f('Edited while waiting',400,'desktop');next.tabs[id(3)]=tab(3,{by:'desktop',c:300});
  d.spaces.noteLocalSpace(sid,next,{tabs:{[id(2)]:{name:next.tabs[id(2)].name},[id(3)]:next.tabs[id(3)]}},d.ctx);
  const retry=d.spaces.exportSpace(sid,first.upload.blob,'v2',d.ctx,budget(2));
  assert.deepEqual(Object.keys(retry.upload.blob.tabs),[id(1),id(2)]);
  assert.equal(retry.upload.blob.tabs[id(2)].name.c,400,'admission priority never restamps a field');
});
test('position growth at the encrypted budget edge holds newest inserts without invalidating neighbours',t=>{
  const d=setup(t),left=model.keyFor('','',id(1)),right=model.keyFor(left,'',id(2));
  const remote=blob({[id(1)]:tab(1,{pos:left}),[id(2)]:tab(2,{pos:right})}),local=structuredClone(remote),edits={tabs:{}};
  let previous=left;
  for(let n=3;n<=500;n++){const pos=model.keyFor(previous,right,id(n));previous=pos;local.tabs[id(n)]=tab(n,{by:'desktop',c:100+n,pos,url:'https://example.test/'+ 'x'.repeat(700)});edits.tabs[id(n)]=local.tabs[id(n)];}
  d.spaces.mergeSpace(sid,remote,'v',d.ctx,seal);d.spaces.noteLocalSpace(sid,local,edits,d.ctx);
  const p=d.spaces.exportSpace(sid,remote,'v',d.ctx,seal),entry=d.spaces.rebind(d.ctx.accountId).data.blobs[sid],held=adapter.unsyncedTabIds(entry);
  assert.ok(held.length>0);assert.ok(p.upload);assert.ok(model.blobFits(p.upload.blob,seal));
  assert.deepEqual(held,[...held].sort(),'held ids keep their original retry order');
  assert.equal(Object.keys(entry.blob.tabs).length,500,'nothing was removed from the local projection');
  const ordered=model.orderOf(p.upload.blob.tabs),a=p.upload.blob.tabs[ordered[0]].pos.v,b=p.upload.blob.tabs[ordered[1]].pos.v;
  const inserted=model.keyFor(a,b,id(1000));assert.ok(a<inserted&&inserted<b);assert.ok(model.validKey(inserted,id(1000)));
});
test('mandatory concurrent remote additions are retained and cause no PUT or index publication',async t=>{
  const remote=blob(Object.fromEntries(Array.from({length:501},(_,n)=>[id(n+1),tab(n+1)]))),events=[];
  const d=setup(t,async(url,opts={})=>{events.push({url:String(url),method:opts.method??'GET'});return {status:200,ok:true,json:async()=>({version:'v',blob:seal(JSON.stringify(remote))})};});
  d.spaces.setEnabled(true,d.ctx);const local=structuredClone(remote);local.tabs[id(502)]=tab(502,{by:'desktop',c:200});
  d.spaces.noteLocalSpace(sid,local,{tabs:{[id(502)]:local.tabs[id(502)]}},d.ctx);
  await d.sync.syncNow(['space-'+sid]);
  assert.equal(events.filter(x=>x.method==='PUT').length,0);assert.equal(events.length,1);
  const entry=d.spaces.rebind(d.ctx.accountId).data.blobs[sid];assert.equal(Object.keys(entry.blob.tabs).length,502);
  assert.equal(entry.lastPublishable,undefined,'remote content above the live-tab cap has never passed admission');
  assert.deepEqual(adapter.unsyncedTabIds(entry),[id(502)]);assert.equal(d.sync.spaceStatus(sid).reason,'remote-over-budget');
});
test('a held group and dependent tab are admitted together when room appears',t=>{
  const d=setup(t),remote=blob({[id(1)]:tab(1)}),local=structuredClone(remote);
  local.groups[id(9)]={name:f('G',200,'desktop'),color:f(null,200,'desktop'),collapsed:f(false,200,'desktop'),pos:f(model.keyFor('','',id(9)),200,'desktop'),deleted:f(false,200,'desktop')};
  local.tabs[id(2)]=tab(2,{by:'desktop',c:201});local.tabs[id(2)].groupId=f(id(9),201,'desktop');
  const tight=s=>({ct:'x'.repeat(Object.keys(JSON.parse(s).groups).length?600000:10)});
  d.spaces.mergeSpace(sid,remote,'v',d.ctx,tight);d.spaces.noteLocalSpace(sid,local,{groups:local.groups,tabs:{[id(2)]:local.tabs[id(2)]}},d.ctx);
  const first=d.spaces.exportSpace(sid,remote,'v',d.ctx,tight);assert.equal(first.upload,null);
  const retry=d.spaces.exportSpace(sid,remote,'v',d.ctx,small);assert.ok(retry.upload.blob.groups[id(9)]);assert.ok(retry.upload.blob.tabs[id(2)]);
  assert.deepEqual(adapter.unsyncedTabIds(d.spaces.rebind(d.ctx.accountId).data.blobs[sid]),[]);
});
test('holding a navigation never rolls newer fetched metadata back to the historical snapshot',t=>{
  const d=setup(t),old=blob({[id(1)]:tab(1)}),local=structuredClone(old);
  const budget=s=>({ct:'x'.repeat(JSON.parse(s).tabs[id(1)].nav.v.url.length>1000?600000:10)});
  d.spaces.mergeSpace(sid,old,'v1',d.ctx,budget);
  local.tabs[id(1)].nav=f({url:'https://example.test/'+ 'x'.repeat(1500),title:'Local'},200,'desktop');
  d.spaces.noteLocalSpace(sid,local,{tabs:{[id(1)]:{nav:local.tabs[id(1)].nav}}},d.ctx);
  const remote=structuredClone(old);remote.tabs[id(1)].name=f('Latest remote name',300);
  const p=d.spaces.exportSpace(sid,remote,'v2',d.ctx,budget),entry=d.spaces.rebind(d.ctx.accountId).data.blobs[sid];
  assert.equal(p.upload,null);assert.equal(entry.blob.tabs[id(1)].name.v,'Latest remote name');assert.equal(entry.lastPublishable.tabs[id(1)].name.v,'Latest remote name');
  assert.equal(entry.blob.tabs[id(1)].nav.v.title,'Local');assert.deepEqual(adapter.unsyncedTabIds(entry),[id(1)]);
});
test('failed upload expiry cleanup also rejects in-flight fields for the retired id',t=>{
  const now=model.LIMITS.tombstoneMs+200;t.mock.method(Date,'now',()=>now);const d=setup(t);
  const remote=blob({[id(1)]:tab(1),[id(2)]:tab(2)}),local=structuredClone(remote);
  local.tabs[id(1)].deleted=f(true,100,'desktop');local.tabs[id(2)].name=f('Pending',now-1,'desktop');
  d.spaces.noteLocalSpace(sid,local,{tabs:local.tabs},d.ctx);
  const p=d.spaces.exportSpace(sid,remote,'v',d.ctx,small);assert.ok(p.upload);
  const inFlight=structuredClone(local);inFlight.tabs[id(1)].name=f('Late edit of retired record',now+1,'desktop');inFlight.tabs[id(3)]=tab(3,{by:'desktop',c:now+1});
  d.spaces.noteLocalSpace(sid,inFlight,{tabs:{[id(1)]:{name:inFlight.tabs[id(1)].name},[id(3)]:inFlight.tabs[id(3)]}},d.ctx);
  d.spaces.settleSpace(sid,p,{blobStored:false},d.ctx);
  const state=d.spaces.rebind(d.ctx.accountId).data;
  assert.equal(state.pending[sid].tabs[id(1)],undefined);assert.equal(state.blobs[sid].blob.tabs[id(1)],undefined);
  assert.ok(state.pending[sid].tabs[id(3)]);
});
test('tombstones hold room until expiry and the first pass with room retries the pending tab',t=>{
  let now=1000;t.mock.method(Date,'now',()=>now);const d=setup(t),remote=blob({[id(1)]:{...tab(1),deleted:f(true)}}),local=structuredClone(remote);
  local.tabs[id(2)]=tab(2,{by:'desktop',c:200});
  const tight=s=>({ct:'x'.repeat(Object.keys(JSON.parse(s).tabs).length>1?600000:10)});
  d.spaces.mergeSpace(sid,remote,'v',d.ctx,tight);d.spaces.noteLocalSpace(sid,local,{tabs:{[id(2)]:local.tabs[id(2)]}},d.ctx);
  assert.equal(d.spaces.exportSpace(sid,remote,'v',d.ctx,tight).reason,'tombstones');
  now=model.LIMITS.tombstoneMs+99;assert.equal(d.spaces.exportSpace(sid,remote,'v',d.ctx,tight).upload,null);
  now+=2;const retry=d.spaces.exportSpace(sid,remote,'v',d.ctx,tight);
  assert.deepEqual(Object.keys(retry.upload.blob.tabs),[id(2)]);assert.equal(retry.reason,null);
});
test('the 501st live tab stays local and syncs after a close without waiting for tombstone expiry',t=>{
  const d=setup(t),remote=blob(Object.fromEntries(Array.from({length:500},(_,n)=>[id(n+1),tab(n+1)]))),local=structuredClone(remote);
  local.tabs[id(501)]=tab(501,{by:'desktop',c:200});d.spaces.mergeSpace(sid,remote,'v',d.ctx,small);d.spaces.noteLocalSpace(sid,local,{tabs:{[id(501)]:local.tabs[id(501)]}},d.ctx);
  const first=d.spaces.exportSpace(sid,remote,'v',d.ctx,small);assert.equal(first.reason,'tabs');assert.equal(first.upload,null);
  local.tabs[id(1)].deleted=f(true,300,'desktop');d.spaces.noteLocalSpace(sid,local,{tabs:{[id(1)]:{deleted:local.tabs[id(1)].deleted}}},d.ctx);
  const next=d.spaces.exportSpace(sid,remote,'v',d.ctx,small);assert.equal(model.liveTabCount(next.upload.blob),500);assert.ok(next.upload.blob.tabs[id(501)]);
});
test('a transient 26th shared Space is retained while creating the 27th is refused',t=>{
  const d=setup(t),spaces={};for(let n=1;n<=26;n++)spaces[id(n)]={name:f('Space '+n),color:f('#426c4c'),symbol:f('briefcase'),pos:f(model.keyFor('','',id(n))),deleted:f(false)};
  d.spaces.mergeIndex({v:1,spaces},d.ctx);
  assert.equal(d.spaces.spaceCount(d.ctx),26);assert.equal(d.spaces.canAddSpace(d.ctx),false);
  assert.equal(d.spaces.snapshot(d.ctx).index.spaces[id(26)].name.v,'Space 26');
});
