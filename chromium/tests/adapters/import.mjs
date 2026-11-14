import {UndefinedNativeAdapterError} from '../lib/adapters.mjs';
export const importSheet=(w,expression)=>w.hostEval(`(()=>{const window=globalThis.document.getElementById('sheet')?.contentWindow;const document=window?.document;if(!document||document.location.pathname!='/pages/tab-import.html')return null;return (${expression})();})()`);
export const imports={
 openTabImport:w=>w.api('openPage',['tab-import']),
 arcImportPage:(w,expression)=>importSheet(w,expression),
 async arcImport(w,operation,value){
  if(operation==='platform'){
   if(value!=='darwin')throw new UndefinedNativeAdapterError('Arc Linux file-choice copy cannot execute on the native macOS fork');
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
