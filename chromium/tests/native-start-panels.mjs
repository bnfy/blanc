// Extensions' side panels as Start Page cards (prototype): an installed
// extension with a side panel is offered in Customize; turned on, its card
// holds a slot and Blanc draws the extension's own panel page over it (an
// extension page, in the extension's process), hidden under popovers and on
// other tabs, and gone when turned off.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {NativeFixture} from './lib/fixture.mjs';
import {installDriver} from './lib/test-driver.mjs';
import {assertRendering,assertNodeRuntime} from './lib/render-guard.mjs';
import {createWorld} from './world.mjs';
const [configFile,out]=process.argv.slice(2),config=JSON.parse(fs.readFileSync(configFile));
assertNodeRuntime();assert.equal(fs.existsSync(out),false);fs.mkdirSync(out,{recursive:true});
const here=path.dirname(fileURLToPath(import.meta.url));
const f=new NativeFixture(),w=createWorld(f),result={candidate:config.candidate,checks:[]};
const parent=fs.mkdtempSync(path.join(os.tmpdir(),'blanc-panels-'));
// A picture of the page area without Screen Recording: the Start Page and the
// extension's panel page are captured over DevTools and the panel drawn at
// its slot (lib/compose-png.swift), as Blanc draws its view there.
const capture=async(connection,file)=>{const {data}=await connection.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(file,Buffer.from(data,'base64'));};
let page=null,panelPage=null;
const shot=async name=>{
 const base=path.join(parent,name+'-page.png');await capture(page,base);
 const view=await page.eval('({w:innerWidth,h:innerHeight,dpr:devicePixelRatio})');const px=v=>String(Math.round(v*view.dpr));
 const layers=[base,'0','0',px(view.w),px(view.h)];
 const slot=panelPage&&await page.eval(`(()=>{const s=document.querySelector('.bb-panel-slot');const n=s?.querySelector('.bb-panel-note');if(!s||!n?.hidden)return null;const r=s.getBoundingClientRect();return {x:r.left,y:r.top,w:r.width,h:r.height};})()`);
 if(slot){const file=path.join(parent,name+'-panel.png');await capture(panelPage,file);layers.push(file,px(slot.x),px(slot.y),px(slot.w),px(slot.h));}
 execFileSync('swift',[path.join(here,'lib/compose-png.swift'),path.join(out,name+'.png'),px(view.w),px(view.h),...layers]);
};
try{
 await f.launch(config,path.join(parent,'fixture'),{testHooks:true,diskAssets:process.env.DISK_ASSETS==="1"});
 await installDriver(f.host);await assertRendering(e=>f.host.eval(e));await w.reset();
 await w.call('setWindowContentSize',1600,960);
 await w.native('createTab',['chrome://newtab/']);
 const target0=await w.waitFor(async()=>(await f.targets()).find(t=>t.type==='page'&&/newtab/.test(t.url)),Boolean,'the Start Page',10000);
 const cdp=await f.connectTarget(target0);page=cdp;
 await w.waitFor(()=>cdp.eval('!!window.bowserPages?.start?.panels'),Boolean,'the page bridge',8000);
 // With no extension panel yet, Customize says where they would appear.
 const hint=()=>cdp.eval(`(()=>{const h=document.getElementById('widgetPanelsHint');return {shown:!h.hidden&&h.getBoundingClientRect().height>0,text:h.textContent.trim(),tiles:document.querySelectorAll('[data-panel-pick]').length};})()`);
 await cdp.eval(`document.getElementById('customizePopover').showPopover(),1`);
 const before=await w.waitFor(hint,v=>v.shown,'the extension panels hint',5000).catch(()=>hint());
 result.hintBefore=before;
 assert.ok(before.shown&&before.tiles===0&&before.text==='Extensions with a side panel show up here too.',`the hint while no extension has a panel: ${JSON.stringify(before)}`);
 await shot('0-customize-hint');
 await cdp.eval(`document.getElementById('customizePopover').hidePopover(),1`);
 const id=await w.native('testLoadUnpacked',[path.join(here,'fixtures','side-panel-extension')]);
 assert.match(String(id),/^[a-p]{32}$/,'the sample extension loads');
 const list=await cdp.eval('window.bowserPages.start.panels()');
 result.id=id;result.list=list;assert.ok(list.some(p=>p.id===id&&p.name==='Blanc Test Notes'),'the panel is offered');
 await cdp.eval(`(async()=>{document.getElementById('customizePopover').showPopover();await new Promise(r=>setTimeout(r,500));return 1;})()`);
 await w.waitFor(()=>cdp.eval(`!!document.querySelector('[data-panel-pick="${id}"]')`),Boolean,'the tile',5000);
 result.tile=await cdp.eval(`document.querySelector('[data-panel-pick="${id}"]').textContent.trim()`);
 const after=await hint();result.hintAfter=after;
 assert.equal(after.shown,false,'the hint goes once an extension panel is offered');
 result.checks.push('with no extension panel Customize says where they appear, and the line goes once one is offered');
 await shot('1-customize');
 await cdp.eval(`document.querySelector('[data-panel-pick="${id}"]').click(),1`);
 await w.waitFor(()=>cdp.eval(`document.querySelector('[data-panel-pick="${id}"]').getAttribute('aria-checked')`),v=>v==='true','the tile on',5000);
 result.checks.push('Customize offers the extension panel as a tile and turns it on');
 await cdp.eval(`document.getElementById('customizePopover').hidePopover(),1`);
 await w.waitFor(()=>cdp.eval(`(()=>{const c=document.querySelector('.bb-widget[data-panel="${id}"]');return !!c&&!!c.closest('.bb-rail');})()`),Boolean,'the card in a column',5000);
 const target=await w.waitFor(async()=>(await f.targets()).find(t=>t.url.startsWith(`chrome-extension://${id}/panel.html`)),Boolean,'the extension panel page',10000);
 result.panelTarget=target.type;panelPage=await f.connectTarget(target);
 await w.waitFor(()=>cdp.eval(`document.querySelector('.bb-widget[data-panel="${id}"] .bb-panel-note').hidden`),Boolean,'the panel placed',5000);
 result.checks.push('the card shows the extension\'s own panel page, placed over its slot');
 await new Promise(r=>setTimeout(r,800));await shot('2-panel');
 // Off again: the card goes and the panel page closes.
 await cdp.eval(`document.getElementById('customizePopover').showPopover(),1`);
 await cdp.eval(`document.querySelector('[data-panel-pick="${id}"]').click(),1`);
 await w.waitFor(()=>cdp.eval(`!document.querySelector('.bb-widget[data-panel="${id}"]')`),Boolean,'the card removed',5000);
 result.checks.push('turning it off removes the card');
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,1));console.log(JSON.stringify(result));
}catch(e){result.error=String(e.stack||e);fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,1));console.log(JSON.stringify(result));process.exitCode=1;}
finally{await f.close();fs.rmSync(parent,{recursive:true,force:true});}
