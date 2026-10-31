// Address bar, search, bangs, slash commands and settings: shipping test-hook
// names over the fork's Island overlay document (shipping's overlay renderer,
// driven through its own DOM), the Island facade (its browserAPI), the fork's
// Settings tab and CDP. Where shipping reads its main-process settings store,
// the fork's store is only reachable through its Settings page, so a write or
// read drives that page's own control and a missing control is the product's.
import {UndefinedNativeAdapterError} from '../lib/adapters.mjs';
import {tabPage} from './core.mjs';
const ADDRESS='addressInput';
const overlay=w=>w.frame('overlay');
const inOverlay=(w,fn,arg)=>overlay(w).evaluate(fn,arg);
// Search providers by the URL each is asked at (shipping search-suggestions.js
// and the search prefixes extended.steps.js asserts).
export const SUGGEST=[['duckduckgo','https://duckduckgo.com/ac/'],['google','https://www.google.com/complete/search'],
 ['bing','https://api.bing.com/osjson.aspx'],['brave','https://search.brave.com/api/suggest'],['kagi','https://kagi.com/api/autosuggest']];
export const SEARCH=[['duckduckgo','https://duckduckgo.com/?q='],['google','https://www.google.com/search?q='],
 ['bing','https://www.bing.com/search?q='],['brave','https://search.brave.com/search?q='],['kagi','https://kagi.com/search?q=']];
// Which provider a URL the fork navigated to belongs to; null when none.
export const engineOfUrl=url=>SEARCH.find(([,p])=>String(url).startsWith(p))?.[0]??null;
// One captured submission in shipping's shape. `route` is the Island facade
// method the overlay called (navigate is shipping's typed-address route,
// search its search-row route); `url` is what the facade then asked native
// to load. The fork has no bang resolver, so it never yields engine 'bang'.
export function submissionOf(entry){
 if(!entry)return null;
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
 if(typed)window.BlancBrowserApi=Object.freeze({invoke:(name,args)=>{if(c.route&&name==='navigate')
  c.log.push({route:c.route.method,input:c.route.args,native:'typed:'+name,url:args[1]});return typed.invoke(name,args);}});
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
// --- Settings: the fork's Settings tab and its own controls ---
const SETTINGS=/^chrome:\/\/(blanc-prototype\/blocking-settings\.html|settings\/)/;
async function settingsTab(w){return (await w.snapshot()).tabs.find(t=>SETTINGS.test(t.committedUrl||t.url))??null;}
async function settingsPage(w){const t=await settingsTab(w);return t?tabPage(w,t.id):null;}
// Opens Settings through the Island's own action, runs `fn` in its document,
// and puts tabs back as they were when Settings was not already open.
async function inSettings(w,fn,arg){
 const before=(await w.snapshot()).activeTabId;const had=await settingsTab(w);
 await w.api('openPage',['settings']);
 const tab=await w.waitFor(()=>settingsTab(w),t=>t&&!t.isLoading,'the fork Settings tab',8000);
 const page=await tabPage(w,tab.id);await page.waitForLoadState();
 const result=await page.evaluate(fn,arg);
 if(result?.missing)throw Error(`Fork Settings (${tab.committedUrl||tab.url}) has no #${result.missing} control`);
 if(!had){await w.native('closeTab',[tab.id]);if(before!=null)await w.native('switchTab',[Number(before)]);}
 return result?.value;
}
// A person's change to one control: select an offered option, set a field,
// or click a switch to the wanted state. An option the page doesn't offer
// can't be chosen, so the control keeps its value.
const setControl=(w,id,value)=>inSettings(w,a=>{
 const el=document.getElementById(a.id);if(!el)return {missing:a.id};
 const fire=()=>{el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));};
 if(el.type==='checkbox'){if(el.checked!==!!a.value)el.click();return {value:el.checked};}
 if(el.tagName==='SELECT'){if([...el.options].some(o=>o.value===a.value)){el.value=a.value;fire();}return {value:el.value};}
 el.value=a.value;fire();el.blur();return {value:el.value};
},{id,value});
const readControl=(w,id)=>inSettings(w,a=>{const el=document.getElementById(a.id);if(!el)return {missing:a.id};
 return {value:el.type==='checkbox'?el.checked:el.value};},{id});
// Inside an already open Settings tab, as shipping reads its sheet: null
// when Settings isn't open.
async function settingsEval(w,fn,arg,none=null){const page=await settingsPage(w);return page?page.evaluate(fn,arg):none;}
// --- Search suggestions: the provider endpoints, served and recorded at the
// Island host's network layer, where the facade would fetch them. ---
async function suggestionTap(w){
 const t=w.suggestTap??={requests:[],fixture:null};if(t.installed)return t;t.installed=true;
 const host=w.fixture.host;
 host.on('Fetch.requestPaused',async({requestId,request})=>{
  const hit=SUGGEST.find(([,u])=>request.url.startsWith(u));const q=new URL(request.url).searchParams;
  const query=(q.get('q')??q.get('query')??'').trim();
  // Fetch credentials mode is not observable over CDP; recorded as unknown.
  t.requests.push({engine:hit?.[0]??null,query,url:request.url,credentials:null});
  const body=Buffer.from(JSON.stringify([query,t.fixture??[]])).toString('base64');
  await host.send('Fetch.fulfillRequest',{requestId,responseCode:200,responseHeaders:[{name:'content-type',value:'application/json'}],body}).catch(()=>{});
 });
 await host.send('Fetch.enable',{patterns:SUGGEST.map(([,u])=>({urlPattern:u+'*',requestStage:'Request'}))});
 return t;
}
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
 // A hand-off leaves no web navigation behind: the fork's native navigate only
 // loads http(s), so a typed URI that turned into a web URL was not handed off.
 async wouldHandOff(w,url){
  const e=await typedDestination(w,url);
  if(e&&/^https?:/i.test(e.url))return false;
  throw new UndefinedNativeAdapterError('The fork issued no web navigation for '+url+'; an OS hand-off is not observable without a native test op');
 },
 async handoffDecision(w,url){
  const e=await typedDestination(w,url);
  if(e&&/^https?:/i.test(e.url))return 'none';
  throw new UndefinedNativeAdapterError('The fork issued no web navigation for '+url+'; its hand-off decision needs a native test op');
 },
 setSearchEngine:(w,engine)=>setControl(w,'searchEngine',String(engine)),
 searchEngine:w=>readControl(w,'searchEngine'),
 async setCustomSearchEngine(w,template){await setControl(w,'searchEngine','custom');await setControl(w,'searchEngineTemplate',String(template));return readControl(w,'searchEngine');},
 setSearchSuggestions:(w,on)=>setControl(w,'searchSuggestions',!!on),
 searchSuggestions:w=>readControl(w,'searchSuggestions'),
 setAppearance:(w,theme)=>setControl(w,'theme',String(theme)),
 setBangsEnabled:(w,on)=>setControl(w,'bangsEnabled',!!on),
 // Custom bangs are added one at a time through Settings → Your bangs.
 async setCustomBangs(w,list){
  for(const b of list)await inSettings(w,a=>{for(const id of ['customBangCode','customBangName','customBangTemplate','customBangAdd'])if(!document.getElementById(id))return {missing:id};
   document.getElementById('customBangCode').value=a.code;document.getElementById('customBangName').value=a.name;
   document.getElementById('customBangTemplate').value=a.template;document.getElementById('customBangAdd').click();return {value:true};},b);
  return (await w.api('bangs')).custom;
 },
 // The overlay's own bang source.
 recentBangs:async w=>(await w.api('bangs')).recent,
 // Shipping stubs the fetcher behind browserAPI.bangIcons; the fork's facade
 // must offer that bridge for there to be anything to stub or count.
 async stubBangIconServer(w){await w.api('bangIcons',[[]]);throw new UndefinedNativeAdapterError('The fork icon server has no test stub');},
 async bangIconRequests(w){await w.api('bangIcons',[[]]);throw new UndefinedNativeAdapterError('The fork icon server keeps no request log');},
 async bangIconStore(w){await w.api('bangIcons',[[]]);throw new UndefinedNativeAdapterError('The fork icon store is not readable');},
 async setSearchSuggestionFixture(w,suggestions){const t=await suggestionTap(w);t.fixture=Array.isArray(suggestions)?suggestions.filter(s=>typeof s==='string'):[];t.requests.length=0;},
 searchSuggestionRequests:async w=>structuredClone((await suggestionTap(w)).requests),
 // Straight through the bridge, as shipping's overlay calls it.
 requestSearchSuggestions:(w,query)=>w.api('searchSuggestions',[String(query)]),
 openFind:w=>w.api('openFindBar'),
 openSettings:w=>w.api('openPage',['settings']),
 settingsCurrentSection:w=>settingsEval(w,()=>document.querySelector('.settings-nav a.current')?.dataset.group??null),
 scrollSettingsSheetToEnd:w=>settingsEval(w,()=>{const page=document.querySelector('body.sheet .page');page.scrollTop=page.scrollHeight;return true;},undefined,false),
 settingsBangControls:w=>settingsEval(w,()=>({enabled:document.getElementById('bangsEnabled')?.checked??null,
  rows:[...document.querySelectorAll('#customBangList .site-row')].map(row=>({code:row.querySelector('.custom-bang-code')?.textContent.replace(/^!/,'')??'',
   name:row.querySelector('.site-row-name')?.textContent??'',host:row.querySelector('.custom-bang-host')?.textContent??''})),
  empty:!!document.querySelector('#customBangList .site-list-empty'),
  error:document.getElementById('customBangError')?.hidden===false?document.getElementById('customBangError').textContent:null,
  replaces:document.getElementById('customBangReplaces')?.hidden===false?document.getElementById('customBangReplaces').textContent:null})),
 settingsAddBang:(w,code,name,template)=>settingsEval(w,a=>{const set=(id,v)=>{const el=document.getElementById(id);if(!el)return false;el.value=v;return true;};
  if(!set('customBangCode',a.code)||!set('customBangName',a.name)||!set('customBangTemplate',a.template))return false;
  document.getElementById('customBangAdd').click();return true;},{code:String(code),name:String(name),template:String(template)},false),
 settingsRemoveBang:(w,code)=>settingsEval(w,c=>{const row=[...document.querySelectorAll('#customBangList .site-row')].find(r=>r.querySelector('.custom-bang-code')?.textContent==='!'+c);
  if(!row)return false;row.querySelector('.site-row-remove').click();return true;},String(code),false),
 settingsHintState:w=>settingsEval(w,()=>[...document.querySelectorAll('.setting .label .hint:not(.field-error)')].filter(h=>h.offsetParent)
  .map((hint,index)=>({index,text:hint.textContent,folded:hint.classList.contains('folded'),hasToggle:hint.nextElementSibling?.classList.contains('hint-toggle')??false}))),
 toggleFirstFoldedHint:w=>settingsEval(w,()=>{const b=document.querySelector('.hint-toggle');b?.click();return !!b;},undefined,false),
 settingsSyncValues(){throw new UndefinedNativeAdapterError('The fork has no Profile Sync export to read synced settings from');},
 // The macOS pasteboard is the owner's, shared with every app: unattended
 // runs must not overwrite or record it, so clipboard steps stay undefined.
 setClipboardText(){throw new UndefinedNativeAdapterError('Clipboard writes would replace the owner\'s real pasteboard');},
 readClipboardText(){throw new UndefinedNativeAdapterError('Clipboard reads would record the owner\'s real pasteboard');},
 // Shipping's command-bar menu is its own (main's address-menu.js). The fork's
 // command bar leaves the address input to Chromium's native editable context
 // menu (adapter.js skips inputs), which CDP cannot list or click.
 addressMenuWired(){throw new UndefinedNativeAdapterError('The fork address input uses Chromium’s native context menu; listing it needs a native test op');},
 addressFieldText(){throw new UndefinedNativeAdapterError('The fork has no address-menu field read; needs a native test op');},
 addressMenu(){throw new UndefinedNativeAdapterError('The fork address input uses Chromium’s native context menu; listing it needs a native test op');},
 runAddressMenuItem(){throw new UndefinedNativeAdapterError('The fork address input uses Chromium’s native context menu; running an item needs a native test op');},
};
