// C2b / N1: Recently closed in the fork's command panel.
// Shipping pin 8a4e57e78: src/main/closed-tabs.js:33-46 (private closes
// refused), 86-98 (ordinary entry/title), 253-268 (renderer projection);
// src/renderer/overlay.js:1659-1669 (band), 1672-1718 (fold/Clear all),
// 1724-1765 (title, Forget and reopen). No cap or expiry assertion.
// Harness: native-recheck-f54.mjs; native-mouse-gestures.mjs (own server);
// native-closed-batches.mjs (close/model); fork-steps/island.mjs (overlay DOM).
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
const parent=fs.mkdtempSync(path.join(os.tmpdir(),'blanc-recheck-n1-'));
const visible=()=>assertRendering(e=>f.host.eval(e));
const entries=async()=>(await w.snapshot()).closed.map(e=>({id:String(e.id),title:e.title,tabCount:e.tabCount}));
const readBand=()=>w.frame('overlay').evaluate(()=>{
 const band=document.querySelector('#islandList .closed-band');
 if(!band)return {present:false,rows:[]};
 const shown=e=>{if(!e)return false;const css=getComputedStyle(e),r=e.getBoundingClientRect();
  return !e.hidden&&css.display!=='none'&&css.visibility==='visible'&&r.width>0&&r.height>0;};
 const clear=band.querySelector('.closed-clear');
 return {present:true,shown:shown(band),header:band.querySelector('.ghead-name')?.textContent??null,
  count:band.querySelector('.ghead-n')?.textContent??null,expanded:band.querySelector('.ghead-toggle')?.getAttribute('aria-expanded')??null,
  clear:!!clear&&!clear.disabled&&shown(clear),rows:[...band.querySelectorAll('.closed-row')].map(row=>{
   const forget=row.querySelector('.closed-forget');
   return {title:row.querySelector('.row-title')?.textContent??null,shown:shown(row),forget:!!forget&&!forget.disabled&&shown(forget)};})};
});
// Only production selectors from island/overlay.js:1669-1779. Open through
// the existing openPanel adapter, unfold through the band's own toggle.
const openBand=async titles=>{
 await w.call('closeOverlay');await w.call('openPanel');
 await w.waitFor(()=>w.call('overlayRendererMode'),m=>m==='panel','N1 expected the command panel rendered; found renderer mode',5000).catch(e=>assert.fail(e.message));
 await w.waitFor(readBand,b=>b.present&&b.shown&&b.count===String(titles.length),
  'N1 expected a visible Recently closed band with count '+titles.length+'; found band',5000).catch(e=>assert.fail(e.message));
 const control=await w.frame('overlay').evaluate(()=>{
  const toggle=document.querySelector('#islandList .closed-band .ghead-toggle');
  const expanded=toggle?.getAttribute('aria-expanded')??null;
  if(expanded==='false')toggle.click();
  return {present:!!toggle,expanded};
 });
 assert.ok(control.present&&['false','true'].includes(control.expanded),`N1 expected a Recently closed fold control with aria-expanded true or false; found ${JSON.stringify(control)}`);
 const expected=[...titles].sort();
 const band=await w.waitFor(readBand,b=>b.present&&b.shown&&b.expanded==='true'&&b.clear&&!!b.header&&
  b.count===String(titles.length)&&JSON.stringify(b.rows.map(r=>r.title).sort())===JSON.stringify(expected)&&b.rows.every(r=>r.shown&&r.forget),
  'N1 expected expanded Recently closed titles '+JSON.stringify(expected)+' with visible Forget and Clear all controls; found band',5000).catch(e=>assert.fail(e.message));
 assert.deepEqual(band.rows.map(r=>r.title).sort(),expected,`N1 expected Recently closed titles ${JSON.stringify(expected)}; found ${JSON.stringify(band)}`);
 return band;
};
const open=async(name,privateTab=false)=>{
 const url=f.base+'/'+name,id=await w.call('openTab',url,privateTab?{private:true}:{});
 const s=await w.waitFor(()=>w.snapshot(),s=>s.tabs.some(t=>String(t.id)===String(id)&&t.url===url&&t.title===name&&!t.isLoading),
  'N1 expected loaded fixture '+name+' at '+url+'; found tabs',5000).catch(e=>assert.fail(e.message));
 const tab=s.tabs.find(t=>String(t.id)===String(id));
 assert.equal(tab.private,privateTab,`N1 expected ${name} private=${privateTab}; found ${JSON.stringify(tab)}`);
 return id;
};
const close=async id=>{
 await w.call('closeTab',id);
 await w.waitFor(()=>w.snapshot(),s=>!s.tabs.some(t=>String(t.id)===String(id)),
  'N1 expected tab '+id+' closed; found tabs',5000).catch(e=>assert.fail(e.message));
};
try{
 await f.launch(config,path.join(parent,'fixture'),{testHooks:true,diskAssets:false});await installDriver(f.host);await visible();await w.reset();
 f.server.removeAllListeners('request');f.server.on('request',(q,r)=>{
  const title={'/n1-ordinary-a':'n1-ordinary-a','/n1-private':'n1-private','/n1-forget':'n1-forget','/n1-clear':'n1-clear','/n1-reopen':'n1-reopen'}[q.url]??'N1 fixture';
  r.writeHead(200,{'content-type':'text/html'});r.end(`<title>${title}</title><p>Recently closed fixture</p>`);
 });

 const a=await open('n1-ordinary-a');await close(a);
 const first=await w.waitFor(entries,rows=>rows.length===1&&rows[0].title==='n1-ordinary-a'&&rows[0].tabCount===1,
  'N1 expected exactly one ordinary closed entry titled n1-ordinary-a with tabCount 1; found entries',5000).catch(e=>assert.fail(e.message));
 await openBand(['n1-ordinary-a']);
 result.checks.push('closing an ordinary tab adds exactly one Recently closed entry displaying that tab\'s title');

 await w.call('closeOverlay');const privateId=await open('n1-private',true);await close(privateId);
 const afterPrivate=await entries();
 assert.deepEqual(afterPrivate,first,`N1 expected closing the private tab to leave only the unchanged ordinary entry ${JSON.stringify(first)}; found ${JSON.stringify(afterPrivate)}`);
 await openBand(['n1-ordinary-a']);
 result.checks.push('closing a private tab adds no entry to the model or the Recently closed band');

 await w.call('closeOverlay');const forgotten=await open('n1-forget');await close(forgotten);
 await w.waitFor(entries,rows=>rows.length===2&&rows.some(e=>e.title==='n1-forget')&&rows.some(e=>e.id===first[0].id),
  'N1 expected the original entry and a separate n1-forget entry; found entries',5000).catch(e=>assert.fail(e.message));
 await openBand(['n1-ordinary-a','n1-forget']);
 const tabsBeforeForget=(await w.snapshot()).tabs.map(t=>String(t.id));
 const forget=await w.frame('overlay').evaluate(()=>{
  const rows=[...document.querySelectorAll('#islandList .closed-band .closed-row')].filter(row=>row.querySelector('.row-title')?.textContent==='n1-forget');
  const button=rows.length===1?rows[0].querySelector('.closed-forget'):null;
  const enabled=!!button&&!button.disabled;if(enabled)button.click();return {matches:rows.length,enabled};
 });
 assert.deepEqual(forget,{matches:1,enabled:true},`N1 expected one enabled Forget control for n1-forget; found ${JSON.stringify(forget)}`);
 const afterForget=await w.waitFor(entries,rows=>JSON.stringify(rows)===JSON.stringify(first),
  'N1 expected Forget to remove only n1-forget and preserve '+JSON.stringify(first)+'; found entries',5000).catch(e=>assert.fail(e.message));
 assert.deepEqual(afterForget,first,`N1 expected only the original entry ${JSON.stringify(first)} after Forget; found ${JSON.stringify(afterForget)}`);
 const tabsAfterForget=(await w.snapshot()).tabs.map(t=>String(t.id));
 assert.deepEqual(tabsAfterForget,tabsBeforeForget,`N1 expected Forget to leave open tab IDs ${JSON.stringify(tabsBeforeForget)}; found ${JSON.stringify(tabsAfterForget)}`);
 await w.waitFor(readBand,b=>b.count==='1'&&b.rows.length===1&&b.rows[0].title==='n1-ordinary-a',
  'N1 expected only n1-ordinary-a in Recently closed after Forget; found band',5000).catch(e=>assert.fail(e.message));
 result.checks.push('Forget removes only the chosen entry, preserves the other entry and opens no tab');

 await w.call('closeOverlay');const cleared=await open('n1-clear');await close(cleared);
 await openBand(['n1-ordinary-a','n1-clear']);
 const clear=await w.frame('overlay').evaluate(()=>{
  const button=document.querySelector('#islandList .closed-band .closed-clear'),enabled=!!button&&!button.disabled;
  if(enabled)button.click();return {present:!!button,enabled};
 });
 assert.deepEqual(clear,{present:true,enabled:true},`N1 expected an enabled Clear all control; found ${JSON.stringify(clear)}`);
 await w.waitFor(entries,rows=>rows.length===0,'N1 expected Clear all to leave no closed entries; found entries',5000).catch(e=>assert.fail(e.message));
 await w.waitFor(readBand,b=>!b.present&&b.rows.length===0,'N1 expected no Recently closed band after Clear all; found band',5000).catch(e=>assert.fail(e.message));
 result.checks.push('Clear all removes both remaining entries and the empty Recently closed band');

 await w.call('closeOverlay');const original=await open('n1-reopen');await close(original);
 await openBand(['n1-reopen']);
 const reopen=await w.frame('overlay').evaluate(()=>{
  const rows=[...document.querySelectorAll('#islandList .closed-band .closed-row')].filter(row=>row.querySelector('.row-title')?.textContent==='n1-reopen');
  if(rows.length===1)rows[0].click();return {matches:rows.length};
 });
 assert.deepEqual(reopen,{matches:1},`N1 expected exactly one n1-reopen entry to reopen; found ${JSON.stringify(reopen)}`);
 const restored=await w.waitFor(()=>w.snapshot(),s=>s.closed.length===0&&s.tabs.filter(t=>t.url===f.base+'/n1-reopen'&&t.title==='n1-reopen'&&!t.private&&!t.isLoading).length===1,
  'N1 expected exactly one restored ordinary n1-reopen tab with its title and URL and no closed entry; found snapshot',5000).catch(e=>assert.fail(e.message));
 assert.equal(restored.tabs.filter(t=>t.url===f.base+'/n1-reopen').length,1,`N1 expected one restored n1-reopen tab; found ${JSON.stringify(restored.tabs)}`);
 await w.call('closeOverlay');await w.call('openPanel');
 await w.waitFor(()=>w.call('overlayRendererMode'),m=>m==='panel','N1 expected the command panel rendered after reopen; found renderer mode',5000).catch(e=>assert.fail(e.message));
 await w.waitFor(readBand,b=>!b.present&&b.rows.length===0,'N1 expected no Recently closed band after reopening its last entry; found band',5000).catch(e=>assert.fail(e.message));
 result.checks.push('reopening the chosen entry restores its ordinary tab and removes the entry');
 await visible();result.result='pass';
}catch(error){result.result=error.code==='BLANC_ENVIRONMENT_STOP'?'blocked-environment':'fail';result.error=String(error.stack);process.exitCode=1;}
finally{
 const exit=await f.close();if(exit?.code!==0){result.exit=exit;result.result='fail';process.exitCode=1;}
 if(f.directory&&fs.existsSync(path.join(f.directory,'browser.log')))fs.copyFileSync(path.join(f.directory,'browser.log'),path.join(out,'browser.log'));
 fs.rmSync(parent,{recursive:true,force:true});fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}
