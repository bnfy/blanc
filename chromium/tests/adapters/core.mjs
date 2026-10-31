// Tabs, groups and the Island overlay: shipping test-hook names over the
// fork's native test dispatch and the Island facade (its browserAPI).
import {UndefinedNativeAdapterError,nativeId} from '../lib/adapters.mjs';
const same=(a,b)=>String(a).toLocaleLowerCase()===String(b).toLocaleLowerCase();
async function groupNamed(w,name){return (await w.snapshot()).groups.find(g=>same(g.name,name))??null;}
async function created(w,reply){
 const id=String(reply.tabId);
 await w.waitForState(s=>s.tabs.some(t=>t.id===id&&!t.loading));return id;
}
export const core={
 state:w=>w.state(),
 async openTab(w,url,opts){
  // Private tabs and other creation options go through the facade, whose
  // refusal of what the fork lacks is a product result.
  if(opts&&Object.keys(opts).length){
   if(Object.keys(opts).some(k=>k!=='private'))throw new UndefinedNativeAdapterError('Tab creation options need an adapter: '+Object.keys(opts));
   if(opts.private)await w.api('createTab',[url,opts]);
  }
  return created(w,await w.native('createTab',[url]));
 },
 newTab:async w=>created(w,await w.native('createTab',['chrome://newtab/'])),
 closeTab:(w,id)=>w.native('closeTab',[nativeId(id)]),
 activateTab:(w,id)=>w.native('switchTab',[nativeId(id)]),
 duplicateActive:async w=>w.native('duplicateTab',[(await w.snapshot()).activeTabId]),
 pinTab:(w,id)=>w.native('togglePinned',[nativeId(id)]),
 muteTab:(w,id)=>w.api('toggleTabMuted',[String(id)]),
 toggleSiteMute:(w,id)=>w.api('toggleSiteMute',[String(id)]),
 reopenClosed:w=>w.native('reopenClosedTab'),
 groupActiveByName:async(w,name)=>w.api('groupTabByName',[String((await w.snapshot()).activeTabId),name]),
 groupTabByName:(w,id,name)=>w.api('groupTabByName',[String(id),name]),
 async closeGroupByName(w,name){const g=await groupNamed(w,name);if(g)await w.api('closeGroup',[g.id]);},
 async closeTabsInGroupName(w,name){
  const g=await groupNamed(w,name);if(!g)return;
  for(const t of (await w.snapshot()).tabs.filter(t=>t.groupId===g.id))await w.native('closeTab',[t.id]);
 },
 async ungroupGroupByName(w,name){const g=await groupNamed(w,name);if(g)await w.api('ungroupGroup',[g.id]);return !!g;},
 toggleGroup:(w,id)=>w.api('toggleGroupCollapsed',[String(id)]),
 newTabBelow:(w,id)=>w.api('newTabBelow',[String(id)]),
 closeTabsBeside:async(w,id,direction)=>{await w.api(direction==='above'?'closeAbove':'closeBelow',[String(id)]);return true;},
 adblockEnabled:async w=>(await w.snapshot()).adblockEnabled,
 closeOverlay:w=>w.api('closeOverlay'),
 openPanel:w=>w.hostEval('window.BlancPrototypeHost.open(true)'),
 openPalette:w=>w.hostEval('window.BlancPrototypeHost.open(false)'),
 // The host owns the mode (main in shipping); the overlay document's own
 // body mode is what its renderer has applied.
 overlayMode:w=>w.hostEval(`(()=>{const f=document.querySelector('#overlay');return !f||f.hidden?null:f.dataset.mode||null})()`),
 overlayRendererMode:w=>w.hostEval(`(()=>{const f=document.querySelector('#overlay');return !f||f.hidden?null:f.contentDocument?.body?.dataset.mode||null})()`),
 zoomIn:w=>w.native('previewPageCommand',['zoomIn']),
 zoomReset:w=>w.native('previewPageCommand',['zoomReset']),
};
