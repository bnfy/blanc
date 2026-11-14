// Native Mini lifecycle boundaries beyond the five shipping scenarios.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {NativeFixture} from './lib/fixture.mjs';
import {installDriver,nativeCall} from './lib/test-driver.mjs';
import {assertRendering,assertNodeRuntime} from './lib/render-guard.mjs';
import {createWorld} from './world.mjs';
import {tabPage} from './adapters/core.mjs';
import {runtimes} from './adapters/tabs.mjs';
const [configFile,out]=process.argv.slice(2),config=JSON.parse(fs.readFileSync(configFile));
assertNodeRuntime();assert.equal(fs.existsSync(out),false);fs.mkdirSync(out,{recursive:true});
const f=new NativeFixture(),w=createWorld(f),result={candidate:config.candidate,checks:[]};
const parent=fs.mkdtempSync(path.join(os.tmpdir(),'blanc-mini-windows-'));
const visible=()=>assertRendering(e=>f.host.eval(e));
try{
 await f.launch(config,path.join(parent,'fixture'),{testHooks:true,diskAssets:false});
 await installDriver(f.host);await visible();await w.reset();
 const normalUrl=f.base+'/normal-window';await w.call('openTab',normalUrl);
 const dirtyId=await w.call('openMiniWindow');
 const dirtyTab=await w.call('openTabInWindow',dirtyId,f.base+'/mini-dirty');
 const page=await tabPage(w,dirtyTab);
 await page.evaluate(()=>{const input=document.createElement('input');input.id='mini-draft';document.body.append(input);input.value='unsaved work';});
 await w.call('expireMiniWindow',dirtyId);
 await new Promise(r=>setTimeout(r,750));
 assert.equal((await w.call('miniWindowState',dirtyId)).mini,true);
 await page.evaluate(()=>{document.querySelector('#mini-draft').value='';});
 await w.waitFor(()=>w.call('expireMiniWindow',dirtyId),r=>r==='closed','clean Mini expires after dirty probe');
 result.checks.push('unsaved form work protects Mini expiry; clearing it permits the native close');
 const kept=await w.call('openMiniWindow'),keptUrl=f.base+'/mini-kept';
 await w.call('openTabInWindow',kept,keptUrl);
 await w.waitFor(()=>w.call('miniWindowChip',kept),c=>c?.visible,'promotion chip');
 assert.equal((await w.call('miniWindowChip',kept,{click:true})).clicked,true);
 await w.waitFor(()=>w.call('miniWindowState',kept),s=>s?.mini===false,'native promotion');
 await w.waitFor(()=>w.call('persistedSessionData'),d=>d.windows.some(win=>win.tabs.some(t=>t.navigations.some(n=>n.url===keptUrl))),'promoted tab durable');
 const transient=await w.call('openMiniWindow'),transientUrl=f.base+'/mini-transient';
 await w.call('openTabInWindow',transient,transientUrl);
 const transientHost=(await runtimes(w)).find(r=>r.id===transient);
 assert.equal((await transientHost.cdp.eval("window.BlancPrototypeHost.api.saveWorkspaceAs('Must not bind')")).ok,false);
 result.checks.push('a Mini cannot bind or save a Space');
 await w.relaunch();await visible();
 const restored=await w.waitFor(()=>w.call('windowRuntimes'),rs=>rs.some(r=>r.tabs.some(t=>t.url===keptUrl)),'promoted window restored');
 assert.ok(restored.some(r=>r.tabs.some(t=>t.url===normalUrl)));
 assert.ok(restored.every(r=>r.mini===false&&!r.tabs.some(t=>t.url===transientUrl)));
 result.checks.push('native restart restores promoted and ordinary windows while excluding the transient Mini');
 // Leave only a Mini, then deliver through the same native macOS dispatcher.
 const onlyMini=await w.call('openMiniWindow'),host=(await runtimes(w)).find(r=>r.id===onlyMini);
 for(const r of await runtimes(w))if(r.id!==onlyMini){
  await nativeCall(r.cdp,'previewPageCommand',['closeWindow'],null,1000).catch(e=>{if(!/closed|timed out/i.test(e.message))throw e;});
 }
 f.host=host.cdp;f.hostTargetId=(await host.cdp.send('Target.getTargetInfo')).targetInfo.targetId;
 delete w._primaryTarget;w._hosts=new Map();w.app.reset();
 const externalUrl=f.base+'/mini-external';assert.equal(await w.native('externalLink',[externalUrl]),true);
 const received=await w.waitFor(()=>w.call('windowRuntimes'),rs=>rs.some(r=>r.tabs.some(t=>t.url===externalUrl)),'ordinary fallback window');
 assert.equal(received.find(r=>r.tabs.some(t=>t.url===externalUrl)).mini,false);
 result.checks.push('an external URL creates an ordinary window when only a Mini remains');
 await visible();result.result='pass';
}catch(error){result.result=error.code==='BLANC_ENVIRONMENT_STOP'?'blocked-environment':'fail';result.error=String(error.stack);process.exitCode=1;}
finally{
 const exit=await f.close();if(exit?.code!==0){result.exit=exit;result.result='fail';process.exitCode=1;}
 if(f.directory&&fs.existsSync(path.join(f.directory,'browser.log')))fs.copyFileSync(path.join(f.directory,'browser.log'),path.join(out,'browser.log'));
 fs.rmSync(parent,{recursive:true,force:true});fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}
