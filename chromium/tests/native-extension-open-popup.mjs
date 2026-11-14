// An extension opening its own action popup (chrome.action.openPopup), as
// 1Password's in-page "Unlock 1Password" button does through its background.
// Chromium refuses it in a window whose toolbar is hidden, and the Island
// hides Chromium's toolbar, so before patch 0081 every call failed with
// "Browser window has no toolbar." and the button did nothing.
//   node chromium/tests/native-extension-open-popup.mjs CONFIG OUT
// The popup anchors on the Island's Extensions button: with Auto-hide the
// Island comes down and stays while the popup is open, then hides again. A
// fullscreen page has no Island, and the call is refused as in Chrome.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {NativeFixture} from './lib/fixture.mjs';
import {installDriver} from './lib/test-driver.mjs';
import {assertRendering,assertNodeRuntime} from './lib/render-guard.mjs';
import {createWorld} from './world.mjs';
import {tabPage} from './adapters/core.mjs';
const [configFile,out]=process.argv.slice(2),config=JSON.parse(fs.readFileSync(configFile));
assertNodeRuntime();assert.equal(fs.existsSync(out),false);fs.mkdirSync(out,{recursive:true});
const extension=path.join(path.dirname(fileURLToPath(import.meta.url)),'fixtures','open-popup-extension');
const f=new NativeFixture(),w=createWorld(f),result={candidate:config.candidate,checks:[]};
const parent=fs.mkdtempSync(path.join(os.tmpdir(),'blanc-open-popup-'));
const visible=()=>assertRendering(e=>f.host.eval(e));
// A command-line extension needs no developer mode in a Chromium-branded build.
f.extraArgs=[`--load-extension=${extension}`,'--disable-features=DisableLoadExtensionCommandLineSwitch'];
try{
 await f.launch(config,path.join(parent,'fixture'),{testHooks:true,diskAssets:process.env.DISK_ASSETS==='1'});
 await installDriver(f.host);await visible();await w.reset();
 const worker=await w.waitFor(async()=>(await f.targets()).find(t=>t.type==='service_worker'&&/^chrome-extension:\/\/[a-p]{32}\/sw\.js$/.test(t.url)),Boolean,'the test extension\'s worker',15000);
 const id=new URL(worker.url).host,popupUrl=`chrome-extension://${id}/popup.html`;
 const sw=await f.connectTarget(worker);
 const popupTarget=async()=>(await f.targets()).find(t=>t.url===popupUrl)??null;
 const state=()=>w.native('autoHideState');
 const tab=await w.call('openTab',f.base+'/sign-in');
 // openPopup needs the window in front (kOpenPopupInactiveWindow).
 const open=async()=>{assert.equal(await w.call('focusWindow'),true,'the window is active');return sw.eval('self.openPopup()');};
 // Where the popup's window sits, in screen coordinates, and its close.
 async function popupFrame(){
  const target=await w.waitFor(popupTarget,Boolean,'the popup page',8000);
  const page=await f.connectTarget(target);
  const read=()=>page.eval('({x:screenX,y:screenY,width:outerWidth,height:outerHeight,ready:document.readyState})');
  const frame=await w.waitFor(read,v=>v?.ready==='complete'&&v.width>0,'the popup laid out',8000);
  return {frame,read,close:async()=>{await page.eval('window.close(),1').catch(()=>0);await w.waitFor(popupTarget,v=>v===null,'the popup closed',8000);}};
 }
 // The popup hangs from the Island at the window's top, inside the window.
 const underIsland=(frame,b)=>frame.x>=b.x&&frame.x+frame.width<=b.x+b.width+1&&frame.y>=b.y&&frame.y<=b.y+160;
 // 1. Auto-hide off (the default; the report's setting).
 {
  const outcome=await open();result.autoHideOff={outcome};
  assert.equal(outcome,'resolved',`openPopup with the Island shown: ${outcome}`);
  const {frame,close}=await popupFrame(),bounds=await w.call('windowContentBounds');
  Object.assign(result.autoHideOff,{frame,bounds});
  assert.ok(underIsland(frame,bounds),'the popup hangs from the Island: '+JSON.stringify({frame,bounds}));
  await close();
  result.checks.push('Auto-hide off: chrome.action.openPopup opens the popup under the Island');
 }
 // 2–3. Auto-hide on, Island hidden: it comes down for the popup, stays
 // while the popup is open, and hides again once it closes.
 await w.call('setIslandAutoHide',true);
 for(const style of ['float','push']){
  await w.call('setIslandAutoHideStyle',style);
  const bounds=await w.call('windowContentBounds');
  await w.call('setTestCursorPoint',{x:bounds.x+bounds.width/2,y:bounds.y+bounds.height/2});
  // The setting's how-to tip holds the Island for its first seconds.
  await w.waitFor(state,s=>s.stripHidden===true&&!s.introducing&&!s.sliding,`the ${style} Island hidden`,20000);
  const outcome=await open(),entry=result['autoHide_'+style]={outcome};
  assert.equal(outcome,'resolved',`openPopup with the ${style} Island hidden: ${outcome}`);
  const held=await w.waitFor(state,s=>s.extensionPopup===true&&s.stripHidden===false&&s.extensionsVisible===true&&!s.sliding,`the ${style} Island down for the popup`,8000);
  const {frame,read,close}=await popupFrame();Object.assign(entry,{frame,bounds,held});
  // Past the hide check (120 ms float, 450 ms push) with the pointer away,
  // and past the Island's slide in, which the popup follows.
  await new Promise(r=>setTimeout(r,1500));
  const settledFrame=entry.settledFrame=await read();
  assert.ok(underIsland(settledFrame,bounds),`the popup hangs from the ${style} Island: `+JSON.stringify({settledFrame,bounds}));
  assert.ok(Math.abs(settledFrame.y-result.autoHideOff.frame.y)<=4,`the popup sits where it does with the Island always shown: `+JSON.stringify({settledFrame,shown:result.autoHideOff.frame}));
  const still=await state();entry.after1500ms=still;
  assert.equal(still.stripHidden,false,`the ${style} Island stays while the popup is open`);
  assert.ok(await popupTarget(),'the popup is still open');
  await close();
  entry.released=await w.waitFor(state,s=>s.extensionPopup===false&&s.stripHidden===true,`the ${style} Island hidden again`,8000);
  result.checks.push(`Auto-hide ${style}: the hidden Island comes down for the popup, stays while it is open and hides after`);
 }
 await w.call('setTestCursorPoint',null);await w.call('setIslandAutoHide',false);
 // 4. The ⌘L panel open: the Extensions button is out of sight under it.
 // Recorded, not judged: what the popup does then.
 {
  assert.equal(await w.call('focusWindow'),true,'the window is active');
  await w.call('openPanel');
  const outcome=await sw.eval('self.openPopup()'),target=await popupTarget();
  result.panelOpen={outcome,state:await state(),overlay:await w.call('overlayMode')};
  if(target){const popup=await popupFrame();result.panelOpen.frame=popup.frame;await popup.close();}
  await w.call('closeOverlay');
 }
 // 5. Afterwards the popup still opens (nothing was left popped out).
 {
  const outcome=await open();result.again={outcome};
  assert.equal(outcome,'resolved',`openPopup afterwards: ${outcome}`);
  await (await popupFrame()).close();
  result.checks.push('the popup opens again afterwards');
 }
 await visible();result.result='pass';
}catch(error){result.result=error.code==='BLANC_ENVIRONMENT_STOP'?'blocked-environment':'fail';result.error=String(error.stack);process.exitCode=1;}
finally{
 const exit=await f.close();if(exit?.code!==0){result.exit=exit;result.result='fail';process.exitCode=1;}
 if(f.directory&&fs.existsSync(path.join(f.directory,'browser.log')))fs.copyFileSync(path.join(f.directory,'browser.log'),path.join(out,'browser.log'));
 fs.rmSync(parent,{recursive:true,force:true});fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}
