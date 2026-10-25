'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const model=require('../../src/main/shared-spaces-model');
let createRuntimeSync;try{({createRuntimeSync}=require('../../src/main/shared-spaces-runtime'));}catch(e){if(e.code!=='MODULE_NOT_FOUND')throw e;}
const id=n=>n.toString(16).padStart(32,'0'),f=(v,c=100)=>({v,c,by:'peer'}),sid=id(99);
const record=(n,left='')=>({nav:f({url:'https://example.test/'+n,title:'T'+n}),name:f(null),pinned:f(false),groupId:f(null),pos:f(model.keyFor(left,'',id(n))),deleted:f(false)});
function harness(override) {
  assert.equal(typeof createRuntimeSync,'function');
  const one=record(1),two=record(2,one.pos.v),base={v:1,spaceId:sid,groups:{},tabs:{[id(1)]:one,[id(2)]:two}};
  const runtime={id:'window',active:id(1),resident:false,panes:[],focused:false};
  let blob=structuredClone(base),saved={spaceId:sid,displayed:structuredClone(base),accepted:[]};
  let accountId='a';
  const tabs=new Map(Object.entries(base.tabs).map(([key,value])=>[key,structuredClone(value)])),writes=[],actions=[],parked=[];
  const controller=createRuntimeSync({
    read:()=>({spaceId:sid,accountId,deviceId:'desktop',blob,window:saved,protectedIds:runtime.resident?[]:[runtime.active,...runtime.panes]}),
    saveWindow:(_runtime,next)=>{saved=structuredClone(next);return true;},
    writeLocal:(_runtime,next,edits)=>{writes.push(edits);blob=model.mergeBlob(blob,next);},
    capture:()=>({urls:[...tabs.values()].map(t=>t.nav.v.url),meta:[...tabs.values()].map(t=>({title:t.nav.v.title,customTitle:t.name.v})),
      tabIds:[...tabs.keys()],pinned:[...tabs.values()].map(t=>t.pinned.v),groupIds:[...tabs.values()].map(t=>t.groupId.v),groups:[],activeIndex:[...tabs.keys()].indexOf(runtime.active)}),
    applyRow:(_runtime,row)=>{
      actions.push(row);
      if(override)return override(row,tabs,parked);
      if(row.op==='create'){tabs.set(row.id,structuredClone(row.record));return true;}
      if(row.op==='close'){parked.push(row.id);tabs.delete(row.id);return true;}
      if(row.kind==='tabs')tabs.get(row.id)[row.field]=structuredClone(row.value);
      return true;
    },layout:()=>{},now:()=>400,
  });
  return {controller,runtime,tabs,writes,actions,parked,get saved(){return saved;},get blob(){return blob;},remote:next=>{blob=model.mergeBlob(blob,next);},forgetRemote:id=>{delete blob.tabs[id];},changeAccount:()=>{accountId='b';saved={spaceId:sid,displayed:structuredClone(base),accepted:[]};}};
}
test('a remote tab is created through the quiet-create action at its record position',async()=>{
  const h=harness(),next=structuredClone(h.blob);next.tabs[id(3)]=record(3,next.tabs[id(2)].pos.v);h.remote(next);
  await h.controller.apply(h.runtime);
  assert.equal(h.actions[0].op,'create');assert.equal(h.actions[0].quiet,true);assert.ok(h.tabs.has(id(3)));
  assert.equal(h.saved.displayed.tabs[id(3)].pos.v,next.tabs[id(3)].pos.v);
});
test('a remote close uses ordinary recording so the live view can be parked',async()=>{
  const h=harness(),next=structuredClone(h.blob);next.tabs[id(2)].deleted=f(true,200);h.remote(next);
  await h.controller.apply(h.runtime);assert.deepEqual(h.parked,[id(2)]);assert.equal(h.saved.displayed.tabs[id(2)].deleted.v,true);
});
test('an unfocused window protects its active tab and every visible split pane',async()=>{
  const h=harness();h.runtime.panes=[id(2)];const next=structuredClone(h.blob);
  next.tabs[id(1)].nav=f({url:'https://remote.test/',title:'Remote'},200);next.tabs[id(2)].deleted=f(true,200);h.remote(next);
  await h.controller.apply(h.runtime);assert.equal(h.actions.length,0);assert.equal(h.saved.accepted.length,2);
  assert.equal(h.saved.displayed.tabs[id(1)].nav.c,100);assert.equal(h.saved.displayed.tabs[id(2)].deleted.v,false);
});
test('switching tabs applies the deferred target and advances its baseline',async()=>{
  const h=harness(),next=structuredClone(h.blob);next.tabs[id(1)].nav=f({url:'https://remote.test/',title:'Remote'},200);h.remote(next);
  await h.controller.apply(h.runtime);h.runtime.active=id(2);await h.controller.apply(h.runtime);
  assert.equal(h.tabs.get(id(1)).nav.v.url,'https://remote.test/');assert.equal(h.saved.displayed.tabs[id(1)].nav.c,200);assert.equal(h.saved.accepted.length,0);
});
test('cold start applies persisted accepted values before protecting the selection',async()=>{
  const h=harness(),next=structuredClone(h.blob);next.tabs[id(1)].deleted=f(true,200);h.remote(next);
  await h.controller.apply(h.runtime);await h.controller.apply(h.runtime,{force:true});
  assert.deepEqual(h.parked,[id(1)]);assert.equal(h.saved.accepted.length,0);
});
test('applied navigation generates no echo and an unrelated close publishes only itself',async()=>{
  const h=harness(),next=structuredClone(h.blob);next.tabs[id(1)].nav=f({url:'https://remote.test/',title:'Remote'},500);h.remote(next);
  await h.controller.apply(h.runtime);h.tabs.delete(id(2));h.controller.local(h.runtime);
  assert.deepEqual(Object.keys(h.writes[0].tabs),[id(2)]);
  h.runtime.active=null;await h.controller.apply(h.runtime);h.controller.local(h.runtime);
  assert.equal(h.writes.length,1);
});
test('a set-aside runtime applies every remote target even with an active id',async()=>{
  const h=harness();h.runtime.resident=true;const next=structuredClone(h.blob);next.tabs[id(1)].deleted=f(true,200);h.remote(next);
  await h.controller.apply(h.runtime);assert.deepEqual(h.parked,[id(1)]);assert.equal(h.saved.accepted.length,0);
});
test('a local navigation supersedes a deferred target with a greater field clock',async()=>{
  const h=harness(),next=structuredClone(h.blob);next.tabs[id(1)].nav=f({url:'https://remote.test/',title:'Remote'},500);h.remote(next);
  await h.controller.apply(h.runtime);h.tabs.get(id(1)).nav.v={url:'https://local.test/',title:'Local'};h.controller.local(h.runtime);
  assert.equal(h.writes[0].tabs[id(1)].nav.c,501);assert.equal(h.saved.accepted.length,0);
  h.runtime.active=null;await h.controller.apply(h.runtime);assert.equal(h.tabs.get(id(1)).nav.v.url,'https://local.test/');
});
test('cold replay keeps an accepted close even after its remote tombstone expires',async()=>{
  const h=harness(),next=structuredClone(h.blob);next.tabs[id(1)].deleted=f(true,200);h.remote(next);
  await h.controller.apply(h.runtime);h.forgetRemote(id(1));
  await h.controller.apply(h.runtime,{force:true});assert.deepEqual(h.parked,[id(1)]);
});
test('main routes remote creation and close through the ordinary quiet/parking paths',()=>{
  const fs=require('node:fs'),vm=require('node:vm');
  const source=fs.readFileSync(require.resolve('../../src/main/main.js'),'utf8');
  const match=source.match(/function applySharedSpaceRow\(runtime, row\) \{[\s\S]*?\n\}/);
  assert.ok(match,'main needs the real runtime action adapter');
  const runtime={tabOrder:[],groups:[]},tabs=new Map(),calls=[];
  const sandbox={tabs,sharedSpaceModel:model,withWindowRuntime:(_r,fn)=>fn(),
    createTab:(url,options)=>{calls.push(['create',url,options]);tabs.set('new',{id:'new',url});runtime.tabOrder.push('new');return 'new';},
    closeTab:(id,options)=>calls.push(['close',id,options]),markPinned:tab=>{tab.pinned=true;},
    sleepSnapshots:new Map(),navigateTabToAddress:()=>{},persistableUrl:x=>x,groupRecord:x=>x};
  vm.runInNewContext(match[0]+'\nthis.apply=applySharedSpaceRow;',sandbox);
  const pinned=record(3);pinned.pinned=f(true);
  sandbox.apply(runtime,{op:'create',kind:'tabs',id:id(3),record:pinned});
  assert.equal(calls[0][2].asleep,true);assert.equal(tabs.get('new').sharedTabId,id(3));
  assert.equal(calls[0][2].pinnedHomeUrl,pinned.nav.v.url);
  sandbox.apply(runtime,{op:'close',kind:'tabs',id:id(3)});
  assert.deepEqual(JSON.parse(JSON.stringify(calls[1])),['close','new',{record:true,selectReplacement:false}]);
});
test('session checkpoints and filtering retain shared ids without putting them in the rollback mirror',()=>{
  const {entryFrom,buildSaveShape}=require('../../src/main/session-workspace');
  const {filterRestoredSession}=require('../../src/main/session-restore');
  const source={id:'win',urls:['https://one.test/','blanc://settings/','https://two.test/'],tabIds:[id(1),null,id(2)]};
  const entry=entryFrom(source);assert.deepEqual(entry.tabIds,source.tabIds);
  const filtered=filterRestoredSession(entry,url=>url.startsWith('blanc:'));assert.deepEqual(filtered.tabIds,[id(1),id(2)]);
  assert.equal(buildSaveShape([entry],{}).tabIds,undefined);
});
test('main protects the unfocused active tab and split panes, but not a resident or named profile',()=>{
  const fs=require('node:fs'),vm=require('node:vm');
  const source=fs.readFileSync(require.resolve('../../src/main/main.js'),'utf8');
  const code=source.match(/function sharedSpaceRuntimeContext\(runtime\) \{[\s\S]*?\n\}/)[0];
  const runtime={id:'window',profileId:'default',workspaceId:'work',activeTabId:'one',focused:false};
  const sandbox={isSharedSpacesOffered:()=>true,DEFAULT_PROFILE_ID:'default',namedWorkspaces:{get:()=>({sharedId:sid})},
    sync:{status:()=>({enabled:true}),sharedContext:()=>({accountId:'a',deviceId:'desktop'})},
    sharedSpaceState:{rebind:()=>({data:{blobs:{[sid]:{blob:{v:1,spaceId:sid,tabs:{},groups:{}}}},windows:{}}})},visibleSplitTabIds:()=>['one','two'],
    tabs:new Map([['one',{sharedTabId:id(1)}],['two',{sharedTabId:id(2)}]])};
  vm.runInNewContext(code+'\nthis.read=sharedSpaceRuntimeContext;',sandbox);
  assert.deepEqual([...new Set(sandbox.read(runtime).protectedIds)],[id(1),id(2)]);
  runtime.resident=true;assert.equal(sandbox.read(runtime).protectedIds.length,0);
  runtime.profileId='named';assert.equal(sandbox.read(runtime),null);
});
test('a native navigation wait does not suppress an unrelated local close',async()=>{
  let release;
  const h=harness((row,tabs)=>new Promise(resolve=>{release=()=>{tabs.get(row.id)[row.field]=row.value;resolve(true);};}));
  const next=structuredClone(h.blob);next.tabs[id(2)].nav=f({url:'https://remote.test/',title:'Remote'},500);h.remote(next);
  const applying=h.controller.apply(h.runtime);await new Promise(resolve=>setImmediate(resolve));
  h.tabs.delete(id(1));h.controller.local(h.runtime);
  assert.deepEqual(Object.keys(h.writes[0].tabs),[id(1)]);
  release();await applying;assert.equal(h.saved.displayed.tabs[id(2)].nav.c,500);
});
test('a completed native action from the old account cannot settle the new account baseline',async()=>{
  let release;const h=harness(()=>new Promise(resolve=>{release=resolve;}));
  const next=structuredClone(h.blob);next.tabs[id(2)].nav=f({url:'https://old-account.test/',title:'Old'},500);h.remote(next);
  const pending=h.controller.apply(h.runtime);await new Promise(resolve=>setImmediate(resolve));
  h.changeAccount();const expected=structuredClone(h.saved);release(true);await pending;
  assert.deepEqual(h.saved,expected);
});
test('a close with accepted targets completes them before handing off to the normal close lifecycle',async()=>{
  const fs=require('node:fs'),vm=require('node:vm');
  const source=fs.readFileSync(require.resolve('../../src/main/main.js'),'utf8');
  const code=source.match(/function closeSharedSpaceWindow\(runtime, event, closeNormally\) \{[\s\S]*?\n\}/)[0];
  const events=[];let release;
  const runtime={window:{isDestroyed:()=>false,close:()=>events.push('retry-close')}};
  const sandbox={isQuitting:false,hasDeferredSharedChanges:()=>true,console,
    applySharedSpaceChanges:()=>new Promise(resolve=>{events.push('apply');release=resolve;})};
  vm.runInNewContext(code+'\nthis.close=closeSharedSpaceWindow;',sandbox);
  const event={preventDefault:()=>events.push('prevent')},normal=()=>events.push('normal-close');
  sandbox.close(runtime,event,normal);assert.deepEqual(events,['prevent','apply']);
  release(true);await new Promise(resolve=>setImmediate(resolve));
  sandbox.close(runtime,event,normal);assert.deepEqual(events,['prevent','apply','retry-close','normal-close']);
});
test('a Space tombstone leaves an open window unsaved and disposes a set-aside runtime',async()=>{
  const fs=require('node:fs'),vm=require('node:vm');
  const source=fs.readFileSync(require.resolve('../../src/main/main.js'),'utf8');
  const code=source.match(/function applySharedSpaceChanges\(runtime, options=\{\}\) \{[\s\S]*?\n\}/)[0];
  for(const resident of [false,true]) {
    const events=[],runtime={workspaceId:'local',resident};
    const sandbox={sharedSpaceRuntimeContext:()=>({spaceId:sid,workspace:{id:'local'},store:{data:{index:{spaces:{[sid]:{deleted:{v:true}}}}}}}),
      sharedSpaceState:{isEnabled:()=>true,isDormant:()=>false},namedWorkspaces:{remove:id=>{events.push('remove:'+id);return {ok:true};}},
      disposeResident:()=>events.push('dispose'),broadcastWorkspacesUpdated:()=>events.push('broadcast'),
      sharedRuntimeSync:{apply:()=>{events.push('tabs-mutated');return Promise.resolve(true);}},
      windowRuntimes:{all:()=>[runtime]},withWindowRuntime:(_r,fn)=>fn(),scheduleBroadcastTabs:()=>{},Promise};
    vm.runInNewContext(code+'\nthis.apply=applySharedSpaceChanges;',sandbox);await sandbox.apply(runtime);
    assert.equal(runtime.workspaceId,null);assert.equal(events.includes('tabs-mutated'),false);assert.equal(events.includes('dispose'),resident);
  }
});
test('a newly active tab stays deferred after an earlier navigation awaited',async()=>{
 let release,started;const gate=new Promise(r=>{release=r;}),ready=new Promise(r=>{started=r;});
 const h=harness(async(row,tabs)=>{if(row.id===id(1)){started();await gate;}tabs.get(row.id)[row.field]=structuredClone(row.value);return true;});h.runtime.active=null;
 const remote=structuredClone(h.blob);for(const n of [1,2])remote.tabs[id(n)].nav=f({url:'https://new.test/'+n,title:'New'},200);h.remote(remote);
 const applying=h.controller.apply(h.runtime);await ready;h.runtime.active=id(2);release();await applying;
 assert.equal(h.tabs.get(id(2)).nav.v.url,'https://example.test/2');assert.ok(h.saved.accepted.some(row=>row.id===id(2)));
});
test('same-value remote clocks advance the displayed receipt before a later local edit',async()=>{
 const h=harness(),remote=structuredClone(h.blob);remote.tabs[id(2)].nav.c=1000;h.remote(remote);await h.controller.apply(h.runtime);
 assert.equal(h.saved.displayed.tabs[id(2)].nav.c,1000);h.tabs.get(id(2)).nav.v.url='https://local.test/';h.controller.local(h.runtime);assert.ok(h.writes.at(-1).tabs[id(2)].nav.c>1000);
});
test('a projection checkpoint precedes every advanced baseline and blocks local echo on failure',async()=>{
 const sid=id(88),tab=record(1),blob={v:1,spaceId:sid,groups:{},tabs:{[id(1)]:tab}},runtime={};let saved={spaceId:sid,displayed:{v:1,spaceId:sid,groups:{},tabs:{}},accepted:[]},materialized=false;
 const order=[],controller=createRuntimeSync({read:()=>({spaceId:sid,accountId:'a',deviceId:'d',blob,window:saved,protectedIds:[]}),
  checkpoint:()=>{order.push('projection');return !materialized;},saveWindow:(_r,state)=>{order.push('baseline');saved=structuredClone(state);return true;},
  applyRow:()=>{materialized=true;return true;},capture:()=>({urls:[],groups:[]}),writeLocal:()=>{throw new Error('echo');},layout:()=>{}});
 await controller.apply(runtime);assert.deepEqual(order.slice(0,2),['projection','baseline']);assert.equal(saved.displayed.tabs[id(1)],undefined);assert.equal(controller.local(runtime),null);
});
test('position materialization runs before its advanced receipt checkpoint',async()=>{
 const h=harness();h.runtime.active=null;const remote=structuredClone(h.blob);remote.tabs[id(2)].pos=f(model.keyFor('',remote.tabs[id(1)].pos.v,id(2)),200);h.remote(remote);
 const events=[],runtime={},base={spaceId:sid,displayed:structuredClone(h.saved.displayed),accepted:[]};let saved=base;
 const c=createRuntimeSync({read:()=>({spaceId:sid,accountId:'a',deviceId:'d',blob:remote,window:saved,protectedIds:[]}),
  applyRow:()=>true,layout:()=>events.push('layout'),checkpoint:(_r,next)=>{if(next.displayed.tabs[id(2)].pos.c===200)assert.equal(events.at(-1),'layout');return true;},saveWindow:(_r,next)=>{saved=structuredClone(next);return true;}});
 await c.apply(runtime);assert.ok(events.length);
});
