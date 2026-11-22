import fs from 'node:fs';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {UndefinedNativeAdapterError} from '../lib/adapters.mjs';
// Shipping's Arc steps write Arc's file in the Mac layout under the synthetic
// browser home. On Windows the browser reads Arc's own Store folder
// (tab_import.inc ArcPath), so that folder is a junction to the Mac one.
export const ARC_WINDOWS_FOLDER=['Packages','TheBrowserCompany.Arc_ttt1ap7aakyb4','LocalCache','Local','Arc'];
export function linkArcFolder(home,platform=process.platform,fsApi=fs){
 if(platform!=='win32')return false;
 const mac=path.join(home,'Library','Application Support','Arc'),windows=path.join(home,...ARC_WINDOWS_FOLDER);
 fsApi.mkdirSync(mac,{recursive:true});fsApi.mkdirSync(path.dirname(windows),{recursive:true});
 if(!fsApi.existsSync(windows))fsApi.symlinkSync(mac,windows,'junction');
 return true;
}
const exec = promisify(execFile);
async function command(tool,...args) {
 return (await exec(tool,args,{encoding:'utf8',timeout:8000})).stdout;
}

export async function chooseLinuxArcFile(file,pid,run=command) {
 if (!path.isAbsolute(file) || !fs.statSync(file).isFile()) throw Error('Expected a copied sidebar file');
 const xdotool = (...args) => run('xdotool',...args);
 const dialog = (await xdotool('search','--sync','--onlyvisible','--name','^Choose StorableSidebar\\.json$')).trim();
 if (!/^[1-9][0-9]*$/.test(dialog)) throw Error('Expected one visible Arc file dialog for the fixture process');
 // A portal dialog belongs to its backend process. Chromium exports its X11
 // parent to the portal; only accept a transient of this fixture's browser.
 const ownedByFixture = async window => {
  try { return (await xdotool('getwindowpid',window)).trim() === String(pid); }
  catch { return false; } // _NET_WM_PID is optional.
 };
 if (!await ownedByFixture(dialog)) {
  const transient=await run('xprop','-id',dialog,'WM_TRANSIENT_FOR');
  const parent=/window id # (0x[0-9a-f]+)/i.exec(transient)?.[1];
  if (!parent || !await ownedByFixture(parent))
   throw Error('Arc chooser does not belong to the fixture browser');
 }
 await xdotool('windowfocus','--sync',dialog);
 await xdotool('key','--clearmodifiers','ctrl+l');
 await xdotool('type','--clearmodifiers','--',file);
 await xdotool('key','--clearmodifiers','Return');
}

export function configureArcImport(w,operation,value,platform=process.platform) {
 if (operation==='platform') {
  // The shared Before hook always says darwin. It only arranges the Mac
  // fixture layout; the native browser keeps its own platform.
  if (value!=='darwin' && !(value==='linux' && platform==='linux'))
   throw new UndefinedNativeAdapterError('The Arc Linux file-choice scenario requires a Linux host');
  linkArcFolder(w.fixture.browserHome,platform);
  return true;
 }
 if (operation==='choose-file' && platform==='linux') {w.arcChosenFile=value;return true;}
 if (operation==='choose-file' && value===null)return true;
 throw new UndefinedNativeAdapterError('Arc import native adapter: '+operation);
}
export const importSheet=(w,expression,timeout)=>w.hostEval(`(()=>{const window=globalThis.document.getElementById('sheet')?.contentWindow;const document=window?.document;if(!document||document.location.pathname!='/pages/tab-import.html')return null;return (${expression})();})()`,timeout);
export const imports={
 openTabImport:w=>w.api('openPage',['tab-import']),
 arcImportPage:(w,expression)=>importSheet(w,expression),
 async arcImport(w,operation,value){
  if(operation==='platform'||operation==='choose-file')return configureArcImport(w,operation,value);
  if(operation==='reads')return w.native('importDebug',['arc-reads']);
  if(operation==='has-session')return w.native('importDebug',['has-arc']);
  if(operation==='records'){
   const store=await w.native('importDebug',['records']);
   if(store.error)throw Error(store.error);
   const meta=(await w.api('listWorkspaces')).items;
   // A listed space with no saved record is left out, as before; the log
   // names both sides for diagnosis.
   const missing=meta.filter(row=>!store.records[row.id]);
   if(missing.length)console.error(`arcImport records: listed spaces with no saved record ${JSON.stringify(missing.map(r=>[r.id,r.name]))}; saved ${JSON.stringify(Object.keys(store.records))}`);
   return meta.flatMap(row=>{
    const record=store.records[row.id];if(!record)return [];
    return [{id:row.id,name:row.name,urls:record.tabs.map(t=>t.url),pinned:record.tabs.map(t=>t.pinned),
     groupIds:record.tabs.map(t=>t.group<0?null:String(t.group)),groups:record.groups.map((g,i)=>({...g,id:String(i)})),
     meta:record.tabs.map(t=>({title:t.title??'',favicon:null}))}];
   });
  }
  throw new UndefinedNativeAdapterError('Arc import native adapter: '+operation);
 },
 importPage:(w,expression)=>importSheet(w,expression),
};
