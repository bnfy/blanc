import fs from 'node:fs';
import path from 'node:path';
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
export const importSheet=(w,expression,timeout)=>w.hostEval(`(()=>{const window=globalThis.document.getElementById('sheet')?.contentWindow;const document=window?.document;if(!document||document.location.pathname!='/pages/tab-import.html')return null;return (${expression})();})()`,timeout);
export const imports={
 openTabImport:w=>w.api('openPage',['tab-import']),
 arcImportPage:(w,expression)=>importSheet(w,expression),
 async arcImport(w,operation,value){
  if(operation==='platform'){
   if(value!=='darwin')throw new UndefinedNativeAdapterError('Arc Linux file-choice copy cannot execute on the native macOS fork');
   linkArcFolder(w.fixture.browserHome);
   return true;
  }
  if(operation==='choose-file'&&value===null)return true;
  if(operation==='reads')return w.native('importDebug',['arc-reads']);
  if(operation==='has-session')return w.native('importDebug',['has-arc']);
  if(operation==='records'){
   const store=await w.native('importDebug',['records']);
   if(store.error)throw Error(store.error);
   const meta=(await w.api('listWorkspaces')).items;
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
