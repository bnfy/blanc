import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as m from './tab-model.mjs';
const now = 1800000000000;
const entry = (name, at=now, tabs=[{url:'https://example.com/',title:'Page',groupId:null,pinned:false}]) => ({name,platform:'darwin',updatedAt:at,tabs,groups:[]});
test('renderer model preserves shipping UTF16 truncation and inert record shape',()=>{
 const e=m.sanitizeEntry({...entry('😀'.repeat(50)),tabs:[{url:'blanc://settings',title:'private'},{url:'https://example.com/',title:'x'.repeat(199)+'😀',pinned:1,extra:'discard'}]});
 assert.equal(e.name.length,80);assert.equal(e.tabs.length,1);assert.equal(e.tabs[0].title.length,200);
 assert.equal(e.tabs[0].title.charCodeAt(199),0xd83d);
 assert.deepEqual(Object.keys(e.tabs[0]),['url','title','groupId','pinned']);
 assert.match(m.canonical(e),/\\ud83d/);assert.equal(m.sanitizeEntry({updatedAt:'1'}),null);
});
test('peer ties converge, own full entry wins and retraction wins a peer tie',()=>{
 const a=entry('A'),b=entry('B');
 assert.deepEqual(m.mergeDevices({peer:a},{peer:b},{now,ownId:'own'}),m.mergeDevices({peer:b},{peer:a},{now,ownId:'own'}));
 assert.deepEqual(m.mergeDevices({own:b},{own:a},{now,ownId:'own'}).own,b);
 assert.equal(m.mergeDevices({peer:a},{peer:{retracted:true,updatedAt:now}},{now,ownId:'own'}).peer.retracted,true);
});
test('device visibility and prune boundaries match the shipping UI contract',()=>{
 const devices={own:entry('Own'),stale:entry('Stale',now-m.PRUNE_MS-1),edge:entry('Edge',now-m.PRUNE_MS),newer:entry('New',now+1),hidden:entry('No tabs',now,[]),retracted:{updatedAt:now,retracted:true}};
 const merged=m.mergeDevices(devices,{}, {now,ownId:'own'});assert.equal(merged.stale,undefined);
 assert.deepEqual(m.displayDevices(merged,'own',{now}).map(x=>x.deviceId),['newer','edge']);
 assert.deepEqual(m.rebindDevices({accountId:'old',devices},'new'),{accountId:'new',devices:{}});
});
test('consent off publishes presence; an unavailable snapshot cannot publish tabs',()=>{
 const prev=entry('Own');const snapshot={tabs:prev.tabs,groups:[]};
 for(const args of [{syncTabs:false,snapshot},{syncTabs:true,snapshot:null}]){
  const result=m.ownEntryFor({...args,prev,name:'Own',platform:'darwin',now:now+1});
  assert.deepEqual(result.tabs,[]);assert.deepEqual(result.groups,[]);
 }
 assert.equal(m.heartbeatDue(prev,now+m.HEARTBEAT_MS),true);
});
test('UTF8 budget trims upload without mutating full store or bumping unchanged clock',()=>{
 const tabs=Array.from({length:70},(_,i)=>({url:`https://example.com/${i}`,title:'漢字😀'.repeat(40),groupId:'g',pinned:false}));
 const snapshot={tabs,groups:[{id:'g',name:'Group'}]};
 const args={devices:{},deviceId:'own',syncTabs:true,snapshot,name:'Own',platform:'darwin',now,maxBytes:1600};
 const first=m.exportDevices(args);
 assert.equal(first.store.own.tabs.length,70);assert.ok(first.upload.own.tabs.length<70);
 assert.ok(Buffer.byteLength(m.canonical(first.upload),'utf8')<=1600);
 const second=m.exportDevices({...args,devices:first.store,now:now+1});
 assert.equal(second.store.own.updatedAt,now);assert.deepEqual(second.upload,first.upload);
 assert.equal(snapshot.tabs.length,70);
});
