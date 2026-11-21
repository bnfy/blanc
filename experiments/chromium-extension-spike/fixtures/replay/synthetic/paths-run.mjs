import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';
import {sha} from './generate.mjs';import {pathFixtures,entryUrl} from './paths-fixtures.mjs';import {startSynthetic} from './transport.mjs';import {createCertificateSet} from './certificate-set.mjs';import {openSession,pause} from './session.mjs';
import {comparePathRuns} from './paths-compare.mjs';
const [configPath,evidence,mode]=process.argv.slice(2),config=JSON.parse(fs.readFileSync(configPath));assert([undefined,'controlled','no-referrer'].includes(mode));assert(evidence&&!fs.existsSync(evidence));fs.mkdirSync(evidence);
const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'blanc-f12-paths-')));const {fixtures,cases}=pathFixtures({controlledService:mode==='controlled',noReferrer:mode==='no-referrer'});
const certificates=createCertificateSet(path.join(root,'certificates'),[...new Set([...fixtures.keys()].map(u=>new URL(u).hostname))]);
fs.writeFileSync(path.join(evidence,'fixtures.json'),JSON.stringify([...fixtures],null,2));fs.writeFileSync(path.join(evidence,'cases.json'),JSON.stringify(cases,null,2));
const report={mode:mode||'uncontrolled',started:new Date().toISOString(),passed:false,acceptance:false,fixtureSha256:sha(JSON.stringify([...fixtures])),sources:{},runs:[],remainingGaps:['service-worker controlled fetch/cache and update variants','worker sender teardown','opaque/subframes','redirect method/header mutation and replacement URLs']};
for(const name of ['paths-run.mjs','paths-fixtures.mjs','paths-compare.mjs','session.mjs','transport.mjs','worker-observer.mjs','worker-context.mjs','shared-client-observer.mjs','shared-client-context.mjs','service-script-context.mjs'])report.sources[name]=sha(fs.readFileSync(new URL(name,import.meta.url)));
let session,replay;
try{
 for(const browserKind of ['electron','chromium'])for(const kind of ['regular','private'])for(const letter of ['a','b']){
  const label=[browserKind,kind,letter].join('-');replay=await startSynthetic({fixtures,tlsMaterial:certificates});
  session=await openSession({config,browserKind,kind,label,root,transport:replay,certificates,workerObservation:true,fixtureUrls:[...fixtures.keys()]});
  const unexpectedPageRequests=[];session.page.on('request',r=>{if(/^https?:/.test(r.url())&&!fixtures.has(r.url()))unexpectedPageRequests.push(r.url());});
  await session.page.goto(entryUrl,{waitUntil:'domcontentloaded',timeout:60000});await session.page.waitForFunction(()=>window.pathProbe?.done,null,{timeout:180000});await pause(400);
  const dom=await session.page.evaluate(()=>window.pathProbe);await session.close();
  const all=session.records();const run={label,browserKind,kind,source:session.source,workerEvidence:session.workerEvidence(),dom,records:all.filter(r=>fixtures.has(r.url)),observerFaults:all.filter(r=>r.fault),unexpectedPageRequests,arrivals:replay.arrivals,faults:replay.faults,complete:!dom.results.some(r=>r.outcome==='timeout')};
  fs.writeFileSync(path.join(evidence,label+'.json'),JSON.stringify(run,null,2));report.runs.push({label,requests:run.records.length,complete:run.complete,results:dom.results});
  session=null;await replay.close();replay=null;assert(run.complete,'fixture timeout');console.log(JSON.stringify({label,requests:run.records.length,results:dom.results}));
 }
 const comparison={profiles:{},fullAcceptance:false};
 for(const kind of ['regular','private']){
  const read=label=>JSON.parse(fs.readFileSync(path.join(evidence,label+'.json')));
  comparison.profiles[kind]=comparePathRuns(...['electron','chromium'].flatMap(b=>['a','b'].map(l=>read(b+'-'+kind+'-'+l))),fixtures,cases);
 }
 fs.writeFileSync(path.join(evidence,'comparison.json'),JSON.stringify(comparison,null,2));
 report.passed=Object.values(comparison.profiles).every(r=>r.valid&&!r.results.some(c=>c.status==='failed'));
 if(!report.passed)process.exitCode=1;
}catch(e){report.error=String(e);process.exitCode=1;if(session){const partial={records:session.records(),arrivals:replay?.arrivals,faults:replay?.faults,dom:await session.page.evaluate(()=>window.pathProbe).catch(()=>null)};fs.writeFileSync(path.join(evidence,'partial.json'),JSON.stringify(partial,null,2));}}
finally{if(session)await session.close();if(replay)await replay.close();fs.rmSync(root,{recursive:true,force:true});report.cleanup={removed:!fs.existsSync(root)};report.finished=new Date().toISOString();fs.writeFileSync(path.join(evidence,'report.json'),JSON.stringify(report,null,2));}
