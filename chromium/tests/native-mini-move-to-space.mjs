// Mini window: Move to Space (#1734, shipping F61-6 to F61-8, plan
// docs/superpowers/plans/2026-11-25-mini-window-move-to-space.md Part B).
// Runs each scenario's steps by the fork's means until the shipping runner's
// inventory moves past #1763: the mini window's Spaces button and the Spaces
// menu's move mode, clicked in that window's own Island documents. The
// Island files come from disk (config.assets), so a candidate built before
// this change runs them.
//   node chromium/tests/native-mini-move-to-space.mjs CONFIG OUT
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {NativeFixture} from './lib/fixture.mjs';
import {installDriver,nativeCall} from './lib/test-driver.mjs';
import {assertRendering,assertNodeRuntime} from './lib/render-guard.mjs';
import {createWorld} from './world.mjs';
import {runtimes} from './adapters/tabs.mjs';
import {jsLiteral} from './lib/js-literal.mjs';
import {checkLedger} from './lib/check-ledger.mjs';
const [configFile,out]=process.argv.slice(2),config=JSON.parse(fs.readFileSync(configFile));
assertNodeRuntime();assert.equal(fs.existsSync(out),false);fs.mkdirSync(out,{recursive:true});
const CHECKS=['F61-6','F61-7 refusal','F61-7 new Space','F61-8','switching by name stays refused'];
const f=new NativeFixture(),w=createWorld(f),result={candidate:config.candidate,checks:[]};
const passed=checkLedger(result,CHECKS);
const parent=fs.mkdtempSync(path.join(os.tmpdir(),'blanc-mini-move-'));
const visible=()=>assertRendering(e=>f.host.eval(e));
const runtimeOf=async id=>(await runtimes(w)).find(r=>r.id===id);
const snap=r=>nativeCall(r.cdp,'snapshot');
// A window's Island documents: the strip (the pill) and the overlay (menus).
const inFrame=(r,frame,source)=>r.cdp.eval(`(()=>{const doc=document.querySelector(${jsLiteral(frame)})?.contentDocument;if(!doc)return null;${source}})()`);
const spaceId=async name=>(await w.call('workspaceAction','list')).items.find(item=>item.name===name)?.id;
// Adapter ids ('window-2', ...) follow window order, so one can pass to
// another window when a window closes; native window ids never do.
const nativeWindow=async r=>(await snap(r)).nativeWindowId;
const byNativeWindow=async native=>{for(const r of await runtimes(w))if(await nativeWindow(r)===native)return r;return null;};
async function savedSpace(name,{keepOpen=false}={}){
 const other=await w.call('openNewWindow');
 await w.call('openTabInWindow',other,f.base+'/space-'+name.toLowerCase());
 assert.equal((await w.call('workspaceActionInWindow',other,'save',name)).ok,true,`${name} saved`);
 const native=await nativeWindow(await runtimeOf(other));
 if(!keepOpen)await w.call('closeWindowRuntime',other);
 return {native,id:await spaceId(name)};
}
async function miniWithPage(slug){
 const id=await w.call('openMiniWindow');
 const url=f.base+'/'+slug;
 const tabId=await w.call('openTabInWindow',id,url);
 const r=await runtimeOf(id);
 return {id,url,tabId,r,native:await nativeWindow(r)};
}
// The Island's Spaces button beside Open in Blanc, then the menu in move mode.
async function openMoveMenu(mini){
 await w.waitFor(()=>inFrame(mini.r,'#strip',`const b=doc.getElementById('pillMiniSpaces');return !!b&&!b.hidden&&!b.disabled&&b.getBoundingClientRect().width>0;`),Boolean,'the mini window\'s Spaces button');
 await inFrame(mini.r,'#strip',`doc.getElementById('pillMiniSpaces').click();return true;`);
 const heading=await w.waitFor(()=>inFrame(mini.r,'#overlay',`return doc.querySelector('#workspaceSwitcher')?.dataset.view==='list'&&doc.querySelector('.ws-profile-heading')?.textContent;`),
  text=>typeof text==='string'&&text.length>0,'the Spaces menu in move mode');
 assert.equal(heading,'Move this window to…');
}
const chooseRow=(mini,name)=>inFrame(mini.r,'#overlay',`const row=[...doc.querySelectorAll('.ws-row-main')].find(n=>n.querySelector('.ws-row-name')?.textContent===${jsLiteral(name)});if(row)row.click();return !!row;`);
const gone=mini=>w.waitFor(async()=>!(await byNativeWindow(mini.native)),Boolean,'the mini window to close');
// The live window showing a Space, with its snapshot.
async function shownWindow(space){
 return w.waitFor(async()=>{for(const r of await runtimes(w)){const s=await snap(r);if(s.spaceName===space)return {r,s};}return null;},Boolean,'a window showing the Space');
}
try{
 await f.launch(config,path.join(parent,'fixture'),{testHooks:true,diskAssets:config.diskAssets!==false});
 await installDriver(f.host);await visible();await w.reset();

 // F61-6: a saved Space open in no window; the page arrives in its group.
 const reading=await savedSpace('Reading');
 const six=await miniWithPage('mini-move-reading');
 await six.r.cdp.eval(`window.BlancPrototypeHost.api.groupTabByName(${jsLiteral(String(six.tabId))},'Research')`);
 await w.waitFor(async()=>(await snap(six.r)).groups?.some(g=>g.name==='Research'),Boolean,'the Research group in the mini window');
 // A start page in the group stays behind: it can't go into a Space here.
 const blankInGroup=await w.call('openTabInWindow',six.id,'chrome://newtab/');
 await six.r.cdp.eval(`window.BlancPrototypeHost.api.groupTabByName(${jsLiteral(String(blankInGroup))},'Research')`);
 await w.waitFor(async()=>(await snap(six.r)).tabs.filter(t=>t.groupId).length===2,Boolean,'both tabs in Research');
 await openMoveMenu(six);
 assert.equal(await chooseRow(six,'Reading'),true);
 await gone(six);
 {
  const {s}=await shownWindow(reading.id);
  const tab=s.tabs.find(t=>t.url===six.url);
  assert.ok(tab,'the page reached Reading');
  assert.equal(s.tabs.at(-1).url,six.url,'last');
  assert.equal(s.groups.find(g=>g.id===tab.groupId)?.name,'Research','still in its group');
  assert.ok(!s.tabs.some(t=>t.url==='blanc://newtab/'&&t.groupId===tab.groupId),'the start page stayed behind');
  // The Space opens at an ordinary window's size, not the mini window's.
  assert.ok(s.windowBounds.width>760,`a full-size window (${JSON.stringify(s.windowBounds)})`);
 }
 passed('F61-6: a mini window moved to a Space open nowhere closes, and its page arrives last, in its group');

 // F61-7: a private tab refuses with its reason; then New space… with the page.
 const elsewhere=await savedSpace('Elsewhere');
 const seven=await miniWithPage('mini-move-later');
 // A grouped start page beside the page: a refused move must leave it there.
 const sevenBlank=await w.call('openTabInWindow',seven.id,'chrome://newtab/');
 for(const id of [seven.tabId,sevenBlank])await seven.r.cdp.eval(`window.BlancPrototypeHost.api.groupTabByName(${jsLiteral(String(id))},'Notes')`);
 await w.waitFor(async()=>(await snap(seven.r)).tabs.filter(t=>t.groupId).length===2,Boolean,'both tabs in Notes');
 const privateId=await w.call('openTabInWindow',seven.id,'chrome://newtab/',{private:true});
 await openMoveMenu(seven);
 assert.equal(await chooseRow(seven,'Elsewhere'),true);
 const reason=await w.waitFor(()=>inFrame(seven.r,'#overlay',`return doc.querySelector('#workspaceSwitcher .ws-error')?.textContent??'';`),text=>/can't move to a space/.test(text||''),'the refusal\'s reason');
 assert.match(reason,/private tab/);
 assert.ok(await byNativeWindow(seven.native),'the mini window stays');
 assert.ok((await snap(seven.r)).tabs.some(t=>t.url===seven.url),'its page stays');
 {
  const s=await snap(seven.r),notes=s.groups.find(g=>g.name==='Notes');
  assert.ok(notes&&s.tabs.find(t=>String(t.id)===String(sevenBlank))?.groupId===notes.id,'the refused move left the start page in its group');
 }
 assert.ok(elsewhere.id,'Elsewhere was offered');
 passed('F61-7 refusal: a private tab stops the move with its reason; nothing moves and the window stays');
 assert.equal(await w.call('closeTabInWindow',seven.id,privateId),true);
 await openMoveMenu(seven);
 await inFrame(seven.r,'#overlay',`doc.querySelector('[data-focus-key="new"]').click();return true;`);
 const editor=await w.waitFor(()=>inFrame(seven.r,'#overlay',`const form=doc.getElementById('workspaceEditor');return form?{text:form.innerText,profile:!!doc.getElementById('workspaceProfile'),start:!!doc.querySelector('.ws-segmented')}:null;`),Boolean,'the New space editor');
 assert.match(editor.text,/With these tabs/);
 assert.match(editor.text,/\b1 tab\b/,'the editor counts the one page that moves');
 assert.equal(editor.profile,false);assert.equal(editor.start,false);
 await inFrame(seven.r,'#overlay',`const input=doc.getElementById('workspaceName');input.value='Later';input.dispatchEvent(new Event('input',{bubbles:true}));doc.getElementById('workspaceEditor').requestSubmit();return true;`);
 await gone(seven);
 {
  const id=await w.waitFor(()=>spaceId('Later'),Boolean,'Later listed');
  const {s}=await shownWindow(id);
  assert.equal(s.tabs.at(-1).url,seven.url);
  assert.ok(!s.tabs.some(t=>t.private),'no private page reached the Space');
 }
 passed('F61-7 new Space: New space… in move mode (no Profile or start choice) makes the Space with the page and closes the window');

 // F61-8: a Space already on screen comes forward; no window opens.
 const shown=await savedSpace('Shown',{keepOpen:true});
 const eight=await miniWithPage('mini-move-shown');
 const before=(await runtimes(w)).length;
 await openMoveMenu(eight);
 assert.equal(await chooseRow(eight,'Shown'),true);
 await gone(eight);
 const after=await w.waitFor(async()=>{const r=await byNativeWindow(shown.native);const s=r&&await snap(r);return s?.tabs.at(-1)?.url===eight.url?s:null;},Boolean,'Shown\'s window with the page');
 assert.equal(after.spaceName,shown.id);
 assert.equal((await runtimes(w)).length,before-1,'only the mini window went away');
 passed('F61-8: a Space already on screen gets the page in its own window; only the mini window goes');

 // Switching by name (the Quick Switcher, /space) never moves a mini window.
 const nine=await miniWithPage('mini-move-refused');
 const refused=await nine.r.cdp.eval(`window.BlancPrototypeHost.api.openWorkspace(${jsLiteral(reading.id)},{})`);
 assert.equal(refused?.ok,false);
 assert.ok((await snap(nine.r)).tabs.some(t=>t.url===nine.url),'the page stays');
 passed('switching by name stays refused: openWorkspace without move leaves the mini window as it is');
 await visible();result.result='pass';
}catch(error){result.result=error.code==='BLANC_ENVIRONMENT_STOP'?'blocked-environment':'fail';result.error=String(error.stack);process.exitCode=1;}
finally{
 const exit=await f.close();if(exit?.code!==0){result.exit=exit;result.result='fail';process.exitCode=1;}
 if(f.directory&&fs.existsSync(path.join(f.directory,'browser.log')))fs.copyFileSync(path.join(f.directory,'browser.log'),path.join(out,'browser.log'));
 fs.rmSync(parent,{recursive:true,force:true});fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}
