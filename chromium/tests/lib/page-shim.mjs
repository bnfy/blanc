// The subset of Playwright's Page/Locator/ElectronApplication that shipping's
// step files use, over CDP. Shipping's overlay and strip are separate
// WebContents; the fork renders the same documents as iframes of the Island
// host, so frame pages offset input by the iframe's position.
import {UndefinedNativeAdapterError} from './adapters.mjs';
import {pause} from './cdp.mjs';
const KEYS={Enter:[13,'\r'],Escape:[27],Tab:[9],Backspace:[8],Delete:[46],ArrowDown:[40],ArrowUp:[38],ArrowLeft:[37],ArrowRight:[39],
 Home:[36],End:[35],PageDown:[34],PageUp:[33],Space:[32,' '],' ':[32,' '],Meta:[91],Control:[17],Shift:[16],Alt:[18],F6:[117]};
const MODIFIER_BITS={Alt:1,Control:2,Meta:4,Shift:8};
function keyEvent(key){
 if(KEYS[key])return {key:key==='Space'?' ':key,code:key==='Space'||key===' '?'Space':key,windowsVirtualKeyCode:KEYS[key][0],text:KEYS[key][1]};
 if(key.length===1){const upper=key.toUpperCase();const code=/[a-z]/i.test(key)?'Key'+upper:/\d/.test(key)?'Digit'+key:undefined;
  return {key,code,windowsVirtualKeyCode:upper.charCodeAt(0),text:key};}
 throw new UndefinedNativeAdapterError('Keyboard shim lacks key '+key);
}
export class Keyboard{
 constructor(cdp){this.cdp=cdp;this.modifiers=0;}
 async down(key){const e=keyEvent(key);if(MODIFIER_BITS[key])this.modifiers|=MODIFIER_BITS[key];
  const text=this.modifiers&~MODIFIER_BITS.Shift?undefined:e.text;
  await this.cdp.send('Input.dispatchKeyEvent',{type:text?'keyDown':'rawKeyDown',modifiers:this.modifiers,...e,text,unmodifiedText:text,
   ...(this.modifiers&MODIFIER_BITS.Meta&&key.length===1?{commands:[]}:{})});}
 async up(key){const e=keyEvent(key);if(MODIFIER_BITS[key])this.modifiers&=~MODIFIER_BITS[key];
  await this.cdp.send('Input.dispatchKeyEvent',{type:'keyUp',modifiers:this.modifiers,...e,text:undefined});}
 async press(combo){const keys=combo.split('+').map(k=>k==='ControlOrMeta'?'Meta':k);
  for(const k of keys)await this.down(k);for(const k of [...keys].reverse())await this.up(k);}
 async type(text){for(const ch of text)await this.press(ch);}
 async insertText(text){await this.cdp.send('Input.insertText',{text});}
}
export class Mouse{
 constructor(cdp,offset){this.cdp=cdp;this.offset=offset;this.x=0;this.y=0;this.buttons=0;}
 async event(type,x,y,extra={}){const o=await this.offset();
  await this.cdp.send('Input.dispatchMouseEvent',{type,x:x+o.x,y:y+o.y,buttons:this.buttons,...extra});}
 async move(x,y,{steps=1}={}){const fx=this.x,fy=this.y;
  for(let i=1;i<=steps;i++)await this.event('mouseMoved',fx+(x-fx)*i/steps,fy+(y-fy)*i/steps,this.buttons?{button:'left'}:{});
  this.x=x;this.y=y;}
 async down({button='left',clickCount=1}={}){this.buttons=1;await this.event('mousePressed',this.x,this.y,{button,clickCount});}
 async up({button='left',clickCount=1}={}){this.buttons=0;await this.event('mouseReleased',this.x,this.y,{button,clickCount});}
 async click(x,y,options={}){await this.move(x,y);await this.down(options);await this.up(options);}
 async wheel(deltaX,deltaY){const o=await this.offset();
  await this.cdp.send('Input.dispatchMouseEvent',{type:'mouseWheel',x:this.x+o.x,y:this.y+o.y,deltaX,deltaY});}
}
const call=(fn,...args)=>`(${typeof fn==='string'?`()=>(${fn})`:fn.toString()})(${args.map(a=>a===undefined?'undefined':JSON.stringify(a)).join(',')})`;
// Playwright's { hasText } narrows a step by its normalized text content:
// a case-insensitive substring for a string, or a RegExp.
function step(css,{hasText}={}){
 if(hasText==null)return css;
 return {css,text:hasText instanceof RegExp?{source:hasText.source,flags:hasText.flags}:String(hasText)};
}
export class Locator{
 constructor(page,selectors,index=null){this.page=page;this.selectors=selectors;this.index=index;}
 locator(selector,options){return new Locator(this.page,[...this.selectors,step(selector,options)],this.index===null?null:this.index);}
 first(){return new Locator(this.page,this.selectors,0);}
 last(){return new Locator(this.page,this.selectors,-1);}
 nth(i){return new Locator(this.page,this.selectors,i);}
 getByRole(){throw new UndefinedNativeAdapterError('Locator shim lacks getByRole');}
 // Resolve inside the page: each selector narrows the previous matches.
 query(body,arg){return `(()=>{let els=[document];const norm=t=>t.replace(/\\s+/g,' ').trim();
  for(const s of ${JSON.stringify(this.selectors)}){els=els.flatMap(e=>[...e.querySelectorAll(typeof s==='string'?s:s.css)]);
   if(typeof s!=='string')els=els.filter(e=>typeof s.text==='string'?norm(e.textContent).toLowerCase().includes(norm(s.text).toLowerCase()):new RegExp(s.text.source,s.text.flags).test(norm(e.textContent)));}
  els=[...new Set(els)];const index=${JSON.stringify(this.index)};
  if(index!==null)els=index<0?els.slice(index):els.slice(index,index+1);return (${body})(els,${JSON.stringify(arg)});})()`;}
 async all(fn,arg){return this.page.evalExpression(this.query(`(els,arg)=>(${fn.toString()})(els,arg)`,arg));}
 async one(fn,arg,{timeout=5000}={}){const end=Date.now()+timeout;
  for(;;){const r=await this.page.evalExpression(this.query(`(els,arg)=>els.length===0?{missing:true}:els.length>1&&${this.index===null}?{strict:els.length}:{value:(${fn.toString()})(els[0],arg)}`,arg));
   if(r.strict)throw Error(`strict mode violation: ${this.selectors.map(s=>typeof s==='string'?s:s.css+':has-text('+JSON.stringify(s.text)+')').join(' ')} resolved to ${r.strict} elements`);
   if(!r.missing)return r.value;if(Date.now()>end)throw Error('Timeout waiting for '+this.selectors.map(s=>typeof s==='string'?s:s.css+':has-text('+JSON.stringify(s.text)+')').join(' '));await pause(50);}}
 count(){return this.all(els=>els.length);}
 allTextContents(){return this.all(els=>els.map(e=>e.textContent));}
 allInnerTexts(){return this.all(els=>els.map(e=>e.innerText));}
 evaluate(fn,arg){return this.page.evalExpression(this.query(`(els,arg)=>{if(!els[0])throw Error('No element for locator');return (${fn.toString()})(els[0],arg)}`,arg));}
 evaluateAll(fn,arg){return this.all(fn,arg);}
 getAttribute(name,o){return this.one((e,n)=>e.getAttribute(n),name,o);}
 textContent(o){return this.one(e=>e.textContent,undefined,o);}
 innerText(o){return this.one(e=>e.innerText,undefined,o);}
 inputValue(o){return this.one(e=>e.value,undefined,o);}
 isVisible(){return this.all(els=>{const e=els[0];if(!e)return false;const r=e.getBoundingClientRect();const s=getComputedStyle(e);
  return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none';});}
 isEnabled(){return this.one(e=>!e.disabled);}
 isHidden(){return this.isVisible().then(v=>!v);}
 async waitFor({state='visible',timeout=5000}={}){const end=Date.now()+timeout;
  for(;;){const [count,visible]=await Promise.all([this.count(),this.isVisible()]);
   if(state==='attached'&&count||state==='detached'&&!count||state==='visible'&&visible||state==='hidden'&&!visible)return;
   if(Date.now()>end)throw Error(`Timeout waiting for ${this.selectors.map(s=>typeof s==='string'?s:s.css+':has-text('+JSON.stringify(s.text)+')').join(' ')} to be ${state}`);await pause(50);}}
 boundingBox(){return this.all(els=>{const e=els[0];if(!e)return null;const r=e.getBoundingClientRect();
  return r.width||r.height?{x:r.x,y:r.y,width:r.width,height:r.height}:null;});}
 scrollIntoViewIfNeeded(){return this.one(e=>{e.scrollIntoView({block:'nearest',inline:'nearest'});return true;});}
 focus(){return this.one(e=>{e.focus();return true;});}
 blur(){return this.one(e=>{e.blur();return true;});}
 dispatchEvent(type,init={}){return this.one((e,a)=>{e.dispatchEvent(new (a.type.startsWith('pointer')?PointerEvent:a.type.startsWith('mouse')||a.type==='click'||a.type==='contextmenu'?MouseEvent:a.type.startsWith('key')?KeyboardEvent:Event)(a.type,{bubbles:true,cancelable:true,composed:true,...a.init}));return true;},{type,init});}
 selectOption(value){return this.one((e,v)=>{e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));return [e.value];},value);}
 // Playwright's actionability: visible, stable across animation frames, and
 // the hit target at its centre (an opening morph must not eat the click).
 async center({timeout=5000}={}){await this.waitFor({timeout});await this.scrollIntoViewIfNeeded();const end=Date.now()+timeout;
  for(let last=null;;){// A throttled (background) document may never paint; a timer bounds the wait.
   const r=await this.evaluate(e=>new Promise(done=>{const read=()=>{const b=e.getBoundingClientRect(),x=b.x+b.width/2,y=b.y+b.height/2;
    done({x:b.x,y:b.y,width:b.width,height:b.height,hit:e.contains(document.elementFromPoint(x,y))});};
    requestAnimationFrame(()=>requestAnimationFrame(read));setTimeout(read,100);}));
   if(r.width&&r.hit&&last&&['x','y','width','height'].every(k=>r[k]===last[k]))return {x:r.x+r.width/2,y:r.y+r.height/2};
   if(Date.now()>end)throw Error(`Timeout waiting for ${this.selectors.map(s=>typeof s==='string'?s:s.css+':has-text('+JSON.stringify(s.text)+')').join(' ')} to be stable and receive pointer events`);last=r;}}
 async click({button='left',clickCount=1,modifiers=[],position}={}){
  const b=position?await this.boundingBox():null;const p=position?{x:b.x+position.x,y:b.y+position.y}:await this.center();
  for(const m of modifiers)await this.page.keyboard.down(m==='ControlOrMeta'?'Meta':m);
  await this.page.mouse.move(p.x,p.y);
  for(let i=1;i<=clickCount;i++){await this.page.mouse.down({button,clickCount:i});await this.page.mouse.up({button,clickCount:i});}
  for(const m of [...modifiers].reverse())await this.page.keyboard.up(m==='ControlOrMeta'?'Meta':m);}
 dblclick(o={}){return this.click({...o,clickCount:2});}
 async hover(){const p=await this.center();await this.page.mouse.move(p.x,p.y);}
 async fill(value){await this.focus();
  await this.one((e,v)=>{e.value=v;e.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:v}));return true;},value);}
 async press(key){await this.focus();await this.page.keyboard.press(key);}
 async type(text){await this.focus();await this.page.keyboard.type(text);}
 screenshot(){throw new UndefinedNativeAdapterError('Locator shim lacks screenshot');}
 page(){return this.page;}
}
export class Page{
 // frame: null for a top-level target; otherwise the host iframe's id.
 constructor({cdp,url,frame=null,host=null,closed=()=>false}){
  this.cdp=cdp;this.pageUrl=url;this.frame=frame;this.host=host;this.closedProbe=closed;this.contexts=new Map();
  this.keyboard=new Keyboard(cdp);this.mouse=new Mouse(cdp,()=>this.offset());
 }
 async offset(){if(!this.frame)return {x:0,y:0};
  return this.cdp.eval(`(()=>{const r=document.getElementById(${JSON.stringify(this.frame)}).getBoundingClientRect();return {x:r.x,y:r.y}})()`);}
 async contextId(){
  if(!this.frame)return undefined;
  // One context map per connection: frame pages share the host connection,
  // and a second Runtime.enable on it reports no existing contexts.
  if(!this.cdp.frameContexts){const contexts=this.cdp.frameContexts=new Map();
   this.cdp.on('Runtime.executionContextCreated',({context})=>{if(context.auxData?.isDefault)contexts.set(context.auxData.frameId,context.id);});
   this.cdp.on('Runtime.executionContextDestroyed',({executionContextId})=>{for(const [f,id] of contexts)if(id===executionContextId)contexts.delete(f);});
   this.cdp.on('Runtime.executionContextsCleared',()=>contexts.clear());
   await this.cdp.send('Runtime.enable');}
  this.contexts=this.cdp.frameContexts;
  const tree=(await this.cdp.send('Page.getFrameTree')).frameTree;
  const src=await this.cdp.eval(`document.getElementById(${JSON.stringify(this.frame)}).src`);
  const child=(tree.childFrames||[]).find(f=>f.frame.url===src);
  if(!child)throw Error('Island frame not loaded: '+this.frame);
  for(let i=0;i<50&&!this.contexts.has(child.frame.id);i++)await pause(20);
  if(!this.contexts.has(child.frame.id))throw Error('No script context for '+this.frame);
  return this.contexts.get(child.frame.id);
 }
 async evalExpression(expression){return this.cdp.eval(expression,await this.contextId());}
 evaluate(fn,arg){return this.evalExpression(call(fn,arg));}
 async waitForFunction(fn,arg,{timeout=5000,polling=50}={}){const end=Date.now()+timeout;let last;
  for(;;){try{last=await this.evaluate(fn,arg);if(last)return last;}catch(e){last=e.message;}
   if(Date.now()>end)throw Error('waitForFunction timed out: '+JSON.stringify(last));await pause(typeof polling==='number'?polling:50);}}
 waitForTimeout(ms){return pause(ms);}
 async waitForLoadState(){await this.waitForFunction(()=>document.readyState!=='loading');}
 locator(selector,options){return new Locator(this,[step(selector,options)]);}
 getByRole(){throw new UndefinedNativeAdapterError('Page shim lacks getByRole');}
 fill(selector,value){return this.locator(selector).fill(value);}
 press(selector,key){return this.locator(selector).press(key);}
 click(selector,o){return this.locator(selector).click(o);}
 focus(selector){return this.locator(selector).focus();}
 textContent(selector){return this.locator(selector).textContent();}
 getAttribute(selector,name){return this.locator(selector).getAttribute(name);}
 inputValue(selector){return this.locator(selector).inputValue();}
 url(){return this.pageUrl;}
 isClosed(){return this.closedProbe();}
 screenshot(){throw new UndefinedNativeAdapterError('Page shim lacks screenshot');}
 waitForEvent(){throw new UndefinedNativeAdapterError('Page shim lacks waitForEvent');}
 context(){throw new UndefinedNativeAdapterError('Page shim lacks context');}
 bringToFront(){return this.cdp.send('Page.bringToFront');}
}
// Shipping URLs for the Island's documents and its internal pages.
export const ISLAND_FRAMES={'blanc-chrome://overlay/':'overlay','blanc-chrome://index/':'strip'};
export function shippingPageUrl(url){
 if(url==='chrome://newtab/'||url.startsWith('chrome://new-tab-page'))return 'blanc://newtab/';
 // The fork's chrome://newtab/ commits its Start Page document here.
 if(url.startsWith('chrome://blanc-prototype/pages/newtab.html'))return 'blanc://newtab/'+url.slice('chrome://blanc-prototype/pages/newtab.html'.length);
 if(url.startsWith('chrome://blanc-prototype/blocking-settings.html'))return 'blanc://settings/';
 return url;
}
// Playwright's ElectronApplication, minus the main process: main-process
// evaluation has no fork equivalent and must be ported per step.
export function createAppShim(fixture){
 const pages=new Map();
 const app={
  windows(){return [...pages.values()];},
  evaluate(){throw new UndefinedNativeAdapterError('Shipping main-process evaluate needs a native adapter');},
  firstWindow(){return pages.get('strip');},
  async refresh(){
   for(const [url,frame] of Object.entries(ISLAND_FRAMES))if(!pages.has(frame))pages.set(frame,new Page({cdp:fixture.host,url,frame,host:fixture.host}));
   const targets=(await fixture.targets()).filter(t=>t.type==='page'&&!t.url.startsWith('chrome://blanc-prototype/host.html'));
   const live=new Set(targets.map(t=>t.id));
   for(const [key,page] of pages)if(page.targetId&&!live.has(page.targetId)){page.closed=true;pages.delete(key);}
   for(const t of targets)if(!pages.has(t.id)){
    const page=new Page({cdp:null,url:shippingPageUrl(t.url),closed:()=>page.closed===true});page.targetId=t.id;
    // Connect lazily; most steps never touch tab documents.
    const connectFor=async()=>{if(!page.cdp){page.cdp=await fixture.connectTarget(t);page.keyboard=new Keyboard(page.cdp);page.mouse=new Mouse(page.cdp,()=>page.offset());}return page.cdp;};
    for(const m of ['evalExpression','offset'])page[m]=(orig=>async(...a)=>{await connectFor();return orig.apply(page,a);})(Page.prototype[m]);
    pages.set(t.id,page);
   }
  },
 };
 return app;
}
