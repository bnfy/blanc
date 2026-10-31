// Shipping hook adapters for the tabs area (see tests/adapters/core.mjs):
// windows, closed entries, the group and tab menus, Shield and site
// controls, and the chrome-document guards.
import {UndefinedNativeAdapterError} from '../lib/adapters.mjs';
import {installDriver,nativeCall} from '../lib/test-driver.mjs';
import {waitFor} from '../lib/cdp.mjs';
import {shippingPageUrl} from '../lib/page-shim.mjs';
import {tabPage} from './core.mjs';
import {jsLiteral} from '../lib/js-literal.mjs';
const HOST='chrome://blanc-prototype/host.html';
const SETTINGS='chrome://blanc-prototype/blocking-settings.html';
// A record whose absent fields raise instead of reading undefined. Shallow:
// nested arrays stay plain so shipping's deepEqual can compare them (a
// recursive observedState proxy fails deepStrictEqual's .size probe).
export function strict(record,label){
 return new Proxy(record,{get(t,k,r){
  if(typeof k==='symbol'||k in t||k==='then'||k==='toJSON')return Reflect.get(t,k,r);
  throw new UndefinedNativeAdapterError('Native snapshot adapter does not expose '+label+'.'+String(k));
 }});
}
const same=(a,b)=>String(a).toLocaleLowerCase()===String(b).toLocaleLowerCase();
// Shipping's exception-list hostname (shield-model blockableHostname).
export function blockableHostname(url){
 try{const u=new URL(url);if(u.protocol!=='http:'&&u.protocol!=='https:')return null;return u.hostname.toLowerCase().replace(/^www\./,'')||null;}catch{return null;}
}
// A shipping closed-entry summary from the native TabRestoreService row
// (oldest first, like Electron's per-window list). The fork exposes no entry
// kind or live-view tier, so `kind` and `held` stay absent.
export const closedSummary=e=>({id:String(e.id),url:e.url||null,tabCount:e.tabCount});
// A window runtime as shipping's windowRuntimeSnapshots() shapes it, from
// that window's own native snapshot. Profile, title, closed count (the fork's
// closed list is profile-wide) and Spaces residency have no per-window source.
export function runtimeRecord(id,snapshot){
 const tabs=snapshot.tabs.map(t=>({id:String(t.id),url:shippingPageUrl(t.url),private:!!t.private}));
 return {id,tabOrder:tabs.map(t=>t.id),activeTabId:snapshot.activeTabId==null?null:String(snapshot.activeTabId),
  glanceTabId:snapshot.glanceTabId==null?null:String(snapshot.glanceTabId),tabs,
  groups:(snapshot.groups||[]).map(g=>({id:String(g.id),name:g.name,collapsed:!!g.collapsed,color:g.color||null})),attached:true};
}
// Shipping tab-menu item ids, by the i18n keys the fork's Island menu
// (adapter.js) and shipping's model both label them with.
export const MENU_KEYS={
 'toggle-start-pin':['tabMenu.pinStartPage','tabMenu.unpinStartPage'],
 'toggle-pin':['tabMenu.pin','tabMenu.unpin','tabMenu.pinSplit','tabMenu.unpinSplit'],
 'toggle-mute':['tabMenu.mute','tabMenu.unmute'],'toggle-site-mute':['tabMenu.muteSite','tabMenu.unmuteSite'],
 'toggle-favorite':['tabMenu.saveFavorite','tabMenu.removeFavorite'],'reload':['menu.reload'],
 'new-tab-below':['tabMenu.newTabBelow'],'close-above':['tabMenu.closeAbove'],'close-below':['tabMenu.closeBelow'],
 'close':['menu.closeTab'],'remove-from-split':['tabMenu.removeFromSplit'],'close-split':['tabMenu.closeSplit'],
 'copy-link':['tabMenu.copyLink'],'duplicate':['tabMenu.duplicate'],'rename':['tabMenu.rename'],
 'close-others':['tabMenu.closeOthers'],'new-tab':['menu.newTab'],'new-private-tab':['menu.newPrivateTab'],
 'glance':['tabMenu.glance'],'quiet':['tabMenu.quiet'],'group':['tabMenu.moveToGroup'],'space':['tabMenu.moveToSpace'],
 'send-to':['tabMenu.sendToDevice'],'split-with':['tabMenu.splitWith'],
};
// ---- windows: each native window has its own Island host target ----
async function primaryTargetId(w){
 return w._primaryTarget??=(await w.fixture.host.send('Target.getTargetInfo')).targetInfo.targetId;
}
async function runtimes(w){
 const primary=await primaryTargetId(w);w._hosts??=new Map();
 const hosts=(await w.fixture.targets()).filter(t=>t.url===HOST);
 const out=[];
 for(const t of hosts){
  let cdp=t.id===primary?w.fixture.host:w._hosts.get(t.id);
  if(!cdp){cdp=await w.fixture.connectTarget(t);await installDriver(cdp);w._hosts.set(t.id,cdp);}
  out.push({id:t.id===primary?'primary':t.id,cdp});
 }
 // Shipping lists runtimes in creation order, primary first; DevTools lists
 // targets newest first.
 out.reverse();out.sort((a,b)=>(b.id==='primary')-(a.id==='primary'));
 return out;
}
async function runtime(w,id){
 const r=(await runtimes(w)).find(r=>r.id===String(id));if(!r)throw Error('Unknown window runtime '+id);return r;
}
const snap=r=>nativeCall(r.cdp,'snapshot');
// ---- Island documents ----
const strip=w=>w.frame('strip'),overlay=w=>w.frame('overlay');
const overlayShown=w=>w.hostEval(`!document.getElementById('overlay').hidden`);
// The Blanc settings document's own blocking bridge answers only its top-level
// page; a hidden target keeps it out of every window's tab strip.
async function blockingSettings(w){
 if(!w._settings){
  const {targetId}=await w.fixture.browser.send('Target.createTarget',{url:SETTINGS,hidden:true,background:true});
  const target=await waitFor(async()=>(await w.fixture.targets()).find(t=>t.id===targetId),Boolean,'Blanc blocking settings page');
  w._settings=await w.fixture.connectTarget(target);
  await waitFor(()=>w._settings.eval(`document.readyState==='complete'&&!!window.blancBlockingSettings`),Boolean,'blocking settings bridge');
 }
 return w._settings;
}
async function activeTab(w){const s=await w.snapshot();return s.tabs.find(t=>String(t.id)===String(s.activeTabId))??null;}
// The fork's Island tab menu: a real right-click on the tab's row in the
// ⌘L panel, read back as rendered buttons.
async function openTabMenu(w,tabId){
 if(!await overlayShown(w))await w.hostEval('window.BlancPrototypeHost.open(false)');
 const page=overlay(w);
 const row=page.locator(`#islandList [data-tab-id="${String(tabId)}"]`).first();
 await row.click({button:'right'});
 await page.locator('.prototype-tab-menu').waitFor({state:'visible'});
 return page;
}
async function menuItem(w,tabId,itemId){
 const keys=MENU_KEYS[itemId];
 if(!keys)throw new UndefinedNativeAdapterError('No label mapping for shipping tab-menu item '+itemId);
 const page=await openTabMenu(w,tabId);
 const item=await page.evaluate(keys=>{
  const labels=new Set(keys.map(k=>window.blancI18n.t(k)));
  const buttons=[...document.querySelectorAll('.prototype-tab-menu button')];
  const i=buttons.findIndex(b=>labels.has(b.textContent));
  return i<0?null:{index:i,label:buttons[i].textContent,enabled:!buttons[i].disabled};
 },keys);
 return {page,item};
}
const domRead=(page,fn)=>page.evaluate(fn);
export const tabs={
 // Windows (F32). The primary window keeps shipping's id 'primary'; others
 // are named by their Island host target.
 async windowRuntimes(w){
  const out=[];for(const r of await runtimes(w))out.push(strict(runtimeRecord(r.id,await snap(r)),'windowRuntime'));
  return out;
 },
 // Chromium's own new-window path (Cmd+N is an accelerator CDP cannot press).
 async openNewWindow(w){
  const before=new Set((await runtimes(w)).map(r=>r.id));
  await w.fixture.browser.send('Target.createTarget',{url:'chrome://newtab/',newWindow:true});
  const r=await waitFor(async()=>(await runtimes(w)).find(r=>!before.has(r.id)),Boolean,'new window Island');
  await waitFor(()=>snap(r),s=>s.tabs.length>0&&s.tabs.every(t=>!t.isLoading),'new window tab');
  return r.id;
 },
 // Chromium's own Close Window command, run by that window's Island. Its
 // reply can be lost as the window goes, so the result is the window leaving.
 async closeWindowRuntime(w,id){
  const r=await runtime(w,id);
  const reply=await nativeCall(r.cdp,'previewPageCommand',['closeWindow'],null,5000).catch(e=>/closed|timed out/i.test(e.message)?'gone':Promise.reject(e));
  if(reply===false)return false;
  await waitFor(async()=>!(await runtimes(w)).some(x=>x.id===r.id),Boolean,'window '+id+' to close');
  return true;
 },
 async openTabInWindow(w,id,url,options){
  if(options&&Object.keys(options).length){
   if(Object.keys(options).some(k=>k!=='private'))throw new UndefinedNativeAdapterError('Tab creation options need an adapter: '+Object.keys(options));
   if(options.private)await w.api('createTab',[url,options]);
  }
  const r=await runtime(w,id);const tabId=String((await nativeCall(r.cdp,'createTab',[url])).tabId);
  await waitFor(()=>snap(r),s=>s.tabs.some(t=>String(t.id)===tabId&&!t.isLoading),'tab in window '+id);
  return tabId;
 },
 async closeTabInWindow(w,runtimeId,tabId){
  const r=await runtime(w,runtimeId);
  if(!(await snap(r)).tabs.some(t=>String(t.id)===String(tabId)))return false;
  await nativeCall(r.cdp,'closeTab',[Number(tabId)]);
  await waitFor(()=>snap(r),s=>!s.tabs.some(t=>String(t.id)===String(tabId)),'tab close in window');
  return true;
 },
 async reopenClosedInWindow(w,runtimeId){
  const r=await runtime(w,runtimeId);const before=String((await snap(r)).activeTabId);
  await nativeCall(r.cdp,'reopenClosedTab');
  const after=await waitFor(()=>snap(r),s=>!s.tabs.some(t=>t.isLoading),'reopen in window');
  return String(after.activeTabId)!==before?String(after.activeTabId):null;
 },
 moveTabToNewWindow:(w,id)=>w.api('moveTabToNewWindow',[String(id)]),
 persistedSessionData(){throw new UndefinedNativeAdapterError('The fork persists windows through Chromium session restore (SNSS), with no session.json projection; needs a sessionWindows test op');},
 // Closed entries (F2).
 async closedEntriesSummary(w){return (await w.snapshot()).closed.map(e=>strict(closedSummary(e),'closedEntry'));},
 // The tab payload the Island renders from: the host's processed snapshot.
 async serializedTabsPayload(w){
  await w.hostEval('window.BlancPrototypeHost.refresh()');
  return (await w.hostEval('window.BlancPrototypeHost.api.getAllTabs()')).tabs.map(t=>strict(t,'serializedTab'));
 },
 // Groups (F3).
 async setGroupColorByName(w,name,color){
  const g=(await w.snapshot()).groups.find(g=>same(g.name,name));if(!g)return false;
  try{return (await w.api('setGroupColor',[g.id,color]))===true;}
  catch(e){if(/Unknown group color/.test(e.message))return false;throw e;}
 },
 async beginRenameGroupByName(w,name){
  const g=(await w.snapshot()).groups.find(g=>same(g.name,name));if(!g)return false;
  await w.api('beginRenameGroup',[g.id]);return true;
 },
 // Tab menu (F2/F46): the Island's own menu, by real right-click and click.
 async tabMenuItem(w,tabId,itemId){
  const {page,item}=await menuItem(w,tabId,itemId);
  await page.keyboard.press('Escape');
  return item&&{label:item.label,enabled:item.enabled};
 },
 async runTabMenuItem(w,tabId,itemId){
  const {page,item}=await menuItem(w,tabId,itemId);
  if(!item||!item.enabled){await page.keyboard.press('Escape');return false;}
  await page.locator('.prototype-tab-menu button').nth(item.index).click();
  return true;
 },
 // Shield and site controls (F12). DOM reads match shipping's hooks; clicks
 // are real CDP pointer input on the Island frames.
 pillShieldState:w=>domRead(strip(w),()=>{const el=document.getElementById('pillShield');if(!el)return null;
  return {hidden:!!el.hidden,off:el.classList.contains('shield-off'),title:el.dataset.tooltip??el.title};}),
 async clickPillShield(w){await strip(w).locator('#pillShield').click();},
 async shieldPopoverState(w){
  const shown=await overlayShown(w);
  const s=await domRead(overlay(w),()=>{
   const pop=document.getElementById('shieldPop');if(!pop)return null;const row=document.getElementById('shieldPopConnection');
   return {visible:!pop.hidden,host:document.getElementById('shieldPopHost').textContent,
    on:document.getElementById('shieldPopToggle').classList.contains('on'),toggleShown:!document.getElementById('shieldPopToggle').hidden,
    connection:row&&!row.hidden?'Connection · '+document.getElementById('shieldPopConnectionValue').textContent:null,
    header:document.querySelector('.shield-pop-state')?.textContent.trim()??'',
    route:document.getElementById('shieldPopRoute')?.hidden===false?{label:document.getElementById('shieldPopRouteLabel').textContent,
     on:document.getElementById('shieldPopRouteToggle').getAttribute('aria-checked')==='true',note:document.getElementById('shieldPopRouteNote').textContent}:null};
  });
  // The overlay document lives in a host iframe; hidden iframe = not shown.
  return s&&{...s,visible:s.visible&&shown};
 },
 async clickShieldPopoverToggle(w){await overlay(w).locator('#shieldPopToggle').click();},
 async clickInsecureBadge(w){
  if(await domRead(strip(w),()=>{const b=document.getElementById('pillInsecure');return !b||b.hidden;}))return false;
  await strip(w).locator('#pillInsecure').click();return true;
 },
 pillInsecureHidden:w=>domRead(strip(w),()=>document.getElementById('pillInsecure')?.hidden??null),
 shieldAriaExpanded:w=>domRead(strip(w),()=>({shield:document.getElementById('pillShield')?.getAttribute('aria-expanded')??null,
  insecure:document.getElementById('pillInsecure')?.getAttribute('aria-expanded')??null})),
 chromeFocusedId:w=>domRead(strip(w),()=>document.activeElement?.id??null),
 async pressOverlayEscape(w){if(!await overlayShown(w))throw Error('overlay is not open');await overlay(w).keyboard.press('Escape');return true;},
 // Exceptions live in the Blanc settings page's own blocking preferences.
 async exceptions(w){return (await (await blockingSettings(w)).eval('window.blancBlockingSettings.get()')).exceptions;},
 // As typed into Settings → Blocking's exception field (it normalizes).
 async addException(w,h){
  const page=await blockingSettings(w);
  await page.eval(`(()=>{const i=document.getElementById('exception-input');i.value=${jsLiteral(String(h))};document.getElementById('exception-form').requestSubmit();})()`);
  await waitFor(()=>page.eval(`document.getElementById('blocking-error').hidden&&!!document.querySelector('#exception-list .site-row')`),Boolean,'exception saved');
 },
 async activeHostname(w){const t=await activeTab(w);return t?blockableHostname(t.committedUrl||t.url):null;},
 allowAdsOnActive:w=>w.api('allowAdsOnActiveSite'),
 // A real mouse click on a tab's page element.
 async clickInTab(w,tabId,selector,modifiers=[]){
  const page=await tabPage(w,tabId);
  if(!await page.evaluate(s=>!!document.querySelector(s),String(selector)))return false;
  await page.locator(String(selector)).click({modifiers});return true;
 },
 // A tab's WebContents identity is its DevTools page target.
 tabWebContentsId:async(w,id)=>(await tabPage(w,id)).targetId??null,
 // Certificate exceptions (N5): the fork shows Chromium's own interstitial and
 // keeps decisions in its SSLHostStateDelegate, which no fork path exposes.
 forgetCertificateExceptionInTab(){throw new UndefinedNativeAdapterError('No fork path forgets a certificate decision (Chromium SSLHostStateDelegate); needs a native test op');},
 forgetCertificateExceptionOnly(){throw new UndefinedNativeAdapterError('No fork path forgets a certificate decision (Chromium SSLHostStateDelegate); needs a native test op');},
 setCertificateExceptionCap(){throw new UndefinedNativeAdapterError('Chromium keeps certificate decisions without Blanc\'s bounded cap; no fork path sets one');},
 // Shipping's chrome document is blanc-chrome://index/, the fork's strip.
 attemptChromeNavigation:(w,url)=>strip(w).evalExpression(`location.href=${jsLiteral(String(url))}`),
 async chromeUrl(w){
  const [host,src]=await w.hostEval(`[location.href,document.getElementById('strip').contentWindow.location.href]`);
  return host===HOST&&src==='chrome://blanc-prototype/index.html'?'blanc-chrome://index/':src;
 },
};
