import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {NativeFixture} from './lib/fixture.mjs';
import {waitFor} from './lib/cdp.mjs';
import {installDriver,nativeCall} from './lib/test-driver.mjs';
import {matchStep} from './steps.mjs';
import {aggregateCases} from './results.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const [configPath,outputDirectory]=process.argv.slice(2);
if(!configPath||!outputDirectory)throw Error('Usage: runner.mjs local-config.json durable-output-directory');
const config=JSON.parse(fs.readFileSync(configPath));
const out=path.resolve(outputDirectory);
if(fs.existsSync(out))throw Error('Refusing to overwrite prior baseline');
const tracker=JSON.parse(fs.readFileSync(path.join(root,'tracker.json')));
const inventory=JSON.parse(fs.readFileSync(path.join(root,'scenarios/inventory.json')));
if(tracker.currentCandidates.macos?.id!==config.candidate)throw Error('Candidate does not match tracker');
const forkCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
const sourceMapSha256=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'source-map.json'))).digest('hex');
fs.mkdirSync(out,{recursive:true,mode:0o700});
const baseline={schemaVersion:1,platform:'macos',candidate:config.candidate,candidateIdentity:{id:config.candidate,frameworkSha256:config.frameworkSha256,executableSha256:config.executableSha256},shippingTag:inventory.shippingTag,shippingCommit:inventory.shippingCommit,forkCommit,sourceMapSha256,
 qualification:'full shipping declaration inventory; defined steps execute on the native candidate; undefined steps are runner gaps, not inferred product failures',scenarios:[]};
const xmlEscape=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const cases=[];
let executed=0;
for(const scenario of inventory.scenarios){
 const record={id:scenario.id,file:scenario.file,line:scenario.line,name:scenario.name,featureRows:scenario.featureRows,shippingTag:inventory.shippingTag,shippingCommit:inventory.shippingCommit,forkCommit,candidate:config.candidate,platform:'macos',cases:[]};
 for(const test of scenario.cases){
  const entry={id:test.id,name:test.name,result:'not-run',executed:false};
  if(scenario.desktopApplicability==='excluded'){entry.result='excluded';entry.exclusionReason=scenario.exclusionReason;}
  else{
   const matches=test.steps.map(s=>s.argument?null:matchStep(s.text));
   const missing=test.steps.filter((s,i)=>!matches[i]).map(s=>({text:s.text,sourceLine:s.sourceLine,reason:s.argument?'argument adapter missing':'step definition missing'}));
   if(missing.length){entry.result='undefined';entry.missingSteps=missing;}
   else{
    const fixture=new NativeFixture();
    const world={fixture,named:new Map(),fixtureUrl:n=>fixture.base+'/site/'+encodeURIComponent(n),waitFor,
      async state(){return nativeCall(fixture.host,'snapshot');},
      async waitForState(predicate){return waitFor(()=>this.state(),predicate,'shipping state assertion');},
      async call(method,...args){
       if(method==='state')return this.state();
       if(method==='openTab'){
        const reply=await nativeCall(fixture.host,'createTab',args);
        await this.waitForState(s=>s.tabs.some(t=>t.id===reply.tabId&&t.url===args[0]&&!t.isLoading));return reply.tabId;
       }
       if(method==='duplicateActive')return nativeCall(fixture.host,'duplicateTab',[(await this.state()).activeTabId]);
       if(method==='pinTab'){
        const tab=(await this.state()).tabs.find(t=>t.id===args[0]);if(!tab)throw Error('Unknown tab');
        return tab.pinned?true:nativeCall(fixture.host,'togglePinned',args);
       }
       if(method==='reopenClosed')return nativeCall(fixture.host,'reopenClosedTab');
       if(method==='zoomIn'||method==='zoomReset')return nativeCall(fixture.host,'previewPageCommand',[method]);
       if(method==='closeTab')return nativeCall(fixture.host,'closeTab',args);
       throw Error('Undefined native adapter: '+method);
      }};
    try{
     await fixture.launch(config,path.join(out,'fixtures','case-'+String(++executed).padStart(4,'0')),{testHooks:true});
     await installDriver(fixture.host);const caps=await nativeCall(fixture.host,'capabilities');if(!caps.testHooks)throw Error('Native test hook unavailable');
     entry.executed=true;entry.steps=[];
     for(let i=0;i<matches.length;i++){
      const match=matches[i];await match.definition.run.call(world,...match.args);
      entry.steps.push({text:test.steps[i].text,result:'pass',shippingDefinition:match.definition.shippingSource});
     }
     entry.result='pass';
    }catch(error){entry.result='fail';entry.error=String(error.message||error);if(fs.existsSync(fixture.directory||''))fs.writeFileSync(path.join(fixture.directory,'error.txt'),String(error.stack||error));}
    finally{entry.browserExit=await fixture.close();if(entry.result==='pass'&&entry.browserExit?.code!==0){entry.result='fail';entry.error='Native fixture did not exit cleanly';}}
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
