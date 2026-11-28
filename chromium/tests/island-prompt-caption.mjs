// While a site's permission prompt waits for an answer, the resting Island is
// still the Island's, never the window's drag handle (IsCaption). The prompt
// is drawn by the Island's own view, which then reported only the prompt's
// rectangle as its interactive area, so on macOS every click on the Island
// became a window drag (owner's report, 2026-11-28: a location prompt from a
// restored tab made the Island ignore clicks). The strip beside the Island
// still drags the window, prompt or not.
//   node chromium/tests/island-prompt-caption.mjs <runtime-config.json> <out>
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {NativeFixture} from './lib/fixture.mjs';
import {installDriver} from './lib/test-driver.mjs';
import {assertRendering,assertNodeRuntime} from './lib/render-guard.mjs';
import {createWorld} from './world.mjs';
import {tabPage} from './adapters/core.mjs';
import {jsLiteral} from './lib/js-literal.mjs';
const [configFile,out]=process.argv.slice(2),config=JSON.parse(fs.readFileSync(configFile));
assertNodeRuntime();assert.equal(fs.existsSync(out),false);fs.mkdirSync(out,{recursive:true});
const f=new NativeFixture(),w=createWorld(f),result={candidate:config.candidate,checks:[]};
const parent=fs.mkdtempSync(path.join(os.tmpdir(),'blanc-prompt-caption-'));
const check=text=>result.checks.push(text);
// Window coordinates of an element in the strip document.
const rect=id=>w.hostEval(`(()=>{const s=document.getElementById('strip'),o=s.getBoundingClientRect(),e=s.contentDocument?.getElementById(${jsLiteral(id)});if(!e)return {x:0,y:0,width:0,height:0};const r=e.getBoundingClientRect();return {x:o.x+r.x,y:o.y+r.y,width:r.width,height:r.height};})()`);
const promptShowing=()=>w.hostEval("!document.getElementById('permission').hidden");
try{
 await f.launch(config,path.join(parent,'fixture'),{testHooks:true,diskAssets:false});
 await installDriver(f.host);await assertRendering(e=>f.host.eval(e));await w.reset();
 const pill=await w.waitFor(()=>rect('islandPill'),r=>r.width>0,'the resting Island');
 // The pill's middle, and a point of the strip well clear of it and of the
 // window controls (the band's right half, beyond the pill).
 const on=[Math.round(pill.x+pill.width/2),Math.round(pill.y+pill.height/2)];
 const width=await w.hostEval('innerWidth');
 const beside=[Math.round((pill.x+pill.width+width)/2),on[1]];
 assert.ok(beside[0]>pill.x+pill.width+8&&beside[0]<width-8,'room beside the Island');
 result.points={on,beside};
 assert.equal(await w.native('captionAt',on),false,'the Island is not a drag handle');
 assert.equal(await w.native('captionAt',beside),true,'the strip beside the Island drags the window');
 check(`with no prompt the Island at ${on} is not a drag handle and the strip at ${beside} is`);

 const page=await tabPage(w,(await w.snapshot()).activeTabId);
 await page.evaluate('navigator.geolocation.getCurrentPosition(()=>{},()=>{})');
 await w.waitFor(promptShowing,Boolean,'the location prompt',5000);
 // The geometry report follows the prompt's own layout; give it a moment.
 await w.waitFor(()=>w.native('captionAt',on),v=>v===false,'the Island while the prompt waits',3000)
  .catch(async()=>{throw Error('with a permission prompt waiting the Island is a drag handle (captionAt '+on+' = '+await w.native('captionAt',on)+')');});
 check('while a permission prompt waits, the Island is still not a drag handle');
 assert.equal(await w.native('captionAt',beside),true,'the strip beside the Island still drags the window during the prompt');
 check('while a permission prompt waits, the strip beside the Island still drags the window');

 await w.hostEval("document.getElementById('permission').contentDocument.querySelector('button')?.click()");
 await w.waitFor(promptShowing,v=>v===false,'the prompt answered',3000);
 assert.equal(await w.native('captionAt',on),false,'the Island after the prompt');
 check('after the prompt is answered the Island is still not a drag handle');
 result.result='pass';
}catch(error){result.result=error.code==='BLANC_ENVIRONMENT_STOP'?'blocked-environment':'fail';result.error=String(error.stack);process.exitCode=1;}
finally{
 const exit=await f.close();if(exit?.code!==0){result.exit=exit;result.result='fail';process.exitCode=1;}
 if(f.directory&&fs.existsSync(path.join(f.directory,'browser.log')))fs.copyFileSync(path.join(f.directory,'browser.log'),path.join(out,'browser.log'));
 fs.rmSync(parent,{recursive:true,force:true});fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}
