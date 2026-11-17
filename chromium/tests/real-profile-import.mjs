// A trial of the Electron profile importer on a COPY of a real Blanc data
// folder (plan docs/superpowers/plans/2026-11-16-electron-profile-importer.md).
// The copy is imported into a fresh test profile that is thrown away. It
// prints counts, store names and reason codes only: never an address, a
// title or any other content of the person's data. The copy is hashed before
// and after to show it was only read.
//   node chromium/tests/real-profile-import.mjs <config.json> <copy of the data folder> <new output folder>
// A test launch reads no real Keychain item, so Sync's key reports
// "unavailable" here; the real prompt needs a signed build and the person.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {NativeFixture} from './lib/fixture.mjs';
import {installDriver,nativeCall} from './lib/test-driver.mjs';
import {assertNodeRuntime} from './lib/render-guard.mjs';
import {createWorld} from './world.mjs';
import {profileHosts} from './fork-steps/profiles.mjs';
const [configFile,source,out]=process.argv.slice(2),config=JSON.parse(fs.readFileSync(configFile));
assertNodeRuntime();assert.ok(fs.statSync(source).isDirectory());assert.equal(fs.existsSync(out),false,'expected a new output folder');fs.mkdirSync(out,{recursive:true});
// Only the stores the importer reads, so a browser cache does not have to be hashed.
const STORES=/^(profiles\/[A-Za-z0-9_-]{1,64}\/)?[a-z-]+\.json$/;
const digest=()=>{const hash=crypto.createHash('sha256');let files=0,bytes=0;
 const walk=(dir,rel)=>{for(const e of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name<b.name?-1:1)){
  const next=rel?rel+'/'+e.name:e.name;
  if(e.isDirectory()){if(next==='profiles'||/^profiles\/[^/]+$/.test(next))walk(path.join(dir,e.name),next);continue;}
  if(!STORES.test(next))continue;const data=fs.readFileSync(path.join(dir,e.name));hash.update(next+'\0'+data.length+'\0');hash.update(data);files++;bytes+=data.length;}};
 walk(source,'');return {sha256:hash.digest('hex'),files,bytes};};
const f=new NativeFixture(),w=createWorld(f),report={candidate:config.candidate};
const parent=fs.mkdtempSync(path.join(os.tmpdir(),'blanc-real-import-'));
// A reason, a store name or a key name: never a value from the data.
const tally=rows=>{const counts={};for(const row of rows??[]){const key=String(row.source??'').split('#')[0].replace(/profiles\/[^/]+\//,'profiles/*/');counts[key]=(counts[key]??0)+1;}return counts;};
try{
 const before=digest();report.source={stores:before.files,bytes:before.bytes};
 await f.launch(config,path.join(parent,'fixture'),{testHooks:true,diskAssets:false});await installDriver(f.host);await w.reset();
 const historyBefore=await w.native('profileImportHistoryCount');
 const started=Date.now();
 const r=await w.native('profileImportRun',[source]);
 report.seconds=Math.round((Date.now()-started)/100)/10;
 report.ok=r.ok;report.error=r.error??null;report.sourceVersion=r.sourceVersion??null;
 if(r.ok){
  report.profiles=Object.fromEntries(Object.entries(r.profiles).map(([key,counts],i)=>[key==='personal'?'personal':'named-'+i,counts]));
  report.errors=(r.errors??[]).map(e=>({profile:e.profile==='personal'||e.profile==='device'?e.profile:'named',store:e.store,reason:e.reason}));
  report.leftBehind=tally(r.notImported);
  report.settings=r.settings?{synced:r.settings.synced,prefs:r.settings.prefs,refused:r.settings.refused,skipped:r.settings.skipped}:null;
  report.install=r.install??null;report.startPage=r.startPage??null;report.session=r.session??null;report.sync=r.sync??null;
  await new Promise(resolve=>setTimeout(resolve,3000));
  const windows=await w.native('profileImportWindows');
  report.readback={favorites:(await w.native('profileImportFavorites')).length,
   historyAdded:(await w.native('profileImportHistoryCount'))-historyBefore,
   spaces:(await w.api('listWorkspaces')).items.length,pins:(await w.native('profileImportPins')).length,
   archived:(await w.api('archiveList')).length,windows:windows.length,
   tabsPerWindow:windows.map(x=>x.tabs.length),unloadedTabs:windows.reduce((n,x)=>n+x.tabs.filter(t=>t.quiet).length,0),
   groups:windows.reduce((n,x)=>n+new Set(x.tabs.map(t=>t.group).filter(Boolean)).size,0),
   profiles:(await w.native('profileImportProfiles')).length,hosts:(await profileHosts(w)).length};
 }
 const after=digest();report.sourceUnchanged=after.sha256===before.sha256;
 report.result=r.ok&&report.sourceUnchanged?'done':'problem';
}catch(error){report.result='failed';report.failure=String(error.message).slice(0,300);process.exitCode=1;}
finally{
 const exit=await f.close().catch(()=>null);report.browserExit=exit?.code??null;
 // The browser log can name pages the import touched, so it is not kept.
 fs.rmSync(parent,{recursive:true,force:true});
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,1));
 process.exit(process.exitCode??0);
}
