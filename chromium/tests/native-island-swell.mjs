// The approach swell (shipping's "Island proximity"): the resting pill rises
// and grows as the cursor comes near, from the page or over the Island; it
// rests far away, while something is open over it and under Reduce motion;
// closing a surface wakes it where the cursor is; and Chromium's extension
// buttons over its slot move with it.
//   node chromium/tests/native-island-swell.mjs <runtime-config.json> <out>
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
const parent=fs.mkdtempSync(path.join(os.tmpdir(),'blanc-island-swell-'));
const visible=()=>assertRendering(e=>f.host.eval(e));
const pause=ms=>new Promise(r=>setTimeout(r,ms));
// The strip's pill: its painted closeness, and its box in host coordinates.
const PILL="document.getElementById('strip').contentDocument.getElementById('islandPill')";
const k=()=>w.hostEval(`Number(${PILL}.style.getPropertyValue('--island-k'))||0`);
const pillBox=()=>w.hostEval(`(()=>{const s=document.getElementById('strip').getBoundingClientRect(),r=${PILL}.getBoundingClientRect();
 return {x:r.x+s.x,y:r.y+s.y,width:r.width,height:r.height};})()`);
// The slot's measured swell, as host.js sends it: growth, then its move.
const slotSwell=()=>w.hostEval(`(()=>{const d=document.getElementById('strip').contentDocument,p=d.getElementById('islandPill'),s=d.getElementById('nativeExtensions');
 const now=s.getBoundingClientRect();if(!p.classList.contains('proximity-active'))return [1,0,0];
 p.classList.remove('proximity-active');const rest=s.getBoundingClientRect();p.classList.add('proximity-active');
 return [now.width/rest.width,now.x-rest.x,now.y-rest.y];})()`);
const nativeSwell=async()=>(await w.native('autoHideState')).extensionsSwell;
const close=(a,b)=>a.every((v,i)=>Math.abs(v-b[i])<0.01);
try{
 await f.launch(config,path.join(parent,'fixture'),{testHooks:true,diskAssets:process.env.DISK_ASSETS==="1"});
 await installDriver(f.host);await visible();await w.reset();
 f.server.removeAllListeners('request');
 f.server.on('request',(q,r)=>{r.writeHead(200,{'content-type':'text/html'});r.end('<title>Swell fixture</title><body style="margin:0;height:3000px"></body>');});
 const id=await w.call('openTab',f.base+'/swell');
 const page=await tabPage(w,id);await page.evalExpression('1');
 const move=(x,y)=>page.cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x,y,button:'none',buttons:0});
 const hostMove=(x,y)=>f.host.send('Input.dispatchMouseEvent',{type:'mouseMoved',x,y,button:'none',buttons:0});
 // Like shipping, the swell sleeps while another window is in front, so each
 // step first puts the test window in front.
 const front=async()=>{await page.bringToFront();await w.waitFor(()=>w.snapshot(),s=>s.windowActive===true,'the test window in front',4000);};
 await front();
 const height=await page.evalExpression('innerHeight');
 assert.ok(height>420,`the page is tall enough to leave the Island's reach: ${height}`);
 const box=await pillBox(),cx=Math.round(box.x+box.width/2);
 result.pill=box;

 // Far down the page: at rest.
 await move(cx,height-10);await pause(400);
 assert.equal(await k(),0,'at rest with the cursor far away');
 // Just below the Island, from the page: the swell settles at 1.
 await front();await move(cx,4);
 await w.waitFor(k,v=>v===1,'the pill swells as the cursor approaches from the page',4000);
 assert.equal(await w.hostEval(`${PILL}.classList.contains('proximity-active')`),true);
 result.checks.push('a cursor approaching from the page swells the resting pill fully within 80px');
 // Partway: between rest and full.
 await move(cx,170);await pause(400);
 const mid=await k();assert.ok(mid>0&&mid<1,`partway out the swell is partial: ${mid}`);
 result.checks.push(`partway out (about 170px below the page top) the swell is partial (${mid})`);
 // The extension buttons take the slot's swell.
 await move(cx,4);await w.waitFor(k,v=>v===1,'full swell again',4000);
 const measured=await slotSwell();
 const swelled=await w.waitFor(nativeSwell,s=>Array.isArray(s)&&s[0]>1.01,'the extension buttons swell',4000);
 assert.ok(close(swelled,measured),`native ${JSON.stringify(swelled)} matches the slot ${JSON.stringify(measured)}`);
 result.extensionsSwell=swelled;
 result.checks.push('Chromium\'s extension buttons take the slot\'s measured swell');
 // Away again: rest, and the buttons with it.
 await move(cx,height-10);
 await w.waitFor(k,v=>v===0,'the pill rests as the cursor leaves',4000);
 await w.waitFor(nativeSwell,s=>close(s,[1,0,0]),'the extension buttons rest',4000);
 result.checks.push('leaving rests the pill and the extension buttons');

 // Over the Island's own band, beside the pill.
 await front();
 const band=await pillBox();
 await hostMove(Math.round(band.x+band.width+40),Math.round(band.y+band.height/2));
 await w.waitFor(k,v=>v===1,'the pill swells as the cursor approaches over the Island',4000);
 // Out of the Island's view and straight on to the page, beyond the reach of
 // the moves native forwards: the swell still rests.
 await hostMove(cx,Math.round(await w.hostEval('innerHeight'))+30);
 await move(cx,height-10);await w.waitFor(k,v=>v===0,'rest after leaving the Island far down the page',4000);
 result.checks.push('a cursor approaching over the Island\'s band swells it, and leaving it far down the page rests it');

 // Something open over it: asleep.
 await front();
 await w.hostEval('window.BlancPrototypeHost.api.openIsland()');
 await w.waitFor(()=>w.hostEval("!document.getElementById('overlay').hidden"),Boolean,'the panel open',4000);
 await move(cx,height-60);await move(cx,height-50);await pause(400);
 assert.equal(await k(),0,'asleep while the panel is open');
 // Closing samples the cursor: near the Island, the pill wakes swelled.
 const bounds=await w.call('windowContentBounds');
 await w.call('setTestCursorPoint',{x:bounds.x+cx,y:bounds.y+Math.round(box.y+box.height+20)});
 await w.hostEval("window.BlancPrototypeHost.api.closeOverlay('escape')");
 await w.waitFor(k,v=>v===1,'closing wakes the swell where the cursor rests',4000);
 await w.call('setTestCursorPoint',null);
 await move(cx,height-10);await w.waitFor(k,v=>v===0,'rest again',4000);
 result.checks.push('the pill rests while the panel is open and wakes where the cursor is when it closes');

 // Reduce motion: no swell at all.
 await front();
 await f.host.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
 await move(cx,4);await pause(500);
 assert.equal(await k(),0,'no swell under Reduce motion');
 await f.host.send('Emulation.setEmulatedMedia',{features:[]});
 await move(cx,height-10);
 result.checks.push('under Reduce motion the pill stays still');
 await visible();result.result='pass';
}catch(error){result.result=error.code==='BLANC_ENVIRONMENT_STOP'?'blocked-environment':'fail';result.error=String(error.stack);process.exitCode=1;}
finally{
 const exit=await f.close();if(exit?.code!==0){result.exit=exit;result.result='fail';process.exitCode=1;}
 if(f.directory&&fs.existsSync(path.join(f.directory,'browser.log')))fs.copyFileSync(path.join(f.directory,'browser.log'),path.join(out,'browser.log'));
 fs.rmSync(parent,{recursive:true,force:true});fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}
