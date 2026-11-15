// Open tabs reach other devices without anyone asking for a Sync pass.
// desktop-sync.mjs converges by calling sync.syncNow on the Mac each time, so
// it never showed whether a tab opened later is published on the runner's own
// timers (shipping: 15 s after the tab list changes). The owner's real-iPhone
// passes on beta.3 and beta.4 found the beta listed with no tabs.
//   node chromium/tests/native-sync-organic-tabs.mjs CONFIG OUT
// Local Worker and an independent bundle peer; no production endpoint.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {assertRendering,assertNodeRuntime} from './lib/render-guard.mjs';
import {NativeFixture} from './lib/fixture.mjs';
import {installDriver,nativeCall} from './lib/test-driver.mjs';
import {createWorld} from './world.mjs';
import {inSettings} from './adapters/commands.mjs';
const require=createRequire(import.meta.url);
const {createSyncFixture}=require('../../test/desktop/support/sync-fixture.js');
const {peer}=require('./android/support/sync-peer.cjs');
const [configFile,out]=process.argv.slice(2),config=JSON.parse(fs.readFileSync(configFile));
assertNodeRuntime();assert.equal(fs.existsSync(out),false);fs.mkdirSync(out,{recursive:true});
const result={candidate:config.candidate,checks:[]};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(read,accepts,label,timeout=120000,interval=1000){
 const end=Date.now()+timeout;let value;
 do{value=await read();if(accepts(value))return value;await sleep(interval);}while(Date.now()<end);
 throw Error(`${label}: not reached in ${timeout/1000}s; last ${JSON.stringify(value)?.slice(0,600)}`);
}
let fixture,worker,w,device;
const rpc=method=>nativeCall(fixture.host,'desktopSyncCall',[method],null,270000);
const openSync=async()=>{
 if(!(await w.native('settingsSheetState',[]))?.attached)await w.api('openPage',['settings','sync']);
 await inSettings(w,'sync',()=>({value:true}));
 await until(()=>w.call('settingsSyncPairingDom'),Boolean,'Sync page');
};
const act=async action=>assert.equal(await w.call('settingsSyncPairingAct',action),true,action);
// The peer pulls like a phone in front; the Mac is left entirely alone. The
// Worker allows 30 account GETs a minute and a pull is four, so pulls are 15 s apart.
const peerSees=url=>async()=>{
 await device.sync.resetRequestWindowForTest();await device.sync.syncNow(['session','icons','settings','sends']);
 return device.sync.listRemoteDevices().map(d=>({name:d.name,tabs:d.tabs.map(t=>t.url)}));
};
const has=url=>rows=>rows.some(d=>d.tabs.includes(url));
try{
 worker=await createSyncFixture();assert.equal(new URL(worker.url).hostname,'127.0.0.1');
 fixture=new NativeFixture();fixture.extraArgs=[`--blanc-sync-endpoint=${worker.url}`];
 const parent=fs.mkdtempSync(path.join(os.tmpdir(),'blanc-organic-'));
 await fixture.launch(config,path.join(parent,'browser'),{testHooks:true,diskAssets:false});
 await assertRendering(e=>fixture.host.eval(e));
 await installDriver(fixture.host);w=createWorld(fixture);await w.reset();
 await openSync();await act('turn-on');
 await until(()=>w.call('settingsSyncPairingDom'),s=>s?.syncOn,'Sync on');
 device=peer('Organic peer',worker.url,{platform:'ios'});
 await rpc('sync.resetRequestWindowForTest');await act('add-device');
 await until(()=>w.call('settingsSyncPairingDom'),s=>s?.sheetCodeValid,'pairing code');
 assert.equal((await device.sync.joinWithCode(await w.call('settingsSyncPairingCode'))).ok,true,'peer joined');
 await device.pass();await act('pair-cancel').catch(()=>{});
 await openSync();await act('share-tabs-on');
 await until(()=>w.call('settingsSyncPairingDom'),s=>s?.shareTabs===true,'sharing on');
 result.checks.push('Sync on, peer joined, tab sharing on');
 // 1. A page opened after sharing is on, with no pass asked of the Mac.
 const first=fixture.base+'/organic-one';
 await w.call('openTab',first,{});
 const t0=Date.now();
 result.first={rows:await until(peerSees(first),has(first),'the first page on the peer',150000,15000),seconds:Math.round((Date.now()-t0)/1000)};
 result.checks.push(`a page opened after sharing reaches the peer by itself (${result.first.seconds}s)`);
 // 2. And the next one, once the first publish has settled.
 const second=fixture.base+'/organic-two';
 await w.call('openTab',second,{});
 const t1=Date.now();
 result.second={rows:await until(peerSees(second),has(second),'the second page on the peer',150000,15000),seconds:Math.round((Date.now()-t1)/1000)};
 result.checks.push(`a later page reaches the peer by itself (${result.second.seconds}s)`);
 // Further conditions from the owner's profile, each recorded on its own.
 const stage=async(name,url,before)=>{
  const entry=result[name]={};
  try{
   await before?.();
   await w.call('openTab',url,{});const t=Date.now();
   entry.rows=await until(peerSees(url),has(url),name,150000,15000);entry.seconds=Math.round((Date.now()-t)/1000);
   result.checks.push(`${name}: reaches the peer by itself (${entry.seconds}s)`);
  }catch(error){entry.error=String(error.message);entry.snapshot=await w.snapshot().then(s=>({spaceName:s.spaceName,spaceBusy:s.spaceBusy,tabs:s.tabs.map(t=>t.url)})).catch(e=>String(e));
   try{entry.macStatus=await rpc('sync.status');}catch(e){entry.macStatus='unreadable: '+e.message;}
   result.failed=[...(result.failed??[]),name];}
 };
 // 3. The window belongs to a saved Space.
 await stage('in a saved Space',fixture.base+'/organic-space',async()=>{result.saved=await w.api('saveWorkspaceAs',['Work',{}]);});
 // 4. After quitting and reopening (session restore puts the Space's window back).
 await stage('after a relaunch',fixture.base+'/organic-relaunch',async()=>{await w.relaunch();await sleep(3000);});
 // 5. The owner's check: Sync turned off, then this Mac joins the account
 // again with a code from another device, its pages already open. Nothing
 // changes in the tab list afterwards, and nobody asks the Mac for a pass.
 {
  const entry=result.rejoin={};
  try{
   await openSync();await act('turn-off');
   await until(()=>w.call('settingsSyncPairingDom'),s=>s?.turnOnVisible&&!s.syncOn,'Sync off');
   await until(peerSees(''),rows=>!rows.some(d=>d.name==='MacBook-Pro'&&d.tabs.length),'the Mac gone from the peer',150000,15000);
   await device.sync.resetRequestWindowForTest();const join=await device.sync.beginPairing();
   await act('choose-code');assert.equal(await w.call('settingsSyncPairingAct','type-code',join.code),true);await act('connect-code');
   await until(()=>w.call('settingsSyncPairingDom'),s=>s?.syncOn,'joined again');
   entry.status=await rpc('sync.status');const t=Date.now();
   entry.rows=await until(peerSees(''),rows=>rows.some(d=>d.tabs.length>0),'the Mac\'s open pages on the peer after joining again',240000,15000);
   entry.seconds=Math.round((Date.now()-t)/1000);
   result.checks.push(`after joining again with a code, the pages already open reach the peer by themselves (${entry.seconds}s)`);
  }catch(error){entry.error=String(error.message);
   try{entry.macStatus=await rpc('sync.status');}catch(e){entry.macStatus='unreadable: '+e.message;}
   entry.dom=await w.call('settingsSyncPairingDom').catch(e=>String(e));
   entry.snapshot=await w.snapshot().then(s=>s.tabs.map(t=>t.url)).catch(e=>String(e));
   result.failed=[...(result.failed??[]),'rejoin'];}
 }
 result.result=result.failed?'fail':'pass';if(result.failed)process.exitCode=1;
}catch(error){result.result=error.code==='BLANC_ENVIRONMENT_STOP'?'blocked-environment':'fail';result.error=String(error.stack);process.exitCode=1;
 try{result.macStatus=await rpc('sync.status');}catch(e){result.macStatus='unreadable: '+e.message;}
 try{result.workerRequests=worker.requests.slice(-25).map(r=>`${r.method} ${r.path??r.url??''}`);}catch{}
}
finally{
 try{await device?.sync.disable();}catch{}
 const exit=fixture?await fixture.close():null;if(exit&&exit.code!==0){result.exit=exit;}
 if(fixture?.directory&&fs.existsSync(path.join(fixture.directory,'browser.log')))fs.copyFileSync(path.join(fixture.directory,'browser.log'),path.join(out,'browser.log'));
 try{await worker?.close?.();}catch{}
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
 process.exit(process.exitCode??0);
}
