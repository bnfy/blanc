// A click in the page closes the open Island (shipping's overlay blur), also
// when the click moves no focus: the page already had it, because it took it
// as the panel opened or because a click dismissed a right-click menu in the
// panel (owner's report, 2026-11-28: clicking the page left the Island
// open). The clicks here are the browser's own input events (CDP), which move
// no window focus, so only the page-click path can close the panel. Find
// stays open between clicks in the page, as in shipping.
//   node chromium/tests/island-page-click-close.mjs <runtime-config.json> <out>
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
assertNodeRuntime();assert.equal(fs.existsSync(out),false);fs.mkdirSync(out,{recursive:true});
const f=new NativeFixture(),w=createWorld(f),result={candidate:config.candidate,checks:[]};
const parent=fs.mkdtempSync(path.join(os.tmpdir(),'blanc-page-click-'));
const check=text=>result.checks.push(text);
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const mode=()=>w.hostEval(`(()=>{const o=document.getElementById('overlay');return !o||o.hidden?null:o.dataset.mode||null})()`);
const openPanel=async()=>{
 await w.hostEval('window.BlancPrototypeHost.api.openIsland()');
 await w.waitFor(mode,m=>m==='panel','the open Island',3000);
 // Past the opening moments, in which a focus change is not a dismissal.
 await pause(600);
};
try{
 await f.launch(config,path.join(parent,'fixture'),{testHooks:true,diskAssets:false});
 await installDriver(f.host);await assertRendering(e=>f.host.eval(e));await w.reset();
 const page=await tabPage(w,(await w.snapshot()).activeTabId);
 const size=await page.evaluate('[innerWidth,innerHeight]');
 // Low in the page, clear of the panel hanging from the Island.
 const at=[Math.round(size[0]/2),Math.round(size[1]-40)];
 result.at=at;

 await openPanel();
 await page.mouse.click(at[0],at[1]);
 await w.waitFor(mode,m=>m===null,'the Island closing on a page click',3000);
 check('a click in the page closes the open Island when it moves no focus');

 await openPanel();
 // A right-click menu in the panel (the host marks it open), dismissed by
 // the click in the page.
 await w.hostEval(`document.getElementById('overlay').contentDocument.body.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}))`);
 await page.mouse.click(at[0],at[1]);
 await w.waitFor(mode,m=>m===null,'the Island closing on a page click after a right-click menu',3000);
 check('after a right-click menu in the panel, a click in the page closes the Island');

 await w.api('openFindBar');
 await w.waitFor(mode,m=>m==='find','the find bar',3000);
 await pause(600);
 await page.mouse.click(at[0],at[1]);
 await pause(800);
 assert.equal(await mode(),'find','Find stays open after a click in the page');
 check('Find stays open after a click in the page');
 result.result='pass';
}catch(error){result.result=error.code==='BLANC_ENVIRONMENT_STOP'?'blocked-environment':'fail';result.error=String(error.stack);process.exitCode=1;}
finally{
 const exit=await f.close();if(exit?.code!==0){result.exit=exit;result.result='fail';process.exitCode=1;}
 if(f.directory&&fs.existsSync(path.join(f.directory,'browser.log')))fs.copyFileSync(path.join(f.directory,'browser.log'),path.join(out,'browser.log'));
 fs.rmSync(parent,{recursive:true,force:true});fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}
