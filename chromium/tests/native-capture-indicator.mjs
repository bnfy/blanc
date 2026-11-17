// N2, the capture indicator, beyond the one shipping scenario the suite runs
// (permissions-and-auth.feature:13, a microphone): the camera, both at once,
// the popover's row going to its tab, and Stop ending both. Shipping:
// src/main/capture-state.js (a window-wide chip with a microphone and a
// camera glyph; one popover row per capturing tab; Stop ends that tab's
// capture). The devices are Chromium's fake ones, as the suite uses; no real
// camera or microphone is opened.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {NativeFixture} from './lib/fixture.mjs';
import {installDriver} from './lib/test-driver.mjs';
import {assertRendering,assertNodeRuntime} from './lib/render-guard.mjs';
import {createWorld} from './world.mjs';
import {tabPage} from './adapters/core.mjs';
const [configFile,out]=process.argv.slice(2),config=JSON.parse(fs.readFileSync(configFile));
assertNodeRuntime();assert.equal(fs.existsSync(out),false,'expected a new output folder');fs.mkdirSync(out,{recursive:true});
const f=new NativeFixture(),w=createWorld(f),result={candidate:config.candidate,checks:[]};
const parent=fs.mkdtempSync(path.join(os.tmpdir(),'blanc-capture-'));
const visible=()=>assertRendering(e=>f.host.eval(e));
const begin=kinds=>{window.__captureError=null;navigator.mediaDevices.getUserMedia(kinds).then(s=>{window.__captureStream=s;},e=>{window.__captureError=e.name;});};
const live=()=>({audio:window.__captureStream?.getAudioTracks().some(t=>t.readyState==='live')??false,
 video:window.__captureStream?.getVideoTracks().some(t=>t.readyState==='live')??false,error:window.__captureError});
const chip=async()=>(await w.snapshot()).captureChip;
const glyphs=()=>w.frame('strip').evaluate(()=>({chip:!document.getElementById('pillCapture').hidden,
 mic:!document.getElementById('pillCaptureMic').hasAttribute('hidden'),cam:!document.getElementById('pillCaptureCam').hasAttribute('hidden')}));
const allow=async word=>{
 const prompt=await w.waitFor(()=>w.frame('permission'),Boolean,'the permission prompt',8000);
 await prompt.locator('#permAllowBtn').waitFor({state:'visible'});
 assert.match(await prompt.locator('#permissionText').textContent(),word,'expected the prompt to name what is asked for');
 await prompt.locator('#permAllowBtn').click();
};
// Chromium's fake devices only: without this flag getUserMedia would reach
// for the Mac's real camera and microphone. The suite sets it the same way
// for shipping's capture scenario (runner.mjs, @F13-2).
f.extraArgs=['--use-fake-device-for-media-stream'];
try{
 await f.launch(config,path.join(parent,'fixture'),{testHooks:true,diskAssets:false});await installDriver(f.host);await visible();await w.reset();
 const id=await w.call('openTab',w.fixtureUrl('camera'));
 const page=await tabPage(w,id);
 assert.deepEqual(await chip(),{audio:false,video:false},'expected no capture before anything asks');
 assert.equal((await glyphs()).chip,false,'expected no chip before anything captures');

 await page.evaluate(begin,{video:true});await w.app.refresh();
 await allow(/camera/i);
 await w.waitFor(()=>page.evaluate(live),s=>s.video===true,'a live camera track',8000);
 await w.waitFor(chip,c=>c.video===true&&c.audio===false,'the chip reports the camera only',8000);
 await w.waitFor(glyphs,g=>g.chip&&g.cam&&!g.mic,'the chip shows the camera glyph only',8000);
 assert.equal(await page.evaluate(()=>navigator.permissions.query({name:'camera'}).then(p=>p.state)),'granted','expected permissions.query to tell the page the truth');
 result.checks.push('a camera in use lights the chip with the camera glyph only, and permissions.query reports the grant');

 await page.evaluate(()=>window.__captureStream.getTracks().forEach(t=>t.stop()));
 await w.waitFor(chip,c=>c.video===false&&c.audio===false,'the chip clears when the page stops',8000);
 await w.waitFor(glyphs,g=>!g.chip,'the chip hides when nothing captures',8000);
 result.checks.push('the chip clears when the page stops the camera itself');

 await page.evaluate(begin,{audio:true,video:true});await w.app.refresh();
 await allow(/microphone/i);
 await w.waitFor(()=>page.evaluate(live),s=>s.video===true&&s.audio===true,'live camera and microphone tracks',8000);
 await w.waitFor(glyphs,g=>g.chip&&g.cam&&g.mic,'the chip shows both glyphs',8000);
 // Window-wide: another tab in front still shows it, and the row leads back.
 const other=await w.call('openTab',w.fixtureUrl('elsewhere'));
 await w.waitFor(glyphs,g=>g.chip&&g.cam&&g.mic,'the chip stays with another tab in front',8000);
 const rows=(await w.snapshot()).capturePopover.rows;
 assert.equal(rows.length,1,`expected one popover row for the one capturing tab; found ${JSON.stringify(rows)}`);
 assert.equal(rows[0].surfaceId,String(id),'expected the row to name the capturing tab');
 result.checks.push('camera and microphone together show both glyphs, window-wide, with one popover row for the capturing tab');

 await w.frame('strip').locator('#pillCapture').click();
 const pop=w.frame('overlay');
 await pop.locator('#capturePop').waitFor({state:'visible'});
 await pop.locator('.capture-pop-go').click();
 await w.waitFor(async()=>String((await w.snapshot()).activeTabId),a=>a===String(id),'the popover row goes to the capturing tab',8000);
 result.checks.push('the popover row brings the capturing tab forward');

 await w.frame('strip').locator('#pillCapture').click();
 await pop.locator('#capturePop').waitFor({state:'visible'});
 await pop.locator('.capture-pop-stop').click();
 await w.waitFor(()=>page.evaluate(live),s=>s.video===false&&s.audio===false,'Stop ends both real tracks',8000);
 await w.waitFor(chip,c=>c.video===false&&c.audio===false,'the chip clears after Stop',8000);
 await w.waitFor(glyphs,g=>!g.chip,'the chip hides after Stop',8000);
 result.checks.push('Stop in the popover ends the camera and the microphone and clears the chip');
 void other;await visible();result.result='pass';
}catch(error){result.result=error.code==='BLANC_ENVIRONMENT_STOP'?'blocked-environment':'fail';result.error=String(error.stack);process.exitCode=1;}
finally{
 const exit=await f.close();if(exit?.code!==0){result.exit=exit;result.result='fail';process.exitCode=1;}
 if(f.directory&&fs.existsSync(path.join(f.directory,'browser.log')))fs.copyFileSync(path.join(f.directory,'browser.log'),path.join(out,'browser.log'));
 fs.rmSync(parent,{recursive:true,force:true});fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}
