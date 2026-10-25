'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {syncDevice,virtualClock}=require('./support/sync-device');
const model=require('../../src/main/shared-spaces-model');
const tick=()=>new Promise(r=>setImmediate(r));
const id=n=>n.toString(16).padStart(32,'0'),account='a'.repeat(64);
const field=(v,c=100)=>({v,c,by:'desktop'});
const tab=n=>({nav:field({url:'https://example.test/'+n,title:'T'}),name:field(null),pinned:field(false),groupId:field(null),pos:field(model.keyFor('','',id(n))),deleted:field(false)});
const space=n=>({v:1,spaceId:id(n),groups:{},tabs:{[id(n+100)]:tab(n+100)}});
const response=(status,body='not found')=>({status,ok:status>=200&&status<300,json:async()=>body,text:async()=>typeof body==='string'?body:JSON.stringify(body)});
function setup(t,{full=false,fetch}={}) {
  const clock=virtualClock(),events=[];
  const device=syncDevice({clock,files:{
    'shared-spaces.json':{accountId:account,enabled:true,requestLog:full?Array(10).fill(Date.now()):[]},
    'tab-sync.json':{accountId:account,devices:{phone:{name:'Phone',platform:'ios',updatedAt:Date.now(),tabs:[],groups:[]}}},
  },fetch:async(url,options={})=>{const e={url:String(url),method:options.method??'GET',store:String(url).split('/').pop(),options};events.push(e);return fetch?fetch(e):response(e.method==='GET'?404:200,{version:'v'});}});
  t.after(async()=>{await device.sync.disable({wipeRemote:true});await device.dispose();});
  return {...device,clock,events,ctx:{accountId:account,deviceId:'desktop',deviceName:'Mac',platform:'darwin'}};
}
test('Send to device waits for an exhausted window and replies from its own completed PUT',async t=>{
  const d=setup(t,{full:true});let settled=false;
  const send=d.sync.sendTab({url:'https://example.test/',title:'Page',to:'phone'}).then(x=>{settled=true;return x;});
  await tick();assert.equal(settled,false);assert.equal(d.events.length,0);
  await d.clock.advance(60000);assert.equal((await send).status,'sent');
  assert.deepEqual(d.events.map(e=>e.method),['GET','PUT']);
});
test('disable cancels a queued Space request with suspended and returns without running it',async t=>{
  const d=setup(t,{full:true}),b=space(1);d.spaces.noteLocalSpace(id(1),b,{tabs:b.tabs},d.ctx);let error;
  const pending=d.sync.syncNow(['space-'+id(1)],{onOutcome:(_name,_outcome,e)=>{error=e;}});await tick();
  assert.equal(d.events.length,0);await d.sync.disable({wipeRemote:true});await pending;
  assert.equal(error.message,'cancelled:suspended');assert.equal(d.events.filter(e=>e.method==='GET').length,0);
});
test('consent-off cancels waiting Spaces work but retains its pending set',async t=>{
  const d=setup(t,{full:true}),b=space(1);d.spaces.noteLocalSpace(id(1),b,{tabs:b.tabs},d.ctx);let error;
  const pending=d.sync.syncNow(['space-'+id(1)],{onOutcome:(_name,_outcome,e)=>{error=e;}});await tick();
  d.sync.setSyncSpaces(false);await pending;
  assert.equal(error.message,'cancelled:consent-off');assert.ok(d.spaces.rebind(account).data.pending[id(1)].tabs);
});
test('a consent generation change strands queued requests without using their credentials',async t=>{
  const d=setup(t,{full:true});let error;
  const pending=d.sync.syncNow(['bookmarks'],{onOutcome:(_name,_outcome,e)=>{error=e;}});await tick();
  d.sync.setSyncTabs(true);await pending;
  assert.equal(error.message,'cancelled:generation');assert.equal(d.events.length,0);
});
test('adopting a new account cancels old queued Space writes before the new account can sync',async t=>{
  const d=setup(t,{full:true}),b=space(1);d.spaces.noteLocalSpace(id(1),b,{tabs:b.tabs},d.ctx);let error;
  const old=d.sync.syncNow(['space-'+id(1)],{onOutcome:(_name,_outcome,e)=>{error=e;}});await tick();
  const enable=d.sync.enable({handle:'new-account',passphrase:'a strong new account passphrase'});await tick();await old;
  assert.equal(error.message,'cancelled:generation');assert.equal(d.events.length,0);
  await d.clock.advance(60000);assert.equal((await enable).ok,true);
  assert.equal(d.events.some(e=>e.store==='space-'+id(1)),false);
});
test('cancelled send cleanup cannot rebind or erase the newly adopted account cache',async t=>{
  const d=setup(t,{full:true});
  const pending=d.sync.sendTab({url:'https://example.test/',title:'Old send',to:'phone'});await tick();
  const credentials={handle:'new-account',passphrase:'a strong new account passphrase'};
  const {accountId:newId,key}=require('../../src/main/sync-crypto').deriveKeys(credentials.handle,credentials.passphrase);key.fill(0);
  const enable=d.sync.enable(credentials),newCtx={...d.ctx,accountId:newId};
  d.sends.mergeFromSync({devices:{'new-peer':{name:'New phone',platform:'ios',updatedAt:Date.now(),items:[]}}},newCtx);
  assert.equal((await pending).status,'failed');
  assert.deepEqual(d.sends.targets(newCtx,{},{}).map(x=>x.id),['new-peer']);
  await d.clock.advance(60000);await enable;
});
test('unknown Spaces stores cancel Space classes while fixed stores still complete',async t=>{
  const d=setup(t,{fetch:e=>response(e.method==='GET'?404:200,e.store==='spaces'?'unknown store':{version:'v'})});
  const b=space(1);d.spaces.noteLocalSpace(id(1),b,{tabs:b.tabs},d.ctx);
  const result=await d.sync.syncNow();assert.equal(result.ok,true);
  assert.ok(d.events.some(e=>e.store==='bookmarks'&&e.method==='PUT'));
  assert.ok(d.events.some(e=>e.store==='sends'&&e.method==='GET'));
  assert.equal(d.events.some(e=>e.store.startsWith('space-')),false);
  assert.equal(d.sync.sharedStatus().available,false);
});
test('wipe drains a wire PUT and cancels a second queued Space operation before DELETE',async t=>{
  let release,started;const wire=new Promise(r=>{started=r;}),gate=new Promise(r=>{release=r;});
  const d=setup(t,{fetch:async e=>{if(e.method==='PUT'&&e.store.startsWith('space-')){started();await gate;}return response(e.method==='GET'?404:200,{version:'v'});}});
  for(const n of [1,2]){const b=space(n);d.spaces.noteLocalSpace(id(n),b,{tabs:b.tabs},d.ctx);}
  const first=d.sync.syncNow(['space-'+id(1)]);await wire;
  const second=d.sync.syncNow(['space-'+id(2)]);const wipe=d.sync.disable({wipeRemote:true});await tick();
  assert.equal(d.events.some(e=>e.method==='DELETE'),false);release();await Promise.all([first,second,wipe]);
  assert.equal(d.events.at(-1).method,'DELETE');assert.equal(d.events.some(e=>e.store==='space-'+id(2)),false);
});
test('an account cannot be adopted while a wipe is draining an old-account PUT',async t=>{
  let release,started;const wire=new Promise(r=>{started=r;}),gate=new Promise(r=>{release=r;});
  const d=setup(t,{fetch:async e=>{if(e.method==='PUT'&&e.store.startsWith('space-')){started();await gate;}return response(e.method==='GET'?404:200,{version:'v'});}});
  const b=space(1);d.spaces.noteLocalSpace(id(1),b,{tabs:b.tabs},d.ctx);
  const put=d.sync.syncNow(['space-'+id(1)]);await wire;
  const wipe=d.sync.disable({wipeRemote:true});
  const adopting=d.sync.enable({handle:'new-account',passphrase:'a strong new account passphrase'});
  await tick();release();const [enable]=await Promise.all([adopting,put,wipe]);
  assert.equal(enable.ok,false);
  const deletes=d.events.filter(e=>e.method==='DELETE');assert.ok(deletes.length>0);
  assert.equal(deletes[0].url.endsWith('/'+account),true,'the old wipe must never target the new account');
});
test('off and on again cannot revive an in-flight Space request from the old consent',async t=>{
 let release;const gate=new Promise(resolve=>{release=resolve;});
 const d=setup(t,{fetch:async e=>{if(e.method==='GET'&&e.store.startsWith('space-')){await gate;return response(404);}return response(200,{version:'v'});}});
 const blob=space(1);d.spaces.noteLocalSpace(id(1),blob,{tabs:blob.tabs},d.ctx);
 const pending=d.sync.syncNow(['space-'+id(1)]);await tick();
 d.sync.setSyncSpaces(false);d.sync.setSyncSpaces(true);release();await pending;
 assert.equal(d.events.some(e=>e.method==='PUT'&&e.store==='space-'+id(1)),false);
 assert.ok(d.spaces.snapshot(d.ctx).pending[id(1)].tabs);
});
test('pairing notices discover devices through the same supported sources as Send to device',async t=>{
 const d=setup(t);assert.deepEqual(d.sync.pairingDevices().map(row=>({id:row.deviceId,name:row.name})),[{id:'phone',name:'Phone'}]);
});
