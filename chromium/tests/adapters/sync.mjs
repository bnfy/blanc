// S4a: the Settings sheet is its own chrome://settings/ DevTools target.
// Observe and operate rendered controls; never manufacture runner success.
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const QrCode=require('../../../src/renderer/pages/qr-code.js');
import {readSettings} from './commands.mjs';

export const sync = {
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
   sheetOpen:el('syncPairingDialog')?.open===true,
   sheetVisible:visible('syncPairingDialog'),
   sheetTitle:el('syncPairingTitle')?.textContent.trim(),
   sheetCodeValid:/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(el('syncPairingCode')?.textContent.trim()??''),
   startShown:visible('syncPairingStart'),
   connectIphoneVisible:visible('syncConnectIphone'),
   pairNotice:el('syncPairingNotice')?.textContent.trim(),
   joinedTitle:visible('syncPairingJoined')?el('syncPairingJoined').textContent.trim():'',
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
   'turn-off':'syncDisable','upload-continue':'syncFirstUploadContinue','upload-not-now':'syncFirstUploadNotNow'};
  if(a.action==='type-code'){
   const field=root.getElementById('syncCode');
   if(field.disabled||!field.getBoundingClientRect().width)return false;
   field.value=a.text;field.dispatchEvent(new Event('input',{bubbles:true,composed:true}));return true;
  }
  const button=root.getElementById(ids[a.action]);
  if(!button||button.disabled||!button.getBoundingClientRect().width)return false;
  button.focus();button.click();return true;
 },{action,text}),
};
