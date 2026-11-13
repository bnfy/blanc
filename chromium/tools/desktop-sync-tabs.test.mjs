import test from 'node:test';
import {iconData,iconPng} from '../tests/lib/icon-fixture.mjs';
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

const setTabs=(device,method,tabs)=>new Promise((resolve,reject)=>device.context.__call(method,JSON.stringify([tabs,[]]),ok=>ok?resolve():reject(Error('snapshot refused'))));
test('desktop icon bridge accepts bounded native PNGs and excludes protected sources',async()=>{
 const d=peer('Desktop icons','http://127.0.0.1:9');
 const ctx={accountId:'icons',deviceId:'a'.repeat(32),syncTabs:true};
 const tabs=[{id:'good',url:'https://good.example/',favicon:iconData},
  {id:'private',url:'https://private.example/',favicon:iconData,private:true},
  {id:'inherited',url:'https://inherited.example/',favicon:iconData,inheritsDocumentPolicy:true},
  {id:'remote',url:'https://remote.example/',favicon:'https://untrusted.example/icon.png'},
  {id:'oversize',url:'https://oversize.example/',favicon:iconData+'A'.repeat(8192)}];
 await setTabs(d,'desktop.setTabs',tabs);
 await d.module('tabicons').refreshCurrent(ctx);
 const own=JSON.parse(JSON.stringify(d.module('tabicons').exportForSync(ctx))).devices[ctx.deviceId];
 assert.deepEqual(own.icons,[{url:'https://good.example/',data:iconData}]);
 await setTabs(d,'desktop.setTabs',[]);
 assert.equal(d.context.__require('shim:electron').nativeImage.createFromBuffer(iconPng).isEmpty(),true,'stale native snapshot bytes refused');
 assert.equal(d.module('tabicons').exportForSync({...ctx,syncTabs:false}).devices[ctx.deviceId].retracted,true);
});
test('phone tab snapshot keeps the original empty icon provider and nativeImage behavior',async()=>{
 const d=peer('Phone unchanged','http://127.0.0.1:9');
 const ctx={accountId:'icons',deviceId:'b'.repeat(32),syncTabs:true};
 await setTabs(d,'phone.setTabs',[{id:'phone',url:'https://phone.example/',favicon:iconData}]);
 await d.module('tabicons').refreshCurrent(ctx);
 assert.equal(d.context.__require('shim:electron').nativeImage.createFromBuffer(iconPng).isEmpty(),true);
 assert.equal(d.module('tabicons').exportForSync(ctx).devices[ctx.deviceId]?.icons?.length??0,0);
});
