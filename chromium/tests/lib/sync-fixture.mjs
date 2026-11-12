// Local Worker + independent frozen-bundle peer for native UI scenario setup.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const shippingHook=fs.readFileSync(new URL('../../../src/main/test-hook.js',import.meta.url),'utf8');
const remoteIcon=shippingHook.slice(shippingHook.indexOf('const remoteFixture =')).match(/favicon: '(data:image\/png;base64,[^']+)'/)[1];
import {createRequire} from 'node:module';
import {nativeCall} from './test-driver.mjs';
import {inSettings} from '../adapters/commands.mjs';
const require=createRequire(import.meta.url);
const {peer}=require('../android/support/sync-peer.cjs');
// The local Worker counts reads per account and per address each minute, as
// production does. The scenarios drive two devices' passes back to back, far
// faster than any person, and waiting out each minute made every Shared Spaces
// and Send case take about two minutes. Before each harness-driven pass the
// counters are freed as if the minute had passed. The Worker code is unchanged,
// a pass's own requests still count, injected 429 faults are separate rules,
// and the Sync gate (desktop-sync.mjs) keeps the real per-minute waits.
export function freeRequestRoom(server){
 for(const key of [...server.env.records.keys()])if(/^(rl|ip):/.test(key))server.env.records.delete(key);
}
export async function syncRoom(w){freeRequestRoom(w.syncServer);}
export async function syncPump(w){
 await syncRoom(w);await w.syncPeer.sync.resetRequestWindowForTest();await w.syncPeer.sync.syncNow(['session','icons','settings','sends']);
 await syncRoom(w);await nativeCall(w.fixture.host,'desktopSyncCall',['sync.resetRequestWindowForTest'],null,120000);
 await nativeCall(w.fixture.host,'desktopSyncCall',['sync.syncNow'],null,120000);
}
export async function ensureSyncPeer(w,name='Press Mac'){
 if(w.syncPeer)return;
 assert.ok(w.syncServer,'Sync scenarios require the local Worker before browser launch');
 await w.api('openPage',['settings','sync']);await inSettings(w,'sync',()=>({value:true}));
 await w.waitFor(()=>w.call('settingsSyncPairingDom'),v=>v?.turnOnVisible,'Sync controls');
 assert.equal(await w.call('settingsSyncPairingAct','turn-on'),true);
 await w.waitFor(()=>w.call('settingsSyncPairingDom'),v=>v?.syncOn,'Sync on',60000);
 assert.equal(await w.call('settingsSyncPairingAct','add-device'),true);
 await w.waitFor(()=>w.call('settingsSyncPairingDom'),v=>v?.sheetCodeValid,'pairing code',60000);
 const code=await w.call('settingsSyncPairingCode');w.syncPeer=peer(name,w.syncServer.url);
 assert.equal((await w.syncPeer.sync.joinWithCode(code)).ok,true,'peer joined');
 await w.call('settingsSyncPairingAct','pair-cancel');
 await w.api('openPage',['settings','sync']); // toggle the Settings sheet closed
}
export async function seedRemoteDevices(w,count=1,name='Press Mac',tabs=1){
 await ensureSyncPeer(w,name);
 if(w.seededRemoteCount===count)return;
 const ctx=w.syncPeer.sync.sharedContext();
 const devices={};
 for(let i=0;i<count;i++){
  const id='abcdef0123456789abcdef012345678'+String(i).padStart(3,'0');
  devices[id]={name:i===0?name:`Press device ${i+1}`,platform:'darwin',updatedAt:Date.now(),
   tabs:Array.from({length:tabs},(_,j)=>({url:w.fixtureUrl(`remote-press-${i}-${j}`),title:j===0?'Remote press needle':`Remote ${j}`,groupId:null,pinned:false})),groups:[]};
 }
 await new Promise((resolve,reject)=>w.syncPeer.context.__call('phone.setTabs','[[],[]]',ok=>ok?resolve():reject(Error('peer snapshot refused'))));
 for(const id of w.seededRemoteIds??[])if(!devices[id])devices[id]={retracted:true,updatedAt:Date.now()};
 w.syncPeer.module('tabsync').mergeFromSync({devices},ctx);
 const icons=Object.fromEntries(Object.entries(devices).map(([id,device])=>[id,device.retracted?device:{updatedAt:Date.now(),icons:device.tabs.map(tab=>({url:tab.url,data:remoteIcon}))}]));
 w.syncPeer.module('tabicons').mergeFromSync({devices:icons},ctx);
 w.seededRemoteIds=Object.keys(devices);
 await w.waitFor(async()=>{await syncPump(w);return w.api('listRemoteTabs');},v=>v.length===count,'remote inventory received',180000);
 w.seededRemoteCount=count;
}
