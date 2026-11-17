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

async function launched(name,extraArgs=[]){
 const fixture=new NativeFixture();fixture.extraArgs=extraArgs;
 await fixture.launch(config,path.join(scratch,name),{testHooks:true,diskAssets:false});
 await installDriver(fixture.host);
 const targetId=(await fixture.targets()).find(t=>t.url===fixture.base+'/initial').id;
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
  const w=await win(),host=await fixture.host.eval('({w:innerWidth,h:innerHeight})'),page=await fixture.page.eval('innerHeight');
  return {ok:host.w===w.width&&host.h+page===w.height,window:w,host,page};
 };
 return {fixture,win,strip,fills};
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
 realInput(dragSteps({x:w.left+grab.x,y:w.top+grab.y},{x:w.left+grab.x+80,y:w.top+grab.y+60}));
 let after=await win();
 record.checks.dragByStrip=near(after.left,w.left+80)&&near(after.top,w.top+60)&&after.width===w.width&&after.height===w.height;
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

 // The Island's menu button opens Chromium's app menu; Escape closes it.
 w=await win();
 const button=await strip(`(()=>{const r=document.getElementById('mainMenuButton').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};})()`);
 const expanded=()=>strip(`document.getElementById('mainMenuButton').getAttribute('aria-expanded')`);
 realInput(clickSteps(w.left+button.x,w.top+button.y));
 const opened=await waitFor(expanded,v=>v==='true','menu button marked open').then(()=>true,()=>false);
 await pause(600);desktopCapture(path.join(out,'menu.png'));
 realInput(keySteps(0x1B));
 const closed=await waitFor(expanded,v=>v==='false','menu button marked closed').then(()=>true,()=>false);
 record.checks.menuButtonOpensAndCloses=opened&&closed;record.details.menuButton={button,opened,closed};

 // Windows' own close button ends the browser cleanly.
 w=await win();
 realInput(clickSteps(w.left+w.width-BUTTON.close,w.top+14));
 for(let i=0;i<100&&!fixture.exit;i++)await pause(100);
 record.checks.closeButton=fixture.exit?.code===0;record.details.closeExit=fixture.exit;
 fs.copyFileSync(path.join(scratch,'scale-100','browser.log'),path.join(out,'browser-100.log'));
 await fixture.close().catch(()=>{});

 // ---- at 150% ----
 const b=await launched('scale-150',['--force-device-scale-factor=1.5']);
 const scaled=await b.fills();
 record.checks.contentFillsAt150=scaled.ok;record.details.contentFillsAt150=scaled;
 desktopCapture(path.join(out,'scale-150.png'));
 fs.copyFileSync(path.join(scratch,'scale-150','browser.log'),path.join(out,'browser-150.log'));
 const exit=await b.fixture.close();
 record.checks.cleanExitAt150=exit?.code===0;
}catch(error){failure=error;record.error=String(error.stack||error);}
finally{fs.rmSync(scratch,{recursive:true,force:true});}
const required=['contentFillsWindow','islandDrawsNoWindowButtons','maximizeButton','contentFillsWhenMaximized','restoreButton','minimizeButton',
 'dragByStrip','resizeByTopEdge','doubleClickMaximizes','menuButtonOpensAndCloses','closeButton','contentFillsAt150','cleanExitAt150'];
record.pass=!failure&&required.every(name=>record.checks[name]===true);
fs.writeFileSync(path.join(out,'frame.json'),JSON.stringify(record,null,2)+'\n');
console.log(JSON.stringify({candidate:record.candidate,pass:record.pass,checks:record.checks,error:record.error},null,2));
if(!record.pass)process.exitCode=1;
