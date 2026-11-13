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
const NAMES=['favorites','devices','shortcuts'];
// Every Start Page document open now, connected directly.
const startPages=async()=>Promise.all((await f.targets()).filter(t=>t.type==='page'&&/newtab/.test(t.url)).map(t=>f.connectTarget(t)));
const read=cdp=>cdp.eval(`(()=>{const shown=e=>!!e&&getComputedStyle(e).display!=='none'&&e.getBoundingClientRect().height>0;
 return {ready:document.body.classList.contains('layout-ready'),root:document.body.dataset.layout,widgets:typeof state==='object'?state.widgets:null,
  switches:Object.fromEntries([...document.querySelectorAll('[data-widget-pick]')].map(b=>[b.dataset.widgetPick,b.getAttribute('aria-checked')])),
  roles:[...document.querySelectorAll('[data-widget-pick]')].map(b=>b.getAttribute('role')),
  names:[...document.querySelectorAll('[data-widget-pick]')].map(b=>b.textContent.trim()),
  favorites:shown(document.querySelector('#bbWidgets [data-widget=favorites]')),
  chart:!!document.querySelector('[data-card=chart],[data-widget-pick=chart]'),
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
 assert.deepEqual(d.roles,['switch','switch','switch']);
 assert.deepEqual(d.names,['Favorites','On your other devices','More shortcuts']);
 assert.equal(d.tileLimit,6);assert.equal(d.favorites,false);assert.equal(d.chart,false,'no Blocked this week widget (V26)');
 assert.equal(d.line,true,'Billboard\'s line says the week\'s count');
 result.checks.push('a new profile shows Billboard alone, with three widget switches in Customize and no Blocked this week widget');

 // Switch Favorites and More shortcuts on as a person would, from Customize.
 const b=await newStartPage();
 for(const name of ['favorites','shortcuts']){
  assert.equal(await b.eval(`(async()=>{const p=document.getElementById('customizePopover');if(!p.matches(':popover-open'))document.getElementById('customizeButton').click();
   const s=document.querySelector('[data-widget-pick=${name}]');s.click();for(let i=0;i<100&&s.getAttribute('aria-checked')!=='true';i++)await new Promise(r=>setTimeout(r,50));
   return s.getAttribute('aria-checked');})()`),'true',`${name} switched on`);
 }
 await b.eval(`document.getElementById('customizePopover').hidePopover(),1`);
 d=await w.waitFor(()=>read(b),x=>x?.widgets?.favorites&&x.widgets.shortcuts,'Favorites and More shortcuts on',8000);
 assert.equal(d.favorites,true,'the Favorites widget shows');assert.equal(d.line,true,'the week\'s line stays');assert.equal(d.tileLimit,12);
 result.checks.push('Favorites shows, the week\'s line stays, and More shortcuts gives Billboard twelve tiles');
 d=await w.waitFor(()=>read(a),x=>x?.widgets?.favorites&&x.widgets.shortcuts&&x.switches.favorites==='true','the other Start Page to follow',8000);
 assert.equal(d.favorites,true);
 result.checks.push('another open Start Page follows the change at once');

 // Placement: Favorites and other devices on the left, Sent on the right by
 // default; the grip's arrow keys and a real drag move a card, every open
 // Start Page follows, and the choice is kept.
 const where=(cdp,card)=>cdp.eval(`(()=>{const c=document.querySelector('[data-card=${card}]');return {side:c?.parentElement?.dataset.side??null,place:state.widgets.place};})()`);
 let p=await where(b,'favorites');
 assert.deepEqual(p.place,{left:['favorites','devices'],right:['sent']},'the default placement');
 assert.equal(p.side,'left');
 await b.eval(`(()=>{const g=document.querySelector('[data-card=favorites] .bb-widget-grip');g.focus();g.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));return 1;})()`);
 p=await w.waitFor(()=>where(b,'favorites'),x=>x.side==='right'&&x.place.right.includes('favorites'),'Favorites moved right by keyboard',8000);
 assert.match(await b.eval(`document.getElementById('widgetMoveStatus').textContent`),/right/i,'the move is announced');
 await w.waitFor(()=>where(a,'favorites'),x=>x.side==='right','the other Start Page follows the move',8000);
 result.checks.push('the grip\'s arrow keys move a card to the other side, announced, and every open Start Page follows');
 // A real drag of the Favorites grip back to the left-hand column.
 const box=await b.eval(`(()=>{const g=document.querySelector('[data-card=favorites] .bb-widget-grip').getBoundingClientRect();const r=document.getElementById('bbRailLeft').getBoundingClientRect();
  return {x:g.left+g.width/2,y:g.top+g.height/2,tx:r.left+r.width/2,ty:r.top+40,wide:innerWidth>=1200};})()`);
 const mouse=(type,x,y,buttons)=>b.send('Input.dispatchMouseEvent',{type,x,y,button:'left',buttons,clickCount:type==='mouseMoved'?0:1});
 await mouse('mouseMoved',box.x,box.y,0);await mouse('mousePressed',box.x,box.y,1);
 for(let i=1;i<=8;i++)await mouse('mouseMoved',box.x+(box.tx-box.x)*i/8,box.y+(box.ty-box.y)*i/8,1);
 await mouse('mouseReleased',box.tx,box.ty,0);
 p=await w.waitFor(()=>where(b,'favorites'),x=>x.side==='left'&&x.place.left.includes('favorites'),'Favorites dragged back to the left',8000);
 result.checks.push(`dragging a card's grip moves it between the columns (${box.wide?'one each side of the page':'under the clock'})`);
 await b.eval(`(()=>{const g=document.querySelector('[data-card=favorites] .bb-widget-grip');g.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));return 1;})()`);
 await w.waitFor(()=>where(b,'favorites'),x=>x.side==='right','Favorites moved right again',8000);

 // Relaunch, with the chart a build before V26 may have saved on and placed:
 // it is ignored and its place dropped.
 await w.relaunch({afterStop:()=>{
  const local=path.join(f.profile,'Local State');const state=JSON.parse(fs.readFileSync(local,'utf8'));
  const widgets=state.blanc.start.widgets;widgets.chart=true;widgets.place.right.push('chart');fs.writeFileSync(local,JSON.stringify(state));
 }});
 await visible();
 const c=await newStartPage();d=await read(c);
 assert.ok(same(d.widgets,{favorites:true,devices:false,shortcuts:true}),`kept after a relaunch: ${JSON.stringify(d.widgets)}`);
 assert.equal(d.widgets.chart,undefined,'a saved chart is ignored');assert.equal(d.chart,false);
 p=await where(c,'favorites');
 assert.equal(p.side,'right','Favorites keeps its place after a relaunch');
 assert.ok(!p.place.left.includes('chart')&&!p.place.right.includes('chart'),`the chart's place is dropped: ${JSON.stringify(p.place)}`);
 result.checks.push('the widgets are kept across a relaunch, and a chart saved before V26 is ignored');

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
 assert.equal(d.root,'billboard');assert.equal(d.favorites,true);assert.equal(d.line,true,'Tally\'s week shows as Billboard\'s line');
 result.checks.push('a profile that chose Tally gets its Favorites once, on Billboard, with the week\'s line');

 // Over an image: the image stays untouched. The widgets sit on one glass
 // tray, small text takes the ink that stands out against the image behind
 // it (no backing, no wash), the footer sits in a
 // fade, and the clock is as it always was (its own shadow, no halo).
 const look=await e.eval(`(async()=>{document.body.dataset.wallpaperStyle='spotlight';
  const src=new URL('start-page-night.png',location.href).href;
  for(const l of document.querySelectorAll('.start-wallpaper-layer')){l.dataset.wallpaperPhase='custom';l.dataset.wallpaperImage=src;l.style.setProperty('--wallpaper-image','url('+JSON.stringify(src)+')');l.classList.add('is-visible');}await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));await window.blancStartInk.update();
  const cs=s=>{const el=document.querySelector(s);return el&&getComputedStyle(el).display!=='none'?getComputedStyle(el):null;};
  const clear=c=>c.backgroundColor==='rgba(0, 0, 0, 0)';
  const fade=getComputedStyle(document.getElementById('layoutFooter'),'::after'),clock=getComputedStyle(document.querySelector('.bb-clock-row'),'::before');
  return {cards:[...document.querySelectorAll('#bbWidgets .bb-rail > .bb-widget')].filter(e=>getComputedStyle(e).display!=='none').map(e=>{const c=getComputedStyle(e);return !clear(c)&&c.backdropFilter.includes('blur');}),
   text:Object.fromEntries(['.start-brand-date','.bb-fav .label'].map(s=>{const c=cs(s);return [s,c?{clear:clear(c),ink:document.querySelector(s).dataset.ink??null}:null];})),
   footerItems:['.start-customize','.footer-right','#footerLeft'].map(s=>{const c=cs(s);return c?clear(c):true;}),
   fade:fade.content!=='none'&&fade.backgroundImage.includes('gradient'),
   markFilter:getComputedStyle(document.querySelector('.start-brand-mark')).filter,
   lineWash:(await window.blancStartInk.explain(document.querySelector('.start-brand-date')))?.wash.alpha??null,
   brandOval:(h=>h.content!=='none'&&h.content!=='normal')(getComputedStyle(document.querySelector('.start-brand'),'::after')),
   dateClear:clear(cs('.start-brand-date')),
   clockHalo:clock.content!=='none'&&clock.content!=='normal',haloAttr:document.querySelector('.bb-clock-row').hasAttribute('data-halo')};})()`);
 result.look=look;
 assert.ok(look.cards.length>0&&look.cards.every(Boolean),'each widget card is glass');
 for(const [sel,t] of Object.entries(look.text))if(t){assert.equal(t.clear,true,`${sel} has no backing`);assert.ok(['light','dark'].includes(t.ink),`${sel} takes the ink that stands out against the image behind it`);}
 assert.ok(look.footerItems.every(Boolean),'the footer\'s items have no backing');
 assert.equal(look.fade,true,'the footer sits in a fade');
 assert.equal(look.brandOval,false,'no wash behind the date');
 assert.ok(look.lineWash>0,`the ink chooser counts the page's wash (${look.lineWash})`);
 if(look.text['.start-brand-date']?.ink==='light')assert.match(look.markFilter,/invert/,'over a dark image the Sunrise mark turns cream with the date');assert.equal(look.dateClear,true,'the date has no backing');
 assert.equal(look.clockHalo,false,'no halo behind the clock');assert.equal(look.haloAttr,false);
 result.checks.push('over an image each widget card is glass, small text takes the ink its image calls for, the footer a fade, and the clock is as before');
 await visible();result.result='pass';
}catch(error){result.result=error.code==='BLANC_ENVIRONMENT_STOP'?'blocked-environment':'fail';result.error=String(error.stack);process.exitCode=1;}
finally{
 const exit=await f.close();if(exit?.code!==0){result.exit=exit;result.result='fail';process.exitCode=1;}
 if(f.directory&&fs.existsSync(path.join(f.directory,'browser.log')))fs.copyFileSync(path.join(f.directory,'browser.log'),path.join(out,'browser.log'));
 fs.rmSync(parent,{recursive:true,force:true});fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}
