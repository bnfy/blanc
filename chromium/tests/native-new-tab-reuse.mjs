// #1505, as shipping's F37-5..9: ⌘T and the Island's blank New Tab go to an
// unused Start Page in the window before opening another; a used, pinned or
// grouped one is left alone, the setting turns it off, and a private request
// reuses only a private Start Page.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {NativeFixture} from './lib/fixture.mjs';
import {installDriver} from './lib/test-driver.mjs';
import {assertRendering,assertNodeRuntime} from './lib/render-guard.mjs';
import {createWorld} from './world.mjs';
const [configFile,out]=process.argv.slice(2),config=JSON.parse(fs.readFileSync(configFile));
assertNodeRuntime();assert.equal(fs.existsSync(out),false);fs.mkdirSync(out,{recursive:true});
const f=new NativeFixture(),w=createWorld(f),result={candidate:config.candidate,checks:[]};
const parent=fs.mkdtempSync(path.join(os.tmpdir(),'blanc-reuse-new-tab-'));
const visible=()=>assertRendering(e=>f.host.eval(e));
const ids=async()=>(await w.snapshot()).tabs.map(t=>String(t.id));
const page=async name=>{const id=await w.call('openTab',f.base+'/'+name);
 await w.waitForState(s=>s.activeTabId===id&&s.tabs.some(t=>t.id===id&&!t.loading));return id;};
// The Start Page reset leaves is unused; an ordinary page is made active.
// world.reset turns reuse off between scenarios; these checks want it on unless asked.
const fresh=async(reuse=true)=>{await w.reset();if(reuse)await w.native('setReuseNewTab',[true]);const blank=(await w.snapshot()).tabs[0].id;const p=await page('page');
 return {blank:String(blank),page:p,before:await ids()};};
const pressNewTab=()=>w.native('previewPageCommand',['newTab']);
const opened=async(before,label)=>{const s=await w.waitForState(s=>s.tabs.length===before.length+1);
 const id=String(s.activeTabId);assert.ok(!before.includes(id),label+': the new tab is active');return id;};
const switched=async(before,to,label)=>{await w.waitForState(s=>String(s.activeTabId)===to);
 await new Promise(r=>setTimeout(r,500));assert.deepEqual((await ids()).sort(),[...before].sort(),label+': no tab was opened');};
try{
 await f.launch(config,path.join(parent,'fixture'),{testHooks:true,diskAssets:false});
 await installDriver(f.host);await visible();

 let s=await fresh();await pressNewTab();await switched(s.before,s.blank,'⌘T');
 await w.waitFor(()=>w.call('overlayMode'),m=>m==='panel','the Island open on the Start Page',5000);
 result.checks.push('⌘T switches to the unused Start Page and opens the Island on it');

 s=await fresh();await w.api('createTab',[null,{focusAddress:false}]);await switched(s.before,s.blank,'the Island\'s New Tab');
 result.checks.push('the Island\'s blank New Tab switches to the unused Start Page');

 s=await fresh();await w.call('activateTab',s.blank);
 await w.call('navigateTab',s.blank,f.base+'/elsewhere');await w.call('navigateTab',s.blank,'blanc://newtab/');
 await w.call('activateTab',s.page);await w.waitForState(x=>String(x.activeTabId)===s.page);
 await pressNewTab();await opened(s.before,'a used Start Page');
 result.checks.push('a Start Page that went somewhere and came back is not reused');

 s=await fresh();await w.call('activateTab',s.blank);await w.call('pinTab',s.blank);
 const grouped=await w.call('openTab','blanc://newtab/');await w.call('groupActiveByName','Work');
 await w.call('activateTab',s.page);await w.waitForState(x=>String(x.activeTabId)===s.page);
 const before=await ids();await pressNewTab();await opened(before,'pinned and grouped');
 assert.ok(before.includes(String(grouped)));
 result.checks.push('pinned and grouped Start Pages are left alone');

 assert.equal(await w.call('setReuseNewTab',false),false);
 s=await fresh(false);await pressNewTab();await opened(s.before,'setting off');
 assert.equal(await w.call('setReuseNewTab',true),true);
 result.checks.push('with the setting off, ⌘T opens a new tab');

 s=await fresh();const priv=String(await w.call('openTab','blanc://newtab/?private=1',{private:true}));
 await w.call('activateTab',s.page);await w.waitForState(x=>String(x.activeTabId)===s.page);
 const withPrivate=await ids();await w.api('createTab',[null,{private:true,focusAddress:false}]);
 await switched(withPrivate,priv,'a private New Tab');
 await w.call('activateTab',s.page);await w.waitForState(x=>String(x.activeTabId)===s.page);
 await pressNewTab();await switched(withPrivate,s.blank,'⌘T with a private Start Page open');
 result.checks.push('private and regular New Tabs each reuse only their own kind');
 // The ⌘⇧N command itself (shipping's F37-9), not the Island's request.
 s=await fresh();assert.equal(await w.native('previewPageCommand',['newPrivateTab']),true);
 const firstPrivate=await opened(s.before,'⌘⇧N with no private Start Page');
 assert.equal((await w.snapshot()).tabs.find(t=>String(t.id)===firstPrivate).private,true);
 await w.call('activateTab',s.page);await w.waitForState(x=>String(x.activeTabId)===s.page);
 const withCommand=await ids();assert.equal(await w.native('previewPageCommand',['newPrivateTab']),true);
 await switched(withCommand,firstPrivate,'⌘⇧N with a private Start Page open');
 result.checks.push('the New Private Tab command opens a private tab, then reuses it');
 // The other commands the fork answers itself open their sheet, never a tab.
 for(const page of ['history','downloads','settings']){
  s=await fresh();assert.equal(await w.native('previewPageCommand',[page]),true);
  await w.waitFor(()=>w.hostEval('window.BlancPrototypeHost.sheetState()'),state=>state?.visible&&state.url==='blanc://'+page+'/','the '+page+' sheet from its command',5000);
  assert.deepEqual((await ids()).sort(),[...s.before].sort(),page+': no tab was opened');
 }
 result.checks.push('History, Downloads and Settings commands open their sheets');
 // Favorites is a page in a tab of its own (V30, #1614): its command opens
 // that tab, never a sheet, and never reuses the unused Start Page.
 s=await fresh();assert.equal(await w.native('previewPageCommand',['bookmarks']),true);
 const favorites=await opened(s.before,'the Favorites command');
 await w.waitForState(x=>x.tabs.some(t=>String(t.id)===favorites&&t.url==='blanc://bookmarks/'));
 result.checks.push('the Favorites command opens the Favorites tab');
 await visible();result.result='pass';
}catch(error){result.result=error.code==='BLANC_ENVIRONMENT_STOP'?'blocked-environment':'fail';result.error=String(error.stack);process.exitCode=1;}
finally{
 const exit=await f.close();if(exit?.code!==0){result.exit=exit;result.result='fail';process.exitCode=1;}
 if(f.directory&&fs.existsSync(path.join(f.directory,'browser.log')))fs.copyFileSync(path.join(f.directory,'browser.log'),path.join(out,'browser.log'));
 fs.rmSync(parent,{recursive:true,force:true});fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}
