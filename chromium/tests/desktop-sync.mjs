// Desktop S4a–S4c gate: the actual native default profile, embedded runner bundle,
// local Worker and independent bundle peer. No production endpoint or real device.
// /usr/local/bin/node chromium/tests/desktop-sync.mjs CONFIG EVIDENCE
import fs from 'node:fs';
import {iconPng} from './lib/icon-fixture.mjs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {assertRendering} from './lib/render-guard.mjs';
import {NativeFixture} from './lib/fixture.mjs';
import {installDriver,nativeCall} from './lib/test-driver.mjs';
import {createWorld} from './world.mjs';
import {tabPage} from './adapters/core.mjs';
import {openTabMenu} from './adapters/tabs.mjs';
import {inSettings} from './adapters/commands.mjs';
const require=createRequire(import.meta.url);
const {createSyncFixture}=require('../../test/desktop/support/sync-fixture.js');
const {peer}=require('./android/support/sync-peer.cjs');
const [configFile,evidence,mode]=process.argv.slice(2);
if(mode && !['--recovery-only','--profiles-only','--tabs-only','--consent-only','--spaces-only'].includes(mode))throw Error('Unknown gate mode');
const spacesOnly=mode==='--spaces-only';
const tabsOnly=mode==='--tabs-only'||spacesOnly;
const profilesOnly=mode==='--profiles-only';
const recoveryOnly=mode==='--recovery-only';
const consentOnly=mode==='--consent-only';
if(!configFile||!evidence)throw Error('Usage: desktop-sync.mjs CONFIG EVIDENCE');
const config=JSON.parse(fs.readFileSync(configFile));
fs.mkdirSync(evidence,{recursive:true,mode:0o700});
const output={candidate:config.candidate,checks:[],mockKeychain:true,mode:spacesOnly?'spaces-only':consentOnly?'consent-only':tabsOnly?'tabs-only':profilesOnly?'profiles-only':recoveryOnly?'recovery-only':'full'};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(read,predicate,label,timeout=180000){
 const end=Date.now()+timeout;let value;
 do{value=await read();if(predicate(value))return value;await sleep(300);}while(Date.now()<end);
 throw Error(`${label}: condition did not converge`);
}
const check=async(name,fn)=>{
 console.log('start '+name);
 try{
  if(fixture?.host)await assertRendering(e=>fixture.host.eval(e));
  await fn();
  if(fixture?.host)await assertRendering(e=>fixture.host.eval(e));
  output.checks.push({name,result:'pass'});console.log('pass '+name);
 }catch(error){
  // A display can lock during a long quota wait. Preserve an environment stop
  // instead of reporting a disabled/undrawn control as a product regression.
  if(error.code!=='BLANC_ENVIRONMENT_STOP'&&fixture?.host){
   try{await assertRendering(e=>fixture.host.eval(e));}
   catch(probe){if(probe.code==='BLANC_ENVIRONMENT_STOP')error=probe;}
  }
  output.checks.push({name,result:error.code==='BLANC_ENVIRONMENT_STOP'?'blocked-environment':'fail',error:error.message});throw error;
 }
};
let fixture,worker,w,device;
const rpc=async method=>{try{return await nativeCall(fixture.host,'desktopSyncCall',[method],null,270000);}catch(error){throw Error(`${method}: ${error.message}`);}};
const nativeFavorites=()=>w.api('listFavorites');
const peerFavorites=()=>device.module('bookmarks').listBookmarks();
// Leave room below the real Worker's 30 account GETs/minute for background
// reconciliation. Resetting the runner's test window does not reset the Worker.
// Pace requests, rather than removing quotas or treating a 429 as convergence.
async function requestRoom(reserve=12){
 const deadline=Date.now()+125000;
 for(;;){
  const recent=worker.requests.filter(r=>r.method==='GET'&&Date.now()-r.at<61000);
  if(recent.length<30-reserve)return;
  if(Date.now()>deadline)throw Error(`Worker request budget did not free: ${recent.length} recent GETs`);
  await sleep(Math.max(300,61000-(Date.now()-recent[0].at)));
 }
}
const peerPass=async()=>{await requestRoom();await device.sync.resetRequestWindowForTest();await device.sync.syncNow(['bookmarks','settings']);};
const pump=async()=>{await requestRoom();await rpc('sync.resetRequestWindowForTest');await rpc('sync.syncNow');await peerPass();};
const openSync=async()=>{
 await assertRendering(e=>fixture.host.eval(e));
 if(!(await w.native('settingsSheetState',[]))?.attached)await w.api('openPage',['settings','sync']);
 await inSettings(w,'sync',()=>({value:true}));
 await until(()=>w.call('settingsSyncPairingDom'),Boolean,'Sync page');
};
const act=async action=>{await assertRendering(e=>fixture.host.eval(e));assert.equal(await w.call('settingsSyncPairingAct',action),true,action);};
const peerEdit=(url,title,folder)=>{
 const item=device.module('bookmarks').exportForSync().items.find(x=>x.url===url);assert.ok(item);
 device.module('bookmarks').mergeFromSync({items:[{...item,title,folder,updatedAt:Date.now()}],tombstones:[]});
};
async function launch({privateMode=false,secondary=false}={}){
 fixture=new NativeFixture();fixture.extraArgs=[`--blanc-sync-endpoint=${worker.url}`,...(secondary?['--profile-directory=Profile 1']:[])];
 const directory=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'blanc-s4a-')),'browser');
 await fixture.launch(config,directory,{testHooks:true,diskAssets:false,privateMode});
 await assertRendering(e=>fixture.host.eval(e));
  fixture.server.removeAllListeners('request');
  fixture.server.on('request',(q,r)=>{
    if(q.url==='/favicon.png'){r.writeHead(200,{'content-type':'image/png'});r.end(iconPng);}
    else {r.writeHead(200,{'content-type':'text/html'});r.end('<title>Native test fixture</title><link rel="icon" href="/favicon.png"><p>Local synthetic page</p>');}
  });
 await installDriver(fixture.host);w=createWorld(fixture);await w.reset();
}
function runnerPid(){
 const rows=execFileSync('/bin/ps',['-axo','pid=,ppid=,command='],{encoding:'utf8'}).split('\n');
 const match=rows.map(l=>l.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/)).find(m=>m&&Number(m[2])===fixture.process.pid&&m[3].includes('--utility-sub-type=blanc.mojom.SyncRunner'));
 assert.ok(match,'runner PID owned by this fixture');return Number(match[1]);
}
async function close(label){
 const exit=await fixture.close();
 fs.copyFileSync(path.join(fixture.directory,'browser.log'),path.join(evidence,label+'-browser.log'));
 assert.equal(exit.code,0,'clean browser exit');
 fs.rmSync(path.dirname(fixture.directory),{recursive:true,force:true});fixture=null;
}
try{
 worker=await createSyncFixture();assert.equal(new URL(worker.url).hostname,'127.0.0.1');
 if(!profilesOnly){
 await launch();
 const first=fixture.base+'/existing',later=fixture.base+'/from-mac',remote='https://peer.example/first';
 await w.call('seedFavorite',first,'Existing Mac Favorite');
 await openSync();
 await check('turn on Sync through Settings using the embedded bundle',async()=>{
  await act('turn-on');await until(()=>w.call('settingsSyncPairingDom'),s=>s?.syncOn&&s.handle==='My Blanc','Sync enabled');
 });
 device=peer('S4b independent iPhone peer',worker.url,{platform:'ios'});
 await check('Mac pairing sheet QR, cancel and independent iPhone peer join',async()=>{
  await rpc('sync.resetRequestWindowForTest');await act('add-device');
  await until(()=>w.call('settingsSyncPairingDom'),s=>s?.sheetCodeValid,'pairing display');
  assert.equal(await w.call('settingsSyncQrMatches'),true,'QR equals shipping encoding');
  assert.equal(await w.call('windowsContentProtected'),1,'one window protected');
  const cancelled=await w.call('settingsSyncPairingCode');
  await act('pair-cancel');await until(()=>w.call('windowsContentProtected'),n=>n===0,'capture released');
  const bad=await device.sync.joinWithCode(cancelled);
  assert.equal(bad.ok,false,'cancelled code refused');assert.equal(bad.error,'pair-not-found');
  await act('add-device');await until(()=>w.call('settingsSyncPairingDom'),s=>s?.sheetCodeValid,'new pairing code');
  const code=await w.call('settingsSyncPairingCode');
  assert.equal((await device.sync.joinWithCode(code)).ok,true,'independent peer joined');
  await device.pass();
  await until(()=>w.call('settingsSyncPairingDom'),s=>s?.joinedTitle==='S4b independent iPhone peer joined.','joined device named',90000);
  await until(()=>w.call('windowsContentProtected'),n=>n===0,'joined releases capture');
  await act('pair-cancel');
  const progress=await w.call('migrationChecklistSettings');
  assert.equal(progress.syncComplete,true,'real Sync completes checklist');
  assert.equal(progress.iphoneComplete,true,'real iPhone presence completes checklist');
 });
 if(!mode || spacesOnly){
 await check('two native windows share Spaces, merge peer edits, and preserve delete with Undo',async()=>{
  const leftUrl=fixture.base+'/shared-left',rightUrl=fixture.base+'/shared-right';
  const leftTab=await w.call('openTab',leftUrl,{});
  await w.api('groupTabByName',[String(leftTab),'left local']);
  const left=await w.api('saveWorkspaceAs',['Left shared Space']);
  assert.equal(left.ok,true,'first native Space saved');
  const right=await w.api('createBlankWorkspace',['Right shared Space',{newWindow:true}]);
  assert.equal(right.ok,true,'second native window opened');
  const other=await until(()=>fixture.targets(),rows=>rows.filter(t=>t.type==='page'&&t.url==='chrome://blanc-prototype/host.html').length===2,'two native windows');
  const target=other.find(t=>t.type==='page'&&t.url==='chrome://blanc-prototype/host.html'&&t.id!==fixture.hostTargetId);
  const second=await fixture.connectTarget(target);
  const otherApi=(method,args=[])=>second.eval(`window.BlancPrototypeHost.api[${JSON.stringify(method)}](...${JSON.stringify(args)})`);
  await otherApi('createTab',[rightUrl]);
  const rightTabs=await until(()=>otherApi('getAllTabs'),v=>v.tabs.some(t=>t.url===rightUrl),'right native tab');
  await otherApi('groupTabByName',[String(rightTabs.tabs.find(t=>t.url===rightUrl).id),'right local']);
  await sleep(1500);
  await openSync();await act('spaces-choose');
  await until(()=>w.hostEval(`1`),Boolean,'native host remains live');
  await until(()=>w.call('settingsSyncPairingAct','spaces-share'),Boolean,'share choices accepted');
  device.sync.setSyncSpaces(true);
  const sharedState=()=>device.module('shared-spaces').snapshot(device.sync.sharedContext());
  const spacesPass=async()=>{await requestRoom(7);device.sync.resetRequestWindowForTest();await device.sync.syncNow(['spaces',...Object.keys(sharedState().index.spaces).map(id=>'space-'+id)]);await sleep(1500);};
  const remote=await until(async()=>{await spacesPass();return sharedState();},v=>Object.values(v.index.spaces).filter(x=>!x.deleted.v).length===2,'both native Spaces on peer');
  const entries=Object.entries(remote.index.spaces);
  const leftId=entries.find(([,r])=>r.name.v==='Left shared Space')?.[0];
  const rightId=entries.find(([,r])=>r.name.v==='Right shared Space')?.[0];
  assert.ok(leftId&&rightId,'independent shared Space identities');
  console.log('spaces: peer received both index entries');
  await until(async()=>{await spacesPass();return sharedState();},v=>v.blobs[leftId]?.blob&&v.blobs[rightId]?.blob,'both encrypted captures received');
  const peerUrls=id=>Object.values(sharedState().blobs[id].blob.tabs).filter(tab=>!tab.deleted.v).map(tab=>tab.nav.v.url);
  assert.ok(peerUrls(leftId).includes(leftUrl),'left native capture delivered');
  assert.ok(peerUrls(rightId).includes(rightUrl),'right native capture delivered');
  console.log('spaces: peer received both native captures');
  const model=device.module('shared-spaces-model');
  const blob=sharedState().blobs[leftId].blob;
  const existing=Object.entries(blob.tabs).find(([,tab])=>tab.nav.v.url===leftUrl);
  const next=JSON.parse(JSON.stringify(blob));
  next.tabs[existing[0]].name=model.field('Peer edited tab',Date.now()+1000,device.sync.sharedContext().deviceId);
  next.tabs[existing[0]].pinned=model.field(true,Date.now()+1000,device.sync.sharedContext().deviceId);
  const groupId=Object.entries(blob.groups).find(([,group])=>group.name.v==='left local')?.[0];
  assert.ok(groupId,'native group reached the peer');
  next.groups[groupId].name=model.field('peer edited group',Date.now()+1000,device.sync.sharedContext().deviceId);
  next.groups[groupId].color=model.field('#6757a3',Date.now()+1000,device.sync.sharedContext().deviceId);
  device.module('shared-spaces').noteLocalSpace(leftId,next,{tabs:{[existing[0]]:{name:next.tabs[existing[0]].name,pinned:next.tabs[existing[0]].pinned}},groups:{[groupId]:{name:next.groups[groupId].name,color:next.groups[groupId].color}}},device.sync.sharedContext());
  await until(async()=>{await spacesPass();return w.snapshot();},v=>v.tabs.some(t=>t.title==='Peer edited tab'&&t.pinned&&t.groupId)&&v.groups.some(g=>g.name==='peer edited group'&&g.color==='#6757a3'),'peer tab and group edits on native window');
  assert.deepEqual((await otherApi('getAllTabs')).groups.map(g=>g.name),['right local'],'other window has no foreign group descriptor');
  await spacesPass();
  assert.deepEqual(Object.values(sharedState().blobs[rightId].blob.groups).filter(g=>!g.deleted.v).map(g=>g.name.v),['right local'],'other peer Space has no foreign group');
  const leftBefore=(await w.snapshot()).tabs.map(t=>t.url);
  const rightBefore=(await otherApi('getAllTabs')).tabs.map(t=>t.url);
  assert.equal((await w.api('removeWorkspace',[left.workspaceId])).ok,true,'delete shared Space');
  assert.equal((await w.api('undoRemoveWorkspace',[left.workspaceId])).ok,true,'Undo keeps local copy');
  await spacesPass();
  assert.ok((await w.snapshot()).tabs.some(t=>t.url===leftUrl),'Undo keeps native left page');
  assert.deepEqual((await w.snapshot()).tabs.map(t=>t.url),leftBefore,'no left-window tab lost or duplicated');
  assert.deepEqual((await otherApi('getAllTabs')).tabs.map(t=>t.url),rightBefore,'other native window remains intact');
  assert.ok(peerUrls(rightId).includes(rightUrl),'other window survives delete and Undo');
  const list=await w.api('listWorkspaces');
  assert.ok(list.items.some(row=>row.id===left.workspaceId),'local Undo Space retained');
  assert.ok(list.items.some(row=>row.id===right.workspaceId),'second Space retained');
  // Restore this check's opt-in before the independent tabs/Favorites gates.
  await openSync();await act('spaces-off');device.sync.setSyncSpaces(false);
  await otherApi('previewPageCommand',['closeWindow']);
  second.close();
 });
 }
 if(!recoveryOnly&&!consentOnly&&!spacesOnly){
 await check('open tabs default off, both directions, private exclusion, Send and retraction',async()=>{
  assert.equal((await w.call('settingsSyncPairingDom')).shareTabs,false,'sharing defaults off');
  const macUrl=fixture.base+'/sync-mac-tab',privateUrl=fixture.base+'/sync-private-tab';
  const macId=await w.call('openTab',macUrl,{});
  const privateId=await w.call('openTab',privateUrl,{private:true});
  await until(()=>w.snapshot(),v=>v.tabs.some(t=>t.url===macUrl)&&v.tabs.some(t=>t.url===privateUrl&&t.private),'native tab inventory');
  const inheritedUrl=fixture.base+'/sync-inherited-tab';
  const opener=await tabPage(w,macId);await opener.evalExpression("1");await opener.bringToFront();
  await opener.cdp.send('Runtime.evaluate',{expression:`window.open(${JSON.stringify(inheritedUrl)},'_blank')`,userGesture:true});
  const child=await until(()=>w.snapshot(),v=>v.tabs.some(t=>t.url===inheritedUrl),'page-opened tab');
  const childId=child.tabs.find(t=>t.url===inheritedUrl).id;
  assert.equal((await w.native('quietState',[childId])).inheritedPolicy,true,'native sticky policy mark');
  const beforeCopy=new Set((await w.snapshot()).tabs.map(t=>String(t.id)));
  assert.equal(await w.api('duplicateTab',[String(childId)]),true,'V4 permits unsandboxed native duplication');
  const copied=await until(()=>w.snapshot(),v=>v.tabs.some(t=>t.url===inheritedUrl&&!beforeCopy.has(String(t.id))),'native duplicate');
  const copyId=copied.tabs.find(t=>t.url===inheritedUrl&&!beforeCopy.has(String(t.id))).id;
  assert.equal((await w.native('quietState',[copyId])).inheritedPolicy,true,'copy retains Sync exclusion');
  const peerUrl='https://peer.example/open-tab';
  await new Promise((resolve,reject)=>device.context.__call('phone.setTabs',JSON.stringify([[{url:peerUrl,title:'Peer open tab',private:false}],[]]),(ok,value)=>ok?resolve(value):reject(Error('peer snapshot refused'))));
  device.sync.setSyncTabs(true);
  const tabPump=async()=>{await requestRoom();await device.sync.resetRequestWindowForTest();await device.sync.syncNow(['session','icons','settings','sends']);await requestRoom();await rpc('sync.resetRequestWindowForTest');await rpc('sync.syncNow');};
  await tabPump();console.log('tabs: peer published; checking consent-off');
  assert.equal(device.sync.listRemoteDevices().length,0,'Mac published no tabs before consent');
  await openSync();await act('share-tabs-on');console.log('tabs: sharing requested');
  await until(async()=>{await tabPump();return {peer:device.sync.listRemoteDevices(),mac:await w.api('listRemoteTabs')};},v=>v.peer.some(d=>d.tabs.some(t=>t.url===macUrl))&&v.mac.some(d=>d.tabs.some(t=>t.url===peerUrl)),'tabs both ways');
  console.log('tabs: both inventories converged');
  await until(async()=>{await tabPump();return device.sync.listRemoteDevices();},rows=>rows.some(d=>d.tabs.some(t=>t.url===macUrl&&device.module('tabicons-model').validIconData(t.favicon))),'real native icon on peer');
  const received=device.sync.listRemoteDevices().flatMap(d=>d.tabs).find(t=>t.url===macUrl).favicon;
  const iconBytes=Buffer.from(received.slice('data:image/png;base64,'.length),'base64');
  assert.equal(iconBytes.readUInt32BE(16),32,'native source raster is 32px');
  assert.ok(received.length<=8192,'shipping icon budget');
  const remoteIcons=Object.values(device.module('tabicons').getRemoteIcons(device.sync.sharedContext())).flat();
  assert.ok(!remoteIcons.some(icon=>[privateUrl,inheritedUrl].includes(icon.url)),'protected icons excluded');
  console.log('tabs: real native 32px icon received');
  const remote=device.sync.listRemoteDevices();
  assert.ok(!remote.some(d=>d.tabs.some(t=>t.url===privateUrl)),'private tab excluded');
  assert.ok(!remote.some(d=>d.tabs.some(t=>t.url===inheritedUrl)),'inherited-policy tab excluded');
  const target=(await w.api('listSendTargets')).find(d=>d.name==='S4b independent iPhone peer');assert.ok(target);
  await requestRoom();await rpc('sync.resetRequestWindowForTest');
  for(const id of [privateId,childId,copyId])
   assert.equal((await w.api('sendTabToDevice',[String(id),target.id])).status,'invalid','protected tab cannot Send');
  const menu=await openTabMenu(w,macId);
  await menu.locator('.prototype-tab-menu button').filter({hasText:'Send to Device'}).click();
  await menu.locator('.prototype-tab-menu button').filter({hasText:target.name}).click();
  await until(async()=>{await tabPump();return device.sync.listSentToThisDevice();},rows=>rows.some(t=>t.url===macUrl),'Mac Send received by peer');
  console.log('tabs: Mac Send received');
  const back=device.sync.listSendTargets()[0];assert.ok(back);
  await requestRoom();device.sync.resetRequestWindowForTest();
  assert.equal((await device.sync.sendTab({url:peerUrl,title:'Sent from peer',to:back.id})).status,'sent');
  await until(async()=>{await tabPump();return w.api('listSentToThisDevice');},rows=>rows.some(t=>t.url===peerUrl),'peer Send received by Mac');
  console.log('tabs: peer Send received');
  const pendingSend=(await w.api('listSentToThisDevice')).find(row=>row.url===peerUrl);assert.ok(pendingSend);
  if((await w.native('settingsSheetState',[]))?.attached)await w.api('openPage',['settings','sync']);
  const privateStart=await w.call('openTab','blanc://newtab/',{private:true});
  const privatePage=await tabPage(w,privateStart);
  const privateData=await privatePage.evaluate(()=>window.bowserPages.start.data());
  assert.deepEqual(privateData.sentItems,[]);assert.deepEqual(privateData.remoteDevices,[]);
  assert.equal(await privatePage.evaluate(id=>window.bowserPages.start.openSent(id),pendingSend.id),false);
  assert.equal(await privatePage.evaluate(id=>window.bowserPages.start.dismissSent(id),pendingSend.id),false);
  await w.call('closeTab',privateStart);
  const startId=await w.call('newTab'),startPage=await tabPage(w,startId);
  await startPage.evaluate(()=>window.bowserPages.start.setLayout('ledger'));
  const sentRow=startPage.locator('#sentList .sent-item').filter({hasText:'Sent from peer'});
  await sentRow.waitFor({state:'visible'});
  const beforeOpen=new Set((await w.snapshot()).tabs.map(tab=>String(tab.id)));
  await sentRow.locator('a.fav').click();
  await until(()=>w.snapshot(),snapshot=>snapshot.tabs.some(tab=>tab.url===peerUrl&&
   !beforeOpen.has(String(tab.id))&&String(tab.id)===String(snapshot.activeTabId)), 'Ledger opens Send in a new tab');
  await until(()=>startPage.evaluate(()=>document.querySelectorAll('#sentList .sent-item').length),
   count=>count===0,'background Ledger removes opened Send');
  assert.equal((await w.api('listSentToThisDevice')).some(row=>row.id===pendingSend.id),false);
  console.log('tabs: Ledger opened received page; private inbox remained empty');
  await openSync();await act('share-tabs-off');
  await until(async()=>{await tabPump();return device.sync.listRemoteDevices();},rows=>!rows.some(d=>d.tabs.some(t=>t.url===macUrl)),'share-off retracts Mac tabs');
  await w.relaunch();
  const restored=await until(()=>w.snapshot(),v=>v.tabs.filter(t=>t.url===inheritedUrl).length===2,'restored policy-marked tabs');
  for(const tab of restored.tabs.filter(t=>t.url===inheritedUrl))
   assert.equal((await w.native('quietState',[tab.id])).inheritedPolicy,true,'policy mark survives native session restore');
  if(!mode)assert.equal(restored.groups.find(group=>group.name==='peer edited group')?.color,'#6757a3','received group color survives native restart');
  await openSync();
 });
 }
 if(tabsOnly){await close('tabs');await device.sync.disable();}
 else {
 await check('first upload holds existing Favorites until Continue',async()=>{
  await until(()=>w.call('settingsSyncPairingDom'),s=>s?.pendingFirstUpload?.includes('1'),'one Favorite consent');
  await pump();assert.ok(!(await rpc('bookmarks.exportForSync')).items.some(x=>x.url===first));
  assert.ok(!peerFavorites().some(x=>x.url===first));assert.ok((await nativeFavorites()).some(x=>x.url===first));
  await act('upload-continue');
  await until(async()=>{await pump();return peerFavorites();},l=>l.some(x=>x.url===first),'accepted Favorite on peer');
 });
 await check('Favorites added on either device reach the other',async()=>{
  await w.call('seedFavorite',later,'Added on Mac');
  device.module('bookmarks').saveFavorite(remote,'Added on peer');await peerPass();
  await until(async()=>{await pump();return {mac:await nativeFavorites(),peer:peerFavorites()};},v=>v.mac.some(x=>x.url===remote)&&v.peer.some(x=>x.url===later),'both additions');
 });
 if(!recoveryOnly&&!consentOnly){
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
  peerEdit(remote,'Peer renamed','Peer folder');await peerPass();
  await until(async()=>{await pump();return nativeFavorites();},l=>l.some(x=>x.url===remote&&x.title==='Peer renamed'&&x.folder==='Peer folder'),'peer edits');
 });
 await check('theme and blocking switch sync from Mac to peer',async()=>{
  await w.call('setAppearance','dark');
  await inSettings(w,'privacy',async(_a,d)=>{const el=d.find('#blancBlocking');if(el.checked)el.click();await new Promise(r=>setTimeout(r,300));return {value:el.checked};});
  await until(async()=>{await pump();return device.module('settings').exportForSync().values;},v=>v.theme==='dark'&&v.adblockEnabled===false,'Mac settings on peer');
 });
 await check('theme and blocking switch sync from peer to Mac',async()=>{
  device.module('settings').setSettings({theme:'light',adblockEnabled:true});await peerPass();
  await until(async()=>{await pump();return {blocking:(await w.snapshot()).adblockEnabled,theme:await inSettings(w,'appearance',(_a,d)=>({value:d.find('#colorSchemeModeSelect').value}))};},v=>v.blocking===true&&v.theme==='1','peer settings on Mac');
 });
 const macSettings={theme:'dark',adblockEnabled:false,adblockExceptions:['mac-setting.example'],searchEngine:'custom',searchEngineTemplate:'https://mac-search.example/?q=%s',bangsEnabled:false,customBangs:[{code:'macbang',name:'Mac bang',template:'https://mac-bang.example/?q=%s'}]};
 const remoteSettings={theme:'light',adblockEnabled:true,adblockExceptions:['peer-setting.example'],searchEngine:'custom',searchEngineTemplate:'https://peer-search.example/?q=%s',bangsEnabled:true,customBangs:[{code:'peerbang',name:'Peer bang',template:'https://peer-bang.example/?q=%s'}]};
 const matches=(actual,expected)=>Object.keys(expected).every(k=>JSON.stringify(actual[k])===JSON.stringify(expected[k]));
 await check('all seven native settings map from Mac to peer',async()=>{
  await w.native('desktopSyncApplySettings',[macSettings]);
  await until(()=>w.native('desktopSyncSettings'),v=>matches(v,macSettings),'native mapping readback');
  await until(async()=>{await pump();return device.module('settings').exportForSync().values;},v=>matches(v,macSettings),'all Mac settings on peer');
 });
 await check('all seven settings map from peer to native Mac',async()=>{
  device.module('settings').setSettings(remoteSettings);await peerPass();
  await until(async()=>{await pump();return w.native('desktopSyncSettings');},v=>matches(v,remoteSettings),'all peer settings on Mac');
 });
 await check('clearing custom search and switching to a stock engine in both directions',async()=>{
  await w.native('desktopSyncApplySettings',[{searchEngine:'google',searchEngineTemplate:''}]);
  await until(async()=>{await pump();return device.module('settings').exportForSync().values;},v=>v.searchEngine==='google'&&v.searchEngineTemplate==='','native custom search cleared');
  device.module('settings').setSettings({searchEngine:'bing',searchEngineTemplate:''});await peerPass();
  await until(async()=>{await pump();return w.native('desktopSyncSettings');},v=>v.searchEngine==='bing'&&v.searchEngineTemplate==='','peer stock search applied');
 });
 }
 await openSync();
 if(!consentOnly){
 await check('stalled runner preserves enabled state and Favorites without removals',async()=>{
  const before=(await nativeFavorites()).map(x=>x.url).sort();
  const tombstones=JSON.stringify(device.module('bookmarks').exportForSync().tombstones);
  const pid=runnerPid();process.kill(pid,'SIGSTOP');
  try {
   let refused=false;
   try { await rpc('sync.status'); } catch { refused=true; }
   assert.equal(refused,true,'stalled RPC reports failure');
   const dom=await w.call('settingsSyncPairingDom');
   assert.equal(dom.syncOn,true,'failure never shows Sync off');
   assert.equal(dom.turnOnVisible,false,'no false turn-on offer');
   assert.deepEqual((await nativeFavorites()).map(x=>x.url).sort(),before);
  } finally {process.kill(pid,'SIGCONT');}
  await until(()=>rpc('sync.status').catch(()=>null),s=>s?.enabled,'late runner response recovers');
  await pump();assert.equal(JSON.stringify(device.module('bookmarks').exportForSync().tombstones),tombstones);
 });
 await check('refused desktop state write preserves Favorites and Sync enabled',async()=>{
  // Reopen the sheet to clear the previous timeout notice without starting
  // another network pass. Observe the exact native disk error, not any notice.
  await w.call('closeUtilitySurface');await openSync();
  await until(()=>rpc('sync.status').catch(()=>null),s=>s?.enabled,'runner ready before disk fault');
  await inSettings(w,'sync',async()=>{
   const {addWebUiListener}=await import('chrome://resources/js/cr.js');
   window.__diskFaultObserved=false;
   addWebUiListener('blanc-sync-changed',event=>{
    if(event.event==='desktop-error'&&event.value==='desktop-state-write-failed')window.__diskFaultObserved=true;
   });
   return {value:true};
  });
  const directory=path.join(fixture.profile,'Default','BlancSyncDesktop');
  const stateFile=path.join(directory,'state.json');
  const saved=fs.readFileSync(stateFile);
  const before=(await nativeFavorites()).map(x=>x.url).sort();
  const tombstones=JSON.stringify(device.module('bookmarks').exportForSync().tombstones);
  fs.chmodSync(directory,0o500);
  try {
   assert.throws(()=>fs.writeFileSync(path.join(directory,'fault-probe'),'test'),{code:'EACCES'},'the OS refuses new files');
   await w.native('desktopSyncRenameFavorite',[first,'Retained through write fault']);
   await until(()=>inSettings(w,'sync',()=>({value:window.__diskFaultObserved===true})),Boolean,'native disk-write error',90000);
   assert.ok((await w.call('settingsSyncPairingDom')).error,'write error visible');
   assert.equal((await w.call('settingsSyncPairingDom')).syncOn,true);
   assert.equal((await rpc('sync.status')).enabled,true);
   assert.equal(fs.readFileSync(stateFile).equals(saved),true,'last durable baseline unchanged');
   const rows=await nativeFavorites();assert.ok(before.every(url=>rows.some(x=>x.url===url)));
   assert.equal(JSON.stringify(device.module('bookmarks').exportForSync().tombstones),tombstones);
  } finally {fs.chmodSync(directory,0o700);}
  await until(async()=>{await pump();return peerFavorites();},rows=>rows.some(x=>x.url===first&&x.title==='Retained through write fault'),'write recovers without removal');
  assert.equal(JSON.stringify(device.module('bookmarks').exportForSync().tombstones),tombstones,'no tombstones after recovery');
  const recovered=await nativeFavorites();assert.ok(before.every(url=>recovered.some(x=>x.url===url)),'all Favorites survive recovery');
 });
 await check('a killed runner recovers without losing enabled state or Favorites',async()=>{
  // Match this isolated browser's direct child and the exact utility subtype.
  process.kill(runnerPid(),'SIGKILL');await sleep(500);
  await until(()=>rpc('sync.status'),s=>s.enabled===true,'runner recovered');
  await pump();assert.ok((await nativeFavorites()).some(x=>x.url===first));assert.ok(peerFavorites().some(x=>x.url===first));
 });
 }
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
 await openSync();
 await check('a missing pairing code reports the shipping error and leaves Sync off',async()=>{
  await act('choose-code');await w.call('settingsSyncPairingAct','type-code','K7MR-4PX2');await act('connect-code');
  await until(()=>w.call('settingsSyncPairingDom'),s=>s?.error==='That code isn’t valid any more. Make a new one on your other device.','missing code error');
  assert.equal((await rpc('sync.status')).enabled,false);
 });
 await requestRoom();device.sync.resetRequestWindowForTest();const join=await device.sync.beginPairing();
 const beforeLocal=(await nativeFavorites()).map(x=>x.url);
 const beforeRemote=peerFavorites().map(x=>x.url);
 const beforeTombstones=JSON.stringify(device.module('bookmarks').exportForSync().tombstones);
 const reconcileRequestStart=worker.requests.length;
 assert.equal(await w.call('settingsSyncPairingAct','type-code',join.code),true);await act('connect-code');
 await check('first reconcile deletes nothing on either side',async()=>{
  await until(()=>w.call('settingsSyncPairingDom'),s=>s?.pendingFirstUpload?.includes('1'),'initial consent');
  await until(async()=>{await pump();return nativeFavorites();},rows=>beforeRemote.every(url=>rows.some(x=>x.url===url)),'all account Favorites downloaded');
  const local=await nativeFavorites();
  assert.ok(beforeLocal.every(url=>local.some(x=>x.url===url)),'all prior local Favorites retained');
  assert.ok(beforeRemote.every(url=>peerFavorites().some(x=>x.url===url)),'all prior remote Favorites retained');
  assert.equal(JSON.stringify(device.module('bookmarks').exportForSync().tombstones),beforeTombstones,'no remote tombstones');
  assert.equal((await rpc('bookmarks.exportForSync')).tombstones.length,0,'no native runner tombstones');
  // Shipping retires a consumed pairing code with DELETE. That operation
  // must not be mistaken for removal of an account or encrypted data store.
  const deletes=worker.requests.slice(reconcileRequestStart).filter(r=>r.method==='DELETE');
  assert.ok(deletes.every(r=>/^\/v1\/pair\/[^/]+$/.test(new URL(r.url).pathname)&&r.status===204),
   'no Worker account/store DELETE; only successful pairing cleanup');
 });
 await check('Not now keeps existing Favorites local while account Favorites download',async()=>{
  await until(()=>w.call('settingsSyncPairingDom'),s=>s?.pendingFirstUpload?.includes('1'),'decline consent');
  await act('upload-not-now');await pump();await pump();
  await until(()=>w.call('settingsSyncPairingDom'),s=>s?.syncOn&&!s.pendingFirstUpload,'declined upload prompt hidden');
  assert.ok((await nativeFavorites()).some(x=>x.url===excluded));assert.ok((await nativeFavorites()).some(x=>x.url===remote));
  assert.ok(!(await rpc('bookmarks.exportForSync')).items.some(x=>x.url===excluded));assert.ok(!peerFavorites().some(x=>x.url===excluded));
  await fixture.stop();
  // A real persisted one-minute request budget, not a stalled utility. On
  // restart shipping conservatively charges recent timestamps for a whole
  // window. Keep its limit intact and prove the native RPC tolerates that wait.
  const budgetFile=path.join(fixture.profile,'Default','BlancSync','shared-spaces.json');
  const budget=JSON.parse(fs.readFileSync(budgetFile));
  budget.requestLog=Array(10).fill(Date.now());budget.windowLimit=10;budget.backoffUntil=null;
  fs.writeFileSync(budgetFile,JSON.stringify(budget),{mode:0o600});
  await fixture.start(fixture.base+'/initial');
  await assertRendering(e=>fixture.host.eval(e));
  fixture.server.removeAllListeners('request');
  fixture.server.on('request',(q,r)=>{
    if(q.url==='/favicon.png'){r.writeHead(200,{'content-type':'image/png'});r.end(iconPng);}
    else {r.writeHead(200,{'content-type':'text/html'});r.end('<title>Native test fixture</title><link rel="icon" href="/favicon.png"><p>Local synthetic page</p>');}
  });
  await installDriver(fixture.host);w=createWorld(fixture);await w.app.refresh();
  const started=Date.now();let finished=false;
  const budgetPass=rpc('sync.syncNow').then(value=>{finished=true;return value;});
  budgetPass.catch(()=>{}); // Cleanup may reject it after a failed local-read assertion.
  // The real inbox is local state and must remain readable while a healthy
  // network pass waits for its persisted quota. No quota reset or extra GET.
  const localInbox=await nativeCall(fixture.host,'desktopSyncCall',['sync.listSentToThisDevice'],null,5000);
  assert.ok(Array.isArray(localInbox));assert.equal(finished,false,'network pass still waits for quota');
  output.restartBudgetLocalInboxReadable=true;
  await budgetPass;
  const waited=Date.now()-started;
  assert.ok(waited>=30000,'persisted quota outlasts the old runner deadline');
  output.restartBudgetWaitMs=waited;console.log('restart: healthy budget wait completed');
  assert.equal((await rpc('sync.status')).enabled,true,'responsive budget-waiting runner stays enabled');
  await openSync();
  await until(()=>w.call('settingsSyncPairingDom'),s=>s?.syncOn&&!s.pendingFirstUpload,'declined upload prompt stays hidden after restart');
  assert.ok((await nativeFavorites()).some(x=>x.url===excluded));assert.ok(!peerFavorites().some(x=>x.url===excluded));
 });
 await close('declined');
 await device.sync.disable();
 }
 }
 for(const mode of (tabsOnly?[]:['private','secondary'])){
  await check(`${mode} profile refuses Sync without a runner or Worker traffic`,async()=>{
   const requestCount=worker.requests.length;
   await launch({privateMode:mode==='private',secondary:mode==='secondary'});
   await w.api('openPage',['settings']);
   const state=await inSettings(w,'',async()=>{
    const {sendWithPromise}=await import('chrome://resources/js/cr.js');
    return {value:await sendWithPromise('blancSyncState')};
   });
   assert.equal(state.available,false);assert.equal(state.status,null);
   let refused=false;try{await rpc('sync.status');}catch{refused=true;}assert.equal(refused,true);
   assert.throws(()=>runnerPid(),'no Sync runner in ineligible profile');
   assert.equal(worker.requests.length,requestCount,'no Worker traffic');
   await close(mode);
  });
 }
 output.requests=worker.requests.map(({method,status})=>({method,status}));
 output.result='pass';
}catch(error){output.result=error.code==='BLANC_ENVIRONMENT_STOP'?'blocked-environment':'fail';output.error=error.stack;console.error(error.stack);process.exitCode=1;}
finally{
 if(fixture)await close('failure').catch(e=>console.error(e));
 output.requests=worker?.requests.map(({method,status,store})=>({method,status,store}));
 await worker?.close();fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify(output,null,2)+'\n');
}
