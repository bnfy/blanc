// The Windows window-frame check (W1 Part A gate, items 1 to 5): the Island
// fills the window under Windows' own caption buttons, and the window behaves
// as one, by real mouse and keyboard input.
//
//   node chromium/tests/windows-frame.mjs CANDIDATE_FOLDER RESULTS_FOLDER
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {NativeFixture} from './lib/fixture.mjs';
import {waitFor,pause} from './lib/cdp.mjs';
import {installDriver,nativeCall} from './lib/test-driver.mjs';
import {assertNodeRuntime} from './lib/render-guard.mjs';
import {realInput,clickSteps,doubleClickSteps,dragSteps,keySteps,desktopCapture} from './lib/windows-desktop.mjs';
import {runtimeConfig} from '../windows/candidate.mjs';

const [candidateFolder,resultsFolder]=process.argv.slice(2);
if(!candidateFolder||!resultsFolder)throw Error('Usage: windows-frame.mjs CANDIDATE_FOLDER RESULTS_FOLDER');
if(process.platform!=='win32')throw Error('The window-frame check runs on Windows');
assertNodeRuntime();
const directory=path.resolve(candidateFolder),out=path.resolve(resultsFolder);
if(fs.existsSync(out))throw Error('Refusing to overwrite earlier results');
fs.mkdirSync(out,{recursive:true});
const candidate=JSON.parse(fs.readFileSync(path.join(directory,'candidate.json'),'utf8'));
const config=runtimeConfig(directory,candidate);
const record={candidate:candidate.id,checks:{},details:{}};
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'blanc-frame-'));
// Chromium's caption buttons, in DIPs from the window's right edge: three of
// 45 with 1 between (WindowFrameUtil), close outermost.
const BUTTON={close:22,maximize:68,minimize:114};
const near=(a,b,slack=2)=>Math.abs(a-b)<=slack;

const fixtures=[];
async function launched(name,extraArgs=[],{fresh=true}={}){
 const fixture=new NativeFixture();fixture.extraArgs=extraArgs;fixtures.push(fixture);
 await fixture.launch(config,path.join(scratch,name),{testHooks:true,diskAssets:false});
 await installDriver(fixture.host);
 // The launch tab carries Chromium's "unsupported command-line flag" infobar
 // (the fixture's resolver rules), which takes height from the page. A fresh
 // tab has none, as every suite case's does after its reset.
 if(fresh){
 const made=await nativeCall(fixture.host,'createTab',[fixture.base+'/initial']);
 // The native snapshot carries the native tab ids its hooks take.
 for(const t of (await nativeCall(fixture.host,'snapshot')).tabs)if(String(t.id)!==String(made.tabId))await nativeCall(fixture.host,'closeTab',[t.id]);
 await waitFor(fixture.snapshot,s=>s.tabs.length===1&&!s.tabs[0].isLoading,'one fresh tab');
 }
 // The closed tab's page stays alive for a while (Recently closed holds it),
 // so two pages share the address: the fresh tab's is the visible one.
 const visiblePage=async()=>{
  for(const target of (await fixture.targets()).filter(t=>t.type==='page'&&t.url===fixture.base+'/initial')){
   const connection=await fixture.connectTarget(target);
   if(await connection.eval('document.visibilityState')==='visible')return {target,connection};
  }
  return null;
 };
 const {target,connection:page}=await waitFor(visiblePage,Boolean,'the fresh tab as the visible page');
 const targetId=target.id;
 // The window as CDP reports it, and the visible part inside Windows'
 // invisible resize borders.
 const win=async()=>{
  const {windowId,bounds}=await fixture.browser.send('Browser.getWindowForTarget',{targetId});
  const i=await nativeCall(fixture.host,'windowFrameInsets');
  return {windowId,state:bounds.windowState,left:bounds.left+i.left,top:bounds.top+i.top,
   width:bounds.width-i.left-i.right,height:bounds.height-i.top-i.bottom};
 };
 const strip=expression=>fixture.host.eval(`(()=>{const document=window.document.getElementById('strip').contentDocument;const window_=document.defaultView;return (${expression});})()`);
 const fills=async()=>{
  const w=await win(),host=await fixture.host.eval('({w:innerWidth,h:innerHeight})'),inner=await page.eval('({w:innerWidth,h:innerHeight})');
  return {ok:host.w===w.width&&inner.w===w.width&&host.h+inner.h===w.height,window:w,host,page:inner};
 };
 // Windows' own close button: the window must go at once. Whether the
 // process then ends, and how soon, is reported beside it.
 const closeByButton=async(wait=15000)=>{
  const w=await win();
  realInput(clickSteps(w.left+w.width-BUTTON.close,w.top+14));
  const pressed=Date.now();
  const windowGone=await waitFor(()=>win().then(()=>false,()=>true),Boolean,'window closed by its button',8000).then(()=>true,()=>false);
  for(let i=0;i<wait/100&&!fixture.exit;i++)await pause(100);
  return {windowGone,exit:fixture.exit,exitAfterMs:fixture.exit?Date.now()-pressed:null};
 };
 // The Island's menu button opens Chromium's app menu; Escape closes it.
 const menuByButton=async(capture=null)=>{
  const w=await win();
  const button=await strip(`(()=>{const r=document.getElementById('mainMenuButton').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};})()`);
  const expanded=()=>strip(`document.getElementById('mainMenuButton').getAttribute('aria-expanded')`);
  realInput(clickSteps(w.left+button.x,w.top+button.y));
  const opened=await waitFor(expanded,v=>v==='true','menu button marked open').then(()=>true,()=>false);
  await pause(600);if(capture)desktopCapture(capture);
  realInput(keySteps(0x1B));
  const closed=await waitFor(expanded,v=>v==='false','menu button marked closed').then(()=>true,()=>false);
  return {button,opened,closed};
 };
 return {fixture,win,strip,fills,closeByButton,menuByButton};
}

let failure=null;
try{
 // ---- at 100% ----
 const a=await launched('scale-100');
 const {fixture,win,strip}=a;
 const first=await a.fills();
 record.checks.contentFillsWindow=first.ok;record.details.contentFillsWindow=first;
 const controls=await strip(`({island:window_.getComputedStyle(document.getElementById('windowControls')).display,menu:!document.getElementById('mainMenuButton').hidden,platform:document.documentElement.dataset.platform})`);
 record.checks.islandDrawsNoWindowButtons=controls.island==='none'&&controls.menu===true&&controls.platform==='win32';
 record.details.islandControls=controls;
 desktopCapture(path.join(out,'restored.png'));

 // Windows' own maximize, restore and minimize buttons, by real clicks.
 let w=await win();
 realInput(clickSteps(w.left+w.width-BUTTON.maximize,w.top+14));
 const maximized=await waitFor(win,x=>x.state==='maximized','window maximized by its button').then(()=>true,()=>false);
 record.checks.maximizeButton=maximized;
 const whenMaximized=await a.fills();
 record.checks.contentFillsWhenMaximized=whenMaximized.ok;record.details.contentFillsWhenMaximized=whenMaximized;
 desktopCapture(path.join(out,'maximized.png'));
 w=await win();
 realInput(clickSteps(w.left+w.width-BUTTON.maximize,w.top+14));
 record.checks.restoreButton=await waitFor(win,x=>x.state==='normal','window restored by its button').then(()=>true,()=>false);
 w=await win();
 realInput(clickSteps(w.left+w.width-BUTTON.minimize,w.top+14));
 record.checks.minimizeButton=await waitFor(win,x=>x.state==='minimized','window minimized by its button').then(()=>true,()=>false);
 await fixture.browser.send('Browser.setWindowBounds',{windowId:w.windowId,bounds:{windowState:'normal'}});
 await waitFor(win,x=>x.state==='normal','window restored');await pause(400);

 // The strip is the window's drag handle; the top edge resizes.
 w=await win();
 const grab={x:150,y:34};
 record.details.captionAtGrab=await nativeCall(fixture.host,'captionAt',[grab.x,grab.y]);
 // Down and slightly left, so the window (and its close button, pressed
 // last) stays on a small screen. Windows spends the first few pixels of
 // travel deciding it is a drag, so the window ends a little short.
 const by={x:-12,y:60};
 realInput(dragSteps({x:w.left+grab.x,y:w.top+grab.y},{x:w.left+grab.x+by.x,y:w.top+grab.y+by.y}));
 let after=await win();
 record.checks.dragByStrip=near(after.left,w.left+by.x,10)&&near(after.top,w.top+by.y,10)&&after.top>w.top+30&&after.width===w.width&&after.height===w.height;
 record.details.dragByStrip={before:w,after};
 w=after;
 realInput(dragSteps({x:w.left+Math.round(w.width/2),y:w.top+1},{x:w.left+Math.round(w.width/2),y:w.top-39}));
 after=await win();
 record.checks.resizeByTopEdge=near(after.top,w.top-40,3)&&near(after.height,w.height+40,3)&&after.width===w.width;
 record.details.resizeByTopEdge={before:w,after};
 w=after;
 realInput(doubleClickSteps(w.left+grab.x,w.top+grab.y));
 record.checks.doubleClickMaximizes=await waitFor(win,x=>x.state==='maximized','window maximized by double-click').then(()=>true,()=>false);
 await fixture.browser.send('Browser.setWindowBounds',{windowId:w.windowId,bounds:{windowState:'normal'}});
 await waitFor(win,x=>x.state==='normal','window restored');await pause(400);

 const menu=await a.menuByButton(path.join(out,'menu.png'));
 record.checks.menuButtonOpensAndCloses=menu.opened&&menu.closed;record.details.menuButton=menu;

 // Close after a tab was closed and the menu was used: the window goes;
 // the process's exit is recorded (see plainClose below for the required one).
 const closeAfterUse=await a.closeByButton();
 record.checks.closeButtonClosesWindow=closeAfterUse.windowGone;record.details.closeAfterTabCloseAndMenu=closeAfterUse;
 await fixture.close().catch(()=>{});

 // Close on a window nothing else was done to: the process ends cleanly.
 const c=await launched('plain-close',[],{fresh:false});
 const plain=await c.closeByButton();
 record.checks.closeButtonEndsBrowser=plain.windowGone&&plain.exit?.code===0;record.details.plainClose=plain;
 await c.fixture.close().catch(()=>{});
 // The same after the menu was opened and closed, with no tab closed: tells
 // the menu's part in a slow exit from a closed tab's.
 const d=await launched('menu-close',[],{fresh:false});
 const menuOnly=await d.menuByButton();
 const afterMenu=await d.closeByButton();
 record.details.closeAfterMenuOnly={menu:menuOnly,close:afterMenu};
 record.checks.closeAfterMenuEndsBrowser=afterMenu.windowGone&&afterMenu.exit?.code===0;
 await d.fixture.close().catch(()=>{});

 // ---- at 150% ----
 const b=await launched('scale-150',['--force-device-scale-factor=1.5']);
 const scaled=await b.fills();
 record.checks.contentFillsAt150=scaled.ok;record.details.contentFillsAt150=scaled;
 desktopCapture(path.join(out,'scale-150.png'));
 const exit=await b.fixture.close();
 record.checks.cleanExitAt150=exit?.code===0;
}catch(error){failure=error;record.error=String(error.stack||error);}
finally{
 // A check that stopped early leaves its browser running, and Windows will
 // not remove a profile a process still holds: close first, and never let
 // tidying up replace the result.
 for(const fixture of fixtures){
  try{await fixture.close();}catch{}
  const log=path.join(fixture.directory??'','browser.log'),kept=path.join(out,`browser-${path.basename(fixture.directory??'none')}.log`);
  if(fs.existsSync(log)&&!fs.existsSync(kept))fs.copyFileSync(log,kept);
 }
 try{fs.rmSync(scratch,{recursive:true,force:true,maxRetries:10,retryDelay:300});}catch(error){record.tidyError=String(error.message||error);}
}
const required=['contentFillsWindow','islandDrawsNoWindowButtons','maximizeButton','contentFillsWhenMaximized','restoreButton','minimizeButton',
 'dragByStrip','resizeByTopEdge','doubleClickMaximizes','menuButtonOpensAndCloses','closeButtonClosesWindow','closeButtonEndsBrowser','closeAfterMenuEndsBrowser','contentFillsAt150','cleanExitAt150'];
record.pass=!failure&&required.every(name=>record.checks[name]===true);
fs.writeFileSync(path.join(out,'frame.json'),JSON.stringify(record,null,2)+'\n');
console.log(JSON.stringify({candidate:record.candidate,pass:record.pass,checks:record.checks,error:record.error},null,2));
if(!record.pass)process.exitCode=1;
