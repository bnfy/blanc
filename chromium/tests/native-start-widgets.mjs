// V24 (owner, 2026-11-13): Billboard is the one Start Page layout, with
// optional widgets switched on in Customize, saved device-wide, shared live
// by every open Start Page and kept across a relaunch. A profile that chose
// another layout before gets that layout's widgets once. Over your image,
// every text group sits on a plate and the clock on a halo.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {NativeFixture} from './lib/fixture.mjs';
import {installDriver} from './lib/test-driver.mjs';
import {assertRendering,assertNodeRuntime} from './lib/render-guard.mjs';
import {createWorld} from './world.mjs';
import {LAYOUT_WIDGETS} from './lib/start-widgets.mjs';
const [configFile,out]=process.argv.slice(2),config=JSON.parse(fs.readFileSync(configFile));
assertNodeRuntime();assert.equal(fs.existsSync(out),false);fs.mkdirSync(out,{recursive:true});
const f=new NativeFixture(),w=createWorld(f),result={candidate:config.candidate,checks:[]};
const parent=fs.mkdtempSync(path.join(os.tmpdir(),'blanc-start-widgets-'));
const visible=()=>assertRendering(e=>f.host.eval(e));
const NAMES=['favorites','devices','chart','shortcuts'];
// Every Start Page document open now, connected directly.
const startPages=async()=>Promise.all((await f.targets()).filter(t=>t.type==='page'&&/newtab/.test(t.url)).map(t=>f.connectTarget(t)));
const read=cdp=>cdp.eval(`(()=>{const shown=e=>!!e&&getComputedStyle(e).display!=='none'&&e.getBoundingClientRect().height>0;
 return {ready:document.body.classList.contains('layout-ready'),root:document.body.dataset.layout,widgets:typeof state==='object'?state.widgets:null,
  switches:Object.fromEntries([...document.querySelectorAll('[data-widget-pick]')].map(b=>[b.dataset.widgetPick,b.getAttribute('aria-checked')])),
  roles:[...document.querySelectorAll('[data-widget-pick]')].map(b=>b.getAttribute('role')),
  names:[...document.querySelectorAll('[data-widget-pick]')].map(b=>b.textContent.trim()),
  favorites:shown(document.querySelector('#bbWidgets [data-widget=favorites]')),
  chart:shown(document.querySelector('#bbWidgets [data-widget=chart]')),
  line:shown(document.getElementById('bbBlocked')),tileLimit:billboardSiteCount()};})()`);
const same=(a,b)=>NAMES.every(n=>a?.[n]===b[n]);
const newStartPage=async()=>{const before=new Set((await f.targets()).map(t=>t.id));await w.call('newTab');
 const t=await w.waitFor(async()=>(await f.targets()).find(t=>t.type==='page'&&/newtab/.test(t.url)&&!before.has(t.id)),Boolean,'a new Start Page',10000);
 const cdp=await f.connectTarget(t);await w.waitFor(()=>read(cdp),d=>d?.ready,'the Start Page drawn',10000);return cdp;};
try{
 await f.launch(config,path.join(parent,'fixture'),{testHooks:true,diskAssets:false});
 await installDriver(f.host);await visible();await w.reset();
 const a=await newStartPage();let d=await read(a);
 assert.equal(d.root,'billboard');assert.ok(same(d.widgets,LAYOUT_WIDGETS.billboard),'a new profile starts with Billboard alone');
 assert.deepEqual(d.roles,['switch','switch','switch','switch']);
 assert.deepEqual(d.names,['Favorites','On your other devices','Blocked this week','More shortcuts']);
 assert.equal(d.tileLimit,6);assert.equal(d.favorites,false);assert.equal(d.chart,false);
 result.checks.push('a new profile shows Billboard alone, with four widget switches in Customize');

 // Switch the chart and More shortcuts on as a person would, from Customize.
 const b=await newStartPage();
 for(const name of ['chart','shortcuts']){
  assert.equal(await b.eval(`(async()=>{const p=document.getElementById('customizePopover');if(!p.matches(':popover-open'))document.getElementById('customizeButton').click();
   const s=document.querySelector('[data-widget-pick=${name}]');s.click();for(let i=0;i<100&&s.getAttribute('aria-checked')!=='true';i++)await new Promise(r=>setTimeout(r,50));
   return s.getAttribute('aria-checked');})()`),'true',`${name} switched on`);
 }
 d=await w.waitFor(()=>read(b),x=>x?.widgets?.chart&&x.widgets.shortcuts,'the chart and More shortcuts on',8000);
 assert.equal(d.chart,true,'the chart widget shows');assert.equal(d.line,false,'the chart replaces the one-line count');assert.equal(d.tileLimit,12);
 result.checks.push('the chart replaces the blocked line, and More shortcuts gives Billboard twelve tiles');
 d=await w.waitFor(()=>read(a),x=>x?.widgets?.chart&&x.widgets.shortcuts&&x.switches.chart==='true','the other Start Page to follow',8000);
 assert.equal(d.chart,true);
 result.checks.push('another open Start Page follows the change at once');

 await w.relaunch();await visible();
 const c=await newStartPage();d=await read(c);
 assert.ok(same(d.widgets,{favorites:false,devices:false,chart:true,shortcuts:true}),`kept after a relaunch: ${JSON.stringify(d.widgets)}`);
 result.checks.push('the widgets are kept across a relaunch');

 // Someone on Tally before V24: no widget choice yet, the old layout saved.
 await w.relaunch({afterStop:()=>{
  const local=path.join(f.profile,'Local State');const state=JSON.parse(fs.readFileSync(local,'utf8'));
  delete state.blanc?.start?.widgets;fs.writeFileSync(local,JSON.stringify(state));
  const prefsFile=path.join(f.profile,'Default','Preferences');const prefs=JSON.parse(fs.readFileSync(prefsFile,'utf8'));
  prefs.blanc??={};prefs.blanc.prototype??={};prefs.blanc.prototype.start_layout='tally';fs.writeFileSync(prefsFile,JSON.stringify(prefs));
 }});
 await visible();
 const e=await newStartPage();d=await read(e);
 assert.ok(same(d.widgets,LAYOUT_WIDGETS.tally),`Tally's widgets after the move: ${JSON.stringify(d.widgets)}`);
 assert.equal(d.root,'billboard');assert.equal(d.favorites,true);assert.equal(d.chart,true);
 result.checks.push('a profile that chose Tally gets its Favorites and chart once, on Billboard');

 // Over an image: the image stays untouched. The widgets sit on one glass
 // tray, small text keeps a soft shadow with no backing, the footer sits in a
 // fade, and the clock is as it always was (its own shadow, no halo).
 const look=await e.eval(`(async()=>{document.body.dataset.wallpaperStyle='spotlight';await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  const cs=s=>{const el=document.querySelector(s);return el&&getComputedStyle(el).display!=='none'?getComputedStyle(el):null;};
  const clear=c=>c.backgroundColor==='rgba(0, 0, 0, 0)';
  const tray=cs('#bbWidgets'),fade=getComputedStyle(document.getElementById('layoutFooter'),'::after'),clock=getComputedStyle(document.querySelector('.bb-clock-row'),'::before');
  return {tray:!!tray&&!clear(tray)&&tray.backdropFilter.includes('blur'),
   sections:[...document.querySelectorAll('#bbWidgets > .bb-widget')].filter(e=>getComputedStyle(e).display!=='none').map(e=>clear(getComputedStyle(e))),
   text:Object.fromEntries(['.bb-fav .label'].map(s=>{const c=cs(s);return [s,c?{clear:clear(c),shadow:c.textShadow!=='none'}:null];})),
   footerItems:['.start-customize','.footer-right','#footerLeft'].map(s=>{const c=cs(s);return c?clear(c):true;}),
   fade:fade.content!=='none'&&fade.backgroundImage.includes('gradient'),
   headerFade:(h=>h.content!=='none'&&h.backgroundImage.includes('gradient'))(getComputedStyle(document.querySelector('.start-brand'),'::after')),
   dateClear:clear(cs('.start-brand-date')),
   clockHalo:clock.content!=='none'&&clock.content!=='normal',haloAttr:document.querySelector('.bb-clock-row').hasAttribute('data-halo')};})()`);
 result.look=look;
 assert.equal(look.tray,true,'the widgets sit on one glass tray');
 assert.ok(look.sections.length>0&&look.sections.every(Boolean),'the tray\'s sections carry no cards of their own');
 for(const [sel,t] of Object.entries(look.text))if(t){assert.equal(t.clear,true,`${sel} has no backing`);assert.equal(t.shadow,true,`${sel} keeps a soft shadow`);}
 assert.ok(look.footerItems.every(Boolean),'the footer\'s items have no backing');
 assert.equal(look.fade,true,'the footer sits in a fade');
 assert.equal(look.headerFade,true,'the header sits in a fade');assert.equal(look.dateClear,true,'the date has no backing');
 assert.equal(look.clockHalo,false,'no halo behind the clock');assert.equal(look.haloAttr,false);
 result.checks.push('over an image the widgets sit on one glass tray, small text keeps a shadow, the header and footer a fade, and the clock is as before');
 await visible();result.result='pass';
}catch(error){result.result=error.code==='BLANC_ENVIRONMENT_STOP'?'blocked-environment':'fail';result.error=String(error.stack);process.exitCode=1;}
finally{
 const exit=await f.close();if(exit?.code!==0){result.exit=exit;result.result='fail';process.exitCode=1;}
 if(f.directory&&fs.existsSync(path.join(f.directory,'browser.log')))fs.copyFileSync(path.join(f.directory,'browser.log'),path.join(out,'browser.log'));
 fs.rmSync(parent,{recursive:true,force:true});fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}
