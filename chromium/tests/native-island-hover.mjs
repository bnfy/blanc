// The resting Island's hover behaviors, as shipping's: a tab dot blooms into
// its site's icon, a pill button lights, its tooltip shows after a rest, and
// with hover-open on, a rest on the site name opens the panel.
//   node chromium/tests/native-island-hover.mjs <runtime-config.json> <out>
// Moves are simulated; a real mouse moving over the test window meanwhile
// sends its own, so run it where nobody is using the mouse.
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
const parent=fs.mkdtempSync(path.join(os.tmpdir(),'blanc-island-hover-'));
const visible=()=>assertRendering(e=>f.host.eval(e));
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const STRIP="document.getElementById('strip').contentDocument";
// An element's centre and box in host coordinates.
const box=sel=>w.hostEval(`(()=>{const s=document.getElementById('strip').getBoundingClientRect(),e=${STRIP}.querySelector(${jsLiteral(sel)});
 if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x+s.x,y:r.y+s.y,width:r.width,height:r.height,cx:r.x+s.x+r.width/2,cy:r.y+s.y+r.height/2};})()`);
const shot=async name=>{const s=await f.host.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(s.data,'base64'));};
try{
 await f.launch(config,path.join(parent,'fixture'),{testHooks:true,diskAssets:process.env.DISK_ASSETS==="1"});
 await installDriver(f.host);await visible();await w.reset();
 f.server.removeAllListeners('request');
 f.server.on('request',(q,r)=>{r.writeHead(200,{'content-type':'text/html'});r.end('<title>Hover fixture</title><body></body>');});
 let last;for(const p of ['/a','/b','/c'])last=await w.call('openTab',f.base+p);
 const page=await tabPage(w,last);await page.bringToFront();
 await w.waitFor(()=>w.snapshot(),s=>s.windowActive===true,'the test window in front',4000);
 const move=(x,y)=>f.host.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:Math.round(x),y:Math.round(y),button:'none',buttons:0});
 const away=async()=>{await move(4,(await w.hostEval('innerHeight'))-2);await pause(150);};

 // A tab dot blooms into its site's icon.
 const dot=await box('.island-dot:not(.active)');assert.ok(dot,'a tab dot');
 await move(dot.cx,dot.cy);
 await w.waitFor(()=>w.hostEval(`(()=>{const p=[...${STRIP}.querySelectorAll('.island-dot')].find(e=>e.matches(':hover'))?.querySelector('.dot-peek');
  return p?Number(getComputedStyle(p).opacity):0;})()`),v=>v===1,'the dot\'s icon disc',2000);
 await shot('dot-bloom');result.checks.push('a tab dot blooms into its site icon on hover');

 // A pill button lights, and its tooltip shows after a rest.
 await away();
 const btn=await box('#pillActions .pill-btn');assert.ok(btn,'a pill button');
 const paint=()=>w.hostEval(`getComputedStyle(${STRIP}.querySelector('#pillActions .pill-btn')).backgroundColor`);
 const rest=await paint();await move(btn.cx,btn.cy);
 await w.waitFor(paint,v=>v!==rest,'the button\'s hover state',2000);
 result.checks.push('a pill button lights on hover');
 const label=await w.hostEval(`${STRIP}.querySelector('#pillActions .pill-btn').dataset.tooltip`);
 const tip=await w.waitFor(()=>w.hostEval(`(()=>{const t=document.getElementById('prototypeTooltip');if(t.hidden)return null;
  const r=t.getBoundingClientRect();return {text:t.textContent,x:r.x,y:r.y,width:r.width,height:r.height};})()`),Boolean,'the tooltip',2000);
 assert.equal(tip.text,label);
 result.tooltip={...tip,button:btn,shippingTop:Math.round(btn.y+btn.height+6)};
 await shot('tooltip');result.checks.push(`the button's tooltip ("${label}") shows after a rest`);

 // Hover-open: a rest on the site name opens the panel.
 await away();
 await w.call('setIslandHoverOpen',true);
 const name=await box('#pillDomain');await move(name.cx,name.cy);
 await w.waitFor(()=>w.hostEval("!document.getElementById('overlay').hidden"),Boolean,'the panel opened by hover',2000);
 result.checks.push('with hover-open on, resting on the site name opens the panel');
 await w.hostEval("window.BlancPrototypeHost.api.closeOverlay('escape')");
 await w.call('setIslandHoverOpen',false);
 await visible();result.result='pass';
}catch(error){result.result=error.code==='BLANC_ENVIRONMENT_STOP'?'blocked-environment':'fail';result.error=String(error.stack);process.exitCode=1;}
finally{
 const exit=await f.close();if(exit?.code!==0){result.exit=exit;result.result='fail';process.exitCode=1;}
 if(f.directory&&fs.existsSync(path.join(f.directory,'browser.log')))fs.copyFileSync(path.join(f.directory,'browser.log'),path.join(out,'browser.log'));
 fs.rmSync(parent,{recursive:true,force:true});fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}
