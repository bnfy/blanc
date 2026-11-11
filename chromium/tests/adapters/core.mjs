// Tabs, groups and the Island overlay: shipping test-hook names over the
// fork's native test dispatch and the Island facade (its browserAPI).
import {UndefinedNativeAdapterError,nativeId} from '../lib/adapters.mjs';
import {shippingPageUrl} from '../lib/page-shim.mjs';
const same=(a,b)=>String(a).toLocaleLowerCase()===String(b).toLocaleLowerCase();
// A tab's document, found by its committed URL: CDP page targets carry no
// tab id, so a URL shared by two tabs is ambiguous rather than guessed.
export async function tabPage(w,id){
 // The browser names each tab's DevTools target, in any window or set aside,
 // so documents that share an address (two Start Pages) stay apart; older
 // candidates fall back to the address, which must then be unique.
 const targetId=(await w.native('tabTargets',[]).catch(()=>null))?.[String(id)];
 if(targetId){await w.app.refresh();const page=w.app.windows().find(p=>p.targetId===targetId);if(page)return page;}
 const tabs=(await w.snapshot()).tabs;const tab=tabs.find(t=>String(t.id)===String(id));
 if(!tab)throw Error('Unknown native tab '+id);
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
export const forkUrl=url=>{
 if(String(url).startsWith('blanc://mahjong/'))return 'chrome://blanc-prototype/pages/mahjong.html'+String(url).slice('blanc://mahjong/'.length);
 const m=/^blanc:\/\/(newtab|settings|downloads|bookmarks|history)\/?(?:[?#].*)?$/i.exec(String(url));
 return m?`chrome://${m[1].toLowerCase()}/`:String(url);};
export const core={
 state:w=>w.state(),
 async openTab(w,url,opts){
  if(opts?.allowLocalFile)throw new UndefinedNativeAdapterError('N15 isolated local HTML session is not implemented; a raw file navigation would bypass its access policy');
  if(opts&&Object.keys(opts).some(k=>k!=='private'))throw new UndefinedNativeAdapterError('Tab creation options need an adapter: '+Object.keys(opts));
  // A private tab opens in this window on the private profile (D1). Its
  // shipping address is the private Start Page, blanc://newtab/?private=1:
  // a private tab's Start Page is the fork's chrome://newtab/.
  if(opts?.private)return created(w,await w.native('createTab',[forkUrl(url),true]));
  // The tour opens from its Settings row, as a person replays it.
  if(/^blanc:\/\/newtab\/\?tour=1$/.test(String(url))){
   const {inSettings}=await import('./commands.mjs');
   const before=new Set((await w.snapshot()).tabs.map(t=>String(t.id)));
   // Open first: inSettings closes a sheet it opened itself, ahead of the click.
   await w.api('openPage',['settings','help']);
   await w.waitFor(async()=>(await w.fixture.targets()).some(t=>t.type==='page'&&t.url.startsWith('chrome://settings')),Boolean,'the settings sheet',8000);
   await inSettings(w,'help',(a,d)=>{const row=d.find('#blancWelcomeTour');if(!row)return {missing:'#blancWelcomeTour'};
    // After the reply: the click closes the sheet this page lives in.
    setTimeout(()=>row.click(),50);return {value:true};});
   const state=await w.waitFor(()=>w.state(),s=>s.tabs.some(t=>!before.has(String(t.id))&&!t.loading),'the welcome tour tab',8000);
   return String(state.tabs.find(t=>!before.has(String(t.id))).id);
  }
  return created(w,await w.native('createTab',[forkUrl(url)]));
 },
 newTab:async w=>created(w,await w.native('createTab',['chrome://newtab/'])),
 // Shipping's hook closes without asking. A page scripted with a user gesture
 // may hold a beforeunload dialog here, and only a scripted page can.
 async closeTab(w,id){
  const targetId=(await w.native('tabTargets',[]).catch(()=>null))?.[String(id)];
  const page=targetId&&w.app.windows().find(p=>p.targetId===targetId&&p.cdp);
  if(page){page.cdp.on('Page.javascriptDialogOpening',()=>page.cdp.send('Page.handleJavaScriptDialog',{accept:true}).catch(()=>{}));
   await page.cdp.send('Page.enable');}
  return w.native('closeTab',[nativeId(id)]);
 },
 async activateTab(w,id){
  const wasQuiet=(await w.snapshot()).tabs.find(t=>String(t.id)===String(id))?.asleep;
  const result=await w.native('switchTab',[nativeId(id)]);
  // Activation starts Chromium's asynchronous restore. Match the completed
  // wake before the next shipping action can ask to discard this tab again.
  if(wasQuiet)await w.waitForState(s=>s.tabs.some(t=>String(t.id)===String(id)&&!t.asleep&&!t.loading));
  return result;
 },
 duplicateActive:async w=>w.native('duplicateTab',[(await w.snapshot()).activeTabId]),
 goBack:(w,id)=>w.api('goBack',[String(id)]),
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
 openPanel:async w=>{w.app.releasePages();await w.hostEval('window.BlancPrototypeHost.api.openIsland()');
  await w.hostEval(`new Promise(r=>{const end=Date.now()+2000;(function check(){
   if(document.getElementById('overlay').hidden||innerHeight>68||Date.now()>end)return r(true);
   requestAnimationFrame(check);})();})`);},
 openPalette:async w=>{await w.api('closeOverlay',[false]);return openIsland(w,false);},
 // The host owns the mode (main in shipping); the overlay document's own
 // body mode is what its renderer has applied.
 overlayMode:w=>w.hostEval(`(()=>{const f=document.querySelector('#overlay');return !f||f.hidden?null:f.dataset.mode||null})()`),
 overlayRendererMode:w=>w.hostEval(`(()=>{const f=document.querySelector('#overlay');return !f||f.hidden?null:f.contentDocument?.body?.dataset.mode||null})()`),
 // Shipping reports BrowserWindow.isFocused(), not the host document's
 // focus: the page or an Island iframe can own keyboard focus in that window.
 async focusWindow(w){
  await w.fixture.host.send('Page.bringToFront');
  let state=await w.snapshot();
  // The host delegate has no ActivateContents; the real tab delegate does.
  if(!state.windowActive){await (await tabPage(w,state.activeTabId)).bringToFront();state=await w.snapshot();}
  return state.windowActive===true;
 },
 executeTab:async(w,id,source)=>(await tabPage(w,id)).evalExpression(String(source)),
 setTabLayout:(w,layout)=>w.api('setTabLayout',[layout]),
 // A presentation seed: the title goes through the page itself so Chromium
 // reports it as a real title; seeds with no page path stay undefined.
 async setTabPresentation(w,id,patch={}){
  const keys=Object.keys(patch).filter(k=>k!=='title'&&k!=='muted'&&k!=='isLoading'&&k!=='favicon'&&k!=='audible');
  if(keys.length)throw new UndefinedNativeAdapterError('Tab presentation seed needs an adapter: '+keys);
  if(typeof patch.title==='string'){
   await (await tabPage(w,id)).evaluate(t=>{document.title=t;},patch.title);
   await w.waitForState(s=>s.tabs.some(t=>t.id===String(id)&&t.title===patch.title));
  }
  // Private icons are deliberately absent from the native projection.
  if(typeof patch.favicon==='string'&&!(await w.state()).tabs.find(t=>t.id===String(id))?.private){
   await (await tabPage(w,id)).evaluate(url=>{let link=document.querySelector('link[rel=icon]');if(!link){link=document.createElement('link');link.rel='icon';document.head.append(link);}link.href=url;},patch.favicon);
   await w.waitFor(()=>w.snapshot(),s=>!!s.tabs.find(t=>String(t.id)===String(id))?.favicon,'page favicon');
  }
  if(patch.audible===true)await w.call('setQuietProtection',id,'audible');
  if(patch.audible===false)await (await tabPage(w,id)).evaluate(()=>window.__quietAudio?.pause());
  if(typeof patch.muted==='boolean'&&(await w.state()).tabs.find(t=>t.id===String(id)).muted!==patch.muted)await w.api('toggleTabMuted',[String(id)]);
  if(patch.isLoading===true){
   // Hold a real loopback response until the row assertions finish. A fixed
   // delay expires while the other identity rows are still being created.
   const tab=(await w.snapshot()).tabs.find(t=>String(t.id)===String(id));
   if(!tab)throw Error('Unknown native tab '+id);
   const url=new URL(tab.committedUrl||tab.url);url.searchParams.set('hold','slow');
   if(url.hostname!=='127.0.0.1')throw Error('Loading fixture requires loopback');
   const page=await tabPage(w,id);await page.evalExpression('1');let paused=false;
   page.cdp.on('Fetch.requestPaused',()=>{paused=true;});
   await page.cdp.send('Fetch.enable',{patterns:[{urlPattern:url.href,requestStage:'Response'}]});
   (w.heldLoadingPages??=[]).push(page);
   w.native('navigate',[nativeId(id),url.href]).catch(()=>{});
   await w.waitFor(()=>paused,Boolean,'held fixture response');
   await w.waitFor(()=>w.snapshot(),s=>s.tabs.find(t=>String(t.id)===String(id))?.isLoading,'native loading state');
  }
  return true;
 },
 zoomIn:w=>w.native('previewPageCommand',['zoomIn']),
 zoomReset:w=>w.native('previewPageCommand',['zoomReset']),
};
