// Tabs, groups and the Island overlay: shipping test-hook names over the
// fork's native test dispatch and the Island facade (its browserAPI).
import {UndefinedNativeAdapterError,nativeId} from '../lib/adapters.mjs';
import {shippingPageUrl} from '../lib/page-shim.mjs';
const same=(a,b)=>String(a).toLocaleLowerCase()===String(b).toLocaleLowerCase();
// A tab's document, found by its committed URL: CDP page targets carry no
// tab id, so a URL shared by two tabs is ambiguous rather than guessed.
export async function tabPage(w,id){
 const tabs=(await w.snapshot()).tabs;const tab=tabs.find(t=>String(t.id)===String(id));
 if(!tab)throw Error('Unknown native tab '+id);
 // The browser names each tab's DevTools target, so documents that share an
 // address (two Start Pages) stay apart; older candidates fall back to the
 // address, which must then be unique.
 const targetId=(await w.native('tabTargets',[]).catch(()=>null))?.[String(id)];
 if(targetId){await w.app.refresh();const page=w.app.windows().find(p=>p.targetId===targetId);if(page)return page;}
 // The snapshot names the Start Page blanc://newtab/ and commits it as its
 // blanc-prototype document; its page target says chrome://newtab/. Compare
 // all of them through the shipping URL projection.
 const urls=new Set([tab.url,tab.committedUrl].filter(Boolean).map(shippingPageUrl));
 const targets=(await w.fixture.targets()).filter(t=>t.type==='page'&&urls.has(shippingPageUrl(t.url)));
 if(targets.length!==1||tabs.filter(t=>urls.has(shippingPageUrl(t.url))||(t.committedUrl&&urls.has(shippingPageUrl(t.committedUrl)))).length!==1)throw new UndefinedNativeAdapterError('Tab document is not uniquely addressable: '+tab.url);
 await w.app.refresh();
 return w.app.windows().find(p=>p.targetId===targets[0].id);
}
// host.js show() resolves once the overlay is unhidden; a toggle that closed
// it instead has nothing to wait for.
async function openIsland(w,newTab){
 const result=await w.hostEval(`window.BlancPrototypeHost.open(${newTab})`);
 await w.hostEval(`new Promise(r=>{const end=Date.now()+2000;(function check(){
  if(document.getElementById('overlay').hidden||innerHeight>68||Date.now()>end)return r(true);
  requestAnimationFrame(check);})();})`);
 return result;
}
async function groupNamed(w,name){return (await w.snapshot()).groups.find(g=>same(g.name,name))??null;}
async function created(w,reply){
 // A utility page opens in the sheet, as shipping's createTab does: no tab.
 if(reply?.status==='sheet')return null;
 const id=String(reply.tabId);
 await w.waitForState(s=>s.tabs.some(t=>t.id===id&&!t.loading));return id;
}
// Shipping's internal addresses, as the fork serves them: the Start Page and
// the utility pages are chrome:// pages (the sheet takes the utility ones).
const forkUrl=url=>{const m=/^blanc:\/\/(newtab|settings|downloads|bookmarks|history)\/?(?:[?#].*)?$/i.exec(String(url));
 return m?`chrome://${m[1].toLowerCase()}/`:String(url);};
export const core={
 state:w=>w.state(),
 async openTab(w,url,opts){
  if(opts&&Object.keys(opts).some(k=>k!=='private'))throw new UndefinedNativeAdapterError('Tab creation options need an adapter: '+Object.keys(opts));
  // A private tab opens in this window on the private profile (D1). Its
  // shipping address is the private Start Page, blanc://newtab/?private=1:
  // a private tab's Start Page is the fork's chrome://newtab/.
  if(opts?.private)return created(w,await w.native('createTab',[forkUrl(url),true]));
  return created(w,await w.native('createTab',[forkUrl(url)]));
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
 async newTabBelow(w,id){
  const before=new Set((await w.snapshot()).tabs.map(t=>String(t.id)));
  await w.api('newTabBelow',[String(id)]);
  return (await w.waitForState(s=>s.tabs.some(t=>!before.has(t.id)))).tabs.find(t=>!before.has(t.id)).id;
 },
 closeTabsBeside:async(w,id,direction)=>{await w.api(direction==='above'?'closeAbove':'closeBelow',[String(id)]);return true;},
 adblockEnabled:async w=>(await w.snapshot()).adblockEnabled,
 closeOverlay:w=>w.api('closeOverlay'),
 // Shipping's showOverlay attaches the overlay view with its bounds before it
 // returns; the host shows its overlay once the native view has taken the
 // height, and the host document learns its new size a frame or so later.
 // Opening resolves once both have happened, so a move over the panel area
 // lands in the open overlay.
 // Shipping's openPanel (showOverlay('panel')): the command bar expanded at
 // the pill with the page's address in the field, the host's show(); not the
 // new-tab panel, whose field starts empty.
 openPanel:async w=>{await w.hostEval('window.BlancPrototypeHost.api.openIsland()');
  await w.hostEval(`new Promise(r=>{const end=Date.now()+2000;(function check(){
   if(document.getElementById('overlay').hidden||innerHeight>68||Date.now()>end)return r(true);
   requestAnimationFrame(check);})();})`);},
 openPalette:w=>openIsland(w,false),
 // The host owns the mode (main in shipping); the overlay document's own
 // body mode is what its renderer has applied.
 overlayMode:w=>w.hostEval(`(()=>{const f=document.querySelector('#overlay');return !f||f.hidden?null:f.dataset.mode||null})()`),
 overlayRendererMode:w=>w.hostEval(`(()=>{const f=document.querySelector('#overlay');return !f||f.hidden?null:f.contentDocument?.body?.dataset.mode||null})()`),
 // Fronts the Island window and reports whether its document has focus.
 async focusWindow(w){await w.fixture.host.send('Page.bringToFront');return w.hostEval('document.hasFocus()');},
 executeTab:async(w,id,source)=>(await tabPage(w,id)).evalExpression(String(source)),
 setTabLayout:(w,layout)=>w.api('setTabLayout',[layout]),
 // A presentation seed: the title goes through the page itself so Chromium
 // reports it as a real title; seeds with no page path stay undefined.
 async setTabPresentation(w,id,patch={}){
  const keys=Object.keys(patch).filter(k=>k!=='title'&&k!=='muted');
  if(keys.length)throw new UndefinedNativeAdapterError('Tab presentation seed needs an adapter: '+keys);
  if(typeof patch.title==='string'){
   await (await tabPage(w,id)).evaluate(t=>{document.title=t;},patch.title);
   await w.waitForState(s=>s.tabs.some(t=>t.id===String(id)&&t.title===patch.title));
  }
  if(typeof patch.muted==='boolean'&&(await w.state()).tabs.find(t=>t.id===String(id)).muted!==patch.muted)await w.api('toggleTabMuted',[String(id)]);
  return true;
 },
 zoomIn:w=>w.native('previewPageCommand',['zoomIn']),
 zoomReset:w=>w.native('previewPageCommand',['zoomReset']),
};
