// Start Page, Favorites/History/Downloads, Glance and first run: shipping
// test-hook names over the fork's Start Page document, its native newtab
// bridge (window.bowserPages), the Island facade and native dispatch.
import {LAYOUT_WIDGETS,PAGE_LAYOUT} from '../lib/start-widgets.mjs';
import {tabPage} from './core.mjs';
import {UndefinedNativeAdapterError,nativeId} from '../lib/adapters.mjs';
import {jsLiteral} from '../lib/js-literal.mjs';
import {inSettings,readSettings} from './commands.mjs';
export const NEWTAB=/^chrome:\/\/(newtab\/|new-tab-page\/|blanc-prototype\/pages\/newtab\.html)/;
// Fork utility pages shown as tabs: Chromium's managers and Settings, when
// opened other than through the Island, whose sheet shows them otherwise.
export const UTILITY=/^chrome:\/\/(bookmarks|history|downloads|settings)\//;
// Shipping internal URLs as page-initiated navigations would name the fork's
// equivalents (the inverse of shippingPageUrl), so attacks reach real pages.
export function forkInternalUrl(url){
 const m=/^blanc:\/\/([a-z]+)\/?(.*)$/.exec(String(url));if(!m)return String(url);
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
 // A restored quiet Start Page may expose a target without a renderer.
 // Evaluating visibility on it times out (or wakes unrelated work). The
 // native tab-target mapping identifies exactly the selected document.
 return tabPage(w,tab.id);
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
// The utility sheet is a frame of the Island host (host.js showSheet); its
// document answers shipping's sheet reads.
const sheetState=w=>w.hostEval('window.BlancPrototypeHost.sheetState()');
const onSheet=(w,expression)=>w.hostEval(`(()=>{const document=window.document.getElementById('sheet')?.contentDocument;
 if(!document||document.location.href==='about:blank')return null;const location=document.location;return (${expression});})()`);
const noState=(hook,what)=>()=>{throw new UndefinedNativeAdapterError(`${hook}: the fork stores no ${what}`);};
const toggleIn=(list,cls,attr)=>key=>`(()=>{const item=[...document.querySelectorAll(${jsLiteral(list)})].find(c=>${attr}===${jsLiteral(String(key))});
 const button=item?.querySelector(${jsLiteral(cls)});if(!button)return false;button.focus();button.click();return true;})()`;
// V24 (owner, 2026-11-13): Billboard is the one layout, and the Favorites
// widget is Ledger's list (six favorites, pins first), whatever layout a
// scenario names. The old layouts are the widget sets the one-time migration
// gives them (blanc_prototype_ui.cc widgetsRead).
const favoriteList="'favoritesList'";
const layoutOfWidgets=widgets=>Object.keys(LAYOUT_WIDGETS).find(name=>
 Object.entries(LAYOUT_WIDGETS[name]).every(([k,v])=>widgets?.[k]===v))??'custom';
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
 // (as core's setTabPresentation does). The page itself never really loads
 // in the offline fixture, so it seeds a production-accepted PNG favicon
 // too (F9-3) via the native seedFavicon op.
 async seedFavorite(w,url,title){
  if((await favorites(w)).some(f=>f.url===url))return;
  const before=String((await w.snapshot()).activeTabId);
  const id=(await w.native('createTab',[url])).tabId;
  const settled=await waitTabSettled(w,id);
  const tab=settled.tabs.find(t=>String(t.id)===String(id));
  if(title&&tab.title!==title){
   const targets=(await w.fixture.targets()).filter(t=>t.type==='page'&&t.url===tab.url);
   await (await visiblePage(w,targets)).evalExpression(`document.title=${jsLiteral(String(title))}`);
   await w.waitFor(()=>w.snapshot(),s=>s.tabs.some(t=>String(t.id)===String(id)&&t.title===title),'seeded title');
  }
  await toggle(w,id);
  await w.native('seedFavicon',[url]);
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
 seedBillboardHistory:w=>w.native('seedBillboardHistory',[]),
 seedBillboardOverflowHistory:w=>w.native('seedBillboardOverflowHistory',[]),
 // ---- Start Page layout (native layoutRead/layoutWrite via the page) ----
 setNewtabLayout:async(w,layout)=>{
  const want=LAYOUT_WIDGETS[String(layout)];if(!want)throw Error('Unknown start-page layout '+layout);
  return (await anyStartPage(w)).evalExpression(`(async()=>{const start=window.bowserPages.start;
   for(const [name,on] of Object.entries(${JSON.stringify(want)}))await start.setWidget(name,on);return ${jsLiteral(String(layout))};})()`);
 },
 newtabLayout:async w=>layoutOfWidgets(await (await anyStartPage(w)).evalExpression('window.bowserPages.start.data().then(d=>d.widgets)')),
 readNewtabLayoutDom:onStart(null,`(()=>({layout:${PAGE_LAYOUT},
  active:${PAGE_LAYOUT},
  visible:['Ledger','Billboard','Shelf','Tally'].filter(n=>{const e=document.getElementById('layout'+n);return e&&getComputedStyle(e).display!=='none';})}))()`),
 clickNewtabLayoutSwitcher:onStart(false,name=>`(()=>{const popover=document.getElementById('customizePopover');const opener=document.getElementById('customizeButton');
  if(!popover||!opener)return false;if(!popover.matches(':popover-open')){opener.focus();opener.click();}
  if(!popover.matches(':popover-open'))return false;
  const want=${JSON.stringify(LAYOUT_WIDGETS[String(name)]??null)};if(!want)return false;
  return (async()=>{for(const [pick,on] of Object.entries(want)){const button=popover.querySelector('[data-widget-pick="'+pick+'"]');if(!button)return false;
   if((button.getAttribute('aria-checked')==='true')===on)continue;button.click();
   for(let i=0;i<100&&(button.hasAttribute('aria-disabled')||(button.getAttribute('aria-checked')==='true')!==on);i++)await new Promise(r=>setTimeout(r,50));}
   return true;})();})()`),
 openStartCustomize:onStart(false,`(()=>{const popover=document.getElementById('customizePopover');const opener=document.getElementById('customizeButton');
  if(!popover||!opener)return false;if(!popover.matches(':popover-open')){opener.focus();opener.click();}return popover.matches(':popover-open');})()`),
 readStartCustomize:onStart(null,`(()=>({open:document.getElementById('customizePopover')?.matches(':popover-open')??false,
  expanded:document.getElementById('customizeButton')?.getAttribute('aria-expanded')??null,focusedId:document.activeElement?.id??null,
  pressed:document.querySelector('[data-widget-pick]')?[${PAGE_LAYOUT}]:[]}))()`),
 // A real key press into the focused Start Page document.
 async pressStartPageKey(w,key){
  const page=await startPage(w);if(!page)return false;
  await page.evalExpression('window.focus(),true');await page.keyboard.press(String(key));return true;
 },
 // ---- Start Page pins (native pinsList/pinsPin/pinsUnpin via the page) ----
 startPagePins:async w=>(await (await anyStartPage(w)).evalExpression('window.bowserPages.pins.list()')).pins.map(({url,title})=>({url,title})),
 clearStartPagePins:async w=>(await anyStartPage(w)).evalExpression(`(async()=>{const p=window.bowserPages.pins;
  for(const pin of (await p.list()).pins)await p.unpin(pin.url);return (await p.list()).pins.length===0;})()`),
 readStartFavorites:onStart(null,`(()=>{const layout='ledger';const list=${favoriteList};
  const items=list?[...document.getElementById(list).querySelectorAll('[data-favorite-url]')]:[];
  return {layout,favorites:items.map(item=>({url:item.dataset.favoriteUrl,title:item.querySelector('.name')?.textContent??null,
   pinned:item.classList.contains('pinned'),pinLabel:item.querySelector('.fav-pin')?.getAttribute('aria-label')??null,
   pinShown:(()=>{const pin=item.querySelector('.fav-pin');return !!pin&&getComputedStyle(pin).opacity==='1';})()})),
   status:document.getElementById('favoritesPinStatus')?.textContent??'',
   focusedPinOf:document.activeElement?.classList.contains('fav-pin')?document.activeElement.closest('[data-favorite-url]')?.dataset.favoriteUrl??null:null};})()`),
 toggleFavoritePin:onStart(false,title=>`(()=>{const list=${favoriteList};
  const item=list&&[...document.getElementById(list).querySelectorAll('[data-favorite-url]')].find(c=>c.querySelector('.name')?.textContent===${jsLiteral(String(title))});
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
 setBillboardHidden:onStart(false,keys=>`(()=>{localStorage.setItem('blanc.billboard.hidden-top-sites.v1',${jsLiteral(JSON.stringify(Array.isArray(keys)?keys.slice(0,200).map(String):[]))});return true;})()`),
 // ---- Start Page geometry reads (the copied shipping DOM) ----
 readStartFrameGeometry:onStart(null,`(()=>{const rect=e=>{if(!e)return null;const s=getComputedStyle(e);if(s.display==='none'||s.visibility==='hidden')return null;
  const r=e.getBoundingClientRect();if(!r.width||!r.height)return null;return {top:r.top,right:r.right,bottom:r.bottom,left:r.left,width:r.width,height:r.height};};
  const layout=${PAGE_LAYOUT};const rootEl=document.getElementById('layoutBillboard');
  const shellEl=document.getElementById('migrationChecklistShell');const shell=shellEl&&!shellEl.hidden?rect(shellEl):null;
  const content=[...rootEl.querySelectorAll('a, button, h2, .ledger-label, .shelf-card, .tally-chart, .tally-caption, .bb-clock, .bb-blocked, .start-empty-hint')]
   .map(e=>({selector:e.id?'#'+e.id:e.className||e.tagName,rect:rect(e)})).filter(x=>x.rect);
  const patron=document.getElementById('patronCallout');const footerLeft=document.querySelector('#layoutFooter .footer-left');const root=document.documentElement;
  return {layout,private:root.dataset.theme==='private',viewportWidth:innerWidth,viewportHeight:innerHeight,
   maxScrollY:Math.max(0,Math.max(root.scrollHeight,document.body.scrollHeight)-innerHeight),shell,content,footer:rect(document.getElementById('layoutFooter')),
   patronInLayout:!!rootEl.querySelector('.js-patron-callout'),patronInFooterLeft:!!patron&&patron.parentElement===footerLeft,
   patronVisible:!!patron&&!patron.hidden&&!!rect(patron),patron:patron&&!patron.hidden?rect(patron):null,
   emptyHints:[...rootEl.querySelectorAll('.start-empty-hint')].filter(e=>rect(e)).length};})()`),
 // V24: the Start Page's widgets as drawn: which are on, which show, the
 // Favorites widget's rows and Billboard's tile limit.
 readStartWidgets:onStart(null,`(()=>{const rect=e=>{if(!e||e.hidden||getComputedStyle(e).display==='none')return null;const r=e.getBoundingClientRect();
  if(!r.width||!r.height)return null;return {left:Math.round(r.left),right:Math.round(r.right),top:Math.round(r.top),bottom:Math.round(r.bottom),width:Math.round(r.width)};};
  const section=n=>document.querySelector('#bbWidgets [data-widget="'+n+'"]');
  return {root:document.body.dataset.layout,viewportWidth:innerWidth,viewportHeight:innerHeight,
   visibleRoots:['Ledger','Billboard','Shelf','Tally'].filter(n=>rect(document.getElementById('layout'+n))),
   widgets:typeof state==='object'?state.widgets:null,
   switches:Object.fromEntries([...document.querySelectorAll('[data-widget-pick]')].map(b=>[b.dataset.widgetPick,b.getAttribute('aria-checked')==='true'])),
   shown:Object.fromEntries(['favorites','devices','chart'].map(n=>[n,!!rect(section(n))])),
   cards:Object.fromEntries(['favorites','devices','chart'].map(n=>[n,rect(section(n))])),
   favoriteRows:[...document.querySelectorAll('#favoritesList [data-favorite-url]')].map(rect).filter(Boolean),
   footer:rect(document.getElementById('layoutFooter')),
   tileLimit:typeof billboardSiteCount==='function'?billboardSiteCount():null};})()`),
 // V24: the week's count lives in the chart widget (Shelf's blocked card is gone).
 readStartBlockedCard:onStart(null,`(()=>{const e=document.querySelector('#bbWidgets .bb-widget-chart .tally-right');if(!e||e.hidden)return false;
  const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(e).visibility!=='hidden';})()`),
 readShelfGeometry:onStart(null,`(()=>{const rect=e=>{if(!e||e.hidden||getComputedStyle(e).display==='none')return null;const r=e.getBoundingClientRect();
  return {left:Math.round(r.left),right:Math.round(r.right),top:Math.round(r.top),bottom:Math.round(r.bottom)};};
  return {columns:document.getElementById('layoutShelf').dataset.columns??null,viewportWidth:innerWidth,
   tiles:[...document.querySelectorAll('#shFavorites .shelf-tile')].map(rect).filter(Boolean),
   groups:rect(document.querySelector('.shelf-card-groups')),blocked:rect(document.querySelector('.shelf-card-blocked'))};})()`),
 readTallyGeometry:onStart(null,`(()=>{const rect=e=>{if(!e||e.hidden||getComputedStyle(e).display==='none')return null;const r=e.getBoundingClientRect();
  return {left:Math.round(r.left),right:Math.round(r.right),top:Math.round(r.top),bottom:Math.round(r.bottom),width:Math.round(r.width)};};
  return {viewportWidth:innerWidth,private:document.documentElement.dataset.theme==='private',content:rect(document.getElementById('startContent')),
   left:rect(document.querySelector('#bbWidgets [data-widget="favorites"]')),right:rect(document.querySelector('#bbWidgets [data-widget="chart"]'))};})()`),
 readBillboardVerticalBox:onStart(null,`(()=>{const shown=[...document.getElementById('layoutBillboard').children].filter(e=>{const s=getComputedStyle(e);const b=e.getBoundingClientRect();
  return !e.hidden&&s.display!=='none'&&s.position!=='absolute'&&b.height>1;});if(!shown.length)return null;
  const top=Math.min(...shown.map(e=>e.getBoundingClientRect().top));const bottom=Math.max(...shown.map(e=>e.getBoundingClientRect().bottom));
  const footerTop=document.getElementById('layoutFooter').getBoundingClientRect().top;const headerBottom=document.querySelector('.start-header').getBoundingClientRect().bottom;
  const round=v=>Math.round(v*10)/10;
  return {layout:${PAGE_LAYOUT},viewportWidth:innerWidth,headerBottom:round(headerBottom),contentTop:round(top),above:round(top),below:round(footerTop-bottom),
   parts:shown.map(e=>e.id||e.className)};})()`),
 readStartFooterLayout:onStart(null,blockedText=>`(()=>{if(${jsLiteral(blockedText??null)}!==null)document.getElementById('footerLeft').textContent=${jsLiteral(blockedText??'')};
  const box=s=>{const e=document.querySelector(s);if(!e||e.hidden||getComputedStyle(e).display==='none')return null;const r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,height:r.height};};
  const items=[...document.querySelectorAll('#layoutFooter .footer-left > *')].filter(e=>!e.hidden&&getComputedStyle(e).display!=='none'&&e.getBoundingClientRect().width>0).map(e=>e.getBoundingClientRect());
  const centres=items.map(r=>Math.round((r.top+r.bottom)/2));
  return {layout:${PAGE_LAYOUT},viewportWidth:innerWidth,leftOnOneLine:centres.every(c=>Math.abs(c-centres[0])<=4),
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
   focusedId:document.activeElement?.id??null,layout:${PAGE_LAYOUT},shellBounds:bounds(shell),
   popoverBounds:popover?.matches(':popover-open')?bounds(popover):null,footerBounds:bounds(document.getElementById('layoutFooter')),
   customizeBounds:bounds(document.getElementById('customizeButton')),hideBounds:bounds(document.getElementById('migrationChecklistHide')),
   pillInFooterLeft:!!shell?.closest('#layoutFooter .footer-left'),viewportWidth:innerWidth};})()`),
 async clickMigrationChecklist(w,action){const page=await startPage(w);if(!page)return false;const id={sync:'migrationSyncAction',tabs:'migrationTabsAction',space:'migrationSpaceAction',iphone:'migrationIphoneAction',hide:'migrationChecklistHide',compact:'migrationChecklistCompact'}[action];
  const inPopover=['sync','tabs','space','iphone'].includes(action);
  if(!id)return false;
  // The navigation can finish before asynchronous Start Page data paints the
  // checklist. Wait for the actual available task, then retain the popover
  // and visible button checks below. No hidden task is treated as actionable.
  await w.waitFor(()=>page.evaluate(id=>{
   const shell=document.getElementById('migrationChecklistShell'),button=document.getElementById(id);
   if(!shell||!button||shell.hidden||button.closest('[hidden]'))return false;
   const box=shell.getBoundingClientRect();return box.width>0&&box.height>0;
  },id),Boolean,'rendered moving-in checklist task '+action);
  return page.evalExpression(`(()=>{const btn=${id?`document.getElementById('${id}')`:'null'};if(!btn)return false;
   if(${inPopover}){const popover=document.getElementById('migrationChecklist');if(!popover.matches(':popover-open'))document.getElementById('migrationChecklistCompact').click();
    if(!popover.matches(':popover-open'))return false;const box=btn.getBoundingClientRect();if(!box.width||!box.height)return false;}
   btn.focus();btn.click();return true;})()`);},
 clickPatronCalloutClose:onStart(false,`(()=>{const btn=document.getElementById('patronCalloutHide');if(!btn||btn.closest('[hidden]'))return false;btn.click();return document.getElementById('patronCallout').hidden;})()`),
 readLaunchSunrise:onStart(null,`(()=>{const scene=document.getElementById('launchSunrise');
  if(!scene)return {present:false,layoutReady:document.body.classList.contains('layout-ready')};const style=getComputedStyle(scene);
  return {present:true,shown:!scene.hidden,pointerEvents:style.pointerEvents,
   animations:[scene,...scene.querySelectorAll('.launch-sunrise-sky,.launch-sunrise-horizon,.launch-sunrise-mark .launch-sunrise-disc,.launch-sunrise-rays,.launch-sunrise-reflect')].flatMap(el=>getComputedStyle(el).animationName.split(', ')),layoutReady:document.body.classList.contains('layout-ready')};})()`),
 readMahjongFooterLink:onStart(null,`(()=>({href:document.getElementById('mahjongLink')?.href??null,target:document.getElementById('mahjongLink')?.target??null,
  layout:${PAGE_LAYOUT},switcherCount:document.querySelectorAll('[data-widget-pick]').length,frameCount:document.querySelectorAll('iframe').length}))()`),
 clickMahjongFooterLink:onStart(false,`(()=>{const link=document.getElementById('mahjongLink');if(!link)return false;link.click();return true;})()`),
 // Patron and the app icon (F17). The preview has no license keys (owner,
 // 2026-11-05), so there is never a supporter to clear.
 clearSupporter:async()=>true,
 appIcon:async w=>(await w.snapshot()).appIcon,
 setAppIcon:(w,id)=>inSettings(w,'appearance',async(a,d)=>{const select=d.find('#blancAppIcon')?.shadowRoot?.querySelector('select');
  if(!select)return {missing:'#blancAppIcon'};if([...select.options].some(o=>o.value===a)){select.value=a;select.dispatchEvent(new Event('change',{bubbles:true}));await new Promise(r=>setTimeout(r,300));}
  return {value:select.value};},String(id)),
 clickPatronCheckout:w=>inSettings(w,'help',(a,d)=>{const row=d.find('#patronCheckout');if(!row)return {missing:'#patronCheckout'};
  // After the reply: the click closes the sheet this page lives in.
  setTimeout(()=>row.click(),50);return {value:true};}),
 // First run (F36). Test profiles finish it at launch, as shipping's do.
 firstRunState:w=>w.native('firstRunState'),
 setUsagePing:(w,on)=>w.native('setUsagePing',[!!on]),
 tabArchiveSetting:async w=>(await w.native('firstRunState')).tabArchive,
 // Shipping pushes a synthetic status; here the page reloads and reads the
 // real one, with suggestions on and the ping off on screen.
 async showTestFirstRunMigration(w){
  const page=await startPage(w);if(!page)return false;
  await w.native('setFirstRunPending',[true]);await w.native('setUsagePing',[false]);
  await page.evalExpression('location.reload()');return true;
 },
 readOnboardingDom:onStart(null,`({shown:!(document.getElementById('onboardDialog')?.hidden??true),step:document.getElementById('onboardDialog')?.dataset.step??null})`),
 skipOnboarding:onStart(false,`(()=>{const skip=document.getElementById('obSkip');if(!skip||document.getElementById('onboardDialog').hidden)return false;skip.click();return true;})()`),
 advanceOnboardingTo:onStart(false,step=>`(async()=>{const dialog=document.getElementById('onboardDialog');if(!dialog||dialog.hidden)return false;
  for(let i=0;i<200&&Number(dialog.dataset.step)<${Number(step)};i+=1){const next=document.getElementById('obNext');if(!next.disabled)next.click();await new Promise(r=>setTimeout(r,25));}
  return dialog.dataset.step==='${Number(step)}';})()`),
 readOnboardingArchiveOffer:onStart(null,`(()=>{const row=document.getElementById('obArchiveRow');const toggle=document.getElementById('obArchive');
  return {hidden:!row||row.hidden||row.closest('section')?.hidden===true,checked:toggle?.getAttribute('aria-checked')==='true',label:row?.textContent.replace(/\\s+/g,' ').trim()??''};})()`),
 clickOnboarding:onStart(false,selector=>`(()=>{const el=document.querySelector(${jsLiteral(String(selector))});if(!el||el.disabled||document.getElementById('onboardDialog').hidden)return false;el.click();return true;})()`),
 sendOnboardingSet:onStart(false,partial=>`window.bowserPages.start.onboardingSet(${jsLiteral(partial??{})}).then(()=>true)`),
 readFirstRunMigrationDom:onStart(null,`({initialReady:(document.getElementById('footerLeft')?.textContent??'').length>0,
  privacyHidden:document.getElementById('onboardDialog')?.hidden??true,migrationHidden:document.querySelector('#obContent [data-step="1"]')?.hidden??true,
  findHidden:document.getElementById('obLook')?.hidden??true,options:[...document.querySelectorAll('#obSources .ob-src-row')].map(row=>row.textContent),
  status:document.getElementById('obImportStatus')?.textContent??'',bringTabsHidden:document.getElementById('obBringTabs')?.hidden??true,
  bringTabsLabel:document.getElementById('obBringTabs')?.textContent??'',step:document.getElementById('onboardDialog')?.dataset.step??null})`),
 openFirstRunImportStep:onStart(false,`(()=>{const dialog=document.getElementById('onboardDialog');if(!dialog||dialog.hidden)return false;
  if(dialog.dataset.step==='0')document.getElementById('obNext').click();return dialog.dataset.step==='1';})()`),
 clickFirstRunMigrationFind:onStart(false,`(()=>{const button=document.getElementById('obLook');if(!button||button.hidden)return false;button.click();return true;})()`),
 clickFirstRunMigration:onStart(false,`(()=>{const dialog=document.getElementById('onboardDialog');if(!dialog||dialog.hidden||dialog.dataset.step!=='1')return false;
  const rows=[...document.querySelectorAll('#obSources .ob-src-row')].filter(row=>!row.textContent.includes('bookmarks file'));if(!rows.length)return false;
  if(!rows[0].classList.contains('selected'))rows[0].click();document.getElementById('obNext').click();return true;})()`),
 async auditOnboardingInvitationTypography(w){
  const page=await startPage(w);if(!page)return null;
  const reset=`(async()=>{const dialog=document.getElementById('onboardDialog');if(!dialog||dialog.hidden)return false;
   const waitFor=async expected=>{for(let i=0;i<80;i+=1){if(dialog.dataset.step===String(expected))return true;await new Promise(r=>setTimeout(r,25));}return false;};
   while(Number(dialog.dataset.step)>0){const expected=Number(dialog.dataset.step)-1;document.getElementById('obBack').click();if(!(await waitFor(expected)))return false;}return true;})()`;
  const capture=async(theme,forward)=>{
   await page.evalExpression('1');await page.cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:theme}]});
   return page.evalExpression(`(async()=>{const dialog=document.getElementById('onboardDialog');const content=document.getElementById('obContent');
    const waitFor=async predicate=>{for(let i=0;i<120;i+=1){if(predicate())return true;await new Promise(r=>setTimeout(r,25));}return false;};
    if(!dialog||dialog.hidden)return null;const dark=${JSON.stringify(theme==='dark')};
    if(!(await waitFor(()=>matchMedia('(prefers-color-scheme: dark)').matches===dark)))throw new Error('theme did not settle');
    await document.fonts.ready;const order=${forward?'[0,1,2,3,4,5]':'[5,4,3,2,1,0]'};const steps=[];
    for(let index=0;index<order.length;index+=1){const step=order[index];
     if(!(await waitFor(()=>dialog.dataset.step===String(step))))throw new Error('onboarding step did not settle: '+step);
     const section=document.querySelector('#obContent [data-step="'+step+'"]');const title=section.querySelector('h1');const style=getComputedStyle(title);
     const titleRect=title.getBoundingClientRect();const contentRect=content.getBoundingClientRect();const next=document.getElementById('obNext');next.focus();const focus=getComputedStyle(next);
     steps.push({step,text:title.textContent,font:style.fontFamily,size:style.fontSize,weight:style.fontWeight,lineHeight:style.lineHeight,tracking:style.letterSpacing,opticalSizing:style.fontOpticalSizing,
      insideContent:titleRect.left>=contentRect.left-1&&titleRect.right<=contentRect.right+1,horizontalOverflow:section.scrollWidth>section.clientWidth+1,focusOutline:focus.outlineStyle!=='none'&&parseFloat(focus.outlineWidth)>=1});
     if(index<order.length-1)document.getElementById(${forward?"'obNext'":"'obBack'"}).click();}
    return {theme:dark?'dark':'light',fontLoaded:document.fonts.check('22px "Instrument Sans"'),dialogOverflow:dialog.scrollWidth>dialog.clientWidth+1,pageOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+1,steps};})()`);
  };
  // Playwright emulates focus for shipping's audit; without it a background
  // test window never matches :focus-visible.
  await page.evalExpression('1');await page.cdp.send('Emulation.setFocusEmulationEnabled',{enabled:true});
  try{if(!(await page.evalExpression(reset)))return null;const light=await capture('light',true);const dark=await capture('dark',false);return {light,dark};}
  finally{await page.cdp.send('Emulation.setEmulatedMedia',{features:[]});await page.cdp.send('Emulation.setFocusEmulationEnabled',{enabled:false});}
 },
 // The Favorites sheet's import controls (F30).
 readBrowserImportDom:w=>onSheet(w,`({options:[...document.querySelectorAll('#browserSource option')].map(o=>({value:o.value,label:o.textContent})),
  buttonHidden:document.getElementById('browserImportBtn')?.hidden??true,findHidden:document.getElementById('browserFindBtn')?.hidden??true,status:document.getElementById('importStatus')?.textContent??''})`),
 clickBrowserFind:w=>onSheet(w,`(()=>{const button=document.getElementById('browserFindBtn');if(!button||button.hidden)return false;button.click();return true;})()`),
 selectBrowserSource:(w,label)=>onSheet(w,`((label)=>{const select=document.getElementById('browserSource');const option=[...(select?.options??[])].find(o=>o.textContent===label&&!o.disabled);
  if(!option)return false;select.value=option.value;select.dispatchEvent(new Event('change',{bubbles:true}));return true;})(${jsLiteral(String(label))})`),
 clickBrowserImport:w=>onSheet(w,`(()=>{const button=document.getElementById('browserImportBtn');if(!button||button.hidden)return false;button.click();return true;})()`),
 migrationChecklistSettings:w=>w.native('checklistProgress',[]),
 async setMigrationChecklistProgress(w,...args){await w.native('checklistProgress',args);return true;},
 // Shipping's reset; the fork keeps only the default-browser task's state.
 async resetMigrationChecklist(w){
  await w.native('resetChecklist');const page=await startPage(w);if(page)await page.evalExpression("window.blancNewTabEvent('checklist')");
  return {dismissed:false,syncComplete:false,tabsComplete:false,spaceComplete:false};
 },
 setPatronCalloutDismissedAt:(w,ms)=>w.native('patronCalloutDismissedAt',[Number(ms)]),
 patronCalloutDismissedAt:w=>w.native('patronCalloutDismissedAt',[]),
 setLaunchSunrise:(w,enabled)=>w.native('setLaunchSunrise',[Boolean(enabled)]),
 // ---- utility pages: the facade's openPage is the production command ----
 openFavoritesSheet:w=>w.api('openPage',['bookmarks']),
 openHistorySheet:w=>w.api('openPage',['history']),
 openDownloads:w=>w.api('openPage',['downloads']),
 // Where a utility page shows: the sheet when it is open, else the active
 // tab when it is a utility page (Settings, until S1.7); `kind` says which.
 async utilitySurface(w){
  const native=await w.native('settingsSheetState',[]);
  if(native.attached){
   const page=await readSettings(w,(_a,d)=>({path:location.pathname,
    ready:document.readyState==='complete' && (location.pathname!=='/sync' ||
     !!d.find('settings-blanc-sync-page[blanc-ready]'))}));
   // Shipping's logical section URL, derived from the native target's actual
   // location. The product still uses chrome://settings/sync (S4a decision).
   return {visible:native.visible===true,ready:!!page?.ready,
    url:page?.path==='/sync'?'blanc://settings/#group-sync':'blanc://settings/',kind:'sheet'};
  }
  const sheet=await sheetState(w);
  if(sheet.visible)return {visible:true,ready:sheet.ready,url:sheet.url,kind:'sheet'};
  const tab=await activeTab(w);const url=tab?.committedUrl||tab?.url||'';
  if(!UTILITY.test(url))return {visible:false,ready:false,url:null,kind:null};
  const {shippingPageUrl}=await import('../lib/page-shim.mjs');
  return {visible:true,ready:!tab.isLoading,url:shippingPageUrl(url),kind:'tab'};
 },
 async closeUtilitySurface(w){await w.hostEval('window.BlancPrototypeHost.closeSheet()');return true;},
 // Shipping's test-hook reads of the sheet's document, over the same DOM.
 utilitySheetRowIcons:w=>onSheet(w,`[...document.querySelectorAll('.row')].map(row=>{const icon=row.querySelector('.row-icon');
  return {image:!!icon?.querySelector('img'),letter:icon?.classList.contains('fallback')?icon.textContent:''};})`),
 historyDayHeadings:w=>onSheet(w,`[...document.querySelectorAll('.day-heading')].map(h=>h.textContent)`),
 async clickFirstSheetLink(w){
  const clicked=await onSheet(w,`(()=>{const a=document.querySelector('a[href^="https"], a[href^="http"]');if(a)a.click();return !!a;})()`);
  if(clicked===null)throw Error('sheet not open');
  if(!clicked)throw Error('no outbound link rendered in sheet');
 },
 utilitySheetContentsId:async w=>(await sheetState(w)).contentsId,
 destroyUtilitySheetContents:w=>w.hostEval('window.BlancPrototypeHost.discardSheetContents()'),
 utilitySheetPalette:w=>onSheet(w,`({text:getComputedStyle(document.body).color,
  card:getComputedStyle(document.querySelector('.page')).backgroundColor,
  currentNav:getComputedStyle(document.querySelector('.page-nav a.current')).color})`),
 readFavoritesSheetPins:w=>onSheet(w,`location.pathname!=='/pages/bookmarks.html'?null:[...document.querySelectorAll('#list .row[data-url]')].map(row=>({
  url:row.dataset.url,title:row.querySelector('.title')?.textContent??'',pinned:row.classList.contains('start-pinned'),
  mark:row.querySelector('.row-pin-mark')?.getAttribute('aria-label')??null,button:row.querySelector('.pin-toggle')?.textContent??null,
  buttonLabel:row.querySelector('.pin-toggle')?.getAttribute('aria-label')??null,focused:document.activeElement===row.querySelector('.pin-toggle')}))`),
 toggleFavoritesSheetPin:async(w,title)=>(await onSheet(w,`(()=>{const row=[...document.querySelectorAll('#list .row[data-url]')]
  .find(c=>c.querySelector('.title')?.textContent===${jsLiteral(String(title))});const button=row?.querySelector('.pin-toggle');
  if(!button||button.disabled)return false;button.focus();button.click();return true;})()`))===true,
 // The Ledger's Favorites heading link, clicked as a person would.
 async followNewtabFavoritesLink(w){
  const page=await startPage(w);if(!page)throw Error('newtab ledger is not the active tab');
  const clicked=await page.evalExpression(`(()=>{const a=document.querySelector('a[href="blanc://bookmarks/"], a[href="chrome://bookmarks/"]');if(a)a.click();return !!a;})()`);
  if(!clicked)throw Error('newtab ledger has no favorites link');
 },
 // F16-6 attack drivers: run in the active page and resolve after it ran.
 async attemptNavigateActiveTab(w,url){
  const ran=await (await activePage(w)).evalExpression(`(()=>{location.href=${jsLiteral(forkInternalUrl(url))};return true;})()`);
  if(ran!==true)throw Error('navigation attempt did not execute');
 },
 async attemptWindowOpenActiveTab(w,url){
  const ran=await (await activePage(w)).evalExpression(`(()=>{window.open(${jsLiteral(forkInternalUrl(url))});return true;})()`);
  if(ran!==true)throw Error('window.open attempt did not execute');
 },
 // Fork steps read the active Start Page through this (null when it isn't).
 executeStartPage:onStart(null,source=>String(source)),
 // ---- Glance (F34): the floating card over the page. ----
 setGlance:(w,id)=>w.api('setGlanceTab',[String(id)]),
 glanceShortcutEnabled:async()=>true,
 pressGlanceShortcut:async w=>{await w.hostEval('window.BlancPrototypeHost.toggleGlance()');return true;},
 openLinkInGlance:async(w,id,url)=>{const s=await w.snapshot();if(String(s.glanceTabId)!==String(id))await w.call('activateTab',id);return w.api('openLinkInGlance',[String(url)]);},
 sendGlanceCardInput:async(w,input)=>{const fr=w.frame('glanceCardFrame');if(!fr)return false;
  if(input.type==='keyDown'){await w.hostEval('window.BlancPrototypeHost.focusGlanceCard()');await fr.keyboard.press(input.keyCode);return true;}
  throw new UndefinedNativeAdapterError('Card pointer input needs an adapter: '+input.type);},
 async openFirstGlanceAndRead(w,id){
  // Delay actual paint callbacks while a fresh card document loads. Fetch
  // interception cannot pause chrome:// documents. No visibility is mocked.
  await w.hostEval(`(()=>{const real=requestAnimationFrame,queued=[];
   window.requestAnimationFrame=callback=>{queued.push(callback);return -queued.length;};
   window.__releaseFirstGlancePaint=()=>{window.requestAnimationFrame=real;for(const callback of queued)real(callback);delete window.__releaseFirstGlancePaint;};
   window.BlancPrototypeHost.reloadGlanceCard();})()`);
  try{
   const opened=await w.api('setGlanceTab',[String(id)]);
   const state=await w.snapshot(),card=await w.hostEval('window.BlancPrototypeHost.glanceState()');
   const bounds=state.tabs.find(t=>t.id===String(id))?.viewBounds;
   return {opened,cardViewVisible:card.shown,glancePageVisible:!!bounds&&bounds.width>0&&bounds.height>0};
  }finally{await w.hostEval('window.__releaseFirstGlancePaint()');}
 },
 glancePageViewVisible:async w=>{const s=await w.snapshot();return !!s.tabs.find(t=>t.id===s.glanceTabId)?.viewBounds;},
 glanceCardFocused:async w=>{const fr=w.frame('glanceCardFrame');return fr?fr.evaluate(()=>document.hasFocus()):false;},
 async closeGlance(w){const s=await w.snapshot();if(s.glanceTabId==null)return false;await w.api('closeGlance');return true;},
 async getGlanceCard(w){
  // The host places the card a moment after the Glance opens.
  let s=await w.snapshot();let g=await w.hostEval('window.BlancPrototypeHost.glanceState()');
  for(let i=0;i<40&&s.glanceTabId!=null&&!g.layout;i++){await new Promise(r=>setTimeout(r,50));s=await w.snapshot();g=await w.hostEval('window.BlancPrototypeHost.glanceState()');}
  if(!g.layout)return null;
  // The page follows the card on Chromium's next layout.
  const same=(a,b)=>a&&b&&a.x===b.x&&a.y===b.y&&a.width===b.width&&a.height===b.height;
  for(let i=0;i<20&&!same(s.tabs.find(t=>t.id===s.glanceTabId)?.viewBounds,g.layout.card.page);i++){await new Promise(r=>setTimeout(r,50));s=await w.snapshot();}
  // Shipping reads these in the window; the fork's are the Island's, which
  // moves under a pushed Auto-hide.
  const dy=(s.glanceArea?.islandY??s.splitGeometry?.islandY)||0;const win=r=>r&&{...r,y:r.y+dy};
  const view=id=>win(s.tabs.find(t=>t.id===id)?.viewBounds??null);
  const rawArea=s.glanceArea??s.splitGeometry.pageArea;
  const area=win(rawArea&&{x:rawArea.x,y:rawArea.y,width:rawArea.width,height:rawArea.height});const c=g.layout.card;
  return {chrome:win(c.chrome),frame:win(c.frame),header:win(c.header),page:win(c.page),cardViewBounds:win(c.chrome),cardViewVisible:g.shown,pageArea:area,pageBounds:area,generation:g.layout.generation,focusedPane:g.layout.focusedPane,
   viewBounds:view(s.glanceTabId),mainViewBounds:view(s.activeTabId),savedFrame:s.glanceFrame??null};
 },
 async glanceHeaderMotion(w){
  const page=w.frame('glanceCardFrame');
  const result=await page.evaluate(()=>{
   const element=document.querySelector('#glanceHeader');
   const style=getComputedStyle(element),identity=element.querySelector('.glance-tab-identity');
   return {header:{transition:style.transition,transform:style.transform,opacity:style.opacity,
    transformOrigin:style.transformOrigin,width:element.getBoundingClientRect().width},
    identity:identity?{transition:getComputedStyle(identity).transition,swapping:identity.classList.contains('swapping')}:null};
  });
  result.picker=await w.call('overlayMode')==='glance'?await w.frame('overlay').evaluate(()=>{
   const element=document.querySelector('#glancePicker'),style=getComputedStyle(element);
   return {transition:style.transition,transform:style.transform,opacity:style.opacity,
    transformOrigin:style.transformOrigin,width:element.getBoundingClientRect().width};
  }):null;return result;
 },
 glanceCardMotion:w=>w.frame('glanceCardFrame').evaluate(()=>{
  const card=document.getElementById('glanceCard');if(!card)return null;
  const style=getComputedStyle(card);
  return {transition:style.transition,transform:style.transform,opacity:style.opacity,hidden:card.hidden};
 }),
 closeGlanceAndReadCard:w=>w.hostEval(`(async()=>{
  const wasOpen=(await window.BlancPrototypeHost.api.getAllTabs()).glanceTabId!=null;
  await window.BlancPrototypeHost.api.closeGlance();
  const closed=wasOpen&&(await window.BlancPrototypeHost.api.getAllTabs()).glanceTabId==null;
  return {closed,cardViewVisible:!document.getElementById('glanceCardFrame').hidden};
 })()`),
 tooltipViewState:w=>w.hostEval(`(()=>{
  const tip=document.getElementById('prototypeTooltip'),r=tip.getBoundingClientRect();
  return {attached:!tip.hidden,bounds:tip.hidden?null:{x:r.x,y:r.y,width:r.width,height:r.height}};
 })()`),
 closeTabAndReadGlance:(w,id)=>w.hostEval(`(async()=>{
  const started=performance.now();
  const area=(await window.BlancPrototypeHost.api.getAllTabs()).splitGeometry.pageArea;
  await window.BlancPrototypeHost.api.closeTab(${jsLiteral(String(id))});
  await window.BlancPrototypeHost.refresh();
  const state=await window.BlancPrototypeHost.api.getAllTabs();
  if(performance.now()-started>=250)throw Error('Close observation exceeded the save debounce');
  return {glanceTabId:state.glanceTabId??null,
   cardViewVisible:!document.getElementById('glanceCardFrame').hidden,
   savedFrame:state.glanceFrame?window.BlancGlanceCard.fractionsToFrame(state.glanceFrame,area):null};
 })()`),
 zoomLevel:async(w,id)=>Math.log(await (await tabPage(w,id)).evaluate(()=>devicePixelRatio)/
  await w.hostEval('devicePixelRatio'))/Math.log(1.2),
 simulateMediaStarted:(w,id)=>w.native('simulateMediaStarted',[nativeId(id)]),
 findTabId:w=>w.hostEval('window.BlancPrototypeHost.findState().tabId'),
};
