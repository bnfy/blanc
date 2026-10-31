// Start Page, Favorites/History/Downloads, Glance and first run: shipping
// test-hook names over the fork's Start Page document, its native newtab
// bridge (window.bowserPages), the Island facade and native dispatch.
import {UndefinedNativeAdapterError,nativeId} from '../lib/adapters.mjs';
export const NEWTAB=/^chrome:\/\/(newtab\/|new-tab-page\/|blanc-prototype\/pages\/newtab\.html)/;
// Fork utility pages: the facade opens Chromium's managers as tabs, and the
// Blanc settings hub is a tab too. No Blanc utility sheet exists.
export const UTILITY=/^chrome:\/\/(bookmarks|history|downloads|settings)\/|^chrome:\/\/blanc-prototype\/blocking-settings\.html/;
// Shipping internal URLs as page-initiated navigations would name the fork's
// equivalents (the inverse of shippingPageUrl), so attacks reach real pages.
export function forkInternalUrl(url){
 const m=/^blanc:\/\/([a-z]+)\/?(.*)$/.exec(String(url));if(!m)return String(url);
 if(m[1]==='settings')return 'chrome://blanc-prototype/blocking-settings.html';
 if(m[1]==='newtab')return 'chrome://newtab/';
 return `chrome://${m[1]}/${m[2]}`;
}
// Pick the one visible document among same-URL page targets: CDP targets carry
// no tab id, and only the active tab of a window is visible.
async function visiblePage(w,targets){
 await w.app.refresh();
 const pages=targets.map(t=>w.app.windows().find(p=>p.targetId===t.id)).filter(Boolean);
 if(pages.length===1)return pages[0];
 const shown=[];for(const p of pages)if(await p.evalExpression('document.visibilityState')==='visible')shown.push(p);
 if(shown.length!==1)throw new UndefinedNativeAdapterError('Start Page document is not uniquely addressable ('+shown.length+' visible)');
 return shown[0];
}
async function activeTab(w){const s=await w.snapshot();return s.tabs.find(t=>String(t.id)===String(s.activeTabId));}
// The active tab's Start Page document, or null when it isn't a Start Page.
async function startPage(w){
 const tab=await activeTab(w);if(!tab||!NEWTAB.test(tab.committedUrl||tab.url))return null;
 const targets=(await w.fixture.targets()).filter(t=>t.type==='page'&&NEWTAB.test(t.url));
 return visiblePage(w,targets);
}
// Any Start Page document: profile-wide reads and writes need one renderer.
async function anyStartPage(w){
 const page=await startPage(w);if(page)return page;
 const targets=(await w.fixture.targets()).filter(t=>t.type==='page'&&NEWTAB.test(t.url));
 await w.app.refresh();
 const p=targets.map(t=>w.app.windows().find(x=>x.targetId===t.id)).find(Boolean);
 if(!p)throw Error('No Start Page is open to reach its native bridge');
 return p;
}
const onStart=(fallback,expression)=>async(w,...args)=>{
 const page=await startPage(w);if(!page)return fallback;
 return page.evalExpression(typeof expression==='function'?expression(...args):expression);
};
// The active page's document, for page-initiated attacks.
async function activePage(w){
 const tab=await activeTab(w);
 const targets=(await w.fixture.targets()).filter(t=>t.type==='page'&&t.url===tab.url);
 if(!targets.length)throw Error('Active tab has no page target: '+tab.url);
 return visiblePage(w,targets);
}
async function waitTabSettled(w,id){
 return w.waitFor(()=>w.snapshot(),s=>s.tabs.some(t=>String(t.id)===String(id)&&!t.isLoading),'tab '+id+' to settle',15000);
}
// The heart acts on the host's cached snapshot; refresh it so a tab created
// a moment ago is known rather than silently skipped.
async function toggle(w,id){await w.hostEval('window.BlancPrototypeHost.refresh()');return w.api('toggleBookmark',[String(id)]);}
async function favorites(w){return w.api('listFavorites');}
// Shipping limits history reads to 5000; the facade caps at 300, so a full
// page means the count is unknowable rather than 300.
async function historyItems(w){
 const items=await w.api('listHistory',[{limit:300}]);
 if(items.length>=300)throw new UndefinedNativeAdapterError('History count beyond the facade cap of 300');
 return items;
}
const noSheet=hook=>()=>{throw Error(`${hook}: the fork has no Blanc utility sheet; utility pages open as Chromium manager tabs`);};
const noState=(hook,what)=>()=>{throw new UndefinedNativeAdapterError(`${hook}: the fork stores no ${what}`);};
const toggleIn=(list,cls,attr)=>key=>`(()=>{const item=[...document.querySelectorAll(${JSON.stringify(list)})].find(c=>${attr}===${JSON.stringify(String(key))});
 const button=item?.querySelector(${JSON.stringify(cls)});if(!button)return false;button.focus();button.click();return true;})()`;
const favoriteList="({ledger:'favoritesList',shelf:'shFavorites',tally:'tlFavorites'})[document.body.dataset.layout]";
export const pages={
 // ---- favorites (Chromium's BookmarkModel through the Island heart) ----
 async favoriteActive(w){
  const tab=await activeTab(w);if(!tab)return;
  await waitTabSettled(w,tab.id);
  if(!(await favorites(w)).some(f=>f.url===tab.committedUrl))await toggle(w,tab.id);
 },
 async favoriteAllTabs(w){
  for(const tab of (await w.snapshot()).tabs){
   if(!/^https?:/.test(tab.committedUrl||'')||tab.private)continue;
   if(!(await favorites(w)).some(f=>f.url===tab.committedUrl))await toggle(w,tab.id);
  }
 },
 async activeFavorited(w){const tab=await activeTab(w);return !!tab&&(await favorites(w)).some(f=>f.url===tab.committedUrl);},
 bookmarkUrls:async w=>(await favorites(w)).map(f=>f.url),
 bookmarkRecords:async w=>(await favorites(w)).map(({url,title,folder})=>({url,title,folder})),
 // A user saves a Favorite by visiting the page and pressing the heart; the
 // seed does that in a scratch tab, giving the page the seeded title first
 // (as core's setTabPresentation does). A seeded icon has no fork path.
 async seedFavorite(w,url,title){
  if((await favorites(w)).some(f=>f.url===url))return;
  const before=String((await w.snapshot()).activeTabId);
  const id=(await w.native('createTab',[url])).tabId;
  const settled=await waitTabSettled(w,id);
  const tab=settled.tabs.find(t=>String(t.id)===String(id));
  if(title&&tab.title!==title){
   const targets=(await w.fixture.targets()).filter(t=>t.type==='page'&&t.url===tab.url);
   await (await visiblePage(w,targets)).evalExpression(`document.title=${JSON.stringify(String(title))}`);
   await w.waitFor(()=>w.snapshot(),s=>s.tabs.some(t=>String(t.id)===String(id)&&t.title===title),'seeded title');
  }
  await toggle(w,id);
  await w.native('closeTab',[id]);
  if((await w.snapshot()).tabs.some(t=>String(t.id)===before))await w.native('switchTab',[nativeId(before)]);
  await w.waitFor(()=>favorites(w),l=>l.some(f=>f.url===url),'seeded favorite');
 },
 // ---- history (Chromium's HistoryService) ----
 historyCount:async w=>(await historyItems(w)).length,
 clearHistory:w=>w.api('clearHistory'),
 // A real visit to a loopback page records history; the scratch tab closes.
 async seedHistory(w){
  const url=w.fixtureUrl('seed');const before=String((await w.snapshot()).activeTabId);
  const id=(await w.native('createTab',[url])).tabId;await waitTabSettled(w,id);
  await w.waitFor(()=>historyItems(w),l=>l.some(h=>h.url===url),'seeded history visit');
  await w.native('closeTab',[id]);
  if((await w.snapshot()).tabs.some(t=>String(t.id)===before))await w.native('switchTab',[nativeId(before)]);
 },
 seedBillboardHistory:()=>{throw new UndefinedNativeAdapterError('seedBillboardHistory: named public hosts and cached icons cannot be visited offline; needs a native history-seeding test op');},
 seedBillboardOverflowHistory:()=>{throw new UndefinedNativeAdapterError('seedBillboardOverflowHistory: sixty public hosts cannot be visited offline; needs a native history-seeding test op');},
 // ---- Start Page layout (native layoutRead/layoutWrite via the page) ----
 setNewtabLayout:async(w,layout)=>(await anyStartPage(w)).evalExpression(`window.bowserPages.start.setLayout(${JSON.stringify(String(layout))})`),
 newtabLayout:async w=>(await anyStartPage(w)).evalExpression('window.bowserPages.start.data().then(d=>d.layout)'),
 readNewtabLayoutDom:onStart(null,`(()=>({layout:document.body.dataset.layout??null,
  active:document.querySelector('[data-layout-pick].active')?.dataset.layoutPick??null,
  visible:['Ledger','Billboard','Shelf','Tally'].filter(n=>{const e=document.getElementById('layout'+n);return e&&getComputedStyle(e).display!=='none';})}))()`),
 clickNewtabLayoutSwitcher:onStart(false,name=>`(()=>{const popover=document.getElementById('customizePopover');const opener=document.getElementById('customizeButton');
  if(!popover||!opener)return false;if(!popover.matches(':popover-open')){opener.focus();opener.click();}
  if(!popover.matches(':popover-open'))return false;
  const button=popover.querySelector('[data-layout-pick="${String(name).replace(/[^a-z]/g,'')}"]');if(!button)return false;button.click();return true;})()`),
 openStartCustomize:onStart(false,`(()=>{const popover=document.getElementById('customizePopover');const opener=document.getElementById('customizeButton');
  if(!popover||!opener)return false;if(!popover.matches(':popover-open')){opener.focus();opener.click();}return popover.matches(':popover-open');})()`),
 readStartCustomize:onStart(null,`(()=>({open:document.getElementById('customizePopover')?.matches(':popover-open')??false,
  expanded:document.getElementById('customizeButton')?.getAttribute('aria-expanded')??null,focusedId:document.activeElement?.id??null,
  pressed:[...document.querySelectorAll('[data-layout-pick][aria-pressed="true"]')].map(b=>b.dataset.layoutPick)}))()`),
 // A real key press into the focused Start Page document.
 async pressStartPageKey(w,key){
  const page=await startPage(w);if(!page)return false;
  await page.evalExpression('window.focus(),true');await page.keyboard.press(String(key));return true;
 },
 // ---- Start Page pins (native pinsList/pinsPin/pinsUnpin via the page) ----
 startPagePins:async w=>(await (await anyStartPage(w)).evalExpression('window.bowserPages.pins.list()')).pins.map(({url,title})=>({url,title})),
 clearStartPagePins:async w=>(await anyStartPage(w)).evalExpression(`(async()=>{const p=window.bowserPages.pins;
  for(const pin of (await p.list()).pins)await p.unpin(pin.url);return (await p.list()).pins.length===0;})()`),
 readStartFavorites:onStart(null,`(()=>{const layout=document.body.dataset.layout;const list=${favoriteList};
  const items=list?[...document.getElementById(list).querySelectorAll('[data-favorite-url]')]:[];
  return {layout,favorites:items.map(item=>({url:item.dataset.favoriteUrl,title:item.querySelector('.name')?.textContent??null,
   pinned:item.classList.contains('pinned'),pinLabel:item.querySelector('.fav-pin')?.getAttribute('aria-label')??null,
   pinShown:(()=>{const pin=item.querySelector('.fav-pin');return !!pin&&getComputedStyle(pin).opacity==='1';})()})),
   status:document.getElementById('favoritesPinStatus')?.textContent??'',
   focusedPinOf:document.activeElement?.classList.contains('fav-pin')?document.activeElement.closest('[data-favorite-url]')?.dataset.favoriteUrl??null:null};})()`),
 toggleFavoritePin:onStart(false,title=>`(()=>{const list=${favoriteList};
  const item=list&&[...document.getElementById(list).querySelectorAll('[data-favorite-url]')].find(c=>c.querySelector('.name')?.textContent===${JSON.stringify(String(title))});
  const button=item?.querySelector('.fav-pin');if(!button)return false;button.focus();button.click();return true;})()`),
 readBillboardSites:onStart(null,`(()=>({sites:[...document.querySelectorAll('#bbFavorites .bb-site')].map(item=>({key:item.dataset.siteKey,
  href:item.querySelector('.bb-fav')?.href??null,label:item.querySelector('.label')?.textContent??null,
  hasIcon:item.querySelector('.tile')?.classList.contains('has-icon')??false,dismissLabel:item.querySelector('.bb-site-dismiss')?.getAttribute('aria-label')??null,
  pinned:item.classList.contains('pinned'),pinLabel:item.querySelector('.bb-site-pin')?.getAttribute('aria-label')??null,
  title:item.querySelector('.label')?.title??null,ariaLabel:item.querySelector('.bb-fav')?.getAttribute('aria-label')??null,
  top:Math.round(item.getBoundingClientRect().top),visible:getComputedStyle(item).display!=='none',
  lines:(()=>{const l=item.querySelector('.label');return l?Math.round(l.getBoundingClientRect().height/parseFloat(getComputedStyle(l).lineHeight)):0;})()})),
  hidden:JSON.parse(localStorage.getItem('blanc.billboard.hidden-top-sites.v1')||'[]'),status:document.getElementById('bbTopSitesStatus')?.textContent??'',
  focusedPinOf:document.activeElement?.classList.contains('bb-site-pin')?document.activeElement.closest('.bb-site')?.dataset.siteKey??null:null}))()`),
 toggleBillboardPin:onStart(false,toggleIn('#bbFavorites .bb-site','.bb-site-pin','c.dataset.siteKey')),
 hideBillboardSite:onStart(false,toggleIn('#bbFavorites .bb-site','.bb-site-dismiss','c.dataset.siteKey')),
 setBillboardHidden:onStart(false,keys=>`(()=>{localStorage.setItem('blanc.billboard.hidden-top-sites.v1',${JSON.stringify(JSON.stringify(Array.isArray(keys)?keys.slice(0,200).map(String):[]))});return true;})()`),
 // ---- Start Page geometry reads (the copied shipping DOM) ----
 readStartFrameGeometry:onStart(null,`(()=>{const rect=e=>{if(!e)return null;const s=getComputedStyle(e);if(s.display==='none'||s.visibility==='hidden')return null;
  const r=e.getBoundingClientRect();if(!r.width||!r.height)return null;return {top:r.top,right:r.right,bottom:r.bottom,left:r.left,width:r.width,height:r.height};};
  const layout=document.body.dataset.layout;const rootEl=document.getElementById('layout'+layout.charAt(0).toUpperCase()+layout.slice(1));
  const shellEl=document.getElementById('migrationChecklistShell');const shell=shellEl&&!shellEl.hidden?rect(shellEl):null;
  const content=[...rootEl.querySelectorAll('a, button, h2, .ledger-label, .shelf-card, .tally-chart, .tally-caption, .bb-clock, .bb-blocked, .start-empty-hint')]
   .map(e=>({selector:e.id?'#'+e.id:e.className||e.tagName,rect:rect(e)})).filter(x=>x.rect);
  const patron=document.getElementById('patronCallout');const footerLeft=document.querySelector('#layoutFooter .footer-left');const root=document.documentElement;
  return {layout,private:root.dataset.theme==='private',viewportWidth:innerWidth,viewportHeight:innerHeight,
   maxScrollY:Math.max(0,Math.max(root.scrollHeight,document.body.scrollHeight)-innerHeight),shell,content,footer:rect(document.getElementById('layoutFooter')),
   patronInLayout:!!rootEl.querySelector('.js-patron-callout'),patronInFooterLeft:!!patron&&patron.parentElement===footerLeft,
   patronVisible:!!patron&&!patron.hidden&&!!rect(patron),patron:patron&&!patron.hidden?rect(patron):null,
   emptyHints:[...rootEl.querySelectorAll('.start-empty-hint')].filter(e=>rect(e)).length};})()`),
 readStartBlockedCard:onStart(null,`(()=>{const card=document.getElementById('shBlocked')?.closest('.shelf-card');return !!card&&!card.hidden&&getComputedStyle(card).display!=='none';})()`),
 readShelfGeometry:onStart(null,`(()=>{const rect=e=>{if(!e||e.hidden||getComputedStyle(e).display==='none')return null;const r=e.getBoundingClientRect();
  return {left:Math.round(r.left),right:Math.round(r.right),top:Math.round(r.top),bottom:Math.round(r.bottom)};};
  return {columns:document.getElementById('layoutShelf').dataset.columns??null,viewportWidth:innerWidth,
   tiles:[...document.querySelectorAll('#shFavorites .shelf-tile')].map(rect).filter(Boolean),
   groups:rect(document.querySelector('.shelf-card-groups')),blocked:rect(document.querySelector('.shelf-card-blocked'))};})()`),
 readTallyGeometry:onStart(null,`(()=>{const rect=e=>{if(!e||e.hidden||getComputedStyle(e).display==='none')return null;const r=e.getBoundingClientRect();
  return {left:Math.round(r.left),right:Math.round(r.right),top:Math.round(r.top),bottom:Math.round(r.bottom),width:Math.round(r.width)};};
  return {viewportWidth:innerWidth,private:document.documentElement.dataset.theme==='private',content:rect(document.getElementById('startContent')),
   left:rect(document.querySelector('.tally-left')),right:rect(document.querySelector('.tally-right'))};})()`),
 readBillboardVerticalBox:onStart(null,`(()=>{const shown=[...document.getElementById('layoutBillboard').children].filter(e=>{const s=getComputedStyle(e);const b=e.getBoundingClientRect();
  return !e.hidden&&s.display!=='none'&&s.position!=='absolute'&&b.height>1;});if(!shown.length)return null;
  const top=Math.min(...shown.map(e=>e.getBoundingClientRect().top));const bottom=Math.max(...shown.map(e=>e.getBoundingClientRect().bottom));
  const footerTop=document.getElementById('layoutFooter').getBoundingClientRect().top;const headerBottom=document.querySelector('.start-header').getBoundingClientRect().bottom;
  const round=v=>Math.round(v*10)/10;
  return {layout:document.body.dataset.layout,viewportWidth:innerWidth,headerBottom:round(headerBottom),contentTop:round(top),above:round(top),below:round(footerTop-bottom),
   parts:shown.map(e=>e.id||e.className)};})()`),
 readStartFooterLayout:onStart(null,blockedText=>`(()=>{if(${JSON.stringify(blockedText??null)}!==null)document.getElementById('footerLeft').textContent=${JSON.stringify(blockedText??'')};
  const box=s=>{const e=document.querySelector(s);if(!e||e.hidden||getComputedStyle(e).display==='none')return null;const r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,height:r.height};};
  const items=[...document.querySelectorAll('#layoutFooter .footer-left > *')].filter(e=>!e.hidden&&getComputedStyle(e).display!=='none'&&e.getBoundingClientRect().width>0).map(e=>e.getBoundingClientRect());
  const centres=items.map(r=>Math.round((r.top+r.bottom)/2));
  return {layout:document.body.dataset.layout,viewportWidth:innerWidth,leftOnOneLine:centres.every(c=>Math.abs(c-centres[0])<=4),
   left:box('#layoutFooter .footer-left'),customize:box('#customizeButton'),right:box('#layoutFooter .footer-right'),footer:box('#layoutFooter')};})()`),
 // ---- Start Page footer pills and launch scene ----
 readMigrationChecklistDom:onStart(null,`(()=>{const shell=document.getElementById('migrationChecklistShell');const popover=document.getElementById('migrationChecklist');
  const sync=document.getElementById('migrationSyncTask');const tabs=document.getElementById('migrationTabsTask');const space=document.getElementById('migrationSpaceTask');
  const bounds=e=>{if(!e||getComputedStyle(e).display==='none')return null;const r=e.getBoundingClientRect();return {top:r.top,right:r.right,bottom:r.bottom,left:r.left,width:r.width,height:r.height};};
  return {count:shell?1:0,visible:!!shell&&!shell.hidden&&getComputedStyle(shell).display!=='none',open:!!popover&&popover.matches(':popover-open'),
   progress:shell?.querySelector('.js-migration-progress')?.textContent??null,label:document.getElementById('migrationChecklistLabel')?.textContent??null,
   title:document.getElementById('migrationChecklistTitle')?.textContent??null,syncComplete:sync?.classList.contains('is-complete')??false,
   tabsComplete:tabs?.classList.contains('is-complete')??false,spaceComplete:space?.classList.contains('is-complete')??false,
   expanded:document.getElementById('migrationChecklistCompact')?.getAttribute('aria-expanded')==='true',focused:document.hasFocus(),
   focusedId:document.activeElement?.id??null,layout:document.body.dataset.layout??null,shellBounds:bounds(shell),
   popoverBounds:popover?.matches(':popover-open')?bounds(popover):null,footerBounds:bounds(document.getElementById('layoutFooter')),
   customizeBounds:bounds(document.getElementById('customizeButton')),hideBounds:bounds(document.getElementById('migrationChecklistHide')),
   pillInFooterLeft:!!shell?.closest('#layoutFooter .footer-left'),viewportWidth:innerWidth};})()`),
 clickMigrationChecklist:onStart(false,action=>{const id={sync:'migrationSyncAction',tabs:'migrationTabsAction',space:'migrationSpaceAction',iphone:'migrationIphoneAction',hide:'migrationChecklistHide',compact:'migrationChecklistCompact'}[action];
  const inPopover=['sync','tabs','space'].includes(action);
  return `(()=>{const btn=${id?`document.getElementById('${id}')`:'null'};if(!btn)return false;
   if(${inPopover}){const popover=document.getElementById('migrationChecklist');if(!popover.matches(':popover-open'))document.getElementById('migrationChecklistCompact').click();
    if(!popover.matches(':popover-open'))return false;const box=btn.getBoundingClientRect();if(!box.width||!box.height)return false;}
   btn.focus();btn.click();return true;})()`;}),
 clickPatronCalloutClose:onStart(false,`(()=>{const btn=document.getElementById('patronCalloutHide');if(!btn||btn.closest('[hidden]'))return false;btn.click();return document.getElementById('patronCallout').hidden;})()`),
 readLaunchSunrise:onStart(null,`(()=>{const scene=document.getElementById('launchSunrise');
  if(!scene)return {present:false,layoutReady:document.body.classList.contains('layout-ready')};const style=getComputedStyle(scene);
  return {present:true,shown:!scene.hidden&&style.display!=='none',pointerEvents:style.pointerEvents,
   animations:scene.getAnimations({subtree:true}).map(a=>a.animationName).sort(),layoutReady:document.body.classList.contains('layout-ready')};})()`),
 readMahjongFooterLink:onStart(null,`(()=>({href:document.getElementById('mahjongLink')?.href??null,target:document.getElementById('mahjongLink')?.target??null,
  layout:document.body.dataset.layout,switcherCount:document.querySelectorAll('[data-layout-pick]').length,frameCount:document.querySelectorAll('iframe').length}))()`),
 clickMahjongFooterLink:onStart(false,`(()=>{const link=document.getElementById('mahjongLink');if(!link)return false;link.click();return true;})()`),
 // The fork ships no Mahjong page (no pages/mahjong.html asset).
 ...Object.fromEntries(['readMahjongDom','readMahjongCompletionGeometry','rapidUndoMahjongMatch','auditMahjongCorrectness','readMahjongDealState',
  'copyMahjongDealFromBoards','readMahjongRecordsGeometry'].map(h=>[h,()=>{throw Error(h+': the fork ships no Mahjong page');}])),
 // Durable first-run, checklist, Patron and launch-scene settings live in
 // Electron main; the fork's Start Page bridge carries none of them.
 firstRunState:noState('firstRunState','first-run completion or privacy choices'),
 resetMigrationChecklist:noState('resetMigrationChecklist','migration-checklist progress'),
 setPatronCalloutDismissedAt:noState('setPatronCalloutDismissedAt','Patron callout snooze clock'),
 patronCalloutDismissedAt:noState('patronCalloutDismissedAt','Patron callout snooze clock'),
 setLaunchSunrise:noState('setLaunchSunrise','launch Sunrise setting'),
 // ---- utility pages: the facade's openPage is the production command ----
 openFavoritesSheet:w=>w.api('openPage',['bookmarks']),
 openHistorySheet:w=>w.api('openPage',['history']),
 openDownloads:w=>w.api('openPage',['downloads']),
 // Where a utility page shows: the fork has no sheet, so the surface is the
 // active tab when it is a utility page; `kind` says so. Shipping's URL and
 // tab-count assertions then judge the difference.
 async utilitySurface(w){
  const tab=await activeTab(w);const url=tab?.committedUrl||tab?.url||'';
  if(!UTILITY.test(url))return {visible:false,ready:false,url:null,kind:'tab'};
  const {shippingPageUrl}=await import('../lib/page-shim.mjs');
  return {visible:true,ready:!tab.isLoading,url:shippingPageUrl(url),kind:'tab'};
 },
 async closeUtilitySurface(){throw Error('closeUtilitySurface: the fork has no utility sheet to dismiss');},
 utilitySheetRowIcons:noSheet('utilitySheetRowIcons'),
 historyDayHeadings:noSheet('historyDayHeadings'),
 clickFirstSheetLink:noSheet('clickFirstSheetLink'),
 utilitySheetContentsId:noSheet('utilitySheetContentsId'),
 destroyUtilitySheetContents:noSheet('destroyUtilitySheetContents'),
 utilitySheetPalette:noSheet('utilitySheetPalette'),
 readFavoritesSheetPins:noSheet('readFavoritesSheetPins'),
 toggleFavoritesSheetPin:noSheet('toggleFavoritesSheetPin'),
 // The Ledger's Favorites heading link, clicked as a person would.
 async followNewtabFavoritesLink(w){
  const page=await startPage(w);if(!page)throw Error('newtab ledger is not the active tab');
  const clicked=await page.evalExpression(`(()=>{const a=document.querySelector('a[href="blanc://bookmarks/"], a[href="chrome://bookmarks/"]');if(a)a.click();return !!a;})()`);
  if(!clicked)throw Error('newtab ledger has no favorites link');
 },
 // F16-6 attack drivers: run in the active page and resolve after it ran.
 async attemptNavigateActiveTab(w,url){
  const ran=await (await activePage(w)).evalExpression(`(()=>{location.href=${JSON.stringify(forkInternalUrl(url))};return true;})()`);
  if(ran!==true)throw Error('navigation attempt did not execute');
 },
 async attemptWindowOpenActiveTab(w,url){
  const ran=await (await activePage(w)).evalExpression(`(()=>{window.open(${JSON.stringify(forkInternalUrl(url))});return true;})()`);
  if(ran!==true)throw Error('window.open attempt did not execute');
 },
 // Fork steps read the active Start Page through this (null when it isn't).
 executeStartPage:onStart(null,source=>String(source)),
 // ---- Glance: the fork's only Glance primitive is the native 0.62 split
 // preview (previewGlancePair); it has no floating card. ----
 async setGlance(w,id){
  const s=await w.snapshot();
  return w.api('previewGlancePair',[String(s.activeTabId),String(id)]);
 },
 async closeGlance(w){const s=await w.snapshot();if(s.glanceTabId==null)return false;await w.api('previewGlanceClose',[String(s.glanceTabId)]);return true;},
 getGlanceCard:()=>{throw Error('getGlanceCard: the fork shows Glance as a side-by-side split preview, not a floating card');},
 glanceHeaderMotion:()=>{throw Error('glanceHeaderMotion: the fork has no Glance card header');},
};
