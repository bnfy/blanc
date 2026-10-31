import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {NativeFixture} from './lib/fixture.mjs';
import {waitFor} from './lib/cdp.mjs';
import {installDriver,nativeCall} from './lib/test-driver.mjs';
import {matchStep} from './steps.mjs';
import {aggregateCases} from './results.mjs';
import {awaitMemory} from './lib/memory-guard.mjs';
import {createWorld,missingAdapters} from './world.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
import {createRequire} from 'node:module';
const {loadShippingModule}=createRequire(import.meta.url)('./lib/shipping-core.cjs');
const fixturePages=loadShippingModule('test/desktop/support/fixtures-server.js');
const [configPath,outputDirectory,...flags]=process.argv.slice(2);
if(!configPath||!outputDirectory)throw Error('Usage: runner.mjs local-config.json durable-output-directory [--only=case-id-regex]');
// --only runs a development subset; its output is never a baseline.
const only=flags.find(f=>f.startsWith('--only='))?.slice(7);
const onlyPattern=only?new RegExp(only):null;
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
const baseline={schemaVersion:1,...(only?{developmentSubset:only}:{}),platform:'macos',candidate:config.candidate,candidateIdentity:{id:config.candidate,frameworkSha256:config.frameworkSha256,executableSha256:config.executableSha256},shippingTag:inventory.shippingTag,shippingCommit:inventory.shippingCommit,forkCommit,sourceMapSha256,
 qualification:'full shipping declaration inventory; defined steps execute on the native candidate; undefined steps are runner gaps, not inferred product failures',scenarios:[]};
const xmlEscape=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const cases=[];
let executed=0;
async function runCase(matches,steps){
 const entry={executed:false};
 const fixture=new NativeFixture();
 const world=createWorld(fixture);
 try{
  // Profiles live in local temp storage, never in the synced evidence folder;
  // the browser log and any error are kept with the results.
  const name='case-'+String(++executed).padStart(4,'0');entry.fixture=name;
  await fixture.launch(config,path.join(scratch,name),{testHooks:true,pages:await fixturePages.start()});
  await installDriver(fixture.host);const caps=await nativeCall(fixture.host,'capabilities');if(!caps.testHooks)throw Error('Native test hook unavailable');
  await world.reset();
  world.bindShippingContext();
  entry.executed=true;entry.steps=[];
  for(let i=0;i<matches.length;i++){
   const match=matches[i];await world.app.refresh();await match.definition.run.call(world,...match.args);
   entry.steps.push({text:steps[i].text,result:'pass',shippingDefinition:match.definition.shippingSource});
  }
  entry.result='pass';
 }catch(error){entry.result=error.code==='BLANC_ADAPTER_UNDEFINED'?'undefined':'fail';entry.error=String(error.message||error);if(fs.existsSync(fixture.directory||''))fs.writeFileSync(path.join(fixture.directory,'error.txt'),String(error.stack||error));}
 finally{entry.browserExit=await fixture.close();if(fixture.reapedHelpers)entry.reapedHelpers=fixture.reapedHelpers;
  if(fixture.directory&&fs.existsSync(fixture.directory)){const keep=path.join(out,'fixtures',entry.fixture);fs.mkdirSync(keep,{recursive:true});
   for(const f of ['browser.log','error.txt'])if(fs.existsSync(path.join(fixture.directory,f)))fs.copyFileSync(path.join(fixture.directory,f),path.join(keep,f));
   fs.rmSync(fixture.directory,{recursive:true,force:true});}if(entry.result==='pass'&&entry.browserExit?.code!==0){entry.result='fail';entry.error='Native fixture did not exit cleanly';}}
 return entry;
}
for(const scenario of inventory.scenarios){
 const record={id:scenario.id,file:scenario.file,line:scenario.line,name:scenario.name,featureRows:scenario.featureRows,shippingTag:inventory.shippingTag,shippingCommit:inventory.shippingCommit,forkCommit,candidate:config.candidate,platform:'macos',cases:[]};
 for(const test of scenario.cases){
  const entry={id:test.id,name:test.name,result:'not-run',executed:false};
  if(onlyPattern&&!onlyPattern.test(test.id)){entry.result='not-run';}
  else if(scenario.desktopApplicability==='excluded'){entry.result='excluded';entry.exclusionReason=scenario.exclusionReason;}
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
     const result=await runCase(matches.slice(0,runnable),test.steps);
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
 if(record.result==='excluded')record.exclusionReason=scenario.exclusionReason;
 baseline.scenarios.push(record);
 fs.writeFileSync(path.join(out,'progress.json'),JSON.stringify({declarationsRecorded:baseline.scenarios.length,total:inventory.scenarios.length,executedCases:executed})+'\n');
}
const summary=Object.fromEntries(['pass','fail','undefined','excluded'].map(s=>[s,baseline.scenarios.filter(x=>x.result===s).length]));
baseline.summary=summary;baseline.caseCount=cases.length;baseline.executedCaseCount=executed;baseline.executableSummary=Object.fromEntries(['pass','fail','undefined','excluded'].map(s=>[s,cases.filter(c=>c.result===s).length]));
fs.writeFileSync(path.join(out,'baseline.json'),JSON.stringify(baseline,null,2)+'\n');
const xml=cases.map(c=>`  <testcase name="${xmlEscape(c.id)}">${c.result==='pass'?'':c.result==='fail'?`<failure message="${xmlEscape(c.error)}"/>`:`<skipped message="${xmlEscape(c.result==='excluded'?c.exclusionReason:'Undefined fork step adapter')}"/>`}</testcase>`).join('\n');
fs.writeFileSync(path.join(out,'junit.xml'),`<?xml version="1.0" encoding="UTF-8"?>\n<testsuite name="Blanc Chromium shipping baseline" tests="${cases.length}" failures="${cases.filter(c=>c.result==='fail').length}" skipped="${cases.filter(c=>['undefined','excluded'].includes(c.result)).length}">\n${xml}\n</testsuite>\n`);
console.log(JSON.stringify({summary,cases:cases.length,executedCases:executed,baseline:path.join(out,'baseline.json')}));
if(summary.fail||summary.undefined)process.exitCode=1;
