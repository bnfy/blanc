import fs from 'node:fs';import http from 'node:http';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {connect,pause} from './cdp.mjs';
const root='/private/tmp/blanc-split-layout-fix',label=process.argv[2]||'fixed',profile=root+'/profile-'+label,port=9277;
const proof={label,checks:[]},clients=[];let proc;
const record=(name,value)=>proof.checks.push({name,value});
const wait=async(fn,test)=>{for(let i=0;i<200;i++){const x=await fn().catch(()=>null);if(test(x))return x;await pause(100)}throw Error('wait timeout')};
const list=()=>fetch(`http://127.0.0.1:${port}/json/list`).then(r=>r.json());
const attach=async(t)=>{const c=await connect(t);clients.push(c);c.targetId=t.id;return c};
const api=(h,m,...a)=>h.eval(`BlancPrototypeHost.api.${m}(...${JSON.stringify(a)})`);
const shape=s=>({tabs:s.tabs.map(t=>({id:t.id,url:t.url,private:t.private})),splits:s.splits,active:s.activeTabId,glance:s.glanceTabId});
const server=http.createServer((q,r)=>{r.setHeader('Content-Type','text/html');r.end('<title>Split eligibility fixture</title><h1>Fixture</h1>')});await new Promise(r=>server.listen(9278,'127.0.0.1',r));
try{
const log=fs.openSync(root+'/'+label+'.browser.log','a');
proc=spawn('/Users/anthonyjloria/Projects/BlancChromium157/src/out/BlancPrototype/Blanc Prototype.app/Contents/MacOS/Blanc Prototype',[`--user-data-dir=${profile}`,`--remote-debugging-port=${port}`,'--blanc-prototype-assets=/private/tmp/blanc-chromium157-work/experiments/chromium-extension-spike/generated','--no-first-run','--no-default-browser-check','--use-mock-keychain','about:blank'],{stdio:['ignore',log,log]});
await wait(list,x=>x?.some(t=>t.url.includes('/host.html')));const browser=await attach(await fetch(`http://127.0.0.1:${port}/json/version`).then(r=>r.json()));
for(const privateMode of [false,true]){
let context;
if(privateMode){context=(await browser.send('Target.createBrowserContext')).browserContextId;await browser.send('Target.createTarget',{url:'about:blank',browserContextId:context,newWindow:true})}
const h=await wait(async()=>{for(const t of (await list()).filter(t=>t.url.includes('/host.html'))){const c=await attach(t);const s=await api(c,'getAllTabs').catch(()=>null);if(s&&s.tabs.some(t=>t.private)===privateMode)return c}return null},Boolean);
for(const n of ['a','b','c','d'])await api(h,'createTab',`http://127.0.0.1:9278/#${n}`);
let s=await wait(()=>api(h,'getAllTabs'),s=>s?.tabs.filter(t=>t.url.includes('9278')).length===4 && s.tabs.every(t=>!t.isLoading));const id=n=>s.tabs.find(t=>t.url.endsWith('#'+n)).id;
for(const t of s.tabs.filter(t=>!t.url.includes('9278')))await api(h,'closeTab',t.id);
const a=id('a'),b=id('b'),c=id('c'),d=id('d');

await api(h,'createSplit',a,b);
const targetInfos=(await browser.send('Target.getTargets')).targetInfos;
const pageTarget=targetInfos.find(t=>t.url.endsWith('#a')&&(!privateMode||t.browserContextId===context));
const win=await browser.send('Browser.getWindowForTarget',{targetId:pageTarget.targetId});
for(const width of [1200,900,700,600,500]) {
 await browser.send('Browser.setWindowBounds',{windowId:win.windowId,bounds:{width,height:720,windowState:'normal'}});await pause(400);
 for(const ratio of [.2,.5,.8]) {
  await browser.send('Browser.setWindowBounds',{windowId:win.windowId,bounds:{width:1200,height:720}});await pause(500);
 record('before resize',await api(h,'getAllTabs'));assert.equal(await api(h,'resizeSplit',[a,b],ratio),true);await pause(300);
 await browser.send('Browser.setWindowBounds',{windowId:win.windowId,bounds:{width,height:720}});await pause(500);
  const allowed=(await browser.send('Target.getTargets')).targetInfos.filter(t=>!privateMode||t.browserContextId===context).map(t=>t.targetId);
  const pages=[];for(const n of ['a','b']){const page=await attach((await list()).find(t=>allowed.includes(t.id)&&t.url.endsWith('#'+n)));pages.push(await page.eval('({width:innerWidth,height:innerHeight,x:screenX,y:screenY})'));}
  const host=await h.eval(`({width:innerWidth,height:innerHeight,divider:document.getElementById('splitDivider').getBoundingClientRect().toJSON(),headers:[...document.querySelectorAll('.split-pane-header')].map(e=>({rect:e.getBoundingClientRect().toJSON(),scroll:e.scrollWidth,client:e.clientWidth,buttons:[...e.querySelectorAll('button')].map(b=>({label:b.getAttribute('aria-label'),rect:b.getBoundingClientRect().toJSON()}))}))})`);
  const bounds=await browser.send('Browser.getWindowBounds',{windowId:win.windowId});
  const state=await api(h,'getAllTabs');
  assert.equal(state.splitGeometry.mode,width>=612?'columns':'rows');
  assert(Math.abs(state.splits[0].layout.widths[0]-ratio)<.001);
  for(const h of host.headers) for(const button of h.buttons) assert(button.rect.right<=h.rect.right+.5);
  if(width<612){assert(pages.every(p=>p.width>400));assert.equal(await api(h,'resizeSplit',[a,b],.6),false);}
  record('geometry',{privateMode,requestedWidth:width,ratio,bounds,host,pages,geometry:state.splitGeometry});
 }
}
await browser.send('Browser.setWindowBounds',{windowId:win.windowId,bounds:{width:1200,height:720}});await pause(500);
assert(Math.abs((await api(h,'getAllTabs')).splits[0].layout.widths[0]-.8)<.001);
record('wide return retains saved ratio',{privateMode});
for(const fraction of [.05,.5,.95]) {
 await api(h,'resizeSplit',[a,b],.5);await pause(500);
 const r=await h.eval("document.getElementById('splitDivider').getBoundingClientRect().toJSON()");
 const y=r.y+r.height*fraction;
 await h.send('Input.dispatchMouseEvent',{type:'mousePressed',x:r.x+6,y,button:'left',clickCount:1});
 await h.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:r.x+66,y,button:'left',buttons:1});
 await h.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:r.x+66,y,button:'left',clickCount:1});
 await wait(()=>api(h,'getAllTabs'),x=>x?.splits?.[0]?.layout.widths[0]>.54);
 const rr=await h.eval("document.getElementById('splitDivider').getBoundingClientRect().toJSON()");
 await h.send('Input.dispatchMouseEvent',{type:'mousePressed',x:rr.x+6,y,button:'left',clickCount:2});
 await h.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:rr.x+6,y,button:'left',clickCount:2});
 await wait(()=>api(h,'getAllTabs'),x=>Math.abs(x?.splits?.[0]?.layout.widths[0]-.5)<.001);
 assert.deepEqual((await api(h,'getAllTabs')).splits[0].tabIds,[a,b]);record('full-height CDP drag/reset',{privateMode,fraction});
}
await browser.send('Browser.setWindowBounds',{windowId:win.windowId,bounds:{width:500,height:350}});await pause(500);
record('short-window fallback',{privateMode,state:await api(h,'getAllTabs')});
await browser.send('Browser.setWindowBounds',{windowId:win.windowId,bounds:{width:1200,height:720}});await pause(500);
if(!privateMode){await api(h,'previewSpaceSave','Geometry');await api(h,'previewSpaceOpen','Geometry');record('Spaces restore',await api(h,'getAllTabs'));}
if(context)await browser.send('Target.disposeBrowserContext',{browserContextId:context});
}
await browser.send('Browser.close').catch(()=>{});await wait(async()=>proc.exitCode,x=>x!==null);assert.equal(proc.exitCode,0);proof.pass=true;
}catch(e){proof.pass=false;proof.error=e.stack;if(proc?.exitCode===null)proc.kill('SIGTERM')}finally{server.close();clients.forEach(c=>c.close());fs.writeFileSync(root+'/'+label+'.json',JSON.stringify(proof,null,2));console.log({pass:proof.pass,checks:proof.checks.length,error:proof.error})}if(!proof.pass)process.exitCode=1;
