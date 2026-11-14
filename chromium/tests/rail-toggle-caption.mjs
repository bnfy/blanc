// The vertical tabs rail is never a window drag handle (IsCaption): on macOS
// its header shares the title-bar band, and a caption there turned the
// layout toggle's click into a window drag (owner's report, 2026-11-14).
// The strip beside the rail still drags the window.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {NativeFixture} from './lib/fixture.mjs';
import {installDriver} from './lib/test-driver.mjs';
import {assertRendering,assertNodeRuntime} from './lib/render-guard.mjs';
import {createWorld} from './world.mjs';
const [configFile,out]=process.argv.slice(2),config=JSON.parse(fs.readFileSync(configFile));
assertNodeRuntime();assert.equal(fs.existsSync(out),false);fs.mkdirSync(out,{recursive:true});
const f=new NativeFixture(),w=createWorld(f),result={candidate:config.candidate,checks:[]};
const parent=fs.mkdtempSync(path.join(os.tmpdir(),'blanc-rail-toggle-'));
const rect=id=>w.hostEval(`(()=>{const r=document.getElementById(${JSON.stringify(id)}).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};})()`);
try{
 await f.launch(config,path.join(parent,'fixture'),{testHooks:true,diskAssets:false});
 await installDriver(f.host);await assertRendering(e=>f.host.eval(e));await w.reset();
 await w.api('setTabLayout',['vertical']);
 await w.waitFor(async()=>(await w.snapshot()).tabLayout,v=>v==='vertical','vertical tabs');
 const toggle=await w.waitFor(()=>rect('verticalTabsUseIsland'),r=>r.width>0,'the layout toggle');
 const rail=await rect('verticalTabsRail');
 const at=[Math.round(toggle.x+toggle.width/2),Math.round(toggle.y+toggle.height/2)];
 result.toggle={at,rail:Math.round(rail.width)};
 assert.equal(await w.native('captionAt',at),false,'the layout toggle is not a drag handle');
 result.checks.push(`the layout toggle at ${at} is not a window drag handle`);
 const pill=(await w.snapshot()).tabLayout&&await w.hostEval(`(()=>{const s=document.getElementById('strip');const p=s.contentDocument.getElementById('islandPill').getBoundingClientRect();const o=s.getBoundingClientRect();return {x:o.x+p.x};})()`);
 const beside=[Math.round(Math.max(rail.width+20,(rail.width+pill.x)/2)),20];
 result.beside=beside;
 assert.equal(await w.native('captionAt',beside),true,'the strip beside the rail still drags the window');
 result.checks.push(`the strip beside the rail (${beside}) still drags the window`);
 await w.hostEval(`document.getElementById('verticalTabsUseIsland').click()`);
 await w.waitFor(async()=>(await w.snapshot()).tabLayout,v=>v==='island','the Island layout after the toggle');
 result.checks.push('clicking the toggle turns vertical tabs off');
 result.result='pass';
}catch(error){result.result=error.code==='BLANC_ENVIRONMENT_STOP'?'blocked-environment':'fail';result.error=String(error.stack);process.exitCode=1;}
finally{
 const exit=await f.close();if(exit?.code!==0){result.exit=exit;result.result='fail';process.exitCode=1;}
 if(f.directory&&fs.existsSync(path.join(f.directory,'browser.log')))fs.copyFileSync(path.join(f.directory,'browser.log'),path.join(out,'browser.log'));
 fs.rmSync(parent,{recursive:true,force:true});fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}
