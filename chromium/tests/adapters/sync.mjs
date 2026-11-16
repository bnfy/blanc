// S4a: the Settings sheet is its own chrome://settings/ DevTools target.
// Observe and operate rendered controls; never manufacture runner success.
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const QrCode=require('../../../src/renderer/pages/qr-code.js');
import {seedRemoteDevices} from '../lib/sync-fixture.mjs';
import {tabPage} from './core.mjs';
import {readSettings} from './commands.mjs';

export const sync = {
 sharedSpacesView:w=>readSettings(w,(_a,d)=>{
  const root=d.find('settings-blanc-sync-page')?.shadowRoot;if(!root)return null;
  const dialog=root.getElementById('syncSpacesDialog');
  return {open:dialog?.open===true,checking:!!root.getElementById('syncSpacesChecking')&&!root.getElementById('syncSpacesChecking').hidden,
   syncEnabled:d.find('settings-blanc-sync-page').state_?.status?.enabled,
   chooseEnabled:!!root.getElementById('syncSpacesChoose')?.getBoundingClientRect().width&&!root.getElementById('syncSpacesChoose').disabled,
   eraseRetryVisible:!!root.getElementById('syncEraseRetry')?.getBoundingClientRect().width,
   disableVisible:!!root.getElementById('syncDisable')?.getBoundingClientRect().width,
   wipeEnabled:!!root.getElementById('syncWipe')&&!root.getElementById('syncWipe').disabled,
   choices:[...dialog.querySelectorAll('label')].map(label=>({text:label.textContent,checked:label.querySelector('input')?.checked,disabled:label.querySelector('input')?.disabled})),
   toggle:root.getElementById('syncSpacesToggle')?.checked,checkingText:root.getElementById('syncSpacesChecking')?.textContent,
   confirmText:root.getElementById('syncSpacesShare')?.textContent,
   confirmDisabled:root.getElementById('syncSpacesShare')?.disabled,
   notice:root.getElementById('syncError')?.textContent??'',text:root.textContent};
 }),
 sharedSpacesAct:(w,action,name)=>readSettings(w,(a,d)=>{
  const root=d.find('settings-blanc-sync-page')?.shadowRoot;if(!root)return false;
  const dialog=root.getElementById('syncSpacesDialog');
  const button=a.action==='cancel'?[...dialog.querySelectorAll('cr-button')].find(e=>e.textContent.trim()==='Cancel'):
   a.action==='untick'?[...dialog.querySelectorAll('label')].find(e=>e.textContent.includes(a.name))?.querySelector('input'):
   root.getElementById(({choose:'syncSpacesChoose','turn-on':'syncSpacesToggle',wipe:'syncWipe',disable:'syncDisable',retry:'syncEraseRetry'})[a.action]??'syncSpacesShare');
  const more=button?.closest('details');if(more&&!more.open)more.querySelector('summary').click();
  if(!button||button.disabled||!button.getBoundingClientRect().width)return false;
  button.click();return true;
 },{action,name}),
 async injectRemoteDevices(w,count=1){
  const mode=await w.call('overlayRendererMode');
  await seedRemoteDevices(w,count);
  if(mode&&await w.call('overlayRendererMode')!==mode)await w.call(mode==='palette'?'openPalette':'openPanel');
  const devices=await w.api('listRemoteTabs');
  await w.hostEval(`window.BlancPrototypeHost.refreshSyncSurfaces()`);
  return devices;
 },
 async clearRemoteDevices(w){
  if(w.syncPeer)await seedRemoteDevices(w,0);
  await w.hostEval(`window.BlancPrototypeHost.refreshSyncSurfaces()`);
 },
 async beginRenameDeviceByName(w,name){
  const devices=await w.api('listRemoteTabs');const device=devices.find(d=>d.name===name);if(!device)return false;
  await w.api('beginRenameDevice',[device.deviceId]);return true;
 },
 async remoteStartPageRows(w){
  const state=await w.snapshot();const tab=state.tabs.find(t=>t.url.startsWith('blanc://newtab')||t.url.startsWith('chrome://blanc-prototype/pages/newtab'));
  if(!tab)return [];
  return (await tabPage(w,tab.id)).evaluate(async()=>Promise.all([...document.querySelectorAll('#remoteList .fav')].map(async e=>{
   const tile=e.querySelector('.tile'),bg=tile?.style.backgroundImage??'',url=bg.match(/^url\(["']?(.*?)["']?\)$/)?.[1];
   let decoded=null;if(url?.startsWith('data:image/png;base64,')){const img=new Image();img.src=url;try{await img.decode();decoded=img.naturalWidth+'x'+img.naturalHeight;}catch{}}
   return {title:e.querySelector('.name')?.textContent,host:(e.querySelector('.host')?.textContent??'')+(e.dataset.device?' · '+e.dataset.device:''),faviconHasIcon:tile?.classList.contains('has-icon')??false,faviconDecoded:decoded};
  })));
 },
 windowsContentProtected:w=>w.native('windowsContentProtected',[]),
 // The transient display code stays in memory; never return it in a DOM
 // summary, assertion error, result receipt or browser log.
 settingsSyncPairingCode:w=>readSettings(w,(_a,d)=>d.find('settings-blanc-sync-page')?.shadowRoot.getElementById('syncPairingCode')?.textContent.trim().replace('-', '')),
 async settingsSyncQrMatches(w){
  const shown=await readSettings(w,(_a,d)=>{const r=d.find('settings-blanc-sync-page')?.shadowRoot;return {
   code:r?.getElementById('syncPairingCode')?.textContent.trim().replace('-', ''),
   path:r?.querySelector('#syncPairingQr path')?.getAttribute('d'),box:r?.getElementById('syncPairingQr')?.getAttribute('viewBox')};});
  if(!shown?.code)return false;
  const matrix=QrCode.encode('https://blanc.day/pair#'+shown.code),size=QrCode.viewBoxSize(matrix);
  return shown.path===QrCode.svgPath(matrix)&&shown.box===`0 0 ${size} ${size}`;
 },
 settingsSyncPairingDom:w=>readSettings(w,(_a,d)=>{
  if(location.pathname!=='/sync')return null;
  const host=d.find('settings-blanc-sync-page');
  if(!host?.hasAttribute('blanc-ready'))return null;
  const root=host.shadowRoot,el=id=>root.getElementById(id);
  const visible=id=>{const e=el(id);return !!e&&!e.hidden&&e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0;};
  return {
   available:host.state_?.available,
   shareTabs:el('syncTabsShare')?.checked === true,
   sheetOpen:el('syncPairingDialog')?.open===true,
   sheetVisible:visible('syncPairingDialog'),
   sheetTitle:el('syncPairingTitle')?.textContent.trim(),
   sheetCodeValid:/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(el('syncPairingCode')?.textContent.trim()??''),
   startShown:visible('syncPairingStart'),
   connectIphoneVisible:visible('syncConnectIphone'),
   pairNotice:el('syncPairingNotice')?.textContent.trim(),
   joinedTitle:visible('syncPairingJoined')?el('syncPairingJoined').textContent.trim():'',
   spacesQuestion:visible('syncSpacesQuestion'),
   spacesQuestionText:visible('syncSpacesQuestion')?el('syncSpacesQuestion').textContent.trim():'',
   pairDone:visible('syncPairingCancel')&&el('syncPairingCancel').textContent.trim()==='Done',
   pathOrder:[...root.querySelectorAll('#syncPaths cr-button')].map(e=>e.id).filter(id=>id.startsWith('syncPath')),
   firstPath:visible('syncTurnOn')?'syncTurnOn':null,
   otherWays:[...el('syncOtherWays').querySelectorAll('cr-button')].map(e=>e.id),
   otherWaysClosed:!el('syncOtherWays').open,
   turnOnVisible:visible('syncTurnOn'),pathsVisible:visible('syncPaths'),
   codeFormVisible:visible('syncCodeForm'),nameFormVisible:visible('syncNameForm'),
   connectDisabled:el('syncCodeConnect').disabled,
   syncOn:visible('syncOn'),handle:el('syncAccount').textContent.trim(),
   recoveryPromptVisible:visible('syncRecoveryPrompt'),
   error:visible('syncError')?el('syncError').textContent.trim():'',
   pendingFirstUpload:visible('syncFirstUpload')?el('syncFirstUploadCount').textContent.trim():null,
  };
 }),
 settingsSyncPairingAct:(w,action,text)=>readSettings(w,async(a,d)=>{
  if(location.pathname!=='/sync')return false;
  const root=d.find('settings-blanc-sync-page')?.shadowRoot;if(!root)return false;
  const ids={'choose-code':'syncPathCode','use-passphrase':'syncUsePassphrase',
   'turn-on':'syncTurnOn','connect-code':'syncCodeConnect','sync-now':'syncNow',
   'add-device':'syncAddDevice','connect-iphone':'syncConnectIphone',
   'continue':'syncPairingContinue','add-this-first':'syncPairingAddThisFirst','pair-cancel':'syncPairingCancel',
   'spaces-not-now':'syncSpacesNotNow','spaces-choose':'syncSpacesChoose','spaces-share':'syncSpacesShare','spaces-off':'syncSpacesOff',
   'turn-off':'syncDisable','upload-continue':'syncFirstUploadContinue','upload-not-now':'syncFirstUploadNotNow'};
  if(a.action==='share-tabs-on'||a.action==='share-tabs-off'){
   const field=root.getElementById('syncTabsShare');
   if(!field||field.disabled||!field.getBoundingClientRect().width)return false;
   if(field.checked!==(a.action==='share-tabs-on'))field.click();return true;
  }
  if(a.action==='type-code'){
   const field=root.getElementById('syncCode');
   if(field.disabled||!field.getBoundingClientRect().width)return false;
   field.value=a.text;field.dispatchEvent(new Event('input',{bubbles:true,composed:true}));return true;
  }
  const button=root.getElementById(ids[a.action]);
  const more=button?.closest('details');if(more&&!more.open)more.querySelector('summary').click();
  if(!button||button.disabled||!button.getBoundingClientRect().width)return false;
  button.focus();button.click();return true;
 },{action,text}),
};
