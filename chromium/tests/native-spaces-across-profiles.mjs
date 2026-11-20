// Spaces across profiles (F41-83 to F41-92, plan
// docs/superpowers/plans/2026-11-19-fork-spaces-across-profiles.md): each
// profile mirrors its Space list into Local State (blanc.spaces.profiles), so
// another profile's window lists it without loading it, and opens or creates
// a Space in it through Chromium's profile loading. Runs each scenario's steps
// by the fork's means until the shipping runner's inventory moves past #1642.
// The F41-83 to F41-92 checks drive the Spaces menu and Quick Switcher in
// the Island documents of Personal's (and, for F41-92, Work's) window.
//   node chromium/tests/native-spaces-across-profiles.mjs CONFIG OUT
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {NativeFixture} from './lib/fixture.mjs';
import {installDriver,nativeCall} from './lib/test-driver.mjs';
import {assertRendering,assertNodeRuntime} from './lib/render-guard.mjs';
import {createWorld} from './world.mjs';
import {createProfile,picker,profileHosts} from './fork-steps/profiles.mjs';
import {jsLiteral} from './lib/js-literal.mjs';
import {Page} from './lib/page-shim.mjs';
import {pause} from './lib/cdp.mjs';
import {checkLedger} from './lib/check-ledger.mjs';
import {createRequire} from 'node:module';
import {freeRequestRoom} from './lib/sync-fixture.mjs';
const require=createRequire(import.meta.url);
const {createSyncFixture}=require('../../test/desktop/support/sync-fixture.js');
const [configFile,out]=process.argv.slice(2),config=JSON.parse(fs.readFileSync(configFile));
assertNodeRuntime();assert.equal(fs.existsSync(out),false);fs.mkdirSync(out,{recursive:true});
// The checks build on each other; pending lists those not yet passed, so a
// failure part way shows what never ran.
const CHECKS=['F41-83','mirror written','mirror follows edits','listing does not load','rename reaches the heading',
 'open from a closed profile','double open','deleted meanwhile','marked for deletion','create',
 'F41-88','F41-84','F41-91','F41-85','Review Focus 4','F41-90','F41-86','F41-89','F41-87','F41-92'];
const f=new NativeFixture(),w=createWorld(f),result={candidate:config.candidate,checks:[]};
const passed=checkLedger(result,CHECKS);
let worker;
const parent=fs.mkdtempSync(path.join(os.tmpdir(),'blanc-spaces-across-profiles-'));
const visible=()=>assertRendering(e=>f.host.eval(e));
const deep=`const find=(selector,root=document)=>{const own=root.querySelector(selector);if(own)return own;for(const el of root.querySelectorAll('*'))if(el.shadowRoot){const found=find(selector,el.shadowRoot);if(found)return found;}return null;};`;
const evaluate=(page,source)=>page.eval(`(()=>{${deep}${source}})()`);
const probe=()=>w.native('spacesMirrorProbe');
const hostApi=(host,call)=>host.cdp.eval(`window.BlancPrototypeHost.api.${call}`);
// A profile's mirrored rows, in order: [{id, name, color, symbol, tabCount}].
const rows=entry=>(entry?.order??[]).map(id=>({id,...entry.items[id]}));
const personalApi=call=>f.host.eval(`window.BlancPrototypeHost.api.${call}`);
const runtimesOf=async dir=>(await w.call('windowRuntimes')).filter(r=>r.profileId===dir);
// spaceOtherProfiles is the Island host's own request, not a test operation,
// so read it as the menu does: through Personal's listWorkspaces().
const others=async()=>{const p=await personalApi('listWorkspaces()');return {profileName:p.profileName,others:p.otherProfiles??[]};};
async function personalState(){const s=await nativeCall(f.host,'snapshot');return {tabs:s.tabs.map(t=>[String(t.id),t.url]),space:s.spaceName||null};}
// ---- The Spaces menu as a person reaches it (F41-83 to F41-92) ----
// Any window's Island documents, by its host connection: the strip holds the
// side list's space mark, the overlay the Spaces menu and the Quick Switcher.
const islandFrame=(cdp,frame)=>new Page({cdp,url:frame==='overlay'?'blanc-chrome://overlay/':'blanc-chrome://index/',frame,host:cdp});
const drawnMode=cdp=>cdp.eval(`(()=>{const f=document.querySelector('#overlay');return !f||f.hidden?null:f.contentDocument?.body?.dataset.mode||null})()`);
const active=async cdp=>(await nativeCall(cdp,'snapshot')).windowActive===true;
// Chromium's own bring-to-front for the window's active tab (as the
// focusWindowRuntime adapter does): an open Island closes in a window that
// isn't in front, as shipping's overlay blur does.
async function bringForward(cdp){
 const s=await nativeCall(cdp,'snapshot'),targetId=(await nativeCall(cdp,'tabTargets'))[String(s.activeTabId)];
 const page=await f.connectTarget((await f.targets()).find(t=>t.id===targetId));
 try{await page.send('Page.bringToFront');}finally{page.close();}
 await w.waitFor(()=>active(cdp),Boolean,'window in front');
}
async function closeIsland(cdp){
 if(!await drawnMode(cdp))return;
 await cdp.eval('window.BlancPrototypeHost.api.closeOverlay()');
 await w.waitFor(()=>drawnMode(cdp),m=>m==null,'the Island closed');
}
// The tabs in the side list, where the space mark is (the Island shows none).
async function sideList(cdp){
 if((await nativeCall(cdp,'snapshot')).tabLayout!=='vertical')await cdp.eval("window.BlancPrototypeHost.api.setTabLayout('vertical')");
 await w.waitFor(()=>islandFrame(cdp,'strip').evaluate(()=>document.documentElement.dataset.tabLayout),v=>v==='vertical','tabs in the side list');
}
async function openSpacesMenu(cdp){
 await sideList(cdp);await bringForward(cdp);await closeIsland(cdp);
 await islandFrame(cdp,'strip').locator('#pillSpace').click();
 await w.waitFor(()=>drawnMode(cdp),m=>m==='spaces','Spaces menu drawn');
 const menu=islandFrame(cdp,'overlay');await menu.locator('#workspaceSwitcher').waitFor({state:'visible'});
 return menu;
}
// The menu's list in order: its headings, and each row with the heading above it.
async function menuList(menu){
 const items=await menu.locator('#workspaceSwitcher .ws-profile-heading, #workspaceSwitcher .ws-row').evaluateAll(els=>els.map(e=>e.matches('.ws-profile-heading')
  ?{heading:e.textContent}:{name:e.querySelector('.ws-row-name')?.textContent??'',profileId:e.dataset.profileId??null,id:e.dataset.workspaceId,
   count:e.querySelector('.ws-row-count')?.textContent??'',buttons:e.querySelectorAll('button').length,more:!!e.querySelector('.ws-row-more')}));
 let heading=null;const rows=[],headings=[];
 for(const item of items)if('heading' in item){heading=item.heading;headings.push(heading);}else rows.push({...item,under:heading});
 return {headings,rows};
}
function rowUnder(list,name,profile){
 const found=list.rows.filter(r=>r.name===name&&r.under===profile);
 assert.equal(found.length,1,`${name} under ${profile}: ${JSON.stringify(list)}`);return found[0];
}
const rowButton=(menu,row)=>menu.locator(`#workspaceSwitcher .ws-row[data-workspace-id=${JSON.stringify(row.id)}]${row.profileId?`[data-profile-id=${JSON.stringify(row.profileId)}]`:':not([data-profile-id])'} .ws-row-main`);
// A page in a window of any profile, by that window's host.
async function openPage(cdp,url,{privateTab=false}={}){
 const before=new Set((await nativeCall(cdp,'snapshot')).tabs.map(t=>String(t.id)));
 await cdp.eval(`window.BlancPrototypeHost.api.createTab(${jsLiteral(url)},{private:${privateTab}})`);
 const s=await w.waitFor(()=>nativeCall(cdp,'snapshot'),s=>s.tabs.some(t=>!before.has(String(t.id))&&t.url===url&&!t.isLoading),'page loaded');
 return String(s.tabs.find(t=>!before.has(String(t.id))&&t.url===url).id);
}
async function pageEval(cdp,tabId,source){
 const targetId=(await nativeCall(cdp,'tabTargets'))[String(tabId)];
 const page=await f.connectTarget((await f.targets()).find(t=>t.id===targetId));
 try{return await page.eval(source);}finally{page.close();}
}
// Chromium's Close Window, run by that window's Island; its reply can be lost
// as the window goes, so the window leaving is the result.
async function closeWindow(h){
 const reply=await nativeCall(h.cdp,'previewPageCommand',['closeWindow'],null,5000).catch(e=>/closed|timed out/i.test(e.message)?'gone':Promise.reject(e));
 assert.notEqual(reply,false,'the window agreed to close');
 await w.waitFor(async()=>!(await f.targets()).some(t=>t.id===h.targetId),Boolean,'window closed');
}
// A profile's windows, by host: {directory, name, cdp, targetId, snap}.
async function windowsOf(directory){
 const out=[];for(const h of await profileHosts(w))if(h.directory===directory)out.push({...h,snap:await nativeCall(h.cdp,'snapshot')});
 return out;
}
try{
 // F41-92 shares a Personal Space through the local Worker; no production endpoint.
 worker=await createSyncFixture();assert.equal(new URL(worker.url).hostname,'127.0.0.1');
 w.syncServer=worker;f.extraArgs=[`--blanc-sync-endpoint=${worker.url}`];
 await f.launch(config,path.join(parent,'fixture'),{testHooks:true,diskAssets:false});
 await installDriver(f.host);await visible();await w.reset();

 // F41-83: One profile needs no profile headings or choice.
 assert.deepEqual((await profileHosts(w)).map(h=>h.directory),['Default'],'Personal is the only profile');
 const home=await personalApi("saveWorkspaceAs('Home')");assert.equal(home.ok,true,JSON.stringify(home));
 {
  const menu=await openSpacesMenu(f.host),list=await menuList(menu);
  assert.deepEqual(list.headings,[],'no profile heading');
  assert.deepEqual(list.rows.map(r=>r.name),['Home']);
  await menu.locator('[data-focus-key="new"]').click();
  await menu.locator('.ws-editor').waitFor({state:'visible'});
  assert.equal(await menu.locator('.ws-editor #workspaceProfile').count(),0,'the New Space editor has no Profile choice');
  await menu.locator('.ws-editor [data-focus-key="cancel"]').click();
  await menu.locator('.ws-editor').waitFor({state:'detached'});
  await closeIsland(f.host);
 }
 passed('F41-83: one profile: no profile heading, and New Space has no Profile choice');

 // mirror written: a Space saved in Work appears under Work's directory alone.
 const work=await createProfile(w,'Work'),workDir=work.directory;
 assert.notEqual(workDir,'Default');
 const saved=await hostApi(work,"saveWorkspaceAs('Sprint')");assert.equal(saved.ok,true,JSON.stringify(saved));
 const sprintId=saved.workspaceId;
 let mirror=(await w.waitFor(probe,p=>rows(p.mirror[workDir]).some(r=>r.name==='Sprint'),'Work mirror written')).mirror;
 assert.deepEqual(rows(mirror[workDir]).map(r=>r.id),[sprintId]);
 assert.deepEqual(Object.keys(mirror[workDir].items[sprintId]).sort(),['color','name','symbol','tabCount']);
 assert.deepEqual(Object.keys(mirror[workDir]).sort(),['items','order']);
 assert.equal(rows(mirror.Default).some(r=>r.id===sprintId),false,'Work\'s Space is not in Personal\'s mirror');
 for(const [directory,entry] of Object.entries(mirror))
  if(directory!==workDir)assert.equal(JSON.stringify(entry).includes('Sprint'),false,`no Work data under ${directory}`);
 passed('mirror written: one Sprint row under Work, with exactly name, color, symbol and tabCount');

 // mirror follows edits: a rename updates the row, a delete takes it out of order.
 assert.equal((await hostApi(work,`updateWorkspace(${jsLiteral(sprintId)},{name:'Sprint 2'})`)).ok,true);
 await w.waitFor(probe,p=>rows(p.mirror[workDir]).some(r=>r.id===sprintId&&r.name==='Sprint 2'),'renamed row mirrored');
 assert.equal((await hostApi(work,`removeWorkspace(${jsLiteral(sprintId)})`)).ok,true);
 await w.waitFor(probe,p=>!p.mirror[workDir]?.order?.includes(sprintId),'deleted row leaves the mirror');
 passed('mirror follows edits: rename updates the row, delete removes it from order');

 // listing does not load: Work's Space stays listed after a relaunch that
 // opens only Personal's window.
 const kept=await hostApi(work,"saveWorkspaceAs('Listed')");assert.equal(kept.ok,true,JSON.stringify(kept));
 await w.waitFor(probe,p=>rows(p.mirror[workDir]).some(r=>r.id===kept.workspaceId),'Listed mirrored');
 const workWindow=(await w.call('windowRuntimes')).find(r=>r.profileId===workDir);
 await w.call('closeWindowRuntime',workWindow.id);
 // V18: with two profiles the picker asks at startup; open Personal directly.
 const pick=await picker(w);
 await evaluate(pick,`const ask=find('#askOnStartup');if(ask.checked)ask.click();return true;`);
 await w.waitFor(()=>evaluate(pick,`return find('#askOnStartup').checked;`),v=>v===false,'profile picker off at startup');
 w.profileHosts=new Map();await w.relaunch();
 assert.equal((await nativeCall(f.host,'profileInfo')).directory,'Default');
 const after=await probe();
 assert.equal(after.loaded.includes(workDir),false,`Work not loaded: ${JSON.stringify(after.loaded)}`);
 assert.deepEqual(rows(after.mirror[workDir]).map(r=>r.name),['Listed']);
 passed('listing does not load: Work stays unloaded and its mirror still lists its Space');

 // rename reaches the heading: renaming Work in the picker renames its group
 // in Personal's Spaces menu (spaceOtherProfiles), while the mirror, keyed
 // by directory, is unchanged.
 const renamePick=await picker(w);
 const card=`const cards=[...find('profile-picker-main-view').shadowRoot.querySelectorAll('profile-card')];const card=cards.find(c=>c.profileState.localProfileName==='Work');if(!card)throw Error('Work card missing');`;
 await evaluate(renamePick,card+`const input=find('#nameInput',card.shadowRoot);input.value='Studio';input.dispatchEvent(new Event('change',{bubbles:true}));return true;`);
 assert.deepEqual(rows((await probe()).mirror[workDir]).map(r=>r.name),['Listed'],'the mirror is keyed by directory, not name');
 const heading=await w.waitFor(others,p=>p.others?.some(o=>o.id===workDir&&o.name==='Studio'),'renamed heading (native)');
 assert.equal(heading.profileName,'Personal');
 assert.deepEqual(heading.others.find(o=>o.id===workDir).items.map(i=>i.name),['Listed']);
 await w.waitFor(()=>personalApi('listWorkspaces()'),p=>p.otherProfiles?.some(o=>o.id===workDir&&o.name==='Studio'),'renamed heading');
 passed('rename reaches the heading: Personal\'s Spaces menu heads Work\'s Spaces as Studio');
 // Back to Work for the scenarios below.
 await evaluate(renamePick,`const cards=[...find('profile-picker-main-view').shadowRoot.querySelectorAll('profile-card')];const card=cards.find(c=>c.profileState.localProfileName==='Studio');if(!card)throw Error('Studio card missing');const input=find('#nameInput',card.shadowRoot);input.value='Work';input.dispatchEvent(new Event('change',{bubbles:true}));return true;`);
 await w.waitFor(others,p=>p.others?.some(o=>o.id===workDir&&o.name==='Work'),'Work named Work again');

 // open from a closed profile: Work has Listed and no window; opening it from
 // Personal loads Work and opens one Work window on Listed. Personal is untouched.
 const listedId=kept.workspaceId,before=await personalState();
 assert.deepEqual(await runtimesOf(workDir),[],'Work has no window');
 const opened=await personalApi(`openWorkspace(${jsLiteral(listedId)},{profileId:${jsLiteral(workDir)}})`);
 assert.equal(opened.ok,true,JSON.stringify(opened));
 let workWindows=await w.waitFor(()=>runtimesOf(workDir),rs=>rs.length===1&&rs[0].workspaceId===listedId,'Work window on Listed');
 assert.deepEqual(await personalState(),before,'Personal\'s tabs and Space unchanged');
 passed('open from a closed profile: one Work window shows Listed; Personal unchanged');

 // double open: two requests while Work has no window and isn't loaded join
 // one load (SpacesElsewhere in spaces_across_profiles.inc), open one window,
 // and both answer ok. A relaunch with only Personal's window unloads Work.
 await w.call('closeWindowRuntime',workWindows[0].id);
 await w.waitFor(()=>runtimesOf(workDir),rs=>rs.length===0,'Work window closed');
 // Chromium records the profiles still loaded at quit as last active and
 // loads them at the next launch, so let Work unload first (it does once its
 // last window has closed).
 await w.waitFor(probe,p=>!p.loaded.includes(workDir),'Work unloaded after its last window closed',20000);
 // Chromium also loads its last-used profile at launch, and Work's window was
 // the last one active: bring Personal's forward so Personal is last used.
 await bringForward(f.host);
 await w.waitFor(()=>active(f.host),Boolean,'Personal in front before the relaunch');
 w.profileHosts=new Map();await w.relaunch();
 assert.equal((await nativeCall(f.host,'profileInfo')).directory,'Default');
 const unloaded=await probe();
 assert.equal(unloaded.loaded.includes(workDir),false,`Work not loaded before the double open: ${JSON.stringify(unloaded.loaded)}`);
 assert.deepEqual(await runtimesOf(workDir),[],'Work has no window before the double open');
 const pair=await personalApi(`(o=>Promise.all([0,1].map(()=>window.BlancPrototypeHost.api.openWorkspace(${jsLiteral(listedId)},o))))({profileId:${jsLiteral(workDir)}})`);
 assert.deepEqual(pair.map(r=>r.ok),[true,true],JSON.stringify(pair));
 workWindows=await w.waitFor(()=>runtimesOf(workDir),rs=>rs.length>=1&&rs.every(r=>r.workspaceId===listedId),'Work window on Listed again');
 await new Promise(done=>setTimeout(done,1000));
 assert.equal((await runtimesOf(workDir)).length,1,'exactly one new Work window');
 passed('double open: with Work unloaded, both requests answer ok and one Work window opens');

 // deleted meanwhile: Listed deleted in Work, then the open answers not-found
 // and adds no Work window.
 const workHost=async()=>(await w.waitFor(()=>profileHosts(w),hs=>hs.some(h=>h.directory===workDir),'Work host')).find(h=>h.directory===workDir);
 assert.equal((await hostApi(await workHost(),`removeWorkspace(${jsLiteral(listedId)})`)).ok,true);
 const gone=await personalApi(`openWorkspace(${jsLiteral(listedId)},{profileId:${jsLiteral(workDir)}})`);
 assert.equal(gone.ok,false);assert.equal(gone.error,'not-found',JSON.stringify(gone));
 assert.equal((await runtimesOf(workDir)).length,1,'no Work window added');
 passed('deleted meanwhile: not-found, and no Work window added');

 // marked for deletion: Work leaves the list and can't be opened; the mark is
 // cancelled afterwards.
 const kept2=await hostApi(await workHost(),"saveWorkspaceAs('Kept')");assert.equal(kept2.ok,true,JSON.stringify(kept2));
 assert.equal(await nativeCall(f.host,'profileDeletionMarkTest',[workDir,true]),true);
 try{
  const refused=await personalApi(`openWorkspace(${jsLiteral(kept2.workspaceId)},{profileId:${jsLiteral(workDir)}})`);
  assert.equal(refused.ok,false);assert.equal(refused.error,'profile-unavailable',JSON.stringify(refused));
  assert.equal(((await others()).others??[]).some(o=>o.id===workDir),false,'Work not listed while marked');
 }finally{assert.equal(await nativeCall(f.host,'profileDeletionMarkTest',[workDir,false]),true);}
 await w.waitFor(others,p=>p.others?.some(o=>o.id===workDir),'Work listed again');
 passed('marked for deletion: profile-unavailable and Work unlisted until the mark is cancelled');

 // create: Planning made in Work from Personal, in a new Work window with one
 // new tab, and mirrored; a second create of "planning" is a duplicate.
 const windowsBefore=(await runtimesOf(workDir)).length;
 const identity=`{profileId:${jsLiteral(workDir)},color:'#2f6fed',symbol:window.SpaceIdentity.SYMBOL_IDS[1]}`;
 const made=await personalApi(`createBlankWorkspace('Planning',${identity})`);
 assert.equal(made.ok,true,JSON.stringify(made));assert.match(made.workspaceId,/^[0-9a-f-]{36}$/);
 const planning=await w.waitFor(()=>runtimesOf(workDir),rs=>rs.some(r=>r.workspaceId===made.workspaceId),'Work window on Planning');
 assert.equal(planning.length,windowsBefore+1,'one new Work window');
 assert.equal(planning.find(r=>r.workspaceId===made.workspaceId).tabs.length,1,'Planning starts with one new tab');
 await w.waitFor(probe,p=>rows(p.mirror[workDir]).some(r=>r.id===made.workspaceId&&r.name==='Planning'),'Planning mirrored');
 const twice=await personalApi(`createBlankWorkspace('planning',${identity})`);
 assert.equal(twice.ok,false);assert.equal(twice.error,'duplicate-name',JSON.stringify(twice));
 assert.equal((await runtimesOf(workDir)).length,windowsBefore+1,'no window for the duplicate');
 passed('create: Planning opens in a new Work window with one tab and is mirrored; "planning" again is duplicate-name');

 // ---- F41-84 to F41-92 through the menu itself ----
 // Work starts over with one window and no Spaces; Personal keeps Home.
 const page=name=>w.fixtureUrl('spaces-across-'+name);
 const newWindows=(before,now)=>now.filter(x=>!before.some(b=>b.targetId===x.targetId));
 const showing=async id=>(await windowsOf(workDir)).find(x=>x.snap.spaceName===id);
 {
  const wins=await windowsOf(workDir);assert.ok(wins.length>=1,'Work has a window');
  for(const item of (await hostApi(wins[0],'listWorkspaces()')).items)
   assert.equal((await hostApi(wins[0],`removeWorkspace(${jsLiteral(item.id)})`)).ok,true);
  for(const extra of wins.slice(1))await closeWindow(extra);
  assert.deepEqual((await hostApi(wins[0],'listWorkspaces()')).items,[]);
 }

 // F41-88: A Space created in another profile starts empty.
 const personalTab=await openPage(f.host,page('personal'));
 let sprintSpace;
 {
  const menu=await openSpacesMenu(f.host);
  await menu.locator('[data-focus-key="new"]').click();
  await menu.locator('.ws-editor').waitFor({state:'visible'});
  const picker=menu.locator('.ws-editor #workspaceProfile');
  assert.equal(await picker.evaluate(e=>e.selectedOptions[0]?.textContent),'Personal');
  // This window first, so choosing Work has something to change.
  const thisWindow=menu.locator('.ws-editor [data-focus-key="start:window"]');
  await thisWindow.click();
  assert.equal(await thisWindow.getAttribute('aria-checked'),'true','This window chosen');
  assert.equal(await thisWindow.evaluate(e=>e.disabled),false,'This window is enabled for Personal');
  assert.equal(await menu.locator('.ws-editor [data-focus-key="start:empty"]').getAttribute('aria-checked'),'false');
  await picker.selectOption(workDir);
  await w.waitFor(()=>menu.locator('.ws-editor [data-focus-key="start:empty"]').getAttribute('aria-checked'),v=>v==='true','Empty chosen');
  assert.equal(await thisWindow.evaluate(e=>e.disabled),true,'This window is disabled');
  assert.equal(await thisWindow.getAttribute('aria-checked'),'false','This window no longer chosen');
  const before=await windowsOf(workDir),personalBefore=await personalState();
  await menu.locator('#workspaceName').fill('Sprint');
  await w.waitFor(()=>menu.locator('.ws-editor [data-focus-key="create"]').evaluate(e=>!e.disabled),Boolean,'Create enabled');
  await menu.locator('.ws-editor [data-focus-key="create"]').click();
  const now=await w.waitFor(()=>windowsOf(workDir),ws=>newWindows(before,ws).some(x=>x.snap.spaceName),'a new Work window on Sprint');
  const fresh=newWindows(before,now);assert.equal(fresh.length,1,'one new Work window');
  const listed=await hostApi(fresh[0],'listWorkspaces()'),sprint=listed.items.find(i=>i.name==='Sprint');
  assert.ok(sprint?.active,JSON.stringify(listed.items));sprintSpace=sprint.id;
  assert.equal(fresh[0].snap.spaceName,sprintSpace);
  assert.equal(fresh[0].snap.tabs.length,1,'Sprint starts with one new tab');
  assert.match(fresh[0].snap.tabs[0].url,/newtab/);
  await w.waitFor(()=>drawnMode(f.host),m=>m==null,'Personal\'s menu closed');
  assert.deepEqual(await personalState(),personalBefore,'Personal unchanged');
 }
 passed('F41-88: Work in the editor picks Empty and disables This window; Sprint opens in a new Work window with one new tab and is in Work\'s list');

 for(const x of await windowsOf(workDir))await closeWindow(x);

 // F41-84: The Spaces menu puts this window's profile first.
 {
  const list=await menuList(await openSpacesMenu(f.host));
  assert.deepEqual(list.headings,['Personal','Work']);
  const homeRow=rowUnder(list,'Home','Personal'),sprintRow=rowUnder(list,'Sprint','Work');
  assert.ok(list.rows.indexOf(homeRow)<list.rows.indexOf(sprintRow),'Home before Sprint');
  await closeIsland(f.host);
 }
 passed('F41-84: headings Personal then Work; Home under Personal before Sprint under Work');

 // F41-91: A profile being deleted disappears from the Spaces menu.
 {
  rowUnder(await menuList(await openSpacesMenu(f.host)),'Sprint','Work');
  await closeIsland(f.host);
  assert.equal(await nativeCall(f.host,'profileDeletionMarkTest',[workDir,true]),true);
  try{
   const menu=await openSpacesMenu(f.host);
   const list=await w.waitFor(()=>menuList(menu),l=>!l.headings.includes('Work'),'Work gone from the menu');
   assert.deepEqual(list.headings,[],'Personal alone: no headings');
   assert.equal(list.rows.some(r=>r.name==='Sprint'),false,'no Sprint');
   await closeIsland(f.host);
  }finally{assert.equal(await nativeCall(f.host,'profileDeletionMarkTest',[workDir,false]),true);}
  await w.waitFor(others,p=>p.others?.some(o=>o.id===workDir),'Work listed again');
 }
 passed('F41-91: while Work is marked for deletion the reopened menu shows neither Work nor Sprint');

 // F41-85: A Work Space that is open nowhere opens in a new Work window.
 {
  await bringForward(f.host);
  const personalBefore=await nativeCall(f.host,'snapshot');
  assert.equal(String(personalBefore.activeTabId),personalTab,'Personal shows its web page');
  const before=await windowsOf(workDir);assert.deepEqual(before,[]);
  const menu=await openSpacesMenu(f.host);
  await rowButton(menu,rowUnder(await menuList(menu),'Sprint','Work')).click();
  const now=await w.waitFor(()=>windowsOf(workDir),ws=>ws.some(x=>x.snap.spaceName===sprintSpace),'a new Work window on Sprint');
  assert.equal(now.length,1,'one new Work window');
  assert.equal(await menu.locator('.ws-decision').count(),0,'no prompt in the menu');
  await w.waitFor(()=>drawnMode(f.host),m=>m==null,'Personal\'s menu closed, with no prompt');
  const after=await nativeCall(f.host,'snapshot');
  assert.deepEqual(after.tabs.map(t=>[String(t.id),t.url]),personalBefore.tabs.map(t=>[String(t.id),t.url]));
  assert.equal(String(after.activeTabId),personalTab);assert.equal(after.spaceName,personalBefore.spaceName);
  for(const x of now)await closeWindow(x);
 }
 passed('F41-85: Sprint under Work opens one new Work window; Personal\'s tabs, page and Space unchanged, no prompt');

 // Review Focus 4: with a private tab active, the open still lands in
 // Work's normal profile.
 {
  const privateTab=await openPage(f.host,page('private'),{privateTab:true});
  const s=await nativeCall(f.host,'snapshot');
  assert.equal(String(s.activeTabId),privateTab);assert.equal(s.tabs.find(t=>String(t.id)===privateTab).private,true);
  const menu=await openSpacesMenu(f.host);
  await rowButton(menu,rowUnder(await menuList(menu),'Sprint','Work')).click();
  const now=await w.waitFor(()=>windowsOf(workDir),ws=>ws.some(x=>x.snap.spaceName===sprintSpace),'a Work window on Sprint');
  assert.equal(now.length,1,'one Work window');
  assert.equal(now[0].directory,workDir);
  assert.ok(now[0].snap.tabs.length>0&&now[0].snap.tabs.every(t=>!t.private),'a normal Work window, not a private one');
  await w.waitFor(()=>drawnMode(f.host),m=>m==null,'Personal\'s menu closed');
  assert.equal(String((await nativeCall(f.host,'snapshot')).activeTabId),privateTab,'Personal\'s private tab stays');
  for(const x of now)await closeWindow(x);
  await nativeCall(f.host,'closeTab',[s.tabs.find(t=>String(t.id)===privateTab).id]);
 }
 passed('Review Focus 4: with a private tab active in Personal, Sprint opens in a normal Work window');

 // F41-90: The Quick Switcher can open a Space from another profile.
 {
  await sideList(f.host);await bringForward(f.host);await closeIsland(f.host);
  await f.host.eval('window.BlancPrototypeHost.api.openIsland()');
  await w.waitFor(()=>drawnMode(f.host),m=>m==='panel','the panel drawn');
  const overlay=islandFrame(f.host,'overlay');
  await overlay.locator('#addressInput').fill('Sprint');
  const found=overlay.locator('.island-row:has(.row-space-tile)',{hasText:'Space · Work'});
  await found.waitFor({state:'visible'});
  assert.equal(await found.count(),1);assert.match(await found.textContent(),/Sprint/);
  const before=await windowsOf(workDir);
  await found.click();
  const now=await w.waitFor(()=>windowsOf(workDir),ws=>newWindows(before,ws).some(x=>x.snap.spaceName===sprintSpace),'a new Work window on Sprint');
  assert.equal(newWindows(before,now).length,1,'one new Work window');
 }
 passed('F41-90: the Quick Switcher shows Sprint as "Space · Work" and opens it in a new Work window');

 // F41-86: A Work Space already on screen brings its window forward.
 {
  const shown=await showing(sprintSpace);
  await bringForward(f.host);
  assert.equal(await active(shown.cdp),false,'the Work window is behind Personal');
  const hostsBefore=(await profileHosts(w)).map(h=>h.targetId).sort();
  const menu=await openSpacesMenu(f.host),row=rowUnder(await menuList(menu),'Sprint','Work');
  assert.equal(row.count,'Show window');
  await rowButton(menu,row).click();
  await w.waitFor(()=>drawnMode(f.host),m=>m==null,'Personal\'s menu closed');
  await w.waitFor(()=>active(shown.cdp),Boolean,'the Work window in front');
  await pause(1000);
  assert.equal(await active(shown.cdp),true,'still in front 1 s after the menu closed');
  assert.equal(await active(f.host),false,'Personal stays behind');
  assert.deepEqual((await profileHosts(w)).map(h=>h.targetId).sort(),hostsBefore,'no window added');
  assert.equal((await nativeCall(shown.cdp,'snapshot')).spaceName,sprintSpace);
 }
 passed('F41-86: choosing Sprint (Show window) brings the Work window forward, still in front 1 s after the menu closed; no window added');

 // F41-89: The Spaces menu only opens Spaces from another profile.
 {
  const shown=await showing(sprintSpace);
  const made=await hostApi(shown,"createBlankWorkspace('Planning',{newWindow:true})");assert.equal(made.ok,true,JSON.stringify(made));
  await w.waitFor(()=>showing(made.workspaceId),Boolean,'a Work window on Planning');
  const menu=await openSpacesMenu(f.host);
  let list=await w.waitFor(()=>menuList(menu),l=>l.rows.some(r=>r.name==='Planning'&&r.under==='Work'),'Planning listed');
  const workRows=l=>l.rows.filter(r=>r.under==='Work').map(r=>r.name);
  assert.deepEqual(workRows(list),['Sprint','Planning']);
  const row=rowUnder(list,'Sprint','Work'),open=rowButton(menu,row);
  assert.equal(row.more,false,'no edit button');assert.equal(row.buttons,1,'only its open button');
  assert.ok((await open.getAttribute('aria-label')).startsWith('Sprint · Work · Show window'));
  // No context menu, Chromium's page menu included: the right-click is refused.
  // Control: this profile's own row (Home) is not refused by the same event.
  const contextRefused=e=>!e.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,composed:true,button:2}));
  assert.equal(await rowButton(menu,rowUnder(list,'Home','Personal')).evaluate(contextRefused),false,'control: Home\'s row is not refused');
  assert.equal(await open.evaluate(e=>!e.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,composed:true,button:2}))),true,'the right-click is refused');
  await open.click({button:'right'});await pause(300);
  assert.equal(await drawnMode(f.host),'spaces','the menu stays as it was');
  assert.equal(await menu.locator('.ws-editor, .ws-decision').count(),0,'nothing to edit or delete');
  // No reordering by keyboard or by dragging.
  await open.press('Alt+ArrowDown');
  const start=await open.boundingBox(),end=await rowButton(menu,rowUnder(list,'Planning','Work')).boundingBox();
  await menu.mouse.move(start.x+start.width/2,start.y+start.height/2);await menu.mouse.down();
  try{
   await menu.mouse.move(end.x+end.width/2,end.y+end.height/2,{steps:4});
   assert.equal(await menu.locator('#workspaceSwitcher .ws-row.dragging').count(),0,'the row does not drag');
  }finally{await menu.mouse.up();}
  list=await menuList(menu);
  assert.deepEqual(workRows(list),['Sprint','Planning']);
  assert.deepEqual((await hostApi(shown,'listWorkspaces()')).items.map(i=>i.name),['Sprint','Planning'],'Work\'s order unchanged');
  await closeIsland(f.host);
  await closeWindow(await showing(made.workspaceId));
 }
 passed('F41-89: Sprint under Work has no edit button, refuses a right-click and does not reorder by keyboard or drag');

 // F41-87: A set-aside Work Space opens with its page as it was.
 {
  const shown=await showing(sprintSpace),draftUrl=page('draft'),text='Work draft still in progress';
  const draftTab=await openPage(shown.cdp,draftUrl);
  assert.equal(await pageEval(shown.cdp,draftTab,`(()=>{const field=document.createElement('textarea');field.id='draft';field.value=${jsLiteral(text)};document.body.append(field);return field.value;})()`),text);
  const identity=await pageEval(shown.cdp,draftTab,'window.__blancPageIdentity??=crypto.randomUUID()');
  // Set aside: that Work window switches to another Space.
  const later=await hostApi(shown,"createBlankWorkspace('Later')");assert.equal(later.ok,true,JSON.stringify(later));
  await w.waitFor(()=>hostApi(shown,'listWorkspaces()'),l=>{const i=l.items.find(x=>x.id===sprintSpace);return i?.resident===true&&!i.active;},'Sprint set aside');
  const before=await windowsOf(workDir);
  const menu=await openSpacesMenu(f.host);
  await rowButton(menu,rowUnder(await menuList(menu),'Sprint','Work')).click();
  const now=await w.waitFor(()=>windowsOf(workDir),ws=>newWindows(before,ws).some(x=>x.snap.spaceName===sprintSpace),'a new Work window on Sprint');
  const fresh=newWindows(before,now);assert.equal(fresh.length,1,'one new Work window');
  const s=await w.waitFor(()=>nativeCall(fresh[0].cdp,'snapshot'),s=>s.tabs.some(t=>t.url===draftUrl),'the draft\'s tab in the new window');
  const id=String(s.tabs.find(t=>t.url===draftUrl).id);
  assert.equal(await pageEval(fresh[0].cdp,id,'window.__blancPageIdentity'),identity,'the same page, not reloaded');
  assert.equal(await pageEval(fresh[0].cdp,id,"document.querySelector('#draft').value"),text,'the draft is still in the field');
 }
 passed('F41-87: Sprint set aside with a draft opens in a new Work window with the same page and the draft still in the field');
 // F41-92: A Work window lists Personal's shared Spaces without sync marks.
 // Shared Spaces fixture: Personal turns Sync on with the local Worker and
 // shares Home (shipping's shared-spaces steps, by the same native calls).
 {
  const handle='Spaces across profiles',passphrase='correct horse battery staple across profiles';
  const raw=(method,args=[])=>nativeCall(f.host,'desktopSyncCall',[method,args],null,180000);
  // A pass runs with the Worker's request window freed, as shared-spaces.mjs does.
  const pass=async(method,args=[])=>{let done=false;const run=raw(method,args).finally(()=>{done=true;});
   (async()=>{while(!done){try{freeRequestRoom(worker);await raw('sync.resetRequestWindowForTest');}catch{}await pause(100);}})();
   return run;};
  const spaces=()=>raw('desktop.spaces.snapshotForTest');
  assert.equal((await pass('sync.enable',[{handle,passphrase}])).ok,true,'Sync on in Personal');
  const homeRow=(await w.waitFor(spaces,s=>s.rows?.some(r=>r.name==='Home'),'Home in the Shared Spaces inventory')).rows.find(r=>r.name==='Home');
  assert.equal((await raw('desktop.spaces.apply',[{enabled:true,selections:[{id:homeRow.id,mode:'copy'}]}])).ok,true,'Home shared');
  freeRequestRoom(worker);await raw('sync.resetRequestWindowForTest');await pass('sync.syncNow');
  // Positive control: Home really is shared. (The fork's menu draws no sync
  // mark in any window, Personal's own included: host.js never sets
  // sharedSync. Plan "Already true, unchanged here".)
  const shared=await w.waitFor(spaces,s=>s.shared?.enabled&&s.rows.find(r=>r.name==='Home')?.sharedLink==='active'&&Object.keys(s.shared.blobs??{}).length===1,'Home shared through the Worker');
  assert.equal(shared.rows.find(r=>r.name==='Home').id,homeRow.id);
  const own=await openSpacesMenu(f.host);
  assert.equal(await own.locator('#workspaceSwitcher .ws-sync-mark').count(),0,'the fork draws no sync mark, even in Personal');
  await closeIsland(f.host);
  // The Work window: Home under Personal, with no mark, and no sync state in
  // what crossed profiles (only the allowlisted fields).
  const shown=await showing(sprintSpace);assert.ok(shown,'the Work window showing Sprint');
  const menu=await openSpacesMenu(shown.cdp),list=await menuList(menu);
  assert.deepEqual(list.headings,['Work','Personal']);
  rowUnder(list,'Home','Personal');
  assert.equal(await menu.locator('#workspaceSwitcher .ws-sync-mark').count(),0,'no sync mark');
  assert.equal(await menu.locator('#workspaceSwitcher .ws-sync-status').count(),0,'no sync status');
  await closeIsland(shown.cdp);
  const personal=(await hostApi(shown,'listWorkspaces()')).otherProfiles?.find(p=>p.id==='default');
  const item=personal?.items.find(i=>i.id===homeRow.id);
  assert.deepEqual(Object.keys(item??{}).sort(),['color','id','name','openElsewhere','symbol','tabCount'],'only the allowlisted fields cross');
 }
 passed('F41-92: with Home shared through the local Worker, a Work window lists it under Personal with no sync mark or sync state');
 await visible();
 assert.deepEqual(result.pending,[],'every check ran');
 result.result='pass';
}catch(error){result.result=error.code==='BLANC_ENVIRONMENT_STOP'?'blocked-environment':'fail';result.error=String(error.stack);process.exitCode=1;}
finally{
 const exit=await f.close();if(exit?.code!==0){result.exit=exit;result.result='fail';process.exitCode=1;}
 if(f.directory&&fs.existsSync(path.join(f.directory,'browser.log')))fs.copyFileSync(path.join(f.directory,'browser.log'),path.join(out,'browser.log'));
 await worker?.close?.();
 fs.rmSync(parent,{recursive:true,force:true});fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}
