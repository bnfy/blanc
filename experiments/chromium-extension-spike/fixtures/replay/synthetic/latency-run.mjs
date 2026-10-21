// Full corpus as deterministic authored pages. Each page issues all its resources
// immediately; no per-request queue, pacing or concurrency limiter in the harness.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
import {sha} from './generate.mjs';import {startSynthetic} from './transport.mjs';import {createCertificateSet} from './certificate-set.mjs';import {pageUrl,pageResponse} from './page.mjs';import {openSession,pause} from './session.mjs';import {percentiles,medianRepetitions,validateLatencyPage} from './latency-validate.mjs';
function idleSnapshot(){const text=execFileSync('/usr/bin/top',['-l','2','-s','1','-n','0'],{encoding:'utf8'});const matches=[...text.matchAll(/CPU usage: ([\d.]+)% user, ([\d.]+)% sys, ([\d.]+)% idle/g)];assert(matches.length);const m=matches.at(-1);return {at:new Date().toISOString(),user:Number(m[1]),system:Number(m[2]),idle:Number(m[3])};}
async function idleSamples(){const samples=[];for(let i=0;i<5;i++){await pause(2000);samples.push(idleSnapshot());if(samples.at(-1).idle>=90)break;}return samples;}
const requireIdle=process.argv.includes('--require-idle');
const [configPath,oraclePath,evidence,only='both']=process.argv.slice(2).filter(x=>x!=='--require-idle'),config=JSON.parse(fs.readFileSync(configPath));assert(evidence&&!fs.existsSync(evidence));fs.mkdirSync(evidence);
const manifest=JSON.parse(fs.readFileSync(path.join(oraclePath,'candidate-manifest.json'))),fixtures=new Map(JSON.parse(fs.readFileSync(path.join(oraclePath,'responses.json'))));
const pageSize=200,pages=[];for(let i=0;i<manifest.candidates.length;i+=pageSize)pages.push(manifest.candidates.slice(i,i+pageSize));
const pageBodies=pages.map(c=>pageResponse(c,{concurrency:'natural'}));
const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'blanc-f12-latency-'))),certificates=createCertificateSet(path.join(root,'certificates'),[...new Set([...fixtures.keys()].map(u=>new URL(u).hostname))]);
const report={started:new Date().toISOString(),completed:false,protocol:'one discarded full warm-up then five full repetitions per profile in the same process; nearest-rank percentiles; median-of-five',pageScheduling:'26 sequential page loads per repetition, 200 candidates per page except last; each page issues its resources concurrently without pacing; full corpus unchanged; repeated roots excluded from unique URL floor',nativeClock:'base::TimeTicks from factory entry or redirect receipt through decision application; Mojo included',electronClock:'process.hrtime.bigint at JS provider-observer entry through real provider result; preceding Electron native dispatch excluded; reference only',fullAcceptance:false,sources:{},runs:[],profiles:{},gaps:['Electron native-entry TimeTicks unavailable through this observer','engine-internal timing not exposed separately']};
report.requireIdle=requireIdle;
for(const name of ['latency-run.mjs','latency-validate.mjs','session.mjs','page.mjs'])report.sources[name]=sha(fs.readFileSync(new URL(name,import.meta.url)));
fs.writeFileSync(path.join(evidence,'page-layout.json'),JSON.stringify(pages.map((c,i)=>({index:i,candidateIds:c.map(x=>x.id),responseSha256:sha(pageBodies[i].body)})),null,2));fs.writeFileSync(path.join(evidence,'page-responses.json'),JSON.stringify(pageBodies,null,2));
report.pageLayoutSha256=sha(fs.readFileSync(path.join(evidence,'page-layout.json')));report.baseFixtureBundleSha256=sha(JSON.stringify([...fixtures]));
let session,replay;
try{
 if(requireIdle){report.idlePreflight=await idleSamples();assert(report.idlePreflight.at(-1).idle>=90,'Idle preflight failed: no browser measurement started');}
 for(const browserKind of (only==='both'?['electron','chromium']:[only]))for(const kind of ['regular','private']){
  const label=browserKind+'-'+kind,oracle=JSON.parse(fs.readFileSync(path.join(oraclePath,kind+'-stability.json')));assert(oracle.stable);
  const expectedAll=new Map(oracle.oracle.map(r=>[r.context.url,r])),reference=new Map(JSON.parse(fs.readFileSync(path.join(oraclePath,kind+'-a-run.json'))).records.map(r=>[r.url,r]));
  replay=await startSynthetic({fixtures,tlsMaterial:certificates});const idleBeforeSession=idleSnapshot();session=await openSession({config,browserKind,kind,label,root,transport:replay,certificates});
  const failures=[];session.page.on('requestfailed',r=>failures.push({url:r.url(),error:r.failure()?.errorText}));
  report.profiles[label]={source:session.source,idleBeforeSession,repetitions:[],boundMs:browserKind==='chromium'?5:null};
  for(let rep=0;rep<6;rep++){
   await session.page.goto('about:blank');const idle=await idleSamples(),started=new Date().toISOString(),allTimes=[],pageResults=[];
   if(requireIdle&&idle.at(-1).idle<90){report.idleStop={label,rep,samples:idle};throw Error('Idle condition failed before repetition; measurement stopped');}
   // A noisy idle baseline is retained and disqualifies the formal idle gate;
   // it does not silently disappear from measurements or alter the bound.
   for(let index=0;index<pages.length;index++){
    const candidates=pages[index];fixtures.set(pageUrl,pageBodies[index]);
    const selected=new Set([pageUrl,...candidates.flatMap(c=>[c.url,...(c.descendantUrl?[c.descendantUrl]:[])])]);const expected=new Map([...expectedAll].filter(([url])=>selected.has(url)));
    const recordStart=session.records().length,arrivalStart=replay.arrivals.length,faultStart=replay.faults.length,failureStart=failures.length;
    await session.page.goto(pageUrl,{waitUntil:'commit',timeout:60000});await session.page.waitForFunction(()=>window.pilot?.done,null,{timeout:180000});await session.page.waitForFunction(()=>(window.blancFixtureChildren||[]).length===(window.blancFixtureExecuted||[]).length,null,{timeout:30000});await pause(200);
    const dom=await session.page.evaluate(()=>({loads:window.pilot.loads,executed:window.blancFixtureExecuted||[],children:window.blancFixtureChildren||[]})),rows=session.records().slice(recordStart),arrivals=replay.arrivals.slice(arrivalStart),transportFaults=replay.faults.slice(faultStart);
    const result=validateLatencyPage({browserKind,rows,dom,arrivals,expected,reference,fixtures,candidates});
    const services=new Set(['clients2.google.com','www.google.com:443','accounts.google.com:443']);if(transportFaults.some(f=>!(['plaintext-refused','connect-refused'].includes(f.code)&&services.has(f.authority))))result.faults.push('transport-fault');result.valid=result.faults.length===0;
    fs.writeFileSync(path.join(evidence,label+'-'+rep+'-page-'+index+'.json'),JSON.stringify({index,rep,result,arrivals,transportFaults,browserFailures:failures.slice(failureStart),dom},null,2));
    allTimes.push(...result.latencies);pageResults.push({index,valid:result.valid,count:result.latencies.length,faults:result.faults});assert(result.valid,JSON.stringify(result.faults.slice(0,8)));
   }
   const result={label,rep,warmup:rep===0,started,finished:new Date().toISOString(),idleSamples:idle,idleConditionMet:idle.at(-1).idle>=90,count:allTimes.length,valid:pageResults.every(r=>r.valid),percentilesMs:percentiles(allTimes),...(rep===0?{first200Ms:percentiles(allTimes.slice(0,200)),first200MaximumMs:Math.max(...allTimes.slice(0,200))}:{}),pages:pageResults};
   report.runs.push(result);report.profiles[label].repetitions.push(result);console.log(JSON.stringify({...result,pages:result.pages.length}));fs.writeFileSync(path.join(evidence,'progress.json'),JSON.stringify(report,null,2));
  }
  const profile=report.profiles[label];profile.medianMs=medianRepetitions(profile.repetitions.slice(1));profile.timingBoundMet=browserKind==='chromium'?profile.medianMs.p99<5:null;profile.idleConditionMet=profile.repetitions.every(r=>r.idleConditionMet);profile.formalNativeGatePassed=browserKind==='chromium'?profile.timingBoundMet&&profile.idleConditionMet:null;
  await session.close();session=null;await replay.close();replay=null;
 }
 report.completed=true;
}catch(e){report.error=String(e);process.exitCode=1;if(session)fs.writeFileSync(path.join(evidence,'partial.json'),JSON.stringify({records:session.records().filter(r=>fixtures.has(r.url)),arrivals:replay?.arrivals,faults:replay?.faults},null,2));}
finally{if(session)await session.close();if(replay)await replay.close();fs.rmSync(root,{recursive:true,force:true});report.cleanup={removed:!fs.existsSync(root)};report.finished=new Date().toISOString();fs.writeFileSync(path.join(evidence,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({completed:report.completed,error:report.error}));}
