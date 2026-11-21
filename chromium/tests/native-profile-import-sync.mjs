// The Electron profile importer, task 7 (plan
// docs/superpowers/plans/2026-11-16-electron-profile-importer.md): Sync's
// stores and its key. The stores are staged beside the profile and taken up
// at the next launch, before Sync starts; the key, which only Electron's
// Keychain item opens, is re-protected for the fork. A test never touches the
// real Keychain item: its password is a stand-in, and with none set the read
// counts as refused. Sync talks only to this test's own local server.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {NativeFixture} from './lib/fixture.mjs';
import {installDriver} from './lib/test-driver.mjs';
import {assertRendering,assertNodeRuntime} from './lib/render-guard.mjs';
import {createWorld} from './world.mjs';
import {prepareSyncFixture} from './fork-steps/sync.mjs';
import {makeImportSource,digestTree,electronProtect} from './lib/profile-import-fixture.mjs';
import {inSettings} from './adapters/commands.mjs';
const [configFile,out]=process.argv.slice(2),config=JSON.parse(fs.readFileSync(configFile));
assertNodeRuntime();assert.equal(fs.existsSync(out),false,'expected a new output folder');fs.mkdirSync(out,{recursive:true});
const result={candidate:config.candidate,checks:[]};
const parent=fs.mkdtempSync(path.join(os.tmpdir(),'blanc-profile-import-sync-'));
const DEVICE='44444444-4444-4444-8444-444444444444';
const key=crypto.randomBytes(32),password=crypto.randomBytes(16).toString('base64');
// The fixture with Sync turned on and its key protected the way Electron does.
const syncing=({personalOnly=false,legacyInstall=false}={})=>makeImportSource(parent,dir=>{const file=path.join(dir,'sync.json');
 // An install from before shipping recorded its date carries the word "legacy".
 if(legacyInstall){const install=path.join(dir,'install.json');fs.writeFileSync(install,JSON.stringify({...JSON.parse(fs.readFileSync(install,'utf8')),createdAt:'legacy'}));}
 fs.writeFileSync(file,JSON.stringify({...JSON.parse(fs.readFileSync(file,'utf8')),enabled:true,handle:'fixture',protectedKey:electronProtect(key,password)}));
 // With a second profile Chromium opens its profile picker at the next launch
 // (recorded for the owner); the relaunch check keeps to one profile.
 if(personalOnly){const registry=path.join(dir,'profiles.json'),saved=JSON.parse(fs.readFileSync(registry,'utf8'));
  saved.profiles=saved.profiles.filter(x=>x.id==='default');fs.writeFileSync(registry,JSON.stringify(saved));}});
let f=null;
const launch=async name=>{f=new NativeFixture();const w=createWorld(f);await prepareSyncFixture(w);
 await f.launch(config,path.join(parent,name),{testHooks:true,diskAssets:false});await installDriver(f.host);await assertRendering(e=>f.host.eval(e));await w.reset();return w;};
const closed=async()=>{const exit=await f.close();if(exit?.code!==0)throw Error('The browser did not close cleanly: '+JSON.stringify(exit));
 if(f.directory&&fs.existsSync(path.join(f.directory,'browser.log')))fs.copyFileSync(path.join(f.directory,'browser.log'),path.join(out,path.basename(f.directory)+'.log'));f=null;};
try{
 // 1. The Keychain read refused: everything else imports, and Sync is left off.
 let w=await launch('refused');let source=syncing({legacyInstall:true});let before=digestTree(source.userData);
 let r=await w.native('profileImportRun',[source.userData]);
 assert.equal(r.ok,true);assert.ok(r.profiles.personal,'expected the rest of the import');
 assert.deepEqual(r.sync,{staged:true,state:'staged',key:'unavailable'});
 let staged=await w.native('profileImportSyncFiles',['BlancSyncImport']);
 assert.equal(staged.ready,true);assert.equal(staged.sync.deviceId,DEVICE);assert.equal(staged.sync.enabled,false,'expected Sync off without its key');
 assert.equal(staged.hasKey,false);assert.equal(staged.key,null);
 assert.equal(digestTree(source.userData),before);
 assert.equal(r.install,true,'expected an old install\'s id kept');
 assert.deepEqual((await w.native('profileImportPrefs',[['blanc.telemetry.install']])).prefs['blanc.telemetry.install'],
  {id:'99999999-9999-4999-8999-999999999999',createdAt:0,day1Default:false,day1Browsed:true});
 result.checks.push('with the Keychain read refused the rest imports, Sync is left off and the device identity is kept; an old install keeps its id');
 await closed();

 // 2. The key re-protected: Sync stays on, as the same device.
 w=await launch('kept');await w.native('setImportSafeStoragePassword',[password]);
 source=syncing();before=digestTree(source.userData);
 r=await w.native('profileImportRun',[source.userData]);
 assert.deepEqual(r.sync,{staged:true,state:'staged',key:'kept'});
 staged=await w.native('profileImportSyncFiles',['BlancSyncImport']);
 assert.deepEqual(staged.files,['sends.json','shared-spaces.json','sync.json','synced-closed.json','tab-icons.json','tab-sync.json']);
 assert.equal(staged.sync.deviceId,DEVICE);assert.equal(staged.sync.enabled,true);assert.equal(staged.sync.handle,'fixture');
 assert.equal(staged.hasKey,true);assert.equal(staged.key,key.toString('base64'),'expected the same key under the fork\'s own protection');
 assert.ok(!JSON.stringify(r).includes(key.toString('base64'))&&!JSON.stringify(staged.sync).includes(key.toString('base64')),'expected the key nowhere in a result');
 assert.equal(digestTree(source.userData),before);
 result.checks.push('the Sync key is opened with the stand-in password and re-protected for the fork; the stores are staged with the same device identity');

 // 3. A wrong password is the same as a refusal.
 await closed();w=await launch('wrong');await w.native('setImportSafeStoragePassword',['not-the-password']);
 source=syncing();r=await w.native('profileImportRun',[source.userData]);
 assert.deepEqual(r.sync,{staged:true,state:'staged',key:'unavailable'});
 result.checks.push('a password that does not open the key leaves Sync off');
 await closed();

 // 4. The next launch takes the staged stores up before Sync starts.
 w=await launch('adopt');await w.native('setImportSafeStoragePassword',[password]);
 source=syncing({personalOnly:true});r=await w.native('profileImportRun',[source.userData]);
 assert.deepEqual(r.sync,{staged:true,state:'staged',key:'kept'});assert.deepEqual(Object.keys(r.profiles),['personal']);
 await w.relaunch();await assertRendering(e=>f.host.eval(e));
 const live=await w.waitFor(()=>w.native('profileImportSyncFiles',['BlancSync']),x=>x.sync?.deviceId===DEVICE,'the imported Sync stores in place',15000);
 assert.equal(live.sync.handle,'fixture');assert.equal(live.key,key.toString('base64'),'expected the key still opening after the relaunch');
 assert.ok(live.files.includes('tab-sync.json')&&live.files.includes('sends.json'));
 assert.equal((await w.native('profileImportSyncFiles',['BlancSyncImport'])).ready,false,'expected the staging folder gone');
 result.checks.push('after a relaunch the fork\'s Sync holds the imported stores, device identity and key');
 await closed();

 // 5. Staging fails: Personal's data is in, but Sync is not marked done, Settings says so, and Try again stages it.
 const own=JSON.parse(fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname),'../blanc/fork-strings.json'),'utf8'));
 const text=name=>own['settings.profileImport.'+name].en;
 const click=w=>inSettings(w,'help',async(a,d)=>{
  const root=d.find('#blancImport').getRootNode(),button=root.getElementById('blancImportStart'),status=root.getElementById('blancImportStatus');
  const before=status.textContent.trim();button.click();const end=Date.now()+30000;
  while(Date.now()<end){await new Promise(r=>setTimeout(r,100));const now=status.textContent.trim();if(!button.disabled&&now!==before&&now!==a)break;}
  return {value:{status:status.textContent.trim(),button:button.textContent.trim()}};},text('working'));
 w=await launch('stagefail');await w.native('setImportSafeStoragePassword',[password]);
 source=syncing({personalOnly:true});await w.native('setImportSource',[source.userData]);
 await w.native('setImportSyncStagingFails',[true]);
 r=await click(w);
 assert.deepEqual(r,{status:text('syncFailed'),button:text('retry')});
 assert.equal((await w.native('profileImportState')).profiles?.personal?.sync,'failed','expected Sync marked failed, not done');
 assert.equal((await w.native('profileImportSyncFiles',['BlancSyncImport'])).ready,false,'expected no finished staging');
 await w.native('setImportSyncStagingFails',[false]);
 r=await click(w);
 assert.deepEqual(r,{status:text('doneRestart'),button:text('start')});
 const marker=(await w.native('profileImportState')).profiles.personal;assert.equal(marker.sync,'staged');
 staged=await w.native('profileImportSyncFiles',['BlancSyncImport']);
 assert.equal(staged.ready,true);assert.equal(staged.sync.deviceId,DEVICE);assert.equal(staged.key,key.toString('base64'));
 assert.equal((await w.api('listFavorites')).length,2,'expected Personal\'s Favorites imported once, not again');
 result.checks.push('a failed Sync staging leaves Sync marked failed, Settings says Sync couldn\'t be set up, and Try again stages it without importing the rest again');

 // 6. The move at launch fails: the staged copy is kept, and the next launch takes it up.
 await w.relaunch({afterStop:async()=>{f.flags.push('--blanc-test-sync-adopt-fail');}});await assertRendering(e=>f.host.eval(e));
 assert.notEqual((await w.native('profileImportSyncFiles',['BlancSync'])).sync?.deviceId,DEVICE,'expected the failed move to leave Sync as it was');
 assert.equal((await w.native('profileImportSyncFiles',['BlancSyncImport'])).ready,true,'expected the staged copy kept after a failed move');
 await w.relaunch({afterStop:async()=>{f.flags=f.flags.filter(x=>x!=='--blanc-test-sync-adopt-fail');}});await assertRendering(e=>f.host.eval(e));
 const adopted=await w.waitFor(()=>w.native('profileImportSyncFiles',['BlancSync']),x=>x.sync?.deviceId===DEVICE,'the imported Sync stores in place after the retry',15000);
 assert.equal(adopted.key,key.toString('base64'));
 assert.equal((await w.native('profileImportSyncFiles',['BlancSyncImport'])).ready,false,'expected the staging folder gone once the move was verified');
 result.checks.push('a failed move at launch keeps the staged copy, and the next launch takes it up and only then removes it');
 result.result='pass';
}catch(error){result.result=error.code==='BLANC_ENVIRONMENT_STOP'?'blocked-environment':'fail';result.error=String(error.stack);process.exitCode=1;}
finally{
 if(f){const exit=await f.close();if(exit?.code!==0){result.exit=exit;result.result='fail';process.exitCode=1;}
  if(f.directory&&fs.existsSync(path.join(f.directory,'browser.log')))fs.copyFileSync(path.join(f.directory,'browser.log'),path.join(out,'last.log'));}
 fs.rmSync(parent,{recursive:true,force:true});fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
 // The local Sync stand-in keeps its sockets open; the test is over.
 process.exit(process.exitCode??0);
}
