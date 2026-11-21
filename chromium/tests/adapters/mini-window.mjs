import {runtimes} from './tabs.mjs';
import {nativeCall} from '../lib/test-driver.mjs';
import {inSettings} from './commands.mjs';
const runtime=async(w,id)=>(await runtimes(w)).find(r=>r.id===id);
export const miniWindow={
 async openMiniWindow(w){
  const before=new Set((await runtimes(w)).map(r=>r.id));
  if(!await w.native('openMiniWindow'))return null;
  const created=await w.waitFor(async()=>(await runtimes(w)).find(r=>!before.has(r.id)),Boolean,'native Mini window');
  return created.id;
 },
 async miniWindowState(w,id){
  const r=await runtime(w,id);if(!r)return null;
  const s=await nativeCall(r.cdp,'snapshot');return {mini:s.miniWindow,bounds:s.windowBounds};
 },
 async miniWindowChip(w,id,options={}){
  const r=await runtime(w,id);if(!r)return null;
  return r.cdp.eval(`(()=>{const doc=document.querySelector('#strip')?.contentDocument;if(!doc)return null;
   const chip=doc.getElementById('pillMiniOpen'),mark=doc.getElementById('pillSpace');
   const visible=e=>!!e&&!e.hidden&&e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0&&doc.defaultView.getComputedStyle(e).visibility!=='hidden';
   const result={visible:visible(chip),miniAttribute:doc.documentElement.hasAttribute('data-mini-window'),spaceMarkShown:visible(mark)};
   if(${options.click===true}){result.clicked=visible(chip);if(result.clicked)chip.click();}return result;})()`);
 },
 async expireMiniWindow(w,id){
  const r=await runtime(w,id);if(!r)return 'closed';
  const s=await nativeCall(r.cdp,'snapshot');
  return w.native('expireMiniWindow',[s.nativeWindowId]);
 },
 async setMiniWindowShortcut(w,choice){
  return inSettings(w,'appearance',async(choice,d)=>{
   const host=d.find('settings-appearance-page'),control=d.find('#blancMiniWindowShortcut');
   if(!host||!control)return {missing:'Mini shortcut settings'};
   const end=Date.now()+8000;
   while(!host.blancMiniState_){if(Date.now()>end)throw Error('Mini shortcut state did not load');await new Promise(r=>setTimeout(r,30));}
   if(choice!==null){
    control.value=choice;control.dispatchEvent(new Event('change',{bubbles:true}));
    while(host.blancMiniState_.saved!==choice){if(Date.now()>end)throw Error('Mini shortcut setting was not saved');await new Promise(r=>setTimeout(r,30));}
    await host.updateComplete;
   }
   return {value:{...host.blancMiniState_}};
  },choice);
 },
};
