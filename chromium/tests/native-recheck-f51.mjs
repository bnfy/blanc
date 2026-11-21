// F51: the What's New pill. Shipping v1.49.1 src/main/whats-new.js: after an
// update the Start Page shows a pill for seven days; with no What's New page
// found it links to the changelog entry; opening the link or closing the
// pill ends it for that version, and the next update shows it again. A test
// launch reports its release with --blanc-test-version; without one the
// rules never run. Offline, so the page-found path and its one-time tab are
// not exercised here.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import {fileURLToPath} from "node:url";
import {NativeFixture} from "./lib/fixture.mjs";
import {installDriver} from "./lib/test-driver.mjs";
import {assertRendering,assertNodeRuntime} from "./lib/render-guard.mjs";
import {createWorld} from "./world.mjs";
const [configFile,out]=process.argv.slice(2),config=JSON.parse(fs.readFileSync(configFile));
assertNodeRuntime();assert.equal(fs.existsSync(out),false,"expected a new output folder");fs.mkdirSync(out,{recursive:true});
const f=new NativeFixture(),w=createWorld(f),result={candidate:config.candidate,checks:[]};
const visible=()=>assertRendering(e=>f.host.eval(e));
const here=path.dirname(fileURLToPath(import.meta.url));
const parent=fs.mkdtempSync(path.join(os.tmpdir(),'blanc-recheck-f51-'));
const drawn=cdp=>w.waitFor(()=>cdp.eval(`document.body.classList.contains('layout-ready')`),Boolean,'the Start Page drawn',10000);
const startPage=async()=>{
 const find=async()=>(await f.targets()).find(t=>t.type==='page'&&/newtab/.test(t.url));
 let t=await find();if(!t){await w.call('newTab');t=await w.waitFor(find,Boolean,'a Start Page',10000);}
 const cdp=await f.connectTarget(t);await drawn(cdp);return cdp;};
const pill=cdp=>cdp.eval(`(()=>{const el=document.getElementById('whatsNew'),link=document.getElementById('whatsNewLink');
 const shown=!!el&&!el.hidden&&getComputedStyle(el).display!=='none'&&el.getBoundingClientRect().width>0;
 return {shown,label:shown?document.getElementById('whatsNewLabel').textContent.trim():null,href:shown?link.href:null};})()`);
const state=async()=>(await w.native('profileImportPrefs',[['blanc.whats_new']])).prefs['blanc.whats_new']??{};
const withVersion=version=>w.relaunch({afterStop:async()=>{f.flags=f.flags.filter(x=>!x.startsWith('--blanc-test-version=')).concat(version?['--blanc-test-version='+version]:[]);}});
try{
 await f.launch(config,path.join(parent,'fixture'),{testHooks:true,diskAssets:false});await installDriver(f.host);await visible();await w.reset();

 // 1. No release version (the preview): nothing shows and nothing is saved.
 let page=await startPage();
 assert.deepEqual(await pill(page),{shown:false,label:null,href:null});assert.deepEqual(await state(),{});
 result.checks.push('with no release version the pill never shows and no state is written');

 // 2. A release reported to an existing profile: the pill, linking to that release's changelog entry.
 await withVersion('1.46.0');await f.host.send('Page.bringToFront');await visible();
 page=await startPage();
 let p=await w.waitFor(()=>pill(page),v=>v.shown,'the What\'s New pill',10000);
 assert.equal(p.href,'https://blanc.day/changelog#v1-46-0');assert.match(p.label,/1\.46\.0/);
 let s=await state();assert.equal(s.lastRunVersion,'1.46.0');assert.equal(s.whatsNewVersion,'1.46.0');
 result.checks.push('after an update the Start Page shows the pill with the version, linking to its changelog entry');

 // 3. Opening the link counts as seen: it does not come back, on a new Start Page or after a relaunch.
 await page.eval(`document.getElementById('whatsNewLink').addEventListener('click',e=>e.preventDefault(),{once:true}),document.getElementById('whatsNewLink').click()`);
 await w.waitFor(state,v=>v.whatsNewVersion==='','the pill marked seen',5000);
 await page.eval(`location.reload()`).catch(()=>{});await new Promise(r=>setTimeout(r,500));await drawn(page);
 assert.equal((await pill(page)).shown,false,'expected the pill gone after its link was opened');
 await withVersion('1.46.0');await f.host.send('Page.bringToFront');await visible();
 page=await startPage();await new Promise(r=>setTimeout(r,1500));
 assert.equal((await pill(page)).shown,false,'expected the pill to stay gone after a relaunch on the same version');
 result.checks.push('opening the link ends the pill for that version, across a reload and a relaunch');

 // 4. The next update shows it again; its close button ends it.
 await withVersion('1.47.0');await f.host.send('Page.bringToFront');await visible();
 page=await startPage();
 p=await w.waitFor(()=>pill(page),v=>v.shown,'the pill for the next release',10000);
 assert.equal(p.href,'https://blanc.day/changelog#v1-47-0');
 await page.eval(`document.getElementById('whatsNewHide').click()`);
 await w.waitFor(()=>pill(page),v=>!v.shown,'the pill closed',5000);
 await w.waitFor(state,v=>v.whatsNewVersion===''&&v.lastRunVersion==='1.47.0','the close saved',5000);
 result.checks.push('the next update shows the pill again, and its close button ends it');
 await visible();result.result='pass';
}catch(error){result.result=error.code==="BLANC_ENVIRONMENT_STOP"?"blocked-environment":"fail";result.error=String(error.stack);process.exitCode=1;}
finally{
 const exit=await f.close();if(exit?.code!==0){result.exit=exit;result.result="fail";process.exitCode=1;}
 if(f.directory&&fs.existsSync(path.join(f.directory,"browser.log")))fs.copyFileSync(path.join(f.directory,"browser.log"),path.join(out,"browser.log"));
 fs.rmSync(parent,{recursive:true,force:true});fs.writeFileSync(path.join(out,"result.json"),JSON.stringify(result,null,2)+"\n");console.log(JSON.stringify(result));
}
