import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {peer}=require('../tests/android/support/sync-peer.cjs');

test('frozen snapshot entry preserves groups and consent while excluding private and inherited-policy tabs',async()=>{
 const device=peer('Snapshot contract','http://127.0.0.1:9');
 const tabs=[
  {url:'https://public.example/',title:'Public',customTitle:'Renamed',groupId:'g',pinned:true},
  {url:'https://private.example/',title:'Private',private:true},
  {url:'https://inherited.example/',title:'Inherited',inheritsDocumentPolicy:true},
  {url:'file:///private/local',title:'Local'},
 ];
 await new Promise((resolve,reject)=>device.context.__call('phone.setTabs',JSON.stringify([tabs,[{id:'g',name:'Work'},{id:'unused',name:'Unused'}]]),ok=>ok?resolve():reject(Error('snapshot entry failed'))));
 const ctx={accountId:'account',deviceId:'a'.repeat(32),deviceName:'Mac',platform:'darwin',syncTabs:true};
 const shared=JSON.parse(JSON.stringify(device.module('tabsync').exportForSync(ctx))).devices[ctx.deviceId];
 assert.deepEqual(shared.tabs,[{url:'https://public.example/',title:'Renamed',groupId:'g',pinned:true}]);
 assert.deepEqual(shared.groups,[{id:'g',name:'Work'}]);
 const off=JSON.parse(JSON.stringify(device.module('tabsync').exportForSync({...ctx,syncTabs:false}))).devices[ctx.deviceId];
 assert.ok(!off.tabs?.length,'consent-off exports no tabs');
 assert.equal(device.module('tabsync-model').displayDevices({[ctx.deviceId]:off},'b'.repeat(32),{now:Date.now()}).length,0,'consent-off presence is not a shared-tabs device');
});
