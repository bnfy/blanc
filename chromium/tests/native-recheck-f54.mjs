// C2a / F54: the fork's Clock > Font & color on its single Start Page.
// Shipping pin 8a4e57e78: src/main/start-clock-style.js:21-34 (exact fonts
// and defaults); src/renderer/pages/newtab.html:316-320 (names/order);
// src/renderer/pages/pages.css:62-67,5245-5261 (families/width axes/ink);
// src/renderer/space-identity.js:14 (Sky #376694) and
// src/renderer/pages/clock-ink.js:8,21-24 (tone 50 is the preset exactly).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {NativeFixture} from './lib/fixture.mjs';
import {installDriver} from './lib/test-driver.mjs';
import {assertRendering,assertNodeRuntime} from './lib/render-guard.mjs';
import {jsLiteral} from './lib/js-literal.mjs';
import {createWorld} from './world.mjs';
const [configFile,out]=process.argv.slice(2),config=JSON.parse(fs.readFileSync(configFile));
assertNodeRuntime();assert.equal(fs.existsSync(out),false,'expected a new output folder; found an existing folder');fs.mkdirSync(out,{recursive:true});
const f=new NativeFixture(),w=createWorld(f),result={candidate:config.candidate,checks:[]};
const parent=fs.mkdtempSync(path.join(os.tmpdir(),'blanc-recheck-f54-'));
const visible=()=>assertRendering(e=>f.host.eval(e));
const FONTS=[{id:'instrument',name:'Instrument Sans'},{id:'condensed',name:'Instrument Sans Condensed'},{id:'inter',name:'Inter'},{id:'flex',name:'Roboto Flex'}];
const FACES={instrument:{family:'Instrument Sans',width:98},condensed:{family:'Instrument Sans',width:75},inter:{family:'Inter',width:98},flex:{family:'Blanc Clock Flex',width:100}};
const newStartPage=async()=>{const before=new Set((await f.targets()).map(t=>t.id));await w.call('newTab');
 const t=await w.waitFor(async()=>(await f.targets()).find(t=>t.type==='page'&&/newtab/.test(t.url)&&!before.has(t.id)),Boolean,'F54 expected a new Start Page target',10000).catch(e=>assert.fail(e.message));
 const cdp=await f.connectTarget(t);await w.waitFor(()=>cdp.eval(`document.body.classList.contains('layout-ready')`),Boolean,'F54 expected the Start Page drawn',10000).catch(e=>assert.fail(e.message));return cdp;};
const read=cdp=>cdp.eval(`(()=>{const e=document.getElementById('bbClock'),css=getComputedStyle(e);return {
 font:clockState?.font,color:clockState?.color,tone:clockState?.tone,style:clockState?.style,
 appliedFont:e.dataset.font,family:css.fontFamily,variation:css.fontVariationSettings,ink:css.color,
 shown:css.display!=='none'&&css.visibility==='visible'&&Number(css.opacity)===1&&e.getBoundingClientRect().height>0&&e.textContent.length>0,
 selectedFonts:[...document.querySelectorAll('[data-clock-font-pick]')].filter(b=>b.getAttribute('aria-pressed')==='true').map(b=>b.dataset.clockFontPick),
 selectedColors:[...document.querySelectorAll('[data-clock-color-pick]')].filter(b=>b.getAttribute('aria-pressed')==='true').map(b=>b.dataset.clockColorPick)};})()`);
try{
 await f.launch(config,path.join(parent,'fixture'),{testHooks:true,diskAssets:false});await installDriver(f.host);await visible();await w.reset();
 const page=await newStartPage();
 const controls=await page.eval(`(()=>{const p=document.getElementById('customizePopover');if(!p.matches(':popover-open'))document.getElementById('customizeButton').click();
  const customizeOpen=p.matches(':popover-open');document.getElementById('clockStyleOpen').click();
  return {customizeOpen,clockOpen:document.getElementById('clockPopover').matches(':popover-open'),
   fonts:[...document.querySelectorAll('[data-clock-font-pick]')].map(b=>({id:b.dataset.clockFontPick,name:b.getAttribute('aria-label')})),
   available:[...document.querySelectorAll('[data-clock-font-pick]')].map(b=>({id:b.dataset.clockFontPick,enabled:!b.disabled,shown:getComputedStyle(b).display!=='none'&&getComputedStyle(b).visibility==='visible'&&b.getBoundingClientRect().height>0}))};})()`);
 assert.equal(controls.customizeOpen,true,`F54 expected Customize open before choosing Font & color; found ${JSON.stringify(controls)}`);
 assert.equal(controls.clockOpen,true,`F54 expected Font & color to open its clock popover; found ${JSON.stringify(controls)}`);
 assert.deepEqual(controls.fonts,FONTS,`F54 expected exactly shipping's fonts ${JSON.stringify(FONTS)}; found ${JSON.stringify(controls.fonts)}`);
 assert.ok(controls.available.every(b=>b.enabled&&b.shown),`F54 expected every offered font visible and enabled; found ${JSON.stringify(controls.available)}`);
 result.checks.push('Clock Font & color offers exactly Instrument Sans, Instrument Sans Condensed, Inter and Roboto Flex');

 let before=await read(page);
 const defaults={font:before.font,color:before.color,tone:before.tone,style:before.style};
 assert.deepEqual(defaults,{font:'instrument',color:'auto',tone:50,style:'solid'},`F54 expected the shipping Instrument Sans/Automatic/tone 50/Solid defaults; found ${JSON.stringify(defaults)}`);
 // Start with a different face so even Instrument Sans must change the CSS;
 // finish on non-default Flex so a lost font write cannot pass persistence.
 for(const font of ['condensed','instrument','inter','flex']){
  await page.eval(`document.querySelector('[data-clock-font-pick='+${jsLiteral(font)}+']').click(),1`);
  const d=await w.waitFor(()=>read(page),d=>d.font===font&&d.appliedFont===font&&d.selectedFonts.length===1&&d.selectedFonts[0]===font,'F54 expected '+font+' saved, applied and selected',8000).catch(e=>assert.fail(e.message));
  const face=FACES[font],family=d.family.split(',')[0].trim().replaceAll('"',''),variation='"wdth" '+face.width;
  assert.equal(family,face.family,`F54 ${font}: expected computed first font-family ${face.family}; found ${d.family}`);
  assert.equal(d.variation,variation,`F54 ${font}: expected computed font-variation-settings ${variation}; found ${d.variation}`);
  assert.ok(d.family!==before.family||d.variation!==before.variation,`F54 ${font}: expected font-family or font-variation-settings to change from ${JSON.stringify({family:before.family,variation:before.variation})}; found ${JSON.stringify({family:d.family,variation:d.variation})}`);
  assert.equal(d.shown,true,`F54 ${font}: expected the styled clock visible; found ${JSON.stringify(d)}`);
  result.checks.push('choosing '+FONTS.find(f=>f.id===font).name+' changes the clock\'s computed family or width variation');before=d;
 }

 const colorControl=await page.eval(`(()=>{const b=document.querySelector('[data-clock-color-pick="sky"]');return {present:!!b,enabled:!!b&&!b.disabled};})()`);
 assert.deepEqual(colorControl,{present:true,enabled:true},`F54 expected an enabled Sky color swatch; found ${JSON.stringify(colorControl)}`);
 await page.eval(`document.querySelector('[data-clock-color-pick="sky"]').click(),1`);
 const chosen=await w.waitFor(()=>read(page),d=>d.color==='sky'&&d.selectedColors.length===1&&d.selectedColors[0]==='sky'&&d.ink==='rgb(55, 102, 148)','F54 expected Sky selected and applied as rgb(55, 102, 148) at shipping tone 50',8000).catch(e=>assert.fail(e.message));
 assert.notEqual(chosen.ink,before.ink,`F54 expected choosing Sky to change the clock color from ${before.ink}; found ${chosen.ink}`);
 result.checks.push('choosing Sky changes the clock\'s computed color to the shipping Sky color at tone 50');

 await w.relaunch();await visible();
 const next=await newStartPage(),d=await read(next);
 const kept={font:d.font,appliedFont:d.appliedFont,family:d.family,variation:d.variation,color:d.color,tone:d.tone,ink:d.ink,selectedFonts:d.selectedFonts,selectedColors:d.selectedColors,shown:d.shown};
 const expected={font:'flex',appliedFont:'flex',family:chosen.family,variation:chosen.variation,color:'sky',tone:50,ink:'rgb(55, 102, 148)',selectedFonts:['flex'],selectedColors:['sky'],shown:true};
 assert.deepEqual(kept,expected,`F54 expected the chosen Flex font and Sky color applied after relaunch ${JSON.stringify(expected)}; found ${JSON.stringify(kept)}`);
 result.checks.push('a new Start Page after same-profile relaunch still applies Roboto Flex and Sky');
 await visible();result.result='pass';
}catch(error){result.result=error.code==='BLANC_ENVIRONMENT_STOP'?'blocked-environment':'fail';result.error=String(error.stack);process.exitCode=1;}
finally{
 const exit=await f.close();if(exit?.code!==0){result.exit=exit;result.result='fail';process.exitCode=1;}
 if(f.directory&&fs.existsSync(path.join(f.directory,'browser.log')))fs.copyFileSync(path.join(f.directory,'browser.log'),path.join(out,'browser.log'));
 fs.rmSync(parent,{recursive:true,force:true});fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}
