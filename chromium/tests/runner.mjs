import fs from 'node:fs';
import {performance} from 'node:perf_hooks';
import {phase,measuredAttempt,timingSummary} from './lib/timing.mjs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {execFileSync,spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {NativeFixture} from './lib/fixture.mjs';
import {waitFor} from './lib/cdp.mjs';
import {installDriver,nativeCall} from './lib/test-driver.mjs';
import {assertRendering,assertNodeRuntime} from './lib/render-guard.mjs';
import {matchStep,beforeHooks} from './steps.mjs';
import {prepareSyncFixture} from './fork-steps/sync.mjs';
import {aggregateCases} from './results.mjs';
import {macosForkExclusions} from './macos-fork-exclusions.mjs';
import {awaitMemory} from './lib/memory-guard.mjs';
import {createWorld,missingAdapters} from './world.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
import {createRequire} from 'node:module';
const {loadShippingModule}=createRequire(import.meta.url)('./lib/shipping-core.cjs');
const fixturePages=loadShippingModule('test/desktop/support/fixtures-server.js');
const [configPath,outputDirectory,...flags]=process.argv.slice(2);
if(!configPath||!outputDirectory)throw Error('Usage: runner.mjs local-config.json durable-output-directory [--only=case-id-text]');
assertNodeRuntime();
// --only runs a development subset (case ids containing the text); its
// output is never a baseline.
const only=flags.find(f=>f.startsWith('--only='))?.slice(7);
const caseList=flags.find(f=>f.startsWith('--case-list='))?.slice(12);
const selected=caseList?new Set(JSON.parse(fs.readFileSync(caseList))):null;
if(only&&selected)throw Error('Choose only one subset selector');
// Several texts, comma-separated, run every case matching any of them.
const onlyPattern=only?{test:id=>only.split(',').some(text=>text&&id.includes(text))}:null;
const config=JSON.parse(fs.readFileSync(configPath));
const out=path.resolve(outputDirectory);
if(fs.existsSync(out))throw Error('Refusing to overwrite prior baseline');
const tracker=JSON.parse(fs.readFileSync(path.join(root,'tracker.json')));
const inventory=JSON.parse(fs.readFileSync(path.join(root,'scenarios/inventory.json')));
if(tracker.currentCandidates.macos?.id!==config.candidate)throw Error('Candidate does not match tracker');
const forkCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
const sourceMapSha256=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'source-map.json'))).digest('hex');
fs.mkdirSync(out,{recursive:true,mode:0o700});
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'blanc-fixtures-'));
// The Island assets the cases ran against: compiled in, or a disk override.
const islandManifestSha256=crypto.createHash('sha256').update(JSON.stringify(JSON.parse(fs.readFileSync(path.join(root,'blanc/island-assets.json'))).manifest)).digest('hex');
const baseline={schemaVersion:1,assets:config.diskAssets===false?{source:'embedded',islandManifestSha256}:{source:'disk',folder:path.basename(config.assets)},...((only||selected)?{developmentSubset:only??{caseList:[...selected]}}:{}),platform:'macos',candidate:config.candidate,candidateIdentity:{id:config.candidate,frameworkSha256:config.frameworkSha256,executableSha256:config.executableSha256},shippingTag:inventory.shippingTag,shippingCommit:inventory.shippingCommit,forkCommit,sourceMapSha256,
 qualification:'full shipping declaration inventory; defined steps execute on the native candidate; undefined steps are runner gaps, not inferred product failures',scenarios:[]};
const xmlEscape=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const cases=[];
let executed=0;
const timings=[];
const harnessHash=crypto.createHash('sha256');
for(const relative of fs.readdirSync(path.join(root,'tests'),{recursive:true}).filter(n=>/\.(mjs|cjs|js)$/.test(n)).sort()){
 harnessHash.update(relative+'\0');harnessHash.update(fs.readFileSync(path.join(root,'tests',relative)));
}
const timingHarnessSha256=harnessHash.digest('hex');
const writeTimings=()=>fs.writeFileSync(path.join(out,'timing.json'),JSON.stringify({candidate:config.candidate,shippingCommit:inventory.shippingCommit,timingHarnessSha256,...timingSummary(timings)},null,2)+'\n');
// Hold the display awake for the run (released when it exits): a sleeping
// display stops the run through the render guard.
spawn('/usr/bin/caffeinate',['-d','-i','-w',String(process.pid)],{stdio:'ignore'}).unref();
async function runCase(matches,steps,tags=[]){
 const entry={executed:false};
 const fixture=new NativeFixture();
 const world=createWorld(fixture);
 // A synthetic input device still uses getUserMedia and the real permission
 // prompt/indicator. Never request the owner's physical microphone in tests.
 if(tags.includes('@F13-2'))fixture.extraArgs=['--use-fake-device-for-media-stream'];
 world.scenarioTags=tags;
 try{
  // Profiles live in local temp storage, never in the synced evidence folder;
  // the browser log and any error are kept with the results.
  const name='case-'+String(++executed).padStart(4,'0');entry.fixture=name;
  if(tags.includes('@sync-server')||tags.includes('@sync')||(tags.includes('@F57')&&!tags.includes('@peer-driver'))||matches.some(m=>/injectRemoteDevices|mergeRemoteTabLayout/.test(m.definition.run.toString())))await phase('fixturePreparation',()=>prepareSyncFixture(world));
  await phase('fixturePreparation',async()=>fixture.launch(config,path.join(scratch,name),{testHooks:true,pages:await fixturePages.start(),diskAssets:config.diskAssets!==false}));
  await installDriver(fixture.host);const caps=await nativeCall(fixture.host,'capabilities');if(!caps.testHooks)throw Error('Native test hook unavailable');
  await phase('renderingGuard',()=>assertRendering(e=>fixture.host.eval(e)));
  await phase('reset',()=>world.reset());
  // Shipping's acceptance palette is pinned to light. Select the real profile
  // theme before the scenario so an evening OS appearance cannot change it.
  await phase('appearance',async()=>{
   // Fixture setup follows shipping's direct setting hook. Exercise the
   // production typed theme command and observe its rendered media state;
   // scenario steps that test Settings still drive that real Settings UI.
   if(await world.api('cycleTheme',['light'])!=='light')throw Error('Could not select the fixture light theme');
   await waitFor(()=>fixture.host.eval("matchMedia('(prefers-color-scheme: light)').matches"),Boolean,'fixture light theme to render');
  });
  world.bindShippingContext();
  entry.executed=true;entry.steps=[];
  for(const hook of beforeHooks)if(hook.tags.split(' or ').some(tag=>tags.includes(tag)))await phase('stepSetup',()=>hook.run.call(world));
  for(let i=0;i<matches.length;i++){
   const match=matches[i];await phase('steps',async()=>{await world.app.refresh();await match.definition.run.call(world,...match.args);});
   entry.steps.push({text:steps[i].text,result:'pass',shippingDefinition:match.definition.shippingSource});
  }
  entry.result='pass';
 }catch(error){
  // A failure on a display that stopped rendering mid-case is not a result.
  // An auto-hidden Island sits above the window and draws no frames, so show
  // it before asking whether the display still draws.
  if(error.code!=='BLANC_ENVIRONMENT_STOP'&&fixture.host)await nativeCall(fixture.host,'setIslandAutoHide',[false]).catch(()=>{})
   .then(()=>assertRendering(e=>fixture.host.eval(e))).catch(stop=>{if(stop.code==='BLANC_ENVIRONMENT_STOP')error=stop;});
  if(error.code==='BLANC_ENVIRONMENT_STOP'){entry.stop=error;}
  else{entry.result=error.code==='BLANC_ADAPTER_UNDEFINED'?'undefined':'fail';entry.error=String(error.message||error);if(fs.existsSync(fixture.directory||''))fs.writeFileSync(path.join(fixture.directory,'error.txt'),String(error.stack||error));}}
 finally{
  await phase('teardown',async()=>{
  world.releaseIndex?.();
  await world.closeNativePeer?.().catch(error=>{entry.result='fail';entry.error=[entry.error,error.message].filter(Boolean).join('; ');});
  // Shipping's After hooks restore its shared app, which a fresh browser per
  // case doesn't need. A Before hook's server still has to close, or Node
  // never exits.
  for(const page of world.heldLoadingPages??[])await page.cdp?.send('Fetch.disable').catch(()=>{});
  await world.lifecycleFixture?.close().catch(()=>{});
  if(world.pinnedLocalDir)fs.rmSync(world.pinnedLocalDir,{recursive:true,force:true});
  world.telemetryServer?.closeAllConnections();world.telemetryServer?.close();
  try{entry.browserExit=await fixture.close();}
  finally{try{await world.syncPeer?.sync.disable();}finally{await world.syncServer?.close();}}
  if(fixture.reapedHelpers)entry.reapedHelpers=fixture.reapedHelpers;
  if(fixture.directory&&fs.existsSync(fixture.directory)){const keep=path.join(out,'fixtures',entry.fixture);fs.mkdirSync(keep,{recursive:true});
   for(const f of ['browser.log','peer-browser.log','error.txt','sync-discovery.json'])if(fs.existsSync(path.join(fixture.directory,f)))fs.copyFileSync(path.join(fixture.directory,f),path.join(keep,f));
   fs.rmSync(fixture.directory,{recursive:true,force:true});}if(entry.result==='pass'&&entry.browserExit?.code!==0){entry.result='fail';entry.error='Native fixture did not exit cleanly';}
  });}
 if(entry.stop)throw entry.stop;
 return entry;
}
for(const scenario of inventory.scenarios){
 const record={id:scenario.id,file:scenario.file,line:scenario.line,name:scenario.name,featureRows:scenario.featureRows,shippingTag:inventory.shippingTag,shippingCommit:inventory.shippingCommit,forkCommit,candidate:config.candidate,platform:'macos',cases:[]};
 for(const test of scenario.cases){
  const entry={id:test.id,name:test.name,result:'not-run',executed:false};
  if((selected&&!selected.has(test.id))||(onlyPattern&&!onlyPattern.test(test.id))){entry.result='not-run';}
  else if(scenario.desktopApplicability==='excluded'){entry.result='excluded';entry.exclusionReason=scenario.exclusionReason;}
  else if(process.platform==='darwin'&&macosForkExclusions[test.id]){entry.result='excluded';entry.exclusionReason=macosForkExclusions[test.id];}
  else if((scenario.tags.includes('@test-platform-linux')||scenario.tags.includes('@F45-7'))&&process.platform!=='linux'){entry.result='undefined';entry.nonApplicableReason='Linux platform behavior cannot execute on the native macOS fork; Electron platform spoofing is not a native platform test.';}
  else{
   const matches=test.steps.map(s=>s.argument?null:matchStep(s.text));
   const gaps=test.steps.map((s,i)=>{
    if(!matches[i])return {text:s.text,sourceLine:s.sourceLine,reason:s.argument?'argument adapter missing':'step definition missing'};
    const hooks=missingAdapters(matches[i].definition);
    return hooks.length?{text:s.text,sourceLine:s.sourceLine,reason:'native hook adapter missing',hooks}:null;
   });
   const missing=gaps.filter(Boolean);
   // Like Cucumber, run the defined prefix: a failure there is the case's
   // result; reaching the first gap leaves it undefined.
   const runnable=missing.length?gaps.findIndex(Boolean):matches.length;
   if(missing.length)entry.missingSteps=missing;
   if(runnable===0)entry.result='undefined';
   else{
    // Shipping's runnable profile retries a failed scenario once.
    for(let attempt=1;attempt<=2;attempt++){
     // Outside the case: a memory stop ends the run, never records a result.
     await awaitMemory();
     const timing={id:test.id,attempt,phases:{},timeouts:[]},started=performance.now();
     let result;
     try{result=await measuredAttempt(timing,()=>runCase(matches.slice(0,runnable),test.steps,scenario.tags));}
     catch(error){timing.stop={code:error.code??null,message:error.message};throw error;}
     finally{timing.totalMs=performance.now()-started;timing.result=result?.result==='pass'&&runnable<matches.length?'undefined':result?.result??(timing.stop?.code==='BLANC_ENVIRONMENT_STOP'?'environment-stop':'run-error');timings.push(timing);writeTimings();}
     if(attempt===2){entry.retried=true;entry.firstAttempt={result:entry.result,error:entry.error};delete entry.error;}
     Object.assign(entry,result);
     if(runnable<matches.length&&entry.result==='pass'){entry.result='undefined';entry.prefixPassed=true;}
     if(entry.result!=='fail')break;
    }
   }
  }
  record.cases.push(entry);cases.push(entry);
 }
 record.result=aggregateCases(record.cases);
 if(record.result==='excluded')record.exclusionReason=scenario.exclusionReason??[...new Set(record.cases.map(c=>c.exclusionReason))].join(' ');
 baseline.scenarios.push(record);
 fs.writeFileSync(path.join(out,'progress.json'),JSON.stringify({declarationsRecorded:baseline.scenarios.length,total:inventory.scenarios.length,executedCases:executed})+'\n');
 // Preserve completed evidence if a rendering/memory guard stops a long run.
 // This checkpoint is explicitly incomplete and is never a baseline receipt.
 fs.writeFileSync(path.join(out,'partial-baseline.json'),JSON.stringify({...baseline,incomplete:true},null,2)+'\n');
}
const summary=Object.fromEntries(['pass','fail','undefined','excluded'].map(s=>[s,baseline.scenarios.filter(x=>x.result===s).length]));
baseline.summary=summary;baseline.caseCount=cases.length;baseline.executedCaseCount=executed;baseline.executableSummary=Object.fromEntries(['pass','fail','undefined','excluded'].map(s=>[s,cases.filter(c=>c.result===s).length]));
fs.writeFileSync(path.join(out,'baseline.json'),JSON.stringify(baseline,null,2)+'\n');
const xml=cases.map(c=>`  <testcase name="${xmlEscape(c.id)}">${c.result==='pass'?'':c.result==='fail'?`<failure message="${xmlEscape(c.error)}"/>`:`<skipped message="${xmlEscape(c.result==='excluded'?c.exclusionReason:'Undefined fork step adapter')}"/>`}</testcase>`).join('\n');
fs.writeFileSync(path.join(out,'junit.xml'),`<?xml version="1.0" encoding="UTF-8"?>\n<testsuite name="Blanc Chromium shipping baseline" tests="${cases.length}" failures="${cases.filter(c=>c.result==='fail').length}" skipped="${cases.filter(c=>['undefined','excluded'].includes(c.result)).length}">\n${xml}\n</testsuite>\n`);
console.log(JSON.stringify({summary,cases:cases.length,executedCases:executed,baseline:path.join(out,'baseline.json')}));
if(summary.fail||summary.undefined)process.exitCode=1;
