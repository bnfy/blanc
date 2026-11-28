// Mini window: switch to tabs and Spaces (#1734 part 2, shipping F61-9 to
// F61-11). Runs each scenario's steps by the fork's means until the shipping
// runner's inventory moves past #1791: the mini window's own search panel,
// typed into and clicked in that window's Island documents. Island files come
// from disk (config.assets) unless config.diskAssets is false.
//   node chromium/tests/native-mini-switch.mjs CONFIG OUT
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
const CHECKS=['F61-9','F61-10','F61-11','held','double-pick','private'];
const f=new NativeFixture(),w=createWorld(f),result={candidate:config.candidate,checks:[]};
const passed=checkLedger(result,CHECKS);
const parent=fs.mkdtempSync(path.join(os.tmpdir(),'blanc-mini-switch-'));
const visible=()=>assertRendering(e=>f.host.eval(e));
const snap=r=>nativeCall(r.cdp,'snapshot');
// Adapter ids follow window order; native window ids never move.
const nativeWindow=async r=>(await snap(r)).nativeWindowId;
const byNativeWindow=async native=>{for(const r of await runtimes(w))if(await nativeWindow(r)===native)return r;return null;};
const runtimeOf=async id=>(await runtimes(w)).find(r=>r.id===id);
const inFrame=(r,frame,source)=>r.cdp.eval(`(()=>{const doc=document.querySelector(${jsLiteral(frame)})?.contentDocument;if(!doc)return null;${source}})()`);
const spaceId=async name=>(await w.call('workspaceAction','list')).items.find(item=>item.name===name)?.id;
async function miniWindow(slug){
 const id=await w.call('openMiniWindow');
 const r=await runtimeOf(id);
 const mini={id,r,native:await nativeWindow(r)};
 if(slug){mini.url=f.base+'/'+slug;mini.tabId=await w.call('openTabInWindow',id,mini.url);}
 return mini;
}
const gone=mini=>w.waitFor(async()=>!(await byNativeWindow(mini.native)),Boolean,'the mini window to close');
// The mini window's own search: open the panel, type, then click a row.
async function search(mini,text){
 await mini.r.cdp.eval('window.BlancPrototypeHost.open(true)');
 await w.waitFor(()=>inFrame(mini.r,'#overlay',"return !!doc.getElementById('addressInput')&&doc.defaultView.getComputedStyle(doc.getElementById('addressInput')).display!=='none';"),Boolean,'the search panel');
 await inFrame(mini.r,'#overlay',`const input=doc.getElementById('addressInput');input.value=${jsLiteral(text)};input.dispatchEvent(new Event('input',{bubbles:true}));return true;`);
}
const listed=mini=>mini.r.cdp.eval('window.BlancPrototypeHost.api.listMiniSwitchTabs()');
const pickRow=(mini,match)=>w.waitFor(()=>inFrame(mini.r,'#overlay',`const row=[...doc.querySelectorAll('.island-row')].find(r=>{const title=r.querySelector('.row-title')?.textContent??'',sub=r.querySelector('.row-sub')?.textContent??'';return ${match};});if(row)row.click();return !!row;`),Boolean,'the row to pick');
try{
 await f.launch(config,path.join(parent,'fixture'),{testHooks:true,diskAssets:config.diskAssets!==false});
 await installDriver(f.host);await visible();await w.reset();

 // F61-9: a tab in another window; the untouched mini window closes.
 {
  const other=await w.call('openNewWindow');
  const url=f.base+'/elsewhere-docs';
  const tabId=await w.call('openTabInWindow',other,url);
  await w.call('openTabInWindow',other,f.base+'/elsewhere-other');
  const otherNative=await nativeWindow(await runtimeOf(other));
  const mini=await miniWindow(null);
  await search(mini,'elsewhere-docs');
  await pickRow(mini,"sub.endsWith(' · Another window')");
  await gone(mini);
  const s=await w.waitFor(async()=>{const r=await byNativeWindow(otherNative);const s=r&&await snap(r);return String(s?.activeTabId)===String(tabId)?s:null;},Boolean,'the page selected in its window');
  assert.equal(s.tabs.find(t=>String(t.id)===String(tabId))?.url,url);
  passed('F61-9: a mini window\'s search goes to a tab in another window, and the untouched mini window closes');
 }

 // F61-10: a tab in a Space saved and open nowhere opens with it selected.
 {
  const other=await w.call('openNewWindow');
  const url=f.base+'/reading-notes';
  await w.call('openTabInWindow',other,url);
  await w.call('openTabInWindow',other,f.base+'/reading-other');
  assert.equal((await w.call('workspaceActionInWindow',other,'save','Reading')).ok,true);
  await w.call('closeWindowRuntime',other);
  const reading=await spaceId('Reading');
  const mini=await miniWindow(null);
  await search(mini,'reading-notes');
  await pickRow(mini,"sub.endsWith(' · Reading')");
  await gone(mini);
  await w.waitFor(async()=>{for(const r of await runtimes(w)){const s=await snap(r);if(s.spaceName===reading&&s.tabs.find(t=>String(t.id)===String(s.activeTabId))?.url===url)return true;}return false;},Boolean,'Reading open at that page');
  passed('F61-10: a tab in a saved Space opens that Space with the tab selected');
 }

 // F61-11: a Space by name; a mini window holding a page stays.
 {
  const other=await w.call('openNewWindow');
  await w.call('openTabInWindow',other,f.base+'/shelf-page');
  assert.equal((await w.call('workspaceActionInWindow',other,'save','Shelf')).ok,true);
  await w.call('closeWindowRuntime',other);
  const shelf=await spaceId('Shelf');
  const mini=await miniWindow('mini-switch-kept');
  await search(mini,'Shelf');
  await pickRow(mini,"title==='Shelf'&&!sub.includes(' · ')");
  await w.waitFor(async()=>{for(const r of await runtimes(w))if((await snap(r)).spaceName===shelf)return true;return false;},Boolean,'a window showing Shelf');
  const kept=await byNativeWindow(mini.native);
  assert.ok(kept,'the mini window holding a page stays');
  assert.ok((await snap(kept)).tabs.some(t=>t.url===mini.url));
  passed('F61-11: a Space picked by name is gone to, and a mini window holding a page stays');
 }

 // Held: a tab in a Space held live arrives with its own id.
 {
  const other=await w.call('openNewWindow');
  const url=f.base+'/held-desk-page';
  const tabId=await w.call('openTabInWindow',other,url);
  assert.equal((await w.call('workspaceActionInWindow',other,'save','Desk')).ok,true);
  assert.equal((await w.call('workspaceActionInWindow',other,'create','Bare')).ok,true);
  const desk=await spaceId('Desk');
  const mini=await miniWindow(null);
  const row=await w.waitFor(async()=>(await listed(mini)).find(r=>r.url===url),Boolean,'the held tab listed');
  assert.equal(row.key,`t:${tabId}:${desk}`,'listed as a held tab with its id');
  assert.equal(row.place,'Desk');
  await search(mini,'held-desk-page');
  await pickRow(mini,"sub.endsWith(' · Desk')");
  await gone(mini);
  await w.waitFor(async()=>{for(const r of await runtimes(w)){const s=await snap(r);if(s.spaceName===desk&&String(s.activeTabId)===String(tabId))return true;}return false;},Boolean,'Desk shown with that very tab selected');
  passed('held: a tab in a Space held live opens that Space with the same tab selected');
 }

 // Double pick: two picks at once open the Space once.
 {
  const other=await w.call('openNewWindow');
  const url=f.base+'/twice-notes';
  await w.call('openTabInWindow',other,url);
  assert.equal((await w.call('workspaceActionInWindow',other,'save','Twice')).ok,true);
  await w.call('closeWindowRuntime',other);
  const twice=await spaceId('Twice');
  const mini=await miniWindow(null);
  const row=await w.waitFor(async()=>(await listed(mini)).find(r=>r.url===url),Boolean,'the saved tab listed');
  const results=await mini.r.cdp.eval(`Promise.all([0,1].map(()=>window.BlancPrototypeHost.api.goToMiniSwitchTab(${jsLiteral(row.key)})))`);
  assert.deepEqual(results.map(r=>r.ok),[true,true],JSON.stringify(results));
  await gone(mini);
  const showing=async()=>{let n=0;for(const r of await runtimes(w))if((await snap(r)).spaceName===twice)n++;return n;};
  await w.waitFor(showing,n=>n===1,'Twice shown in one window');
  await new Promise(resolve=>setTimeout(resolve,1500));
  assert.equal(await showing(),1,'still one window');
  passed('double-pick: two picks at once open the Space in one window');
 }

 // Private: while a private tab is in front, nothing elsewhere is listed.
 {
  const mini=await miniWindow(null);
  await w.call('openTabInWindow',mini.id,'chrome://newtab/',{private:true});
  const rows=await mini.r.cdp.eval('window.BlancPrototypeHost.api.listMiniSwitchTabs()');
  assert.deepEqual(rows,[]);
  passed('private: a mini window with a private tab in front lists nothing elsewhere');
 }
 await visible();result.result='pass';
}catch(error){result.result=error.code==='BLANC_ENVIRONMENT_STOP'?'blocked-environment':'fail';result.error=String(error.stack);process.exitCode=1;}
finally{
 const exit=await f.close();if(exit?.code!==0){result.exit=exit;result.result='fail';process.exitCode=1;}
 if(f.directory&&fs.existsSync(path.join(f.directory,'browser.log')))fs.copyFileSync(path.join(f.directory,'browser.log'),path.join(out,'browser.log'));
 fs.rmSync(parent,{recursive:true,force:true});fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}
