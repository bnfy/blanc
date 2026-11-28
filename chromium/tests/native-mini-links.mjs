// Mini window: links from other apps open in one (#1734 part 3, shipping
// F61-12 and F61-13), through the native external-link path the Mac's app
// controller uses (application:openURLs: -> OpenExternalLink) and the one it
// offers links received before startup to (openStartupUrls -> ClaimStartupLink).
//   node chromium/tests/native-mini-links.mjs CONFIG OUT
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {NativeFixture} from './lib/fixture.mjs';
import {installDriver} from './lib/test-driver.mjs';
import {assertRendering,assertNodeRuntime} from './lib/render-guard.mjs';
import {createWorld} from './world.mjs';
import {checkLedger} from './lib/check-ledger.mjs';
const [configFile,out]=process.argv.slice(2),config=JSON.parse(fs.readFileSync(configFile));
assertNodeRuntime();assert.equal(fs.existsSync(out),false);fs.mkdirSync(out,{recursive:true});
const CHECKS=['off','F61-12','latest','F61-13','startup'];
const f=new NativeFixture(),w=createWorld(f),result={candidate:config.candidate,checks:[]};
const passed=checkLedger(result,CHECKS);
const parent=fs.mkdtempSync(path.join(os.tmpdir(),'blanc-mini-links-'));
const visible=()=>assertRendering(e=>f.host.eval(e));
const holder=(rs,url)=>rs.find(r=>r.tabs.some(t=>t.url===url));
const arrives=async url=>holder(await w.waitFor(()=>w.call('windowRuntimes'),rs=>rs.some(r=>r.tabs.some(t=>t.url===url&&!t.isLoading)),`${url} to open`),url);
const minis=async()=>(await w.call('windowRuntimes')).filter(r=>r.mini);
// On the Mac, through the app controller's own application:openURLs:.
const fromApp=async url=>assert.equal(await w.native(process.platform==='darwin'?'systemOpenURL':'externalLink',[url]),true);
try{
 await f.launch(config,path.join(parent,'fixture'),{testHooks:true,diskAssets:config.diskAssets!==false});
 await installDriver(f.host);await visible();await w.reset();
 const profileId=(await w.call('windowRuntimes')).find(r=>!r.mini).profileId;

 // Off (the default): the frontmost ordinary window takes the link.
 {
  const url=f.base+'/mini-links-off';
  assert.equal(await w.native('externalLink',[url]),true);
  assert.equal((await arrives(url)).mini,false);
  assert.deepEqual(await minis(),[]);
  passed('off: a link from another app opens in the ordinary window');
 }

 // F61-12: on, a link opens a mini window on it alone; links arriving
 // together share it, the last one in front.
 let first;
 {
  assert.equal(await w.native('setMiniWindowLinks',[true]),true);
  const one=f.base+'/mini-links-first',two=f.base+'/mini-links-second';
  await fromApp(one);await fromApp(two);
  const mini=await arrives(two);
  assert.equal(mini.mini,true);
  assert.deepEqual(mini.tabs.map(t=>t.url),[one,two],'both links, no start page beside them');
  assert.equal(mini.activeTabId,mini.tabs[1].id,'the last link is in front');
  assert.equal((await minis()).length,1);
  first=mini.id;
  passed('F61-12: links from another app open in one new mini window, with no blank tab');
 }

 // The most recently used mini window takes the next link.
 {
  const newer=await w.call('openMiniWindow');
  assert.notEqual(newer,first);
  const url=f.base+'/mini-links-latest';
  await fromApp(url);
  assert.equal((await arrives(url)).id,newer,'the newer mini window');
  assert.ok(!(await w.call('windowRuntimes')).find(r=>r.id===first).tabs.some(t=>t.url===url));
  passed('latest: a link joins the most recently used mini window');
 }

 // F61-13: a matching rule still wins, here a Space of this profile.
 {
  const ordinary=(await w.call('windowRuntimes')).find(r=>!r.mini).id;
  await w.call('openTabInWindow',ordinary,f.base+'/routed-home');
  const saved=await w.call('workspaceActionInWindow',ordinary,'save','Routed');
  assert.equal(saved.ok,true,JSON.stringify(saved));
  const spaceId=(await w.call('workspaceAction','list')).items.find(item=>item.name==='Routed').id;
  const rule={id:'mini-links-rule',match:{kind:'contains',value:'/route-proof-'},destination:{profileId,spaceId,private:false}};
  assert.equal((await w.native('setLinkRoutes',[[rule]])).ok,true);
  const url=f.base+'/route-proof-mini';
  await fromApp(url);
  const receiver=await arrives(url);
  assert.equal(receiver.mini,false,'not a mini window');
  assert.equal(receiver.workspaceId,spaceId,'the rule\'s Space');
  assert.equal((await w.native('setLinkRoutes',[[]])).ok,true);
  passed('F61-13: a link that matches a rule goes where the rule says');
 }

 // A link received before startup: claimed by the setting, left to
 // Chromium's startup tabs once it is off.
 {
  const url=f.base+'/mini-links-startup';
  assert.equal(await w.native('startupLink',[url]),true);
  assert.equal((await arrives(url)).mini,true);
  assert.equal(await w.native('setMiniWindowLinks',[false]),false);
  assert.equal(await w.native('startupLink',[f.base+'/mini-links-unclaimed']),false);
  passed('startup: ClaimStartupLink, which openStartupUrls offers links received before startup, opens one in a mini window, and with the setting off leaves it to Chromium');
 }
 await visible();result.result='pass';
}catch(error){result.result=error.code==='BLANC_ENVIRONMENT_STOP'?'blocked-environment':'fail';result.error=String(error.stack);process.exitCode=1;}
finally{
 const exit=await f.close();if(exit?.code!==0){result.exit=exit;result.result='fail';process.exitCode=1;}
 if(f.directory&&fs.existsSync(path.join(f.directory,'browser.log')))fs.copyFileSync(path.join(f.directory,'browser.log'),path.join(out,'browser.log'));
 fs.rmSync(parent,{recursive:true,force:true});fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}
