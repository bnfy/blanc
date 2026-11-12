// Island geometry, pointer and layout: shipping test-hook names over the
// Island's own documents (strip/overlay iframes of the host), CDP input and
// window commands, the fork Settings page, and native dispatch.
import {UndefinedNativeAdapterError,nativeId} from '../lib/adapters.mjs';
import {inSettings} from './commands.mjs';
import {tabPage} from './core.mjs';
import {shippingPageUrl} from '../lib/page-shim.mjs';
import {jsLiteral} from '../lib/js-literal.mjs';
const undef=reason=>()=>{throw new UndefinedNativeAdapterError(reason);};
const SPACES_MENU_PAD=16,SPACES_MENU_SIDE=44;
// Electron sendInputEvent mouse types -> CDP Input.dispatchMouseEvent types.
const MOUSE={mouseMove:'mouseMoved',mouseDown:'mousePressed',mouseUp:'mouseReleased'};
export function cdpMouse(input,offset={x:0,y:0}){
 const type=MOUSE[input?.type];
 if(!type)throw new UndefinedNativeAdapterError('Mouse input shim lacks '+input?.type);
 const button=type==='mouseMoved'?(input.button?String(input.button):'none'):String(input.button||'left');
 return {type,x:Number(input.x)+offset.x,y:Number(input.y)+offset.y,button,buttons:type==='mouseReleased'?0:({left:1,right:2,middle:4}[button]??0),clickCount:Number(input.clickCount)||(type==='mouseMoved'?0:1)};
}
// Electron keyDown/char/keyUp with a one-character keyCode -> CDP key events.
export function cdpKey(input){
 const key=String(input?.keyCode??'');
 if(key==='Escape'){const base={key,code:'Escape',windowsVirtualKeyCode:27};
  return input.type==='keyDown'?{type:'rawKeyDown',...base}:{type:'keyUp',...base};}
 if(key.length!==1)throw new UndefinedNativeAdapterError('Key input shim lacks '+key);
 const code=/[a-z]/i.test(key)?'Key'+key.toUpperCase():/\d/.test(key)?'Digit'+key:undefined;
 const base={key,code,windowsVirtualKeyCode:key.toUpperCase().charCodeAt(0)};
 if(input.type==='keyDown')return {type:'rawKeyDown',...base};
 if(input.type==='char')return {type:'char',...base,text:key,unmodifiedText:key};
 if(input.type==='keyUp')return {type:'keyUp',...base};
 throw new UndefinedNativeAdapterError('Key input shim lacks '+input?.type);
}
async function send(cdp,input,offset){
 if(input?.type==='mouseWheel')await cdp.send('Input.dispatchMouseEvent',{type:'mouseWheel',x:Number(input.x)+(offset?.x??0),y:Number(input.y)+(offset?.y??0),deltaX:Number(input.deltaX)||0,deltaY:Number(input.deltaY)||0});
 else if(MOUSE[input?.type])await cdp.send('Input.dispatchMouseEvent',cdpMouse(input,offset));
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
// macOS floats only the pill (shipping's floatViewsWanted): no window
// controls or menu button of the fork's own.
const floatPill=(w,role)=>{if(role!=='pill')throw new UndefinedNativeAdapterError('The fork floats only the pill (macOS): no '+role+' view');return w.frame('floatPill');};
// The strip paints from the host's snapshot poll; read it after the host's
// own refresh has carried the native state that the step just changed.
const painted=w=>w.hostEval('window.BlancPrototypeHost.refresh().then(()=>new Promise(r=>setTimeout(r,50)))');
const frameRect=(w,id)=>w.hostEval(`(()=>{const f=document.getElementById(${jsLiteral(id)});if(!f||f.hidden)return null;const r=f.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})()`);
// The floating pill's frame, as shipping's floatViewState reports its view.
// Above every page and the sheet: views' own targeting gives its middle to
// the Island view.
async function floatViewState(w,role='pill'){
 if(role!=='pill')return null;
 const state=await w.hostEval('window.BlancPrototypeHost.floatViewState()');
 if(!state)return null;
 const b=state.bounds;
 const above=!!b&&await w.native('islandAbovePages')&&(!state.shown||await w.native('hitTarget',[Math.round(b.x+b.width/2),Math.round(b.y+Math.min(b.height-1,30))])==='island');
 return {...state,aboveTabsAndSheet:above};
}
// Blink dispatches mouse moves with the next frame, after CDP has answered;
// Electron's input-event reaches shipping's main process before
// sendInputEvent returns. Waiting two frames gives the move to its listeners
// first, so a step reads the state the move left.
const nextFrames='new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r(true))))';
async function frameInput(w,id,input){
 const r=await frameRect(w,id);if(!r)return false;
 await send(w.fixture.host,input,{x:r.x,y:r.y});
 if(MOUSE[input?.type])await w.hostEval(nextFrames);
 return true;
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
export const island={
 tabLayout:async w=>{
  const layout=(await w.snapshot()).tabLayout;
  // A restored native tab model can precede the strip iframe's first render.
  // Observe its actual layout after it catches up with the persisted model.
  return w.waitFor(()=>strip(w).evaluate(()=>document.documentElement.dataset.tabLayout),v=>v===layout,'rendered tab layout');
 },
 verticalTabsWidth:async w=>(await w.snapshot()).verticalTabsPreferredWidth,
 verticalTabsMetrics:async w=>{const s=await w.snapshot();return Object.fromEntries(Object.entries(s).filter(([k])=>k.startsWith('verticalTabs')));},
 utilityBounds:async w=>{const settings=await frameRect(w,'settingsSheet');return settings??frameRect(w,'sheet');},
 overlayElementRect:(w,selector)=>w.waitFor(()=>overlay(w).locator(selector).boundingBox(),Boolean,'rendered overlay '+selector),
 // ---- window ----
 async windowContentBounds(w){
  const {bounds}=await windowOf(w);
  // The Island window has no OS frame: the host and the page split its height,
  // or (auto-hide) the page takes all of it with the Island above it.
  // A zoomed page (Mahjong's records check) reports fewer CSS pixels; its
  // height is compared in the host's, within the pixel that rounding costs.
  const [host,inner]=await Promise.all([w.hostEval('({w:innerWidth,h:innerHeight,dpr:devicePixelRatio})'),(await activePage(w)).evalExpression('({h:innerHeight,dpr:devicePixelRatio})')]);
  const zoomed=inner.dpr!==host.dpr,page=zoomed?Math.round(inner.h*inner.dpr/host.dpr):inner.h;
  const fills=h=>zoomed?Math.abs(h-bounds.height)<=1:h===bounds.height;
  if(host.w!==bounds.width||([68,76,84].includes(host.h)&&!fills(host.h+page)&&!fills(page)))throw Error('Island window content does not fill its frame: '+JSON.stringify({bounds,host,page}));
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
 // The fork's window drag is native (IsCaption), not CSS app regions, so
 // these read the caption: an empty strip point beside the pill, and the
 // thin band along the page pane's top.
 async stripAppRegion(w){
  const pill=(await islandReport(w))?.rect;if(!pill)return null;
  return await w.native('captionAt',[Math.round(Math.max(100,pill.x-40)),34])?'drag':'no-drag';
 },
 async dragBandAppRegion(w){
  const {width}=await island.windowContentBounds(w);
  return await w.native('captionAt',[Math.round(width/2),2])?'drag':'none';
 },
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
 // Shipping attaches its positioned Spaces view before reporting its bounds.
 // The fork publishes the host mode before the next-frame renderer handoff;
 // wait for that handoff before reading the menu and its actual shadow room.
 async overlayBounds(w){
  const spaces=await w.call('overlayMode')==='spaces';
  if(spaces)await w.waitFor(()=>w.call('overlayRendererMode'),mode=>mode==='spaces','rendered Spaces overlay');
  const frame=await frameRect(w,'overlay');
  if(!frame)return frame;
  // Shipping reports native view bounds, before its WebContents zoom. Frame
  // DOM bounds are zoomed CSS pixels; recover the host's native window scale.
  const {bounds}=await windowOf(w);
  const scale=bounds.width/await w.hostEval('innerWidth');
  const native=r=>Object.fromEntries(Object.entries(r).map(([key,value])=>[key,value*scale]));
  if(!spaces)return native(frame);
  const menu=await overlay(w).locator('#workspaceSwitcher').boundingBox();if(!menu)return frame;
  return native({x:frame.x+menu.x-SPACES_MENU_SIDE,y:frame.y+menu.y-SPACES_MENU_PAD,width:menu.width+SPACES_MENU_SIDE*2,height:menu.height+SPACES_MENU_PAD*2});},
 sendOverlayInput:(w,input)=>frameInput(w,'overlay',input),
 async pressOverlayKey(w,key,modifiers=[]){
  await overlay(w).evaluate(()=>window.focus());
  await overlay(w).keyboard.press([...modifiers,key].join('+'));return true;
 },
 async spacesMenuExitState(w){
  const view={mode:await w.call('overlayMode'),showing:!!(await frameRect(w,'overlay'))};
  const menu=await overlay(w).evaluate(()=>{
   const m=document.getElementById('workspaceSwitcher'),s=getComputedStyle(m);
   return {hidden:m.hidden,closing:document.body.dataset.closing??'',display:s.display,
    top:s.top,left:s.left,transform:s.transform,opacity:Number(s.opacity)};
  });
  return {...view,...menu};
 },
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
 overlayDragging:w=>w.hostEval('window.BlancPrototypeHost.overlayDragging()'),
 // ---- tab documents ----
 setMouseGestures:(w,enabled,mapping)=>w.native("setMouseGestures",mapping===undefined?[!!enabled]:[!!enabled,mapping]),
 async sendMouseInput(w,id,input){
  const page=await tabPage(w,id);await page.evalExpression('1');
  if(input?.type==='mouseDown'){
   await w.waitFor(async()=>{
    const s=await w.snapshot(),bounds=s.tabs.find(t=>String(t.id)===String(id))?.viewBounds;
    const shown=String(s.glanceTabId)!==String(id)||(await w.hostEval('window.BlancPrototypeHost.glanceState()')).shown;
    return !!bounds&&bounds.width>0&&bounds.height>0&&shown&&await page.evalExpression('document.visibilityState === "visible"');
   },Boolean,'visible native input target');
  }
  const sent=await send(page.cdp,input);
  // A CDP mouse-move acknowledgement can precede its frame dispatch. Flush
  // it before the next release, as Electron sendInputEvent's native path does.
  if(input?.type==='mouseMove')await page.evalExpression(nextFrames);
  return sent;
 },
 async typeIntoActivePage(w,key){const page=await activePage(w);await page.evalExpression('1');
  for(const type of ['keyDown','char','keyUp'])await page.cdp.send('Input.dispatchKeyEvent',cdpKey({type,keyCode:key}));return true;},
 // Keep the rail path for active tabs; background focus uses the test hook.
 async focusTabContents(w,id){
  if((await w.snapshot()).glanceTabId!=null)return w.api('focusGlancePane',[String(id)]);
  if(String((await w.snapshot()).activeTabId)!==String(id))return w.native('testFocusTabContents',[nativeId(id)]);
  await w.api('activateTabFromRail',[String(id)]);return true;
 },
 // ---- layout ----
 setVerticalTabsWidth:(w,width)=>w.api('setVerticalTabsWidth',[width]),
 reorderGroup:(w,id,before)=>w.api('reorderGroup',[String(id),before==null?null:String(before)]),
 // Cmd+1..3 go through the native browser commands the fork binds to Island
 // slots (SelectIslandSlot); other slots have no reachable native command.
 async selectTabAtIndex(w,index){
  // Island slots 1-8 run Chromium's select-tab commands (slot9 is the last tab).
  if(!Number.isInteger(index)||index<0||index>7)throw new UndefinedNativeAdapterError('No Island slot for index '+index);
  const slot='slot'+(index+1);
  if(await w.native('previewPageCommand',[slot])!==true)throw Error('Island slot command was refused: '+slot);
 },
 // ---- settings (fork Settings page) ----
 // Settings → Appearance's switch (S1.7), as a person turns it.
 setIslandTabIcons:(w,on)=>inSettings(w,'appearance',async(a,d)=>{const el=d.find('#blancIslandTabIcons');
  if(!el)return {missing:'#blancIslandTabIcons'};if(el.checked!==a)el.click();await new Promise(r=>setTimeout(r,300));
  return {value:el.checked};},!!on),
 // Settings → Appearance's Island size dropdown (F3-35), as a person picks it.
 setIslandSize:(w,size)=>inSettings(w,'appearance',async(a,d)=>{const menu=d.find('#blancIslandSize');
  const select=menu?.shadowRoot?.querySelector('select');if(!select)return {missing:'#blancIslandSize'};
  if(select.value!==a){select.value=a;select.dispatchEvent(new Event('change',{bubbles:true}));await new Promise(r=>setTimeout(r,300));}
  return {value:select.value};},String(size)),
 // The active page's view, in window content coordinates: what the Island
 // and its rail leave of the window.
 async activeGuestBounds(w){
  const {bounds}=await windowOf(w);
  const page=await(await activePage(w)).evalExpression('({w:innerWidth,h:innerHeight})');
  return {x:bounds.width-page.w,y:bounds.height-page.h,width:page.w,height:page.h};
 },
 // Shipping's hook writes the setting directly (settings.setSettings); going
 // through the Settings page takes longer than a dwell. The host's refresh
 // carries it, as the preference observer's settings event does.
 async setIslandHoverOpen(w,on){
  const value=await w.native('setIslandHoverOpen',[on===true]);
  await w.hostEval('window.BlancPrototypeHost.refresh()');
  if((await w.snapshot()).islandHoverOpen!==(on===true))throw Error('The Island hover-open setting did not change');
  return value;
 },
 // Shipping's hooks write the settings directly, as setIslandHoverOpen does.
 async setIslandAutoHide(w,on){
  const value=await w.native('setIslandAutoHide',[on===true]);
  await w.hostEval('window.BlancPrototypeHost.refresh()');
  return value;
 },
 async setIslandAutoHideStyle(w,style){
  const value=await w.native('setIslandAutoHideStyle',[String(style)]);
  await w.hostEval('window.BlancPrototypeHost.refresh()');
  return value;
 },
 // ---- surfaces the fork Island does not have ----
 // Shipping's hover-open state, held by the host (host.js, F1).
 islandHoverState:w=>w.hostEval('window.BlancPrototypeHost.hoverState()'),
 // Native auto-hide state, with the host's how-to tip.
 async islandAutoHideState(w){
  const state=await w.native('autoHideState');
  return {...state,introTipShown:state.introducing&&await w.hostEval('window.BlancPrototypeHost.autoHideIntroShown()')};
 },
 // Shipping's test cursor, in screen coordinates. Native samples it for
 // auto-hide (in window content coordinates); the host samples its last
 // pointer when the panel closes (in the strip's, which sits above the page's
 // top when auto-hide pushes it).
 async setTestCursorPoint(w,point){
  if(point==null){
   await w.native('setTestCursorPoint',[null]);
   return w.hostEval('window.BlancPrototypeHost.setLastPointer(null)');
  }
  const bounds=await island.windowContentBounds(w);const strip=await frameRect(w,'strip');
  const local={x:point.x-bounds.x,y:point.y-bounds.y};
  if(await w.native('setTestCursorPoint',[local])!==true)return false;
  const state=await w.native('autoHideState');
  // Only the horizontal push style moves the Island with the page.
  const islandTop=state.floating||(await w.snapshot()).tabLayout==='vertical'?0:state.pageY-state.chromeHeight;
  return w.hostEval(`window.BlancPrototypeHost.setLastPointer(${JSON.stringify({x:local.x-strip.x,y:local.y-islandTop-strip.y})})`);
 },
 setCursorSamplingUnavailable:(w,on)=>w.native('setCursorSamplingUnavailable',[on===true]),
 // Shipping's acceptance hold, for this window's Island.
 async holdIslandInWindow(w,runtimeId,on){
  if(String(runtimeId)!=='primary')throw new UndefinedNativeAdapterError('The fork holds only the primary window\'s Island');
  const held=await w.native('holdIsland',[on===true]);
  await w.hostEval('window.BlancPrototypeHost.refresh()');
  return held;
 },
 // The floating pill is a frame of the Island host (host.js), shipping's
 // float view: its document, its native frame and input into it.
 floatEval:(w,role,script)=>floatPill(w,role).evalExpression(String(script)),
 floatViewState,
 floatControlsState:undef('The fork floats only the pill (macOS): no window controls or menu button views'),
 sendFloatMouseInput:(w,role,input)=>{floatPill(w,role);return frameInput(w,'floatPill',input);},
 // A window's float surfaces live and die with its Island host, so each is
 // named by that host's target and its frame.
 async floatWebContentsIds(w,runtimeId){
  const id=String(runtimeId);
  const {targetInfos:targets}=await w.fixture.browser.send('Target.getTargets');
  const ordered=await w.native('windowOrdinals');
  const targetId=id==='primary'?ordered[0]:/^window-\d+$/.test(id)?ordered[Number(id.slice(7))-1]:id;
  const host=targets.find(t=>t.targetId===targetId&&t.url==='chrome://blanc-prototype/host.html');
  if(!host)return [];
  return [`${targetId}:floatPill`];
 },
 floatPillWebContentsId:undef('The fork\'s floating pill is a frame of the Island host, not its own web contents'),
 async chromeSurfaceRegistered(w,surface){
  const [id]=String(surface).split(':');
  if(id==='primary')return true;
  const {targetInfos:targets}=await w.fixture.browser.send('Target.getTargets');
  return targets.some(t=>t.targetId===id);
 },
};
