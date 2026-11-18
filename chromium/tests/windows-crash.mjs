// Does a cross-compiled Windows build capture crashes (W1 Part B, gate 6)?
// Chromium's docs say a cross build cannot, because its assembly files are
// stubbed; this tree assembles them. Crash the browser and a renderer the
// way DevTools can, and look for what Crashpad wrote. The result is recorded
// either way: this is a finding, not a pass or fail of the build.
//
//   node chromium/tests/windows-crash.mjs CANDIDATE_FOLDER RESULTS_FOLDER
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {NativeFixture} from './lib/fixture.mjs';
import {pause} from './lib/cdp.mjs';
import {runtimeConfig} from '../windows/candidate.mjs';

const [candidateFolder,resultsFolder]=process.argv.slice(2);
if(!candidateFolder||!resultsFolder)throw Error('Usage: windows-crash.mjs CANDIDATE_FOLDER RESULTS_FOLDER');
const directory=path.resolve(candidateFolder),out=path.resolve(resultsFolder);
if(fs.existsSync(out))throw Error('Refusing to overwrite earlier results');
fs.mkdirSync(out,{recursive:true});
const candidate=JSON.parse(fs.readFileSync(path.join(directory,'candidate.json'),'utf8'));
const config=runtimeConfig(directory,candidate);
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'blanc-crash-'));
// Every crash report file under a folder: Crashpad keeps them in
// <data>\Crashpad\reports (and new\, pending\ before they settle).
function dumps(root){
 const found=[];
 const walk=dir=>{if(!fs.existsSync(dir))return;for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);
  if(e.isDirectory())walk(p);else if(/\.dmp$/i.test(e.name))found.push({file:path.relative(root,p),bytes:fs.statSync(p).size});}};
 walk(root);return found;
}
const places=profile=>({profile:path.join(profile,'Crashpad'),defaultData:path.join(process.env.LOCALAPPDATA??'','Blanc Chromium Preview','User Data','Crashpad')});
const record={candidate:candidate.id,runs:{}};
for(const [name,extraArgs] of [['default',[]],['crash-reporter-for-testing',['--enable-crash-reporter-for-testing']]]){
 const run={};record.runs[name]=run;
 const fixture=new NativeFixture();fixture.extraArgs=extraArgs;
 try{
  await fixture.launch(config,path.join(scratch,name),{testHooks:true,diskAssets:false});
  const where=places(fixture.profile);
  run.crashpadFolders=Object.fromEntries(Object.entries(where).map(([k,v])=>[k,fs.existsSync(v)]));
  // A renderer first, then the browser itself.
  await fixture.page.send('Page.crash').catch(()=>{});
  await pause(4000);
  run.afterRenderer=Object.fromEntries(Object.entries(where).map(([k,v])=>[k,dumps(v)]));
  await fixture.browser.send('Browser.crash').catch(()=>{});
  for(let i=0;i<100&&!fixture.exit;i++)await pause(100);
  run.browserExit=fixture.exit;
  await pause(5000);
  run.afterBrowser=Object.fromEntries(Object.entries(where).map(([k,v])=>[k,dumps(v)]));
  run.captured=Object.values(run.afterBrowser).some(list=>list.length>0);
 }catch(error){run.error=String(error.stack||error);}
 finally{try{await fixture.close();}catch{}
  const log=path.join(fixture.directory??'','browser.log');if(fs.existsSync(log))fs.copyFileSync(log,path.join(out,`browser-${name}.log`));}
}
try{fs.rmSync(scratch,{recursive:true,force:true,maxRetries:10,retryDelay:300});}catch{}
record.capturesCrashes=Object.values(record.runs).some(r=>r.captured);
fs.writeFileSync(path.join(out,'crash.json'),JSON.stringify(record,null,2)+'\n');
console.log(JSON.stringify(record,null,2));
