// The Extensions panel is the Island expanded in place: with Auto-hide's
// floating Island (and over a Glance card) it is drawn on top, as shipping's
// ⌘L panel is above its float views, never behind them.
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
const parent=fs.mkdtempSync(path.join(os.tmpdir(),'blanc-ext-float-'));
const visible=()=>assertRendering(e=>f.host.eval(e));
// What the host draws on top at the centre of a frame: the panel, or the frame.
const topAt=sel=>w.hostEval(`(()=>{const r=document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect();
 const e=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return e?.closest('#extensionsPanel')?'panel':(e?.id||e?.tagName||null);})()`);
try{
 await f.launch(config,path.join(parent,'fixture'),{testHooks:true,diskAssets:process.env.DISK_ASSETS==="1"});
 await installDriver(f.host);await visible();await w.reset();
 await w.call('openTab',f.base+'/extensions-float');
 await w.call('setIslandAutoHide',true);await w.call('setIslandAutoHideStyle','float');
 const bounds=await w.call('windowContentBounds');
 await w.call('setTestCursorPoint',{x:bounds.x+bounds.width/2,y:bounds.y+20});
 await w.waitFor(()=>w.hostEval('window.BlancPrototypeHost.floatViewState()'),s=>s?.visible===true,'the floating Island revealed',8000);
 await w.hostEval('window.BlancPrototypeHost.extensions()');
 await w.waitFor(()=>w.hostEval("!document.getElementById('extensionsPanel').hidden"),Boolean,'the Extensions panel',8000);
 // Hold the floating pill shown where it was, as in the report, and look.
 await w.hostEval("document.getElementById('floatPill').classList.add('shown'),1");
 result.floatState=await w.hostEval('window.BlancPrototypeHost.floatViewState()');
 assert.equal(await topAt('#floatPill'),'panel','the panel is drawn over the floating Island');
 result.checks.push('with Auto-hide floating, the Extensions panel is drawn over the floating Island');
 // The Glance card's frame sits on its own layer; the panel is above it too.
 await w.hostEval(`(()=>{const g=document.getElementById('glanceCardFrame');g.hidden=false;Object.assign(g.style,{left:'200px',top:'60px',width:'600px',height:'300px'});return 1;})()`);
 assert.equal(await topAt('#glanceCardFrame'),'panel','the panel is drawn over a Glance card');
 await w.hostEval("document.getElementById('glanceCardFrame').hidden=true,1");
 result.checks.push('the Extensions panel is drawn over a Glance card');
 await w.hostEval('window.BlancPrototypeHost.extensions()');
 await w.call('setTestCursorPoint',null);await w.call('setIslandAutoHide',false);
 await visible();result.result='pass';
}catch(error){result.result=error.code==='BLANC_ENVIRONMENT_STOP'?'blocked-environment':'fail';result.error=String(error.stack);process.exitCode=1;}
finally{
 const exit=await f.close();if(exit?.code!==0){result.exit=exit;result.result='fail';process.exitCode=1;}
 if(f.directory&&fs.existsSync(path.join(f.directory,'browser.log')))fs.copyFileSync(path.join(f.directory,'browser.log'),path.join(out,'browser.log'));
 fs.rmSync(parent,{recursive:true,force:true});fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}
