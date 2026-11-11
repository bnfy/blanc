// Local Worker: rapid native edits, refused journal write, and a persisted
// post-publication/pre-acknowledgement restart fixture. No quota bypass.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';
import {NativeFixture} from './lib/fixture.mjs';import {createWorld} from './world.mjs';import {installDriver} from './lib/test-driver.mjs';import {assertRendering,assertNodeRuntime} from './lib/render-guard.mjs';
import {prepareSyncFixture} from './fork-steps/sync.mjs';import {inSettings,readSettings} from './adapters/commands.mjs';
const [configFile,out]=process.argv.slice(2),config=JSON.parse(fs.readFileSync(configFile));assertNodeRuntime();assert.equal(fs.existsSync(out),false);fs.mkdirSync(out,{recursive:true});
const f=new NativeFixture(),w=createWorld(f),result={candidate:config.candidate,checks:[]};let directory;
const open=async()=>{await w.api('openPage',['settings','sync']);await inSettings(w,'sync',()=>({value:true}));await w.waitFor(()=>w.call('settingsSyncPairingDom'),s=>s?.available,'Sync page',15000);};
const read=file=>JSON.parse(fs.readFileSync(file));
const theme=()=>readSettings(w,async()=>{const cr=await import('chrome://resources/js/cr.js');return (await cr.sendWithPromise('blancSettingsGet')).theme;});
try{
 await prepareSyncFixture(w);await f.launch(config,path.join(fs.mkdtempSync(path.join(os.tmpdir(),'blanc-sync-journal-')),'fixture'),{testHooks:true,diskAssets:false});await installDriver(f.host);await assertRendering(e=>f.host.eval(e));await w.reset();await open();
 await w.call('settingsSyncPairingAct','turn-on');await w.waitFor(()=>w.call('settingsSyncPairingDom'),s=>s?.syncOn&&s.handle==='My Blanc','Sync enabled',90000);
 directory=path.join(f.profile,'Default/BlancSyncDesktop');const stateFile=path.join(directory,'state.json'),runnerFile=path.join(f.profile,'Default/BlancSync/settings.json');
 await w.waitFor(()=>{try{return read(stateFile);}catch{return null;}},s=>!!s?.settingsSeen?.theme,'initial setting reconciliation',90000);
 const settled=async wanted=>w.waitFor(async()=>{const s=read(stateFile);return {native:await theme(),seen:s.settingsSeen.theme,pending:s.settingsOutgoing,runner:read(runnerFile).theme};},s=>s.native===wanted&&s.seen===wanted&&!s.pending&&s.runner===wanted,'durable '+wanted+' theme',90000);
 assert.equal(await w.api('cycleTheme',['light']),'light');assert.equal(await w.api('cycleTheme',['dark']),'dark');await settled('dark');
 result.checks.push({name:'rapid light then dark preserves the last native edit through durable acknowledgement',result:'pass'});
 await readSettings(w,async()=>{const cr=await import('chrome://resources/js/cr.js');window.__journalFault=false;cr.addWebUiListener('blanc-sync-changed',e=>{if(e.event==='desktop-error'&&e.value==='desktop-state-write-failed')window.__journalFault=true;});});
 const saved=fs.readFileSync(stateFile);fs.chmodSync(directory,0o500);
 try{
  assert.throws(()=>fs.writeFileSync(path.join(directory,'fault-probe'),'test'),{code:'EACCES'});
  assert.equal(await w.api('cycleTheme',['light']),'light');
  await w.waitFor(()=>readSettings(w,()=>window.__journalFault),Boolean,'refused journal write reported',90000);
  assert.equal(await theme(),'light');assert.ok(fs.readFileSync(stateFile).equals(saved));assert.equal(read(runnerFile).theme,'dark');
 }finally{fs.chmodSync(directory,0o700);}
 await w.native('desktopSyncCall',['sync.status']);await settled('light');
 result.checks.push({name:'refused journal write neither publishes nor loses the native edit; repair converges',result:'pass'});
 assert.equal(await w.api('cycleTheme',['dark']),'dark');await settled('dark');
 await w.relaunch({afterStop:()=>{
  // Model the exact crash window: old local light has reached the runner,
  // newer native dark is saved, and the outgoing acknowledgement is pending.
  const state=read(stateFile);state.settingsSeen.theme='system';state.settingsOutgoing={theme:'light'};fs.writeFileSync(stateFile,JSON.stringify(state),{mode:0o600});
  const runner=read(runnerFile);runner.theme='light';fs.writeFileSync(runnerFile,JSON.stringify(runner),{mode:0o600});
 }});await open();assert.equal(await theme(),'dark');await settled('dark');
 result.checks.push({name:'persisted outgoing restart fixture acknowledges its own echo without reverting newer native dark',result:'pass'});
 await assertRendering(e=>f.host.eval(e));
}catch(error){result.checks.push({result:error.code==='BLANC_ENVIRONMENT_STOP'?'blocked-environment':'fail',error:String(error.stack)});process.exitCode=1;}
finally{
 if(directory&&fs.existsSync(directory))fs.chmodSync(directory,0o700);
 const exit=await f.close();if(exit?.code!==0){result.checks.push({result:'fail',exit});process.exitCode=1;}await w.syncServer?.close();
 if(f.directory&&fs.existsSync(path.join(f.directory,'browser.log')))fs.copyFileSync(path.join(f.directory,'browser.log'),path.join(out,'browser.log'));
 if(f.directory)fs.rmSync(path.dirname(f.directory),{recursive:true,force:true});fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}
