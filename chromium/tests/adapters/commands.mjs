// Address bar, search, bangs, slash commands and settings: shipping test-hook
// names over the fork's Island overlay document (shipping's overlay renderer,
// driven through its own DOM), the Island facade (its browserAPI), the fork's
// Settings tab and CDP. Where shipping reads its main-process settings store,
// the fork's store is only reachable through its Settings page, so a write or
// read drives that page's own control and a missing control is the product's.
import {UndefinedNativeAdapterError} from '../lib/adapters.mjs';
const ADDRESS='addressInput';
const overlay=w=>w.frame('overlay');
const inOverlay=(w,fn,arg)=>overlay(w).evaluate(fn,arg);
// Search prefixes extended.steps.js asserts.
export const SEARCH=[['duckduckgo','https://duckduckgo.com/?q='],['google','https://www.google.com/search?q='],
 ['bing','https://www.bing.com/search?q='],['brave','https://search.brave.com/search?q='],['kagi','https://kagi.com/search?q=']];
// Which provider a URL the fork navigated to belongs to; null when none.
export const engineOfUrl=url=>SEARCH.find(([,p])=>String(url).startsWith(p))?.[0]??null;
// One captured submission in shipping's shape. `route` is the Island facade
// method the overlay called (navigate is shipping's typed-address route,
// search its search-row route); `url` is what the facade then asked native
// to load. A typed bang is the facade's navigate or search of bang-shaped text that
// reached native as a page load rather than a search: shipping captures it as
// engine 'bang' with the words beside the bang as its query.
const BANG_CODE=/^[a-z0-9][a-z0-9_-]{0,31}$/i;
function bangWords(text){
 const tokens=String(text??'').trim().split(/\s+/);
 if(tokens[0]?.startsWith('!')&&BANG_CODE.test(tokens[0].slice(1)))return tokens.slice(1).join(' ');
 if(tokens.length>1&&tokens.at(-1).startsWith('!')&&BANG_CODE.test(tokens.at(-1).slice(1)))return tokens.slice(0,-1).join(' ');
 return null;
}
export function submissionOf(entry){
 if(!entry)return null;
 const words=(entry.route==='navigate'||entry.route==='search')&&entry.native==='typed:navigate'?bangWords(entry.input[1]):null;
 if(words!==null)return {engine:'bang',query:words,url:entry.url};
 if(entry.route==='search')return {engine:engineOfUrl(entry.url)??'unknown',query:String(entry.input[1]??'').trim(),url:entry.url};
 return {engine:'address',query:String(entry.route==='createTab'?entry.input[0]:entry.input[1]),url:entry.url};
}
// Observe, never alter: the overlay's calls into the facade and the facade's
// native requests that follow synchronously from them. Requests still go to
// native unchanged (native navigate refuses non-http(s) URLs itself, and the
// fixture keeps every non-loopback host on a dead proxy).
const TAP=`(()=>{if(window.__blancCapture)return true;const c=window.__blancCapture={route:null,log:[]};
 const api=window.BlancPrototypeHost.api;
 for(const m of ['navigate','search','createTab']){const orig=api[m];api[m]=function(...a){const prev=c.route;c.route={method:m,args:a};try{return orig.apply(this,a);}finally{c.route=prev;}};}
 const send=chrome.send.bind(chrome);
 chrome.send=(name,args)=>{if(name==='blancPrototype'&&c.route&&(args[1]==='navigate'||args[1]==='createTab'))
  c.log.push({route:c.route.method,input:c.route.args,native:args[1],url:args[2][args[1]==='navigate'?1:0]});return send(name,args);};
 // Navigation runs on the typed interface; record what reaches it the same way.
 const typed=window.BlancBrowserApi;
 if(typed)window.BlancBrowserApi=Object.freeze({invoke:(name,args)=>{const route=c.route;
  if(route&&name==='navigate')c.log.push({route:route.method,input:route.args,native:'typed:'+name,url:args[1]});
  const result=typed.invoke(name,args);
  // Under the test hook a search resolves to the URL it would load.
  if(route&&name==='search')return result.then(url=>{if(typeof url==='string')c.log.push({route:route.method,input:route.args,native:'typed:search',url});return url;});
  return result;}});
 return true;})()`;
async function capture(w,reset){await w.hostEval(TAP);if(reset)await w.hostEval('window.__blancCapture.log.length=0');}
const lastCaptured=async w=>w.hostEval('window.__blancCapture?.log.at(-1)??null');
// Shipping's openOverlaySurface for the palette, through core's adapters.
async function openPalette(w){
 await w.call('closeOverlay');
 await w.waitFor(()=>w.call('overlayRendererMode'),m=>m==null,'overlay renderer to leave its edit session',5000);
 await w.call('openPalette');
 await w.waitFor(()=>w.call('overlayRendererMode'),m=>m==='palette','overlay renderer in palette mode',5000);
}
// Where the fork's command bar sends typed text: a fresh tab, the palette,
// the text as a real input, Enter, and the facade's native request read back.
// The probe tab is closed and the previous tab restored afterwards.
// What typing the text did: 'open' or 'confirm' for a recorded OS hand-off,
// 'none' for a web navigation or search.
async function typedHandoff(w,text){
 const before=(await w.native('handoffs')).length;
 const entry=await typedDestination(w,text);
 const recorded=(await w.native('handoffs')).slice(before).find(h=>h.url===text.trim()||h.url===text);
 if(recorded)return recorded.prompt?'confirm':'open';
 if(entry&&/^https?:/i.test(entry.url))return 'none';
 throw new UndefinedNativeAdapterError('Typing '+text+' produced neither a hand-off nor a web navigation');
}
async function typedDestination(w,text){
 const before=(await w.snapshot()).activeTabId;
 const probe=String((await w.native('createTab',['chrome://newtab/'])).tabId);
 await w.waitForState(s=>s.activeTabId===probe&&!s.tabs.find(t=>t.id===probe).loading);
 try{
  await capture(w,true);await openPalette(w);
  await editAddressInput(w,text);await pressAddressKey(w,'Enter');
  // Settles on the first native request, or on none once the palette closed.
  let entry=null;const end=Date.now()+3000;
  while(Date.now()<end&&!(entry=await lastCaptured(w)))await new Promise(r=>setTimeout(r,50));
  return entry;
 }finally{
  if((await w.snapshot()).tabs.some(t=>String(t.id)===probe))await w.native('closeTab',[Number(probe)]);
  if(before!=null&&(await w.snapshot()).tabs.some(t=>String(t.id)===String(before)))await w.native('switchTab',[Number(before)]);
 }
}
function editAddressInput(w,value,inputType='insertText'){
 return inOverlay(w,a=>{const input=document.getElementById(a.id);if(!input)return false;input.value=a.value;
  input.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:a.inputType,data:null}));return true;},{id:ADDRESS,value:String(value),inputType:String(inputType)});
}
function pressAddressKey(w,key,m={}){
 const init={key:String(key),bubbles:true,altKey:!!m.altKey,ctrlKey:!!m.ctrlKey,metaKey:!!m.metaKey,shiftKey:!!m.shiftKey};
 return inOverlay(w,a=>{const input=document.getElementById(a.id);if(!input)return false;input.dispatchEvent(new KeyboardEvent('keydown',a.init));return true;},{id:ADDRESS,init});
}
// --- Settings: chrome://settings in the settings sheet (S1.7), with Blanc's
// controls inside Chromium's sections (owner, 2026-11-04). ---
const SETTINGS=/^chrome:\/\/settings\//;
// The page the sheet's native view shows, or null while the sheet is closed.
async function settingsPage(w){
 const state=await w.native('settingsSheetState',[]).catch(()=>null);
 if(!state?.attached)return null;
 const target=(await w.fixture.targets()).find(t=>t.type==='page'&&SETTINGS.test(t.url));
 if(!target)return null;
 await w.app.refresh();
 return w.app.windows().find(p=>p.targetId===target.id)??null;
}
// chrome://settings keeps its controls in nested shadow trees; every reader
// gets find (first match) and all (every match) across them.
const DEEP=`const find=(sel,root=document)=>{const e=root.querySelector(sel);if(e)return e;
 for(const el of root.querySelectorAll('*'))if(el.shadowRoot){const x=find(sel,el.shadowRoot);if(x)return x;}return null;};
 const all=(sel,root=document,out=[])=>{out.push(...root.querySelectorAll(sel));for(const el of root.querySelectorAll('*'))if(el.shadowRoot)all(sel,el.shadowRoot,out);return out;};`;
const inPage=(page,fn,arg)=>page.evaluate(`(()=>{${DEEP}return (${fn})(${JSON.stringify(arg??null)},{find,all});})()`);
// Read an already-open native Settings target without opening or navigating
// it. Sync assertions must fail when /sync routed to the wrong section.
export async function readSettings(w,fn,arg){
 const page=await settingsPage(w);return page?inPage(page,fn,arg):null;
}
// A person reaches a section through Settings' own menu; the sheet keeps the
// navigation (its delegate), so the same page moves there.
// (Its page address shows as shipping's blanc://settings/, so ask the document.)
const at=(page,section)=>page.evaluate('location.href').then(href=>href.startsWith(`chrome://settings/${section}`)).catch(()=>false);
async function moveTo(w,page,section){
 if(await at(page,section))return page;
 await page.evaluate(`location.href=${JSON.stringify(`chrome://settings/${section}`)}`).catch(()=>{});
 return w.waitFor(async()=>{const p=await settingsPage(w);return p&&await at(p,section)?p:null;},Boolean,`Settings → ${section}`,8000);
}
// What shows that a section has drawn Blanc's controls, and filled its lists.
const READY={search:'settings-search-page[blanc-ready] #blancBangs',appearance:'#blancIslandAutoHide',
 privacy:'settings-privacy-page[blanc-ready] #blancBlocking',languages:'#blancUiLanguage',help:'#patronCheckout'};
async function settingsReady(page,section){
 await page.waitForLoadState();
 const selector=READY[section];
 if(!selector)return;
 const until=Date.now()+8000;
 while(!(await inPage(page,(sel,d)=>{const [host,rest]=sel.split(' ');
  if(!rest)return !!d.find(host);const el=d.find(host);return !!(el&&d.find(rest,el.shadowRoot??el));},selector)))
  {if(Date.now()>until)throw Error(`Settings never showed ${selector}`);await new Promise(r=>setTimeout(r,100));}
}
// Opens Settings at a section through the Island's own action (or moves the
// open sheet there), runs `fn` in its document, and closes the sheet again
// when Settings was not already open.
export async function inSettings(w,section,fn,arg,{full=false}={}){
 const had=await settingsPage(w);
 if(!had)await w.api('openPage',['settings',section]);
 let page=had??await w.waitFor(()=>settingsPage(w),Boolean,'the settings sheet',8000);
 page=await moveTo(w,page,section);
 await settingsReady(page,section);
 const result=await inPage(page,fn,arg);
 if(result?.missing)throw Error(`Settings (${page.url()}) has no ${result.missing} control`);
 if(!had){
  await w.hostEval('window.BlancPrototypeHost.closeSheet()');
  await w.waitFor(async()=>!(await w.fixture.targets()).some(t=>t.type==='page'&&SETTINGS.test(t.url)),Boolean,'the settings sheet to close',8000);
 }
 return full?result:result?.value;
}
// A person's click on a Settings switch, to the wanted state.
const setSwitch=(w,section,id,on)=>inSettings(w,section,async(a,d)=>{
 const el=d.find('#'+a.id);if(!el)return {missing:'#'+a.id};
 if(el.checked!==a.on){el.click();await new Promise(r=>setTimeout(r,300));}
 return {value:el.checked};},{id,on:!!on});
const readSwitch=(w,section,id)=>inSettings(w,section,(a,d)=>{const el=d.find('#'+a.id);
 return el?{value:el.checked}:{missing:'#'+a.id};},{id});
// Shipping's engine ids by the names Chromium's Change dialog shows.
const ENGINES={duckduckgo:'DuckDuckGo',google:'Google',bing:'Microsoft Bing',brave:'Brave',kagi:'Kagi'};
const engineOf=name=>Object.keys(ENGINES).find(id=>ENGINES[id]===name)??(name?'custom':'');
// Chromium's Appearance → Mode: Device, Light, Dark.
const MODES={system:'0',light:'1',dark:'2'};
// Inside an already open Settings, as shipping reads its sheet: null when
// Settings isn't open.
async function settingsEval(w,section,fn,arg,none=null){
 let page=await settingsPage(w);if(!page)return none;
 page=await moveTo(w,page,section);
 await settingsReady(page,section);return inPage(page,fn,arg);
}
const bangControls=(a,d)=>{const notice=d.find('#blancBangNotice');
 return {enabled:d.find('#blancBangs')?.checked??null,
  rows:d.all('.blanc-bang').map(row=>({code:row.querySelector('.blanc-bang-code')?.textContent.replace(/^!/,'')??'',
   name:row.querySelector('.blanc-bang-name')?.textContent??'',host:row.querySelector('.blanc-bang-host')?.textContent??''})),
  empty:!!d.find('#blancCustomBangsEmpty'),
  error:notice?.dataset.kind==='error'?notice.textContent.trim():null,
  replaces:notice?.dataset.kind==='replaces'?notice.textContent.trim():null};};
const addBang=async(a,d)=>{const field=id=>d.find('#'+id);
 for(const id of ['blancBangCode','blancBangName','blancBangTemplate','blancBangAdd'])if(!field(id))return {missing:'#'+id};
 field('blancBangCode').value=a.code;field('blancBangName').value=a.name;field('blancBangTemplate').value=a.template;
 const before=field('blancBangNotice')?.textContent;field('blancBangAdd').click();
 // The add saves asynchronously; it has settled once the draft clears or a notice shows.
 const until=Date.now()+5000;
 while(Date.now()<until&&field('blancBangCode').value!==''&&field('blancBangNotice')?.textContent===before)
  await new Promise(r=>setTimeout(r,25));
 return {value:true};};
// --- Search suggestions: shipping's fixture and request log, at the native
// suggestion service's network boundary (browser_api/search.h). ---
export const commands={
 editAddressInput,pressAddressKey,
 addressInputValue:w=>inOverlay(w,id=>document.getElementById(id)?.value??null,ADDRESS),
 // Shipping's readers of the ⌘L list, verbatim against the same document.
 addressSectionHeaders:w=>inOverlay(w,()=>[...document.querySelectorAll('#islandList .island-ghead .ghead-name')].map(el=>el.textContent)),
 addressActiveRowVisible:w=>inOverlay(w,()=>{const list=document.getElementById('islandList');const row=list?.querySelector('.island-row.active');
  if(!list||!row)return null;const l=list.getBoundingClientRect(),r=row.getBoundingClientRect();return r.top>=l.top-1&&r.bottom<=l.bottom+1;}),
 addressResultRows:w=>inOverlay(w,async()=>Promise.all([...document.querySelectorAll('#islandList .island-row')].map(async row=>{
  const fav=row.querySelector('.favicon');const raw=fav?getComputedStyle(fav).backgroundImage:'';let url='';
  if(raw&&raw.indexOf('url(')===0){url=raw.slice(4,raw.length-1);if(url[0]==='"'||url[0]==="'")url=url.slice(1,-1);}
  let faviconDecoded=null;
  if(url)faviconDecoded=await new Promise(resolve=>{const img=new Image();img.onload=()=>resolve(img.naturalWidth+'x'+img.naturalHeight);img.onerror=()=>resolve(false);img.src=url;});
  return {title:row.querySelector('.row-title')?.textContent??'',cmd:row.querySelector('.row-cmd')?.textContent??'',hint:row.querySelector('.row-hint')?.textContent??'',
   sub:row.querySelector('.row-sub')?.textContent??'',tag:row.querySelector('.row-tag')?.textContent??'',label:row.querySelector('.row-primary')?.getAttribute('aria-label')??'',
   quiet:row.classList.contains('quiet'),active:row.classList.contains('active'),enter:!!row.querySelector('.row-enter'),
   faviconClass:fav?fav.className:'',faviconHasIcon:!!(fav&&fav.classList.contains('has-icon')),faviconDecoded};}))),
 async captureSearchNavigation(w,enabled){await capture(w,true);await w.hostEval(`window.__blancCapture.off=${!enabled}`);},
 async capturedSearchSubmission(w){if(await w.hostEval('!window.__blancCapture||window.__blancCapture.off'))return null;return submissionOf(await lastCaptured(w));},
 // Shipping normalizes the text in main; the fork's equivalent is where its
 // command bar actually sends it, read off the native request.
 async resolveAddress(w,input){const e=await typedDestination(w,input);return e?e.url:null;},
 // Typed hand-offs are recorded natively instead of launched under the test
 // hook (the native "handoffs" op); a web navigation means none happened.
 async wouldHandOff(w,url){return (await typedHandoff(w,url))!=='none';},
 async handoffDecision(w,url){return typedHandoff(w,url);},
 // Chromium's Change dialog: an engine it doesn't offer can't be chosen, so
 // the default stays.
 setSearchEngine:(w,engine)=>inSettings(w,'search',async(a,d)=>{
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  d.find('#openDialogButton').click();
  let dialog=null;for(let i=0;i<50&&!dialog;i++){await wait(100);dialog=d.find('settings-search-engine-list-dialog');}
  if(!dialog)return {missing:'settings-search-engine-list-dialog'};
  const root=dialog.shadowRoot??dialog;await wait(300);
  const radio=d.all('cr-radio-button',root).find(r=>r.textContent.trim()===a.name);
  if(!radio){d.find('#cancelButton',root).click();await wait(300);}
  else{radio.click();await wait(100);d.find('#setAsDefaultButton',root).click();
   for(let i=0;i<50&&d.find('.search-engine-name')?.textContent.trim()!==a.name;i++)await wait(100);}
  return {value:d.find('.search-engine-name')?.textContent.trim()??'',offered:!!radio};},{name:ENGINES[engine]??null},{full:true}).then(r=>{
  // V12 (owner, 2026-11-04): an engine the Change dialog doesn't list (Kagi)
  // is added under Manage search engines, which shipping's step doesn't do.
  // An unknown engine (shipping's invalid-engine case) is simply refused.
  if(ENGINES[engine]&&!r.offered&&engineOf(r.value)!==engine)throw new UndefinedNativeAdapterError(`V12: ${ENGINES[engine]??engine} is added under chrome://settings → Manage search engines`);
  return engineOf(r.value);}),
 searchEngine:w=>inSettings(w,'search',(a,d)=>({value:d.find('.search-engine-name')?.textContent.trim()??''})).then(engineOf),
 // V12 (owner, 2026-11-04): a custom address is added under Chromium's Manage
 // search engines and made the default there.
 setCustomSearchEngine(){throw new UndefinedNativeAdapterError('V12: a custom search address is added under chrome://settings → Manage search engines');},
 setSearchSuggestions:(w,on)=>setSwitch(w,'search','blancSearchSuggestions',on),
 searchSuggestions:w=>readSwitch(w,'search','blancSearchSuggestions'),
 setAppearance:(w,theme)=>inSettings(w,'appearance',async(a,d)=>{const select=d.find('#colorSchemeModeSelect');
  if(!select)return {missing:'#colorSchemeModeSelect'};
  if(a.mode!==null&&select.value!==a.mode){select.value=a.mode;select.dispatchEvent(new Event('change',{bubbles:true}));
   await new Promise(r=>setTimeout(r,300));}
  return {value:Object.keys(a.modes).find(k=>a.modes[k]===select.value)??select.value};},{mode:MODES[theme]??null,modes:MODES}),
 // Shipping's hook writes the setting without UI; Settings would close the
 // open command bar, which F47-7 keeps open.
 setBangsEnabled:(w,on)=>w.native('setBangsEnabled',[!!on]),
 // Custom bangs are added one at a time through Settings → Your bangs.
 async setCustomBangs(w,list){
  for(const b of list)await inSettings(w,'search',`${addBang}`,b);
  return (await w.api('bangs')).custom;
 },
 // The overlay's own bang source.
 recentBangs:async w=>(await w.api('bangs')).recent,
 // Shipping's icon server stub and readers, at the native service's fetch
 // boundary (browser_api/bang_icons.h).
 stubBangIconServer:(w,map)=>w.native('stubBangIconServer',[map&&typeof map==='object'?map:{}]),
 bangIconRequests:w=>w.native('bangIconRequests'),
 bangIconStore:w=>w.native('bangIconStore'),
 setSearchSuggestionFixture:(w,suggestions)=>w.native('setSuggestionFixture',[Array.isArray(suggestions)?suggestions.filter(s=>typeof s==='string'):[]]),
 searchSuggestionRequests:w=>w.native('suggestionRequests'),
 // Straight through the bridge, as shipping's overlay calls it.
 requestSearchSuggestions:(w,query)=>w.api('searchSuggestions',[String(query)]),
 openFind:w=>w.api('openFindBar'),
 openSettings:w=>w.api('openPage',['settings']),
 // V14 (owner, 2026-11-04): Settings' menu marks the page you are on, as
 // chrome://settings's does; no marker follows scrolling.
 settingsCurrentSection(){throw new UndefinedNativeAdapterError('V14: chrome://settings marks the page you are on, not a scrolled-to section');},
 scrollSettingsSheetToEnd(){throw new UndefinedNativeAdapterError('V14: chrome://settings marks the page you are on, not a scrolled-to section');},
 // The open Settings page scrolled to its end, as a person scrolls it.
 settingsScrollToEnd:w=>settingsPage(w).then(page=>page?page.evaluate(`(()=>{const s=document.scrollingElement;s.scrollTop=s.scrollHeight;return s.scrollTop>0||s.scrollHeight<=innerHeight;})()`):false),
 // A click on an item of Settings' own menu (☰ at the sheet's width), then
 // which item the menu marks and where Settings is.
 settingsChooseMenuItem:(w,id)=>settingsPage(w).then(page=>page?inPage(page,async(item,d)=>{const wait=ms=>new Promise(r=>setTimeout(r,ms));
  let link=null;for(let i=0;i<30&&!link;i++){link=d.all('#'+item)[0]??null;if(!link)await wait(100);}
  if(!link)return false;
  // At the sheet's width the menu is behind ☰; a person opens it first.
  const button=d.find('#menuButton');if(button&&button.offsetParent){button.click();await wait(500);}
  (d.all('#'+item).find(l=>l.offsetParent)??link).click();await wait(1000);return true;},String(id)):false),
 settingsMenuMarked:w=>settingsPage(w).then(page=>page?inPage(page,(a,d)=>{const menu=d.find('settings-menu')?.shadowRoot;
  const marked=menu?[...menu.querySelectorAll('a[role=menuitem]')].find(l=>l.classList.contains('selected')||l.getAttribute('aria-current')==='page'):null;
  return {item:marked?.id??null,path:location.pathname};}):null),
 settingsBangControls:w=>settingsEval(w,'search',`${bangControls}`),
 settingsAddBang:(w,code,name,template)=>settingsEval(w,'search',`${addBang}`,{code:String(code),name:String(name),template:String(template)},false).then(r=>r===false?false:!r?.missing),
 settingsRemoveBang:(w,code)=>settingsEval(w,'search',async(c,d)=>{const button=d.all('.blanc-bang-remove').find(b=>b.dataset.code===c);
  if(!button)return false;button.click();await new Promise(r=>setTimeout(r,300));return true;},String(code),false),
 // V13 (owner, 2026-11-04): explanations show in full, as Chromium's do.
 settingsExplanations:w=>settingsEval(w,'appearance',(a,d)=>d.all('settings-toggle-button').filter(t=>t.offsetParent&&t.subLabel)
  .map(t=>{const el=d.find('#subLabel',t.shadowRoot)??t.shadowRoot?.querySelector('.secondary');
   return {text:t.subLabel,whole:!el||el.scrollHeight<=el.clientHeight+1};})),
 settingsHintState(){throw new UndefinedNativeAdapterError('V13: chrome://settings shows explanations in full');},
 toggleFirstFoldedHint(){throw new UndefinedNativeAdapterError('V13: chrome://settings shows explanations in full');},
 settingsSyncValues:w=>w.native('desktopSyncSettings'),
 // The macOS pasteboard is the owner's, shared with every app: under
 // --blanc-test Blanc's own clipboard actions use an in-memory board instead
 // (Copy Clean Link, Paste and Go, /copy, /invite), which these read and set.
 setClipboardText:(w,text)=>w.native('setTestClipboard',[String(text)]),
 readClipboardText:w=>w.native('testClipboard',[]),
 // Shipping's command-bar menu is its own (main's address-menu.js); the fork's
 // is Blanc's native menu on the Island's address input (F19), whose builder
 // and executor these drive, since CDP can't open a native menu.
 addressMenuWired:w=>w.native('addressMenuWired',[]),
 addressFieldText:async w=>{
  const text=await w.hostEval(`(()=>{const f=document.getElementById('overlay');if(!f||f.hidden)return null;
   return f.contentDocument?.getElementById('addressInput')?.value??''})()`);
  if(text===null)throw Error('overlay is not open');
  return text;
 },
 addressMenu:(w,{fieldText})=>w.native('addressMenu',[String(fieldText)]),
 runAddressMenuItem:(w,id,fieldText)=>w.native('runAddressMenuItem',[String(id),String(fieldText)]),
};
