// N3 in the fork: screen sharing is Chromium's own getDisplayMedia and its
// picker, not shipping's broker; what the Island owes is shipping's sharing
// chip and popover row (src/main/display-capture-indicator.js
// projectDisplayShares; renderer.js pillDisplayShare; overlay.js
// display-share-row with its Stop). This shares a tab, with the picker
// answered by Chromium's own test switch so nothing opens on screen and no
// screen or window is captured. Not covered here: the picker itself, and a
// window or whole-screen share (those need the macOS Screen Recording
// permission).
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
const parent=fs.mkdtempSync(path.join(os.tmpdir(),'blanc-display-share-'));
const visible=()=>assertRendering(e=>f.host.eval(e));
// Fake devices, and the tab to share chosen by its title instead of a picker.
f.extraArgs=['--use-fake-device-for-media-stream','--auto-select-tab-capture-source-by-title=Share target'];
const shares=async()=>(await w.snapshot()).displayShares;
const chipShown=()=>w.frame('strip').evaluate(()=>!document.getElementById('pillDisplayShare').hidden);
try{
 await f.launch(config,path.join(parent,'fixture'),{testHooks:true,diskAssets:false});await installDriver(f.host);await visible();await w.reset();
 f.server.removeAllListeners('request');f.server.on('request',(q,r)=>{r.writeHead(200,{'content-type':'text/html'});
  r.end(`<title>${q.url==='/target'?'Share target':'Sharer'}</title><p>${q.url}</p>`);});
 await w.call('openTab',f.base+'/target');
 const id=await w.call('openTab',f.base+'/sharer');
 const page=await tabPage(w,id);await page.evalExpression('1');
 const live=()=>page.evalExpression(`({live:window.__share?.getVideoTracks().some(t=>t.readyState==='live')??false,surface:window.__share?.getVideoTracks()[0]?.getSettings().displaySurface??null,error:window.__shareError??null})`);
 assert.deepEqual(await shares(),[],'expected no share before anything shares');
 assert.equal(await chipShown(),false,'expected no sharing chip before anything shares');
 // getDisplayMedia needs a user gesture.
 await page.cdp.send('Runtime.evaluate',{userGesture:true,expression:`navigator.mediaDevices.getDisplayMedia({video:true}).then(s=>{window.__share=s},e=>{window.__shareError=e.name});1`});
 const started=await w.waitFor(live,s=>s.live||s.error,'the tab share starts',10000);
 assert.deepEqual(started,{live:true,surface:'browser',error:null},'expected a live tab share');
 const rows=await w.waitFor(shares,r=>r.length===1,'the Island reports one share',8000);
 assert.deepEqual(rows[0],{shareId:String(id),pending:false,origin:new URL(f.base).origin,surfaceLabel:null,surfaceKind:'tab',computerAudio:false,tabId:String(id)},'expected shipping\'s share row for the sharing tab');
 await w.waitFor(chipShown,Boolean,'the sharing chip shows',8000);
 result.checks.push('a tab share lights the Island\'s sharing chip and is reported as one share, for the sharing tab');

 // Window-wide, and the popover row leads back to the sharing tab.
 const elsewhere=await w.call('openTab',f.base+'/elsewhere');
 // A page finishing its load closes the Island's popovers, as in shipping;
 // let this one finish first.
 await w.waitFor(async()=>(await w.snapshot()).tabs.find(t=>String(t.id)===String(elsewhere)),t=>t&&!t.loading&&!t.isLoading,'the other tab finishes loading',8000);
 await new Promise(r=>setTimeout(r,500));
 await w.waitFor(chipShown,Boolean,'the chip stays with another tab in front',8000);
 await w.frame('strip').locator('#pillDisplayShare').click();
 const pop=w.frame('overlay');
 await pop.locator('#capturePop').waitFor({state:'visible'});
 assert.equal(await pop.evaluate(()=>document.querySelectorAll('.display-share-row').length),1,'expected one share row in the popover');
 await pop.locator('.display-share-go').click();
 await w.waitFor(async()=>String((await w.snapshot()).activeTabId),a=>a===String(id),'the row goes to the sharing tab',8000);
 result.checks.push('the chip is window-wide, and its popover row brings the sharing tab forward');

 // The row only switches tabs, as shipping's: the popover stays open.
 assert.equal(await pop.evaluate(()=>!document.getElementById('capturePop').hidden),true,'expected the popover still open after going to the tab');
 await pop.locator('.display-share-stop').click();
 await w.waitFor(live,s=>s.live===false,'Stop ends the real share',8000);
 await w.waitFor(shares,r=>r.length===0,'the Island reports no share after Stop',8000);
 await w.waitFor(chipShown,v=>v===false,'the sharing chip hides after Stop',8000);
 result.checks.push('Stop in the popover ends the share and clears the chip');
 await visible();result.result='pass';
}catch(error){result.result=error.code==='BLANC_ENVIRONMENT_STOP'?'blocked-environment':'fail';result.error=String(error.stack);process.exitCode=1;}
finally{
 const exit=await f.close();if(exit?.code!==0){result.exit=exit;result.result='fail';process.exitCode=1;}
 if(f.directory&&fs.existsSync(path.join(f.directory,'browser.log')))fs.copyFileSync(path.join(f.directory,'browser.log'),path.join(out,'browser.log'));
 fs.rmSync(parent,{recursive:true,force:true});fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}
