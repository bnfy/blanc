// C2a / F50: the fork's Customize > Wallpaper > Color and Fill controls.
// Shipping pin 8a4e57e78: src/main/settings.js:218-225 (Sunrise, Sage,
// Gradient defaults), src/main/start-page-paint.js:10-13 (Fill choices),
// src/renderer/space-identity.js:13 (Sage #426c4c), and
// src/renderer/pages/newtab.js:1634-1643 (apply/remove the fill).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {NativeFixture} from './lib/fixture.mjs';
import {installDriver} from './lib/test-driver.mjs';
import {assertRendering,assertNodeRuntime} from './lib/render-guard.mjs';
import {createWorld} from './world.mjs';
const [configFile,out]=process.argv.slice(2),config=JSON.parse(fs.readFileSync(configFile));
assertNodeRuntime();assert.equal(fs.existsSync(out),false,'expected a new output folder; found an existing folder');fs.mkdirSync(out,{recursive:true});
const f=new NativeFixture(),w=createWorld(f),result={candidate:config.candidate,checks:[]};
const parent=fs.mkdtempSync(path.join(os.tmpdir(),'blanc-recheck-f50-'));
const visible=()=>assertRendering(e=>f.host.eval(e));
const newStartPage=async()=>{const before=new Set((await f.targets()).map(t=>t.id));await w.call('newTab');
 const t=await w.waitFor(async()=>(await f.targets()).find(t=>t.type==='page'&&/newtab/.test(t.url)&&!before.has(t.id)),Boolean,'F50 expected a new Start Page target',10000).catch(e=>assert.fail(e.message));
 const cdp=await f.connectTarget(t);await w.waitFor(()=>cdp.eval(`document.body.classList.contains('layout-ready')`),Boolean,'F50 expected the Start Page drawn',10000).catch(e=>assert.fail(e.message));return cdp;};
const read=cdp=>cdp.eval(`(()=>{const css=getComputedStyle(document.body),saved=JSON.parse(localStorage.getItem('blanc.prototype.start.preferences.v1')||'{}').wallpaper;
 return {source:wallpaperState.source,preset:wallpaperState.color?.preset,fill:wallpaperState.color?.paint?.fill,
  savedSource:saved?.source,savedFill:saved?.color?.paint?.fill,appliedFill:document.body.dataset.wallpaperFill??null,
  base:css.getPropertyValue('--start-color-base').trim(),background:css.backgroundImage,color:css.backgroundColor,
  colorSelected:document.getElementById('colorWallpaperPick').getAttribute('aria-pressed'),sunriseSelected:document.getElementById('sunriseWallpaperPick').getAttribute('aria-pressed'),
  solidSelected:document.querySelector('[data-wallpaper-fill-pick="solid"]').getAttribute('aria-pressed'),
  optionsHidden:document.getElementById('colorWallpaperOptions').hidden,
  imageLayers:[...document.querySelectorAll('.start-wallpaper-layer')].some(l=>l.classList.contains('is-visible'))};})()`);
try{
 await f.launch(config,path.join(parent,'fixture'),{testHooks:true,diskAssets:false});await installDriver(f.host);await visible();await w.reset();
 const page=await newStartPage(),before=await read(page);
 assert.equal(before.source,'sunrise',`F50 expected a fresh profile to use Sunrise; found ${JSON.stringify(before)}`);
 assert.equal(before.appliedFill,null,`F50 expected no Color fill on Sunrise; found ${JSON.stringify(before)}`);
 const controls=await page.eval(`(()=>{const p=document.getElementById('customizePopover');if(!p.matches(':popover-open'))document.getElementById('customizeButton').click();
  const b=document.getElementById('colorWallpaperPick');return {open:p.matches(':popover-open'),enabled:!b.disabled};})()`);
 assert.deepEqual(controls,{open:true,enabled:true},`F50 expected Customize open and Color enabled; found ${JSON.stringify(controls)}`);
 await page.eval(`document.getElementById('colorWallpaperPick').click(),1`);
 let d=await w.waitFor(()=>read(page),d=>d.source==='color'&&d.savedSource==='color'&&d.appliedFill==='gradient'&&d.colorSelected==='true'&&!d.optionsHidden,'F50 expected Color saved and selected with its Gradient fill applied',8000).catch(e=>assert.fail(e.message));
 assert.equal(d.preset,'sage',`F50 expected the shipping Sage preset; found ${JSON.stringify(d)}`);
 assert.equal(d.base,'#426c4c',`F50 expected Sage base #426c4c; found ${JSON.stringify(d)}`);
 assert.equal(d.color,'rgb(66, 108, 76)',`F50 expected the drawn Sage background rgb(66, 108, 76); found ${JSON.stringify(d)}`);
 assert.match(d.background,/gradient\(/,`F50 expected a drawn Gradient fill; found ${JSON.stringify(d)}`);
 assert.notEqual(d.background,before.background,`F50 expected Color to replace Sunrise's background ${before.background}; found ${d.background}`);
 assert.equal(d.imageLayers,false,`F50 expected no artwork layer over the Color fill; found ${JSON.stringify(d)}`);
 result.checks.push('choosing Color in Customize applies the shipping Sage Gradient fill to the Start Page');

 const gradient=d.background;
 await page.eval(`document.querySelector('[data-wallpaper-fill-pick="solid"]').click(),1`);
 d=await w.waitFor(()=>read(page),d=>d.fill==='solid'&&d.savedFill==='solid'&&d.appliedFill==='solid'&&d.solidSelected==='true','F50 expected Solid saved, selected and applied',8000).catch(e=>assert.fail(e.message));
 assert.equal(d.background,'none',`F50 expected Solid to remove the drawn gradient; found ${JSON.stringify(d)}`);
 assert.equal(d.color,'rgb(66, 108, 76)',`F50 expected Solid to keep the Sage color rgb(66, 108, 76); found ${JSON.stringify(d)}`);
 assert.notEqual(d.background,gradient,`F50 expected changing Fill to change the background from ${gradient}; found ${d.background}`);
 result.checks.push('changing Fill from Gradient to Solid stores Solid and changes the drawn background');

 await w.relaunch();await visible();
 const next=await newStartPage();d=await read(next);
 const kept={source:d.source,savedSource:d.savedSource,preset:d.preset,fill:d.fill,savedFill:d.savedFill,appliedFill:d.appliedFill,color:d.color,background:d.background,selected:d.solidSelected};
 assert.deepEqual(kept,{source:'color',savedSource:'color',preset:'sage',fill:'solid',savedFill:'solid',appliedFill:'solid',color:'rgb(66, 108, 76)',background:'none',selected:'true'},`F50 expected Sage Solid saved and applied on a new Start Page after relaunch; found ${JSON.stringify(kept)}`);
 result.checks.push('a new Start Page after same-profile relaunch still applies the Sage Solid fill');

 await next.eval(`(()=>{const p=document.getElementById('customizePopover');if(!p.matches(':popover-open'))document.getElementById('customizeButton').click();document.getElementById('sunriseWallpaperPick').click();return 1;})()`);
 d=await w.waitFor(()=>read(next),d=>d.source==='sunrise'&&d.savedSource==='sunrise'&&d.appliedFill===null&&d.sunriseSelected==='true'&&d.optionsHidden,'F50 expected Sunrise saved and selected with the Color fill removed',8000).catch(e=>assert.fail(e.message));
 assert.equal(d.background,before.background,`F50 expected Sunrise's original background ${before.background}; found ${d.background}`);
 assert.equal(d.color,before.color,`F50 expected Sunrise's original background color ${before.color}; found ${d.color}`);
 assert.equal(d.imageLayers,false,`F50 expected no dynamic/custom image layer after returning to static Sunrise; found ${JSON.stringify(d)}`);
 result.checks.push('switching back to Sunrise removes the Color fill and restores the original artwork background');
 await visible();result.result='pass';
}catch(error){result.result=error.code==='BLANC_ENVIRONMENT_STOP'?'blocked-environment':'fail';result.error=String(error.stack);process.exitCode=1;}
finally{
 const exit=await f.close();if(exit?.code!==0){result.exit=exit;result.result='fail';process.exitCode=1;}
 if(f.directory&&fs.existsSync(path.join(f.directory,'browser.log')))fs.copyFileSync(path.join(f.directory,'browser.log'),path.join(out,'browser.log'));
 fs.rmSync(parent,{recursive:true,force:true});fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}
