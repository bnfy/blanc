// Desktop S4a gate: the actual native default profile, embedded runner bundle,
// local Worker and independent bundle peer. No production endpoint or real device.
// /usr/local/bin/node chromium/tests/desktop-sync.mjs CONFIG EVIDENCE
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {assertRendering} from './lib/render-guard.mjs';
import {NativeFixture} from './lib/fixture.mjs';
import {installDriver,nativeCall} from './lib/test-driver.mjs';
import {createWorld} from './world.mjs';
import {inSettings} from './adapters/commands.mjs';
const require=createRequire(import.meta.url);
const {createSyncFixture}=require('../../test/desktop/support/sync-fixture.js');
const {peer}=require('./android/support/sync-peer.cjs');
const [configFile,evidence]=process.argv.slice(2);
if(!configFile||!evidence)throw Error('Usage: desktop-sync.mjs CONFIG EVIDENCE');
const config=JSON.parse(fs.readFileSync(configFile));
fs.mkdirSync(evidence,{recursive:true,mode:0o700});
const output={candidate:config.candidate,checks:[],mockKeychain:true};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(read,predicate,label,timeout=60000){
 const end=Date.now()+timeout;let value;
 do{value=await read();if(predicate(value))return value;await sleep(300);}while(Date.now()<end);
 throw Error(`${label}: ${JSON.stringify(value)}`);
}
const check=async(name,fn)=>{await fn();output.checks.push({name,result:'pass'});console.log('pass '+name);};
let fixture,worker,w,device;
const rpc=method=>nativeCall(fixture.host,'desktopSyncCall',[method],null,120000);
const nativeFavorites=()=>w.api('listFavorites');
const peerFavorites=()=>device.module('bookmarks').listBookmarks();
const pump=async()=>{await rpc('sync.resetRequestWindowForTest');await rpc('sync.syncNow');await device.pass();};
const openSync=async()=>{await w.api('openPage',['settings','sync']);await until(()=>w.call('settingsSyncPairingDom'),Boolean,'Sync page');};
const act=async action=>assert.equal(await w.call('settingsSyncPairingAct',action),true,action);
const peerEdit=(url,title,folder)=>{
 const item=device.module('bookmarks').exportForSync().items.find(x=>x.url===url);assert.ok(item);
 device.module('bookmarks').mergeFromSync({items:[{...item,title,folder,updatedAt:Date.now()}],tombstones:[]});
};
async function launch(){
 fixture=new NativeFixture();fixture.extraArgs=[`--blanc-sync-endpoint=${worker.url}`];
 const directory=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'blanc-s4a-')),'browser');
 await fixture.launch(config,directory,{testHooks:true,diskAssets:false});
 await assertRendering(e=>fixture.host.eval(e));
 await installDriver(fixture.host);w=createWorld(fixture);await w.reset();
}
async function close(label){
 const exit=await fixture.close();
 fs.copyFileSync(path.join(fixture.directory,'browser.log'),path.join(evidence,label+'-browser.log'));
 assert.equal(exit.code,0,'clean browser exit');
 fs.rmSync(path.dirname(fixture.directory),{recursive:true,force:true});fixture=null;
}
try{
 worker=await createSyncFixture();assert.equal(new URL(worker.url).hostname,'127.0.0.1');
 await launch();
 const first=fixture.base+'/existing',later=fixture.base+'/from-mac',remote='https://peer.example/first';
 await w.call('seedFavorite',first,'Existing Mac Favorite');
 await openSync();
 await check('turn on Sync through Settings using the embedded bundle',async()=>{
  await act('turn-on');await until(()=>w.call('settingsSyncPairingDom'),s=>s?.syncOn&&s.handle==='My Blanc','Sync enabled');
 });
 device=peer('S4a independent peer',worker.url);
 await rpc('sync.resetRequestWindowForTest');const pairing=await rpc('sync.beginPairing');
 assert.equal((await device.sync.joinWithCode(pairing.code)).ok,true,'peer joined');
 await check('first upload holds existing Favorites until Continue',async()=>{
  await until(()=>w.call('settingsSyncPairingDom'),s=>s?.pendingFirstUpload?.includes('1'),'one Favorite consent');
  await pump();assert.ok(!(await rpc('bookmarks.exportForSync')).items.some(x=>x.url===first));
  assert.ok(!peerFavorites().some(x=>x.url===first));assert.ok((await nativeFavorites()).some(x=>x.url===first));
  await act('upload-continue');
  await until(async()=>{await pump();return peerFavorites();},l=>l.some(x=>x.url===first),'accepted Favorite on peer');
 });
 await check('Favorites added on either device reach the other',async()=>{
  await w.call('seedFavorite',later,'Added on Mac');
  device.module('bookmarks').saveFavorite(remote,'Added on peer');await device.pass();
  await until(async()=>{await pump();return {mac:await nativeFavorites(),peer:peerFavorites()};},v=>v.mac.some(x=>x.url===remote)&&v.peer.some(x=>x.url===later),'both additions');
 });
 await check('native title edit, folder move and folder rename from Mac merge on peer',async()=>{
  const row=(await nativeFavorites()).find(x=>x.url===later);
  await w.native('desktopSyncRenameFavorite',[later,'Mac renamed title']);
  await w.call('openFavoritesSheet');
  await until(()=>w.hostEval(`document.querySelector('#sheet')?.contentWindow?.bowserPages?.bookmarks !== undefined`),Boolean,'Favorites sheet bridge');
  await w.hostEval(`document.querySelector('#sheet').contentWindow.bowserPages.bookmarks.setFolder(${JSON.stringify(row.id)},'Mac folder')`);
  await w.hostEval(`document.querySelector('#sheet').contentWindow.bowserPages.bookmarks.renameFolder('Mac folder','Mac renamed')`);
  await until(async()=>{await pump();return peerFavorites();},l=>l.some(x=>x.url===later&&x.folder==='Mac renamed'&&x.title==='Mac renamed title'),'Mac folder edit');
 });
 await check('peer title rename and folder move merge on Mac',async()=>{
  peerEdit(remote,'Peer renamed','Peer folder');await device.pass();
  await until(async()=>{await pump();return nativeFavorites();},l=>l.some(x=>x.url===remote&&x.title==='Peer renamed'&&x.folder==='Peer folder'),'peer edits');
 });
 await check('theme and blocking switch sync from Mac to peer',async()=>{
  await w.call('setAppearance','dark');
  await inSettings(w,'privacy',async(_a,d)=>{const el=d.find('#blancBlocking');if(el.checked)el.click();await new Promise(r=>setTimeout(r,300));return {value:el.checked};});
  await until(async()=>{await pump();return device.module('settings').exportForSync().values;},v=>v.theme==='dark'&&v.adblockEnabled===false,'Mac settings on peer');
 });
 await check('theme and blocking switch sync from peer to Mac',async()=>{
  device.module('settings').setSettings({theme:'light',adblockEnabled:true});await device.pass();
  await until(async()=>{await pump();return {blocking:(await w.snapshot()).adblockEnabled,theme:await inSettings(w,'appearance',(_a,d)=>({value:d.find('#colorSchemeModeSelect').value}))};},v=>v.blocking===true&&v.theme==='1','peer settings on Mac');
 });
 await check('a killed runner recovers without losing enabled state or Favorites',async()=>{
  // Match this isolated browser's direct child and the exact utility subtype.
  const rows=execFileSync('/bin/ps',['-axo','pid=,ppid=,command='],{encoding:'utf8'}).split('\n');
  const match=rows.map(l=>l.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/)).find(m=>m&&Number(m[2])===fixture.process.pid&&m[3].includes('--utility-sub-type=blanc.mojom.SyncRunner'));
  assert.ok(match,'runner PID owned by this fixture');process.kill(Number(match[1]),'SIGKILL');await sleep(500);
  await until(()=>rpc('sync.status'),s=>s.enabled===true,'runner recovered');
  await pump();assert.ok((await nativeFavorites()).some(x=>x.url===first));assert.ok(peerFavorites().some(x=>x.url===first));
 });
 await openSync();
 await check('turning Sync off retains local Favorites',async()=>{
  await act('turn-off');await until(()=>w.call('settingsSyncPairingDom'),s=>s?.turnOnVisible&&!s.syncOn,'Sync off');
  assert.equal((await rpc('sync.status')).enabled,false);assert.ok((await nativeFavorites()).some(x=>x.url===first));
 });
 await close('accepted');
 // A new native profile joins the existing account. Decline must persist and
 // remote downloads must not remove its preexisting local Favorite.
 await launch();const excluded=fixture.base+'/not-now';
 await w.call('seedFavorite',excluded,'Only this Mac');
 await openSync();device.sync.resetRequestWindowForTest();const join=await device.sync.beginPairing();
 await act('choose-code');assert.equal(await w.call('settingsSyncPairingAct','type-code',join.code),true);await act('connect-code');
 await check('Not now keeps existing Favorites local while account Favorites download',async()=>{
  await until(()=>w.call('settingsSyncPairingDom'),s=>s?.pendingFirstUpload?.includes('1'),'decline consent');
  await act('upload-not-now');await pump();await pump();
  assert.ok((await nativeFavorites()).some(x=>x.url===excluded));assert.ok((await nativeFavorites()).some(x=>x.url===remote));
  assert.ok(!(await rpc('bookmarks.exportForSync')).items.some(x=>x.url===excluded));assert.ok(!peerFavorites().some(x=>x.url===excluded));
  await fixture.stop();await fixture.start(fixture.base+'/initial');
  await installDriver(fixture.host);w=createWorld(fixture);await w.app.refresh();await pump();assert.ok((await nativeFavorites()).some(x=>x.url===excluded));assert.ok(!peerFavorites().some(x=>x.url===excluded));
 });
 await close('declined');
 output.requests=worker.requests.map(({method,status})=>({method,status}));
 output.result='pass';
}catch(error){output.result='fail';output.error=error.stack;console.error(error.stack);process.exitCode=1;}
finally{
 if(fixture)await close('failure').catch(e=>console.error(e));
 await worker?.close();fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify(output,null,2)+'\n');
}
