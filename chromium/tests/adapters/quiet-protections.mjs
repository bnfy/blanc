// Establish native protection conditions with real page activity.
import {nativeId,UndefinedNativeAdapterError} from '../lib/adapters.mjs';
import {tabPage} from './core.mjs';
export const quietProtections={
 async setQuietProtection(w,id,reason){
  if(reason==='pinned'){await w.call('pinTab',id);return true;}
  if(reason==='muted'){await w.call('muteTab',id);return true;}
  const page=await tabPage(w,id);
  if(reason==='audible'||reason==='used media'){
   await page.evaluate(async reason=>{
    const rate=8000,samples=rate*2,buffer=new ArrayBuffer(44+samples*2),v=new DataView(buffer);
    const text=(at,s)=>{for(let i=0;i<s.length;i++)v.setUint8(at+i,s.charCodeAt(i));};
    text(0,'RIFF');v.setUint32(4,36+samples*2,true);text(8,'WAVE');text(12,'fmt ');
    v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);
    v.setUint32(24,rate,true);v.setUint32(28,rate*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);
    text(36,'data');v.setUint32(40,samples*2,true);
    for(let i=0;i<samples;i++)v.setInt16(44+i*2,8000*Math.sin(i*2*Math.PI*440/rate),true);
    const audio=window.__quietAudio=new Audio(URL.createObjectURL(new Blob([buffer],{type:'audio/wav'})));
    audio.loop=true;await audio.play();
    return true;
   },reason);
   await w.waitFor(()=>w.native('quietState',[nativeId(id)]),s=>s.usedMedia===true,'native media history');
   if(reason==='used media')await page.evaluate(()=>{window.__quietAudio.pause();return true;});
   if(reason==='audible')await w.waitFor(()=>w.snapshot(),s=>s.tabs.find(t=>String(t.id)===String(id))?.audible,'audible native tab');
   return true;
  }
  if(reason==='adopted child'){
   await page.evaluate(()=>{window.__quietChild=window.open('/site/quiet-child?nostore=1','_blank');return !!window.__quietChild;});
   await w.waitFor(()=>w.native('quietState',[nativeId(id)]),s=>s.liveOpenerFamily===true,'native opener family');
   return true;
  }
  if(reason==='pending permission'){
   await page.evaluate(()=>{navigator.geolocation.getCurrentPosition(()=>{},()=>{});return true;});
   await w.waitFor(()=>w.native('quietState',[nativeId(id)]),s=>s.permissionPending===true,'native pending permission');
   return true;
  }
  throw new UndefinedNativeAdapterError('No real quiet protection fixture for '+reason);
 },
 async armBeforeUnloadObjection(w,id){
  return (await tabPage(w,id)).evaluate(()=>{
   addEventListener('beforeunload',event=>{event.preventDefault();event.returnValue='';});return true;
  });
 },
 // Chromium skips beforeunload-bearing frames before closing. There is no
 // Electron will-prevent-unload event or Electron listener set to observe.
 tabListenerState(){throw new UndefinedNativeAdapterError('Chromium has no Electron WebContents listener counts');},
 beforeUnloadProbe(){throw new UndefinedNativeAdapterError('Chromium proactively protects beforeunload; no close event is dispatched');},
};
