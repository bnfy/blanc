// Native checks supplementing the unchanged Electron-specific F31 assertions.
// Local synthetic pages, mock Keychain and isolated profiles; never production.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {NativeFixture} from './lib/fixture.mjs';
import {installDriver} from './lib/test-driver.mjs';
import {assertRendering,assertNodeRuntime} from './lib/render-guard.mjs';
import {createWorld} from './world.mjs';
import {tabPage} from './adapters/core.mjs';
import {pause} from './lib/cdp.mjs';
const {loadShippingModule}=createRequire(import.meta.url)('./lib/shipping-core.cjs');
const [configPath,out]=process.argv.slice(2);
if(!configPath||!out)throw Error('Usage: quiet-lifecycle.mjs CONFIG EVIDENCE');
assertNodeRuntime();
const config=JSON.parse(fs.readFileSync(configPath));
fs.mkdirSync(out,{recursive:true});
const result={candidate:config.candidate,checks:[]};
async function check(name,privateMode,run){
 const f=new NativeFixture(),w=createWorld(f);
 try{
  await f.launch(config,path.join(fs.mkdtempSync(path.join(os.tmpdir(),'blanc-q3-')),'fixture'),
   {testHooks:true,privateMode,diskAssets:config.diskAssets!==false,pages:await loadShippingModule('test/desktop/support/fixtures-server.js').start()});
  await installDriver(f.host);await assertRendering(e=>f.host.eval(e));await w.reset();
  await run(w);await assertRendering(e=>f.host.eval(e));
  result.checks.push({name,result:'pass'});
 }catch(error){result.checks.push({name,result:error.code==='BLANC_ENVIRONMENT_STOP'?'blocked':'fail',error:String(error.stack)});throw error;}
 finally{
  const exit=await f.close();
  fs.copyFileSync(path.join(f.directory,'browser.log'),path.join(out,name+'.log'));
  fs.rmSync(path.dirname(f.directory),{recursive:true,force:true});
  if(exit?.code!==0){result.checks.push({name:name+' shutdown',result:'fail',exit});process.exitCode=1;}
  fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2)+'\n');
 }
 console.log('pass '+name);
}
async function open(w,name,privateTab=false){
 const id=await w.call('openTab',w.fixtureUrl(name),privateTab?{private:true}:{});
 await w.waitForState(s=>s.tabs.some(t=>t.id===id&&!t.loading&&t.loadedUrl?.includes(name)));
 return id;
}
await check('startup-background-restore',false,async w=>{
 const a=await open(w,'restore-background'),b=await open(w,'restore-selected');
 await w.call('pinTab',a);await w.relaunch();
 await pause(1500);
 const s=await w.state(),background=s.tabs.find(t=>t.url.includes('restore-background'));
 assert.ok(background);assert.equal(background.asleep,true);assert.equal(background.webContentsId,null);
 const selected=s.tabs.find(t=>t.url.includes('restore-selected'));
 assert.equal(s.activeTabId,selected.id);assert.equal(selected.asleep,false);
 await w.call('activateTab',background.id);assert.equal((await w.call('sleepState',background.id)).asleep,false);
});
for(const privateMode of [false,true])await check(privateMode?'private-window-wake':'in-window-private-wake',privateMode,async w=>{
 const previous=(await w.state()).activeTabId,id=await open(w,'private-recovery',!privateMode);
 const before=await w.call('executeTab',id,"sessionStorage.getItem('acceptance-load-count')");
 await w.call('activateTab',previous);assert.equal(await w.call('sleepTab',id),true);
 await w.call('activateTab',id);
 const t=(await w.state()).tabs.find(t=>t.id===id);
 assert.equal(t.private,true);assert.equal(t.sessionKind,'private');assert.equal(t.sessionPersistent,false);
 assert.equal(Number(await w.call('executeTab',id,"sessionStorage.getItem('acceptance-load-count')")),Number(before)+1);
 if(!privateMode){const saved=await w.call('persistedSessionData');assert.ok(!JSON.stringify(saved).includes('private-recovery'));}
});
await check('page-state-memory-only',false,async w=>{
 const previous=(await w.state()).activeTabId,id=await open(w,'state-recovery');
 const secret='quiet-memory-'+Date.now();
 await w.call('executeTab',id,`history.replaceState({secret:${JSON.stringify(secret)}},'',location.href);true`);
 // Both incremental live writes and a quiet session checkpoint must omit ALL
 // encoded page state, not merely fail to find plaintext inside binary data.
 await w.call('persistedSessionData');
 await w.call('activateTab',previous);assert.equal(await w.call('sleepTab',id),true);
 w.quietCandidateId=id;await w.call('persistedSessionData');
 const sync=await w.call('sessionSyncSnapshot'),ipc=await w.call('serializedTabsPayload');
 assert.ok(!JSON.stringify([sync,ipc]).includes(secret));
 assert.equal((await w.call('sleepState',id)).hasSnapshot,true);
 await w.call('activateTab',id);
 assert.equal(await w.call('executeTab',id,'history.state.secret'),secret);
});
await check('beforeunload-native-protection',false,async w=>{
 const previous=(await w.state()).activeTabId,id=await open(w,'beforeunload-native');
 await w.call('armBeforeUnloadObjection',id);
 const before=(await w.state()).tabs.find(t=>t.id===id).webContentsId;
 await w.call('activateTab',previous);assert.equal(await w.call('sleepTab',id),false);
 assert.equal((await w.state()).tabs.find(t=>t.id===id).webContentsId,before);
 await w.call('activateTab',id);
 await w.call('executeTab',id,"document.title='Still wired';history.pushState({},'',location.pathname+'?still-wired');true");
 await w.waitForState(s=>s.tabs.some(t=>t.id===id&&t.title==='Still wired'&&t.url.includes('still-wired')));
 const p=await tabPage(w,id);await p.locator('#acceptance-draft').click();await p.keyboard.type('still editable');
 assert.equal(await w.call('executeTab',id,"document.getElementById('acceptance-draft').value"),'still editable');
 // This proves native behavior, not Electron listener counts/event emission.
});
