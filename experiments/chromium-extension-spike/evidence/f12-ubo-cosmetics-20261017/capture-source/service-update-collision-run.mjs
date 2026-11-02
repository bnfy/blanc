// Two real registrations share one script URL. Capture phase boundaries without
// treating call order, scope hints, URL or time as a hook-to-registration join.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';
import {startSynthetic} from './transport.mjs';import {createCertificateSet} from './certificate-set.mjs';import {openSession,pause} from './session.mjs';import {sha} from './generate.mjs';import {correlateWorker} from './worker-context.mjs';
const [configPath,evidence]=process.argv.slice(2),config=JSON.parse(fs.readFileSync(configPath));assert(!fs.existsSync(evidence));fs.mkdirSync(evidence);
const origin='https://page.blanc-fixture.test',base=origin+'/blanc-fixture/registration/',worker=base+'worker.js',entry=base+'index.html',scopes=[base+'a/',base+'b/'];
const body="oninstall=e=>e.waitUntil(skipWaiting());onactivate=e=>e.waitUntil(clients.claim());";
const fixtures=new Map([[entry,{status:200,contentType:'text/html',body:'<!doctype html><link rel="icon" href="data:,"><title>Two registration update probe</title>'}],[worker,{status:200,contentType:'application/javascript',body}]]);
const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'blanc-service-collision-'))),certificates=createCertificateSet(path.join(root,'certificates'),[new URL(origin).hostname]);
fs.writeFileSync(path.join(evidence,'fixtures.json'),JSON.stringify([...fixtures],null,2));
const report={started:new Date().toISOString(),completed:false,contextAcceptance:false,scope:'two simultaneous same-URL unchanged-byte registration updates',nativeBuilds:0,latencyMeasured:false,runs:[],sources:{}};
for(const f of ['service-update-collision-run.mjs','session.mjs','worker-observer.mjs','worker-context.mjs','service-script-context.mjs'])report.sources[f]=sha(fs.readFileSync(new URL(f,import.meta.url)));
let session,replay;
try{for(const browserKind of ['electron','chromium'])for(const kind of ['regular','private'])for(const repetition of ['a','b']){
 const label=[browserKind,kind,repetition].join('-');replay=await startSynthetic({fixtures,tlsMaterial:certificates});session=await openSession({config,browserKind,kind,label,root,transport:replay,certificates,workerObservation:true,fixtureUrls:[...fixtures.keys()]});await session.page.goto(entry);
 const before=await session.page.evaluate(async({worker,scopes})=>{
  const registrations=await Promise.all(scopes.map(async scope=>{const r=await navigator.serviceWorker.register(worker,{scope});const w=r.installing||r.waiting||r.active;if(w.state!=='activated')await new Promise((ok,no)=>{const t=setTimeout(()=>no(Error('activate timeout')),15000);w.addEventListener('statechange',()=>{if(w.state==='activated'){clearTimeout(t);ok();}});});return {scope:r.scope,scriptURL:r.active.scriptURL,state:r.active.state};}));return registrations.sort((a,b)=>a.scope.localeCompare(b.scope));
 },{worker,scopes});
 const initial=session.records().filter(r=>r.url===worker);assert.equal(initial.length,2);
 const after=await session.page.evaluate(async scopes=>{await Promise.all(scopes.map(async scope=>{const r=await navigator.serviceWorker.getRegistration(scope);await r.update();}));return Promise.all(scopes.map(async scope=>{const r=await navigator.serviceWorker.getRegistration(scope);return {scope:r.scope,scriptURL:r.active.scriptURL,state:r.active.state,installing:!!r.installing,waiting:!!r.waiting};}));},scopes);await pause(300);await session.close();
 const run={label,browserKind,kind,source:session.source,before,after,records:session.records().filter(r=>fixtures.has(r.url)),workerEvidence:session.workerEvidence(),arrivals:replay.arrivals,faults:replay.faults};
 const scripts=run.records.filter(r=>r.url===worker);assert.equal(scripts.length,4);assert.equal(run.workerEvidence.faults.length,0);
 assert(after.every((r,i)=>r.scope===scopes[i]&&r.scriptURL===worker&&r.state==='activated'&&!r.installing&&!r.waiting));
 const versions=run.workerEvidence.events.flatMap(e=>e.method==='ServiceWorker.workerVersionUpdated'?e.params.versions:[]).filter(v=>v.scriptURL===worker);
 const identities=[...new Map(versions.filter(v=>v.targetId).map(v=>[v.versionId,{versionId:v.versionId,registrationId:v.registrationId,targetId:v.targetId}])).values()];assert.equal(identities.length,2);assert.equal(new Set(identities.map(v=>v.registrationId)).size,2);assert.equal(new Set(identities.map(v=>v.targetId)).size,2);
 const registrations=run.workerEvidence.events.flatMap(e=>e.method==='ServiceWorker.workerRegistrationUpdated'?e.params.registrations:[]);
 for(const id of identities)assert(registrations.some(r=>r.registrationId===id.registrationId&&scopes.includes(r.scopeURL)));
 const updates=scripts.slice(2).map(row=>({hookRequestId:row.requestId??row.loader_request_id,factory:row.factory_instance??null,correlation:correlateWorker(run,row)}));assert(updates.every(r=>r.correlation.status==='gap'));
 assert.equal(replay.arrivals.filter(a=>a.url===worker).length,4);assert(replay.arrivals.filter(a=>a.url===worker).every(a=>a.sha256===sha(body)));
 fs.writeFileSync(path.join(evidence,label+'.json'),JSON.stringify({...run,identities,updates},null,2));report.runs.push({label,registrations:2,scriptRequests:4,updateGaps:updates.map(r=>r.correlation.reason)});await replay.close();replay=null;session=null;console.log(label+' captured two distinct registrations; update identities remain gaps');
}report.completed=true;}catch(error){report.error=String(error);process.exitCode=1;}
finally{if(session){fs.writeFileSync(path.join(evidence,'partial.json'),JSON.stringify({source:session.source,records:session.records(),workerEvidence:session.workerEvidence(),arrivals:replay?.arrivals},null,2));await session.close();}if(replay)await replay.close();fs.rmSync(root,{recursive:true,force:true});report.cleanup={removed:!fs.existsSync(root)};report.finished=new Date().toISOString();fs.writeFileSync(path.join(evidence,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
