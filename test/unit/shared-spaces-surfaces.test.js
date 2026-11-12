'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {hideOccurrences,markState,closedBand}=require('../../src/main/shared-spaces-surfaces');
test('matching sidecar hides only listed occurrences in a visible Space',()=>{
 const device={deviceId:'b',updatedAt:5,tabs:[{url:'same'},{url:'same'},{url:'other'}]};
 const sidecar={devices:{b:{forUpdatedAt:5,tabs:[{i:0,spaceId:'s'}]}}};
 assert.deepEqual(hideOccurrences([device],sidecar,new Set(['s']))[0].tabs,[{url:'same'},{url:'other'}]);
 assert.equal(hideOccurrences([device],sidecar,new Set())[0].tabs.length,3);
 assert.equal(hideOccurrences([{...device,updatedAt:6}],sidecar,new Set(['s']))[0].tabs.length,3);
});
test('marks distinguish unavailable, full, waiting and shared',()=>{
 assert.equal(markState({available:false},{}),'unavailable');
 assert.equal(markState({available:true},{reason:'tombstones'}),'full');
 assert.equal(markState({available:true},{pending:true}),'waiting');
 assert.equal(markState({available:true},{}),'shared');
});
test('routine sync requests never mark a Space as waiting to upload',()=>{
 // The 60-second pass keeps the request window busy almost all the time;
 // only this Space's own unacknowledged edits mean something waits (M16 §3.8).
 assert.equal(markState({available:true,waiting:9,running:1},{}),'shared');
 assert.equal(markState({available:true,waiting:9,running:1},{pending:false}),'shared');
 assert.equal(markState({available:true,waiting:0,running:0},{pending:true}),'waiting');
});
test('one closed band keeps local live recovery and does not duplicate matching remote ids',()=>{
 assert.deepEqual(closedBand([{id:'same',title:'local'}],[{id:'same',title:'remote'},{id:'new',title:'new',fromName:'B'}]).map(x=>x.id),['same','new']);
});
test('a missing sidecar never hides a same-URL unshared tab',()=>{
 const devices=[{deviceId:'b',updatedAt:6,tabs:[{url:'same'},{url:'same'}]}];
 assert.deepEqual(hideOccurrences(devices,null,new Set(['s'])),devices);
});
test('unacknowledged changes wait and a failed upload reports not synced',()=>{
 assert.equal(markState({available:true},{pending:true}),'waiting');
 assert.equal(markState({available:true},{pending:true,failed:true}),'notSynced');
});
test('publication binds the immutable F27 snapshot, including duplicate URL indices',async t=>{
 const {syncDevice}=require('./support/sync-device'),d=syncDevice({record:{syncTabs:true}});t.after(()=>d.dispose());
 const sid='a'.repeat(32),tabs=[{url:'https://same.test/',title:'Shared',sharedSpaceId:sid},{url:'https://same.test/',title:'Local'},{url:'https://private.test/',private:true,sharedSpaceId:sid}];
 d.tabsync.setSnapshotProvider(()=>({tabList:tabs,groups:[]}));
 const ctx={accountId:d.record.accountId,deviceId:'desktop',deviceName:'A',platform:'darwin',syncTabs:true};
 const payload=d.tabsync.exportForSync(ctx);tabs.unshift({url:'https://later.test/',sharedSpaceId:sid});
 assert.deepEqual(d.tabsync.publishedSidecar(payload),{forUpdatedAt:payload.devices.desktop.updatedAt,tabs:[{i:0,spaceId:sid}]});
 d.spaces.setOwnSidecar(d.tabsync.publishedSidecar(payload),ctx);
 const binding=d.spaces.exportSidecar(ctx);
 assert.deepEqual(binding.devices.desktop.tabs,[{i:0,spaceId:sid}]);
 assert.equal(hideOccurrences([{deviceId:'desktop',...payload.devices.desktop}],binding,new Set([sid]))[0].tabs[0].title,'Local');
});
test('an over-budget tab or unpublished navigation keeps its F27 occurrence visible',()=>{
 const {publishedOccurrence}=require('../../src/main/shared-spaces-surfaces');
 const tab={url:'https://one.test/',title:'One',pinned:false,groupId:null};
 const record={nav:{v:{url:tab.url,title:tab.title}},name:{v:''},pinned:{v:false},groupId:{v:null},deleted:{v:false}};
 assert.equal(publishedOccurrence(tab,undefined),false);assert.equal(publishedOccurrence(tab,record),true);
 assert.equal(publishedOccurrence({...tab,url:'https://new.test/'},record),false);
 assert.equal(publishedOccurrence(tab,{...record,deleted:{v:true}}),false);
});
test('a change in shared membership advances the F27 clock even when tab content is unchanged',async t=>{
 const {syncDevice}=require('./support/sync-device'),d=syncDevice({record:{syncTabs:true}});t.after(()=>d.dispose());
 const tab={url:'https://same.test/',title:'Same'};d.tabsync.setSnapshotProvider(()=>({tabList:[tab],groups:[]}));
 const ctx={accountId:d.record.accountId,deviceId:'desktop',deviceName:'A',platform:'darwin',syncTabs:true};
 const first=d.tabsync.exportForSync(ctx);tab.sharedSpaceId='a'.repeat(32);const next=d.tabsync.exportForSync(ctx);
 assert.ok(next.devices.desktop.updatedAt>first.devices.desktop.updatedAt);assert.deepEqual(next.devices.desktop.tabs,first.devices.desktop.tabs);
 assert.equal(d.tabsync.publishedSidecar(next).forUpdatedAt,next.devices.desktop.updatedAt);
});
