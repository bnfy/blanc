// Island geometry, pointer and layout: shipping test-hook names over the
// Island's own documents (strip/overlay iframes of the host), CDP input and
// window commands, the fork Settings page, and native dispatch.
import {UndefinedNativeAdapterError,nativeId} from '../lib/adapters.mjs';
import {tabPage} from './core.mjs';
import {shippingPageUrl} from '../lib/page-shim.mjs';
const undef=reason=>()=>{throw new UndefinedNativeAdapterError(reason);};
// Electron sendInputEvent mouse types -> CDP Input.dispatchMouseEvent types.
const MOUSE={mouseMove:'mouseMoved',mouseDown:'mousePressed',mouseUp:'mouseReleased'};
export function cdpMouse(input,offset={x:0,y:0}){
 const type=MOUSE[input?.type];
 if(!type)throw new UndefinedNativeAdapterError('Mouse input shim lacks '+input?.type);
 const button=type==='mouseMoved'?(input.button?String(input.button):'none'):String(input.button||'left');
 return {type,x:Number(input.x)+offset.x,y:Number(input.y)+offset.y,button,clickCount:Number(input.clickCount)||(type==='mouseMoved'?0:1)};
}
// Electron keyDown/char/keyUp with a one-character keyCode -> CDP key events.
export function cdpKey(input){
 const key=String(input?.keyCode??'');
 if(key.length!==1)throw new UndefinedNativeAdapterError('Key input shim lacks '+key);
 const code=/[a-z]/i.test(key)?'Key'+key.toUpperCase():/\d/.test(key)?'Digit'+key:undefined;
 const base={key,code,windowsVirtualKeyCode:key.toUpperCase().charCodeAt(0)};
 if(input.type==='keyDown')return {type:'rawKeyDown',...base};
 if(input.type==='char')return {type:'char',...base,text:key,unmodifiedText:key};
 if(input.type==='keyUp')return {type:'keyUp',...base};
 throw new UndefinedNativeAdapterError('Key input shim lacks '+input?.type);
}
async function send(cdp,input,offset){
 if(MOUSE[input?.type])await cdp.send('Input.dispatchMouseEvent',cdpMouse(input,offset));
 else await cdp.send('Input.dispatchKeyEvent',cdpKey(input));
 return true;
}
// The active tab's document: among targets showing the active tab's URL, the
// one whose document is visible (inactive tabs report hidden).
async function activePage(w){
 const s=await w.snapshot();const tab=s.tabs.find(t=>String(t.id)===String(s.activeTabId));
 if(!tab)throw Error('No active native tab');
 await w.app.refresh();
 const url=shippingPageUrl(tab.url);
 const candidates=w.app.windows().filter(p=>p.targetId&&!p.isClosed()&&p.url()===url);
 const visible=[];for(const p of candidates)if(await p.evalExpression('document.visibilityState')==='visible')visible.push(p);
 if(visible.length!==1)throw new UndefinedNativeAdapterError('Active tab document is not uniquely addressable: '+tab.url);
 return visible[0];
}
async function windowOf(w){
 const page=await activePage(w);
 return w.fixture.browser.send('Browser.getWindowForTarget',{targetId:page.targetId});
}
const strip=w=>w.frame('strip');const overlay=w=>w.frame('overlay');
// The strip paints from the host's snapshot poll; read it after the host's
// own refresh has carried the native state that the step just changed.
const painted=w=>w.hostEval('window.BlancPrototypeHost.refresh().then(()=>new Promise(r=>setTimeout(r,50)))');
const frameRect=(w,id)=>w.hostEval(`(()=>{const f=document.getElementById(${JSON.stringify(id)});if(!f||f.hidden)return null;const r=f.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})()`);
async function frameInput(w,id,input){
 const r=await frameRect(w,id);if(!r)return false;
 return send(w.fixture.host,input,{x:r.x,y:r.y});
}
// The strip renderer's own report (renderer.js reportIslandRect): the resting
// pill box with any proximity swell divided back out, plus the URL area.
async function islandReport(w){
 const offset=await frameRect(w,'strip');if(!offset)return null;
 const r=await strip(w).evaluate(()=>{
  const pill=document.getElementById('islandPill');const r=pill?.getBoundingClientRect();if(!r||!r.width)return null;
  const k=pill.classList.contains('shield-open')||pill.classList.contains('spaces-open')?0:Number(pill.style.getPropertyValue('--island-k'))||0;
  const scale=1+0.02*k,width=r.width/scale,height=r.height/scale,y=r.top+2*k;
  const parts=[document.getElementById('pillDomain').getBoundingClientRect()];
  if(document.getElementById('pillInsecure').hidden)parts.push(document.getElementById('pillFavicon').getBoundingClientRect());
  const vis=parts.filter(p=>p.width>0),center=r.left+r.width/2;
  const hover=vis.length?(()=>{const left=Math.min(...vis.map(p=>p.left)),right=Math.max(...vis.map(p=>p.right));
   return {x:center+(left-center)/scale,y,width:(right-left)/scale,height};})():null;
  return {x:center-width/2,y,width,height,hoverRect:hover};
 });
 if(!r)return null;
 const shift=b=>b&&{x:b.x+offset.x,y:b.y+offset.y,width:b.width,height:b.height};
 return {rect:shift(r),hoverRect:shift(r.hoverRect)};
}
// Shipping sets these through its Settings page; drive the fork's Settings
// page the same way. A missing control is the product's own gap.
async function settingsControl(w,id,apply){
 const before=new Set((await w.snapshot()).tabs.map(t=>String(t.id)));
 await w.api('openPage',['settings']);
 const s=await w.waitForState(st=>st.activeTabId&&!st.tabs.find(t=>t.id===st.activeTabId).loading);
 const tabId=s.activeTabId;const created=!before.has(tabId);
 try{
  const page=await tabPage(w,tabId);
  await page.waitForLoadState();
  const value=await page.evaluate(([id,apply])=>{
   const el=document.getElementById(id);if(!el)return {missing:true,url:location.href};
   if(el.type==='checkbox'){if(el.checked!==apply)el.click();return {value:el.checked};}
   el.value=apply;el.dispatchEvent(new Event('change',{bubbles:true}));return {value:el.value};
  },[id,apply]);
  if(value.missing)throw Error(`Fork Settings (${value.url}) has no #${id} control`);
  return value.value;
 }finally{if(created)await w.native('closeTab',[nativeId(tabId)]);}
}
export const island={
 // ---- window ----
 async windowContentBounds(w){
  const {bounds}=await windowOf(w);
  // The Island window has no OS frame: the host and the page split its height.
  const [host,page]=await Promise.all([w.hostEval('({w:innerWidth,h:innerHeight})'),(await activePage(w)).evalExpression('innerHeight')]);
  if(host.w!==bounds.width||(host.h===68&&host.h+page!==bounds.height))throw Error('Island window content does not fill its frame: '+JSON.stringify({bounds,host,page}));
  return {x:bounds.left,y:bounds.top,width:bounds.width,height:bounds.height};
 },
 async setWindowContentSize(w,width,height){
  const {windowId}=await windowOf(w);
  await w.fixture.browser.send('Browser.setWindowBounds',{windowId,bounds:{windowState:'normal'}});
  await w.fixture.browser.send('Browser.setWindowBounds',{windowId,bounds:{width:Number(width),height:Number(height)}});
 },
 async mainWindowState(w){const {bounds}=await windowOf(w);return {maximized:bounds.windowState==='maximized',minimized:bounds.windowState==='minimized'};},
 async restoreMainWindow(w){const {windowId}=await windowOf(w);await w.fixture.browser.send('Browser.setWindowBounds',{windowId,bounds:{windowState:'normal'}});return true;},
 chromeButtonRects:undef('The fork strip reports no window-button geometry to the host'),
 mainMenuRequests:undef('The fork host keeps no record of main-menu requests'),
 // ---- strip geometry and DOM ----
 islandRect:async w=>(await islandReport(w))?.rect??null,
 islandHoverRect:async w=>(await islandReport(w))?.hoverRect??null,
 async islandDotsState(w){await painted(w);return strip(w).evaluate(()=>{
  const overflow=document.querySelector('.pill-overflow');const dots=[...document.querySelectorAll('.island-dot')];
  return {directCount:dots.length,directIds:dots.map(d=>d.dataset.tabId),directTitles:dots.map(d=>d.title),
   overflowText:overflow?.textContent??'',overflowLabel:overflow?.getAttribute('aria-label')??'',
   iconsMode:document.getElementById('pillDots')?.classList.contains('icons')===true,
   iconCount:document.querySelectorAll('#pillDots .island-dot > .dot-icon').length,
   peekCount:document.querySelectorAll('#pillDots .island-dot > .dot-peek').length};
 });},
 pillPlaceholderState:w=>strip(w).evaluate(()=>{
  const label=document.getElementById('pillDomain');const chip=document.getElementById('pillSlash');if(!label)return null;
  const cs=getComputedStyle(label);const fill=cs.webkitTextFillColor||cs.color;
  return {text:label.textContent,placeholder:label.classList.contains('placeholder'),animation:cs.animationName,
   gradientPainted:/rgba\(0, 0, 0, 0\)|transparent/.test(fill),reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches,
   chipHidden:chip?!!chip.hidden:null,chipLabel:chip?chip.textContent:null};
 }),
 clickPillSlash:w=>strip(w).evaluate(()=>document.getElementById('pillSlash').click()),
 stripAppRegion:w=>strip(w).evaluate(()=>{const s=getComputedStyle(document.getElementById('strip'));return s.getPropertyValue('-webkit-app-region')||s.appRegion;}),
 dragBandAppRegion:w=>strip(w).evaluate(()=>{const b=document.getElementById('dragBand');if(!b)return null;const s=getComputedStyle(b);
  return s.display==='none'?'none':s.getPropertyValue('-webkit-app-region')||s.appRegion;}),
 chromeEval:(w,script)=>strip(w).evalExpression(String(script)),
 sendChromeMouseInput:(w,input)=>frameInput(w,'strip',input),
 // ---- overlay ----
 overlayAddressValue:w=>overlay(w).evaluate(()=>document.getElementById('addressInput')?.value??null),
 overlayFocusedId:w=>overlay(w).evaluate(()=>document.hasFocus()?(document.activeElement?.id??null):null),
 overlayPanelRect:async w=>(await frameRect(w,'overlay'))?overlay(w).evaluate(()=>{const r=document.getElementById('islandPanel')?.getBoundingClientRect();
  return r&&r.width>0?{left:r.left,top:r.top,right:r.right,bottom:r.bottom}:null;}):null,
 // The overlay iframe is the fork's overlay view: shown is attached.
 overlayViewAttached:async w=>!!(await frameRect(w,'overlay')),
 overlayViewBounds:w=>frameRect(w,'overlay'),
 overlayBounds:w=>frameRect(w,'overlay'),
 sendOverlayInput:(w,input)=>frameInput(w,'overlay',input),
 // Counts the host's own onOverlayShow broadcasts to the current overlay
 // document, from the reset onward.
 resetOverlayShowCount:w=>w.hostEval(`(()=>{const d=document.getElementById('overlay').contentDocument;
  if(window.__blancTestShows?.doc!==d){const c={doc:d,n:0};window.__blancTestShows=c;window.BlancPrototypeHost.api.onOverlayShow(()=>{c.n++;});}
  window.__blancTestShows.n=0;})()`),
 async overlayShowCount(w){
  const n=await w.hostEval(`(()=>{const c=window.__blancTestShows;return c&&c.doc===document.getElementById('overlay').contentDocument?c.n:null})()`);
  if(n==null)throw Error('Overlay show counter was not reset on the current overlay document');
  return n;
 },
 overlayDragging:undef('The fork host discards setOverlayDragState; no overlay drag flag exists to read'),
 // ---- tab documents ----
 async sendMouseInput(w,id,input){const page=await tabPage(w,id);await page.evalExpression('1');return send(page.cdp,input);},
 async typeIntoActivePage(w,key){const page=await activePage(w);await page.evalExpression('1');
  for(const type of ['keyDown','char','keyUp'])await page.cdp.send('Input.dispatchKeyEvent',cdpKey({type,keyCode:key}));return true;},
 // The rail's activate-and-focus-page path; shipping focuses the active tab.
 async focusTabContents(w,id){
  if(String((await w.snapshot()).activeTabId)!==String(id))throw Error('focusTabContents expects the active tab');
  await w.api('activateTabFromRail',[String(id)]);return true;
 },
 // ---- layout ----
 setVerticalTabsWidth:(w,width)=>w.api('setVerticalTabsWidth',[width]),
 reorderGroup:(w,id,before)=>w.api('reorderGroup',[String(id),before==null?null:String(before)]),
 // Cmd+1..3 go through the native browser commands the fork binds to Island
 // slots (SelectIslandSlot); other slots have no reachable native command.
 async selectTabAtIndex(w,index){
  const slot={0:'slot1',1:'slot2',2:'slot3'}[index];
  if(!slot)throw new UndefinedNativeAdapterError('No native test path selects Island slot '+(index+1)+' (previewPageCommand maps slot1-3 and slot9 only)');
  if(await w.native('previewPageCommand',[slot])!==true)throw Error('Island slot command was refused: '+slot);
 },
 // ---- settings (fork Settings page) ----
 setIslandTabIcons:(w,on)=>settingsControl(w,'islandTabIcons',!!on),
 setIslandHoverOpen:(w,on)=>settingsControl(w,'islandHoverOpen',on===true),
 setIslandAutoHide:(w,on)=>settingsControl(w,'islandAutoHide',on===true),
 setIslandAutoHideStyle:(w,style)=>settingsControl(w,'islandAutoHideStyle',String(style)),
 // ---- surfaces the fork Island does not have ----
 islandHoverState:undef('The fork Island has no hover-open state machine to observe'),
 islandAutoHideState:undef('The fork Island has no auto-hide state to observe'),
 setTestCursorPoint:undef('Cursor sampling override is a shipping test seed; the fork samples no cursor'),
 setCursorSamplingUnavailable:undef('Cursor sampling override is a shipping test seed; the fork samples no cursor'),
 holdIslandInWindow:undef('The fork has no floating Island to hold'),
 floatEval:undef('The fork has no floating Island views'),
 floatViewState:undef('The fork has no floating Island views'),
 floatControlsState:undef('The fork has no floating Island views'),
 sendFloatMouseInput:undef('The fork has no floating Island views'),
 floatWebContentsIds:undef('The fork has no floating Island views'),
 floatPillWebContentsId:undef('The fork has no floating Island views'),
 chromeSurfaceRegistered:undef('The fork has no per-window chrome surface registry (float views)'),
};
