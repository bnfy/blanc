// N13: Mute Site and the page tint. Shipping v1.49.1 src/main/site-mute.js
// (a site muted from one tab is muted in every tab on it, old and new) and
// src/main/page-tint-controller.js / page-tint-policy.js (the Island takes
// the page's color; Match site colors off returns it to the theme).
// Divergence V21 (approved 2026-11-05) says a muted site stays muted after a
// relaunch; check 3 reports what this build does.
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
import {inSettings} from './adapters/commands.mjs';
const parent=fs.mkdtempSync(path.join(os.tmpdir(),'blanc-recheck-n13-'));
const raw=async url=>(await f.snapshot()).tabs.find(t=>t.url===url);
const open=async name=>{const url=f.base+'/'+name,id=await w.call('openTab',url);
 await w.waitFor(()=>w.snapshot(),s=>s.tabs.some(t=>String(t.id)===String(id)&&t.url===url&&!t.isLoading),'the fixture page '+name,10000);return {id,url};};
const setColors=on=>inSettings(w,'appearance',async value=>{await new Promise((resolve,reject)=>chrome.settingsPrivate.setPref('blanc.island.site_colors',value,'',ok=>ok?resolve():reject(Error('Preference rejected'))));return {value:true};},on);
try{
 await f.launch(config,path.join(parent,'fixture'),{testHooks:true,diskAssets:false});await installDriver(f.host);await visible();await w.reset();

 // 1. A playing tab, then Mute Site: that tab and another on the same site are silenced.
 const a=await open('n13-a'),b=await open('n13-b');
 await w.call('setQuietProtection',a.id,'audible');
 await w.waitFor(()=>raw(a.url),t=>t?.audible===true,'the fixture playing sound',10000);
 assert.equal((await raw(a.url)).siteMuted,false);
 await w.call('toggleSiteMute',a.id);
 const muted=await w.waitFor(async()=>[await raw(a.url),await raw(b.url)],([x,y])=>x?.siteMuted===true&&y?.siteMuted===true,'both tabs on the site muted',5000);
 result.observed={};
 const shown=(await w.snapshot()).tabs.filter(t=>[a.url,b.url].includes(t.url)).map(t=>t.muted);
 assert.deepEqual(shown,[true,true],'expected both tabs shown muted');
 assert.equal(muted[0].audible,true,'the page keeps playing; only its sound is cut');
 result.checks.push('Mute Site silences the playing tab and every other tab on that site');

 // 2. A new tab on the site is muted too; Unmute Site restores them all.
 const c=await open('n13-c');
 await w.waitFor(()=>raw(c.url),t=>t?.siteMuted===true,'a new tab on the muted site muted',5000);
 await w.call('toggleSiteMute',c.id);
 await w.waitFor(async()=>[await raw(a.url),await raw(b.url),await raw(c.url)],rows=>rows.every(t=>t?.siteMuted===false),'the site unmuted everywhere',5000);
 await w.call('toggleSiteMute',a.id);
 await w.waitFor(()=>raw(a.url),t=>t?.siteMuted===true,'the site muted again',5000);
 result.checks.push('a new tab on a muted site is muted, and Unmute Site restores every tab');

 // 3. After a relaunch (V21 says it stays muted; shipping's ends when Blanc quits).
 await w.relaunch();await f.host.send('Page.bringToFront');await visible();
 const after=await w.waitFor(()=>raw(a.url),Boolean,'the tab restored',10000);
 result.observed.siteMutedAfterRelaunch=after.siteMuted;
 result.checks.push('after a relaunch the site is '+(after.siteMuted?'still muted (V21)':'no longer muted (as shipping, not V21)'));

 // 4. The page tint: the Island reports the page's color; Match site colors off clears it, and on brings it back.
 const d=await open('n13-tint');
 await (await f.connectTarget((await f.targets()).find(t=>t.type==='page'&&t.url===d.url))).eval(`(()=>{const m=document.createElement('meta');m.name='theme-color';m.content='#1f6f4a';document.head.append(m);
  document.documentElement.style.background=document.body.style.background='#1f6f4a';})()`);
 const hex=v=>typeof v==='string'&&/^#[0-9a-f]{6}$/.test(v);
 const tinted=await w.waitFor(()=>raw(d.url),t=>hex(t?.pageBg),'the page\'s color reported to the Island',10000);
 const [r,g,bl]=[1,3,5].map(i=>parseInt(tinted.pageBg.slice(i,i+2),16));
 assert.ok(g>r&&g>bl,'expected a green tint from the green page; found '+tinted.pageBg);
 await setColors(false);
 await w.waitFor(()=>raw(d.url),t=>t&&t.pageBg==='','the tint cleared with Match site colors off',10000);
 await setColors(true);
 await w.waitFor(()=>raw(d.url),t=>hex(t?.pageBg),'the tint back with Match site colors on',10000);
 result.checks.push('the Island takes the page\'s color; Match site colors off clears it and on restores it');
 await visible();result.result='pass';
}catch(error){result.result=error.code==="BLANC_ENVIRONMENT_STOP"?"blocked-environment":"fail";result.error=String(error.stack);process.exitCode=1;}
finally{
 const exit=await f.close();if(exit?.code!==0){result.exit=exit;result.result="fail";process.exitCode=1;}
 if(f.directory&&fs.existsSync(path.join(f.directory,"browser.log")))fs.copyFileSync(path.join(f.directory,"browser.log"),path.join(out,"browser.log"));
 fs.rmSync(parent,{recursive:true,force:true});fs.writeFileSync(path.join(out,"result.json"),JSON.stringify(result,null,2)+"\n");console.log(JSON.stringify(result));
}
