'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../../src/main/main'),'utf8');
function push(entry,context=null){
 const own=[],runtime={profileId:'default',closedEntries:[]},ctx={accountId:'a',deviceId:'A'};
 const sandbox={documentPolicy:require('../../src/main/document-policy'),rt:()=>runtime,isSharedSpacesOffered:()=>true,DEFAULT_PROFILE_ID:'default',sync:{sharedStatus:()=>({enabled:true}),sharedContext:()=>ctx},
  sharedSpaceRuntimeContext:()=>context,syncedClosed:{addOwnItem:(_ctx,item)=>own.push(item)},require:name=>name==='./tabsync'?{getDeviceEntries:()=>({B:{name:'Laptop'}})}:require(name),
  setTimeout:()=>1,bindWindowRuntime:(_runtime,fn)=>fn,expireEntries:()=>[],CLOSED_ENTRY_TTL_MS:3600000,MAX_CLOSED_ENTRIES:25,
  scheduleMenuRebuild:()=>{},disposeClosedEntry:()=>{},downgradeHeldEntry:()=>{}};
 const code=source.slice(source.indexOf('function pushClosedEntry('),source.indexOf('/** Drop every resource'));
 vm.runInNewContext(code+'\nthis.push=pushClosedEntry;',sandbox);sandbox.push(entry);return {own,entry};
}
test('an ordinary local HTTP close joins the synced band without sharing its page state',()=>{
 const {own}=push({kind:'tab',id:'closed-1',url:'https://one.test/',title:'One',closedAt:1,snapshot:{secret:'page state'}});
 assert.equal(own.length,1);assert.equal(own[0].url,'https://one.test/');assert.equal(own[0].snapshot,undefined);assert.equal(own[0].spaceId,null);
});
test('applying a remote tombstone records one own item with the same close identity',()=>{
 const id='b'.repeat(32),ctx={spaceId:'s',deviceId:'A',blob:{tabs:{[id]:{deleted:{v:true,by:'B'}}}}};
 const {own,entry}=push({kind:'tab',id:'closed-1',sharedTabId:id,sharedRemoteClose:true,url:'https://one.test/',title:'One',closedAt:1},ctx);
 assert.equal(own.length,1);assert.equal(own[0].id,id);assert.equal(entry.sharedFrom,'Laptop');
});
test('the combined band keeps a local entry once and deduplicates peer copies of a close',()=>{
 const runtime={profileId:'default',closedEntries:[{id:'local',syncedId:'one'}]},ctx={};
 const sandbox={isSharedSpacesOffered:()=>true,DEFAULT_PROFILE_ID:'default',projectEntries:()=>[{id:'local',title:'Local',tabCount:1}],
  sync:{sharedStatus:()=>({enabled:true}),sharedContext:()=>ctx},syncedClosed:{inbox:()=>[
   {id:'one',title:'duplicate',fromName:'B'},{id:'two',title:'Two',fromId:'C',fromName:'C',spaceId:'s',closedAt:2},{id:'two',title:'Two',fromId:'B',fromName:'B',spaceId:'s',closedAt:1}]},
  sharedSpaceState:{snapshot:()=>({blobs:{s:{blob:{tabs:{two:{deleted:{by:'B'}}}}}}})}};
 const code=source.slice(source.indexOf('function sharedClosedBand('),source.indexOf('function reopenSharedClosedEntry('));
 vm.runInNewContext(code+'\nthis.band=sharedClosedBand;',sandbox);const rows=sandbox.band(runtime);
 assert.equal(rows.length,2);assert.equal(rows[1].fromName,'B');assert.equal(rows[0].id,'local');
});

test('a user close during a deferred remote close remains a local close',()=>{
 const id='b'.repeat(32),ctx={spaceId:'s',deviceId:'A',blob:{tabs:{[id]:{deleted:{v:true,by:'B'}}}}};
 const {entry}=push({kind:'tab',id:'closed-1',sharedTabId:id,url:'https://one.test/',title:'One',closedAt:1},ctx);
 assert.equal(entry.sharedRemote,false);assert.equal(entry.sharedFrom,null);
});
test('policy-bearing closed pages never publish a fresh unrestricted reopen',()=>{assert.equal(push({kind:'tab',id:'policy',url:'https://one.test/',title:'One',closedAt:1,inheritsDocumentPolicy:true}).own.length,0);});
test('a malformed stamped policy on a closed page stays local',()=>{assert.equal(push({kind:'tab',id:'bad-policy',url:'https://one.test/',title:'One',closedAt:1,documentPolicy:1,inheritsDocumentPolicy:null}).own.length,0);});
test('the combined band orders local and remote rows together by closing time',()=>{
 const runtime={profileId:'default',closedEntries:[{id:'local',closedAt:1}]};
 const sandbox={isSharedSpacesOffered:()=>true,DEFAULT_PROFILE_ID:'default',projectEntries:()=>[{id:'local',title:'Local',tabCount:1}],sync:{sharedStatus:()=>({enabled:true}),sharedContext:()=>({})},syncedClosed:{inbox:()=>[{id:'remote',title:'Remote',fromName:'B',closedAt:10}]},sharedSpaceState:{snapshot:()=>({blobs:{}})}};
 const code=source.slice(source.indexOf('function sharedClosedBand('),source.indexOf('function reopenSharedClosedEntry('));vm.runInNewContext(code+'\nthis.band=sharedClosedBand;',sandbox);
 assert.deepEqual(Array.from(sandbox.band(runtime),row=>row.id),['local','shared:remote']);
});
test('a local close does not reappear through a peer after its native entry expires or Clear all',async t=>{
 const {syncDevice}=require('./support/sync-device'),d=syncDevice();t.after(()=>d.dispose());const ctx={accountId:d.record.accountId,deviceId:'desktop',deviceName:'A',platform:'darwin'},now=Date.now();
 const item={id:'event-id',url:'https://one.test/',title:'One',closedAt:now};d.closed.addOwnItem(ctx,item);
 d.closed.mergeFromSync({devices:{peer:{name:'B',platform:'linux',updatedAt:now,items:[item]}}},ctx);assert.equal(d.closed.inbox(ctx).length,0);
 d.closed.clear(ctx);d.closed.mergeFromSync({devices:{peer2:{name:'C',platform:'linux',updatedAt:now+1,items:[item]}}},ctx);assert.equal(d.closed.inbox(ctx).length,0);
});
