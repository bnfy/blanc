// A window reopens at the size it had at quit. Chromium replays AppKit's
// archived window state (frame included) onto a restored window, and that
// archive is written half a second late, so it often holds an earlier frame;
// patch 0087 keeps the session's own bounds. This is a regression check, not
// a reproducer: it passed on the build without the patch. The case that
// showed the bug is vertical-tabs.feature:58 (wrong frame replayed in 11 of
// 16 relaunches on macos-914063c2e1c2a1ac, each put back by the patch).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {NativeFixture} from './lib/fixture.mjs';
import {installDriver} from './lib/test-driver.mjs';
import {assertRendering,assertNodeRuntime} from './lib/render-guard.mjs';
import {createWorld} from './world.mjs';
import {tabPage} from './adapters/core.mjs';
import {relaunchWindowBounds} from './adapters/island.mjs';
const [configFile,out]=process.argv.slice(2),config=JSON.parse(fs.readFileSync(configFile));
assertNodeRuntime();assert.equal(fs.existsSync(out),false,'expected a new output folder');fs.mkdirSync(out,{recursive:true});
const f=new NativeFixture(),w=createWorld(f),result={candidate:config.candidate,checks:[]};
const parent=fs.mkdtempSync(path.join(os.tmpdir(),'blanc-window-size-'));
const visible=()=>assertRendering(e=>f.host.eval(e));
// An infobar after relaunch can shorten the page, so read the window
// directly without requiring the page and Island to fill it.
const bounds=async()=>{try{const s=await w.snapshot(),page=await tabPage(w,s.activeTabId);
 return await relaunchWindowBounds(w,page.targetId);}catch{return null;}};
const dims=async()=>{const b=await w.waitFor(bounds,Boolean,'window bounds',7000);return {width:b.width,height:b.height};};
const size=async(width,height)=>{await w.call('setWindowContentSize',width,height);
 await w.waitFor(bounds,b=>b?.width===width&&b?.height===height,`${width}x${height} window`,7000);};
try{
 await f.launch(config,path.join(parent,'fixture'),{testHooks:true,diskAssets:false});await installDriver(f.host);await visible();await w.reset();
 for(const layout of ['horizontal','vertical']){
  await w.call('setTabLayout',layout);
  await size(1000,700);await size(640,480);
  // Longer than AppKit's 0.5 s, so the archive holds the narrow frame.
  await new Promise(r=>setTimeout(r,1500));
  // No wait for the new size to settle: the quit has to land inside AppKit's
  // half second, while its archive still holds 640 by 480.
  await w.call('setWindowContentSize',1000,700);
  await w.relaunch();await visible();
  const after=await dims();
  assert.deepEqual(after,{width:1000,height:700},`${layout} tabs: expected the window back at 1000 by 700 after quitting right after a resize; found ${JSON.stringify(after)}`);
  result.checks.push(`${layout} tabs: a window resized just before quitting reopens at that size, not an earlier one`);
 }
 await size(640,480);await new Promise(r=>setTimeout(r,1500));await w.relaunch();await visible();
 const settled=await dims();
 assert.deepEqual(settled,{width:640,height:480},`expected a settled 640 by 480 window to reopen at that size; found ${JSON.stringify(settled)}`);
 result.checks.push('a window left at a size for longer than half a second reopens at that size');
 result.result='pass';
}catch(error){result.result=error.code==='BLANC_ENVIRONMENT_STOP'?'blocked-environment':'fail';result.error=String(error.stack);process.exitCode=1;}
finally{
 const exit=await f.close();if(exit?.code!==0){result.exit=exit;result.result='fail';process.exitCode=1;}
 if(f.directory&&fs.existsSync(path.join(f.directory,'browser.log')))fs.copyFileSync(path.join(f.directory,'browser.log'),path.join(out,'browser.log'));
 fs.rmSync(parent,{recursive:true,force:true});fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}
