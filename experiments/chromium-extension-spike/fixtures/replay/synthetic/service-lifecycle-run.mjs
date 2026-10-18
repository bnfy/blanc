// Bounded behavior probe. Raw hook/worker observations remain evidence, not a
// claim that the full service-worker request-context matrix is resolved.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';
import {startSynthetic} from './transport.mjs';import {createCertificateSet} from './certificate-set.mjs';import {openSession,pause} from './session.mjs';import {scriptLiteral} from '../../../script-literal.mjs';import {sha} from './generate.mjs';
const [configPath,evidence]=process.argv.slice(2),config=JSON.parse(fs.readFileSync(configPath));assert(evidence&&!fs.existsSync(evidence));fs.mkdirSync(evidence);
const origin='https://page.blanc-fixture.test',base=origin+'/blanc-fixture/service-life/',entry=base+'index.html',worker=base+'worker.js',failed=base+'missing.js',network=base+'network',cached=base+'cached',blocked='https://000491b06a.com/blanc-fixture/service-life/blocked';
const fixtures=new Map();const add=(url,body,contentType='text/plain',status=200)=>fixtures.set(url,{body,contentType,status});
add(entry,'<!doctype html><link rel="icon" href="data:,"><title>Service lifecycle</title>','text/html');add(origin+'/favicon.ico','','image/x-icon');add(failed,'missing authored script','application/javascript',404);add(network,'network response');add(cached,'NETWORK CACHE MISS');add(blocked,'BLOCKER MISS');
const source=version=>`const version=${scriptLiteral(version)};oninstall=e=>e.waitUntil((async()=>{const c=await caches.open('fixture-cache');await c.put(${scriptLiteral(cached)},new Response('cached response'));await skipWaiting();})());onactivate=e=>e.waitUntil(clients.claim());onfetch=e=>{if(e.request.url===${scriptLiteral(cached)})e.respondWith(caches.match(e.request));else e.respondWith(fetch(e.request));};onmessage=e=>e.ports[0].postMessage(version);`;
add(worker,source('v1'),'application/javascript');fs.writeFileSync(path.join(evidence,'fixtures.json'),JSON.stringify([...fixtures],null,2));fs.writeFileSync(path.join(evidence,'replacement.js'),source('v2'));
const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'blanc-service-life-'))),certificates=createCertificateSet(path.join(root,'certificates'),[new URL(origin).hostname,new URL(blocked).hostname]);
const report={started:new Date().toISOString(),behaviorPassed:false,acceptance:false,updateMode:'same-url-registration-update',sources:{},runs:[],gaps:['strict per-request controlled-fetch context comparison','failed script correlation without worker realm','unchanged-byte update and HTTP validator/cache variants','client reassignment during in-flight requests','cache eviction and worker restart']};
for(const name of ['service-lifecycle-run.mjs','session.mjs','transport.mjs','worker-observer.mjs'])report.sources[name]=sha(fs.readFileSync(new URL(name,import.meta.url)));
let session,replay;
try{for(const browserKind of ['electron','chromium'])for(const kind of ['regular','private'])for(const repetition of ['a','b']){
 add(worker,source('v1'),'application/javascript');const replacement=base+'replacement.js';add(replacement,source('v2'),'application/javascript');
 const label=[browserKind,kind,repetition].join('-');replay=await startSynthetic({fixtures,tlsMaterial:certificates});session=await openSession({config,browserKind,kind,label,root,transport:replay,certificates,workerObservation:true,fixtureUrls:[...fixtures.keys()]});await session.page.goto(entry);
 const outcome=await session.page.evaluate(async urls=>{
  const bounded=p=>Promise.race([p,new Promise((_,reject)=>setTimeout(()=>reject(Error('lifecycle timeout')),15000))]);
  const activated=async reg=>{const w=reg.installing||reg.waiting||reg.active;if(w.state!=='activated')await bounded(new Promise((ok,no)=>w.addEventListener('statechange',()=>{if(w.state==='activated')ok();if(w.state==='redundant')no(Error('redundant'));})));return w;};
  const version=()=>bounded(new Promise(resolve=>{const c=new MessageChannel();c.port1.onmessage=e=>{c.port1.close();resolve(e.data);};navigator.serviceWorker.controller.postMessage('version',[c.port2]);}));
  let failedRegistration=false;try{await navigator.serviceWorker.register(urls.failed,{scope:urls.base+'failed/'});}catch{failedRegistration=true;}
  const reg=await navigator.serviceWorker.register(urls.worker,{scope:urls.base});await activated(reg);if(!navigator.serviceWorker.controller)await bounded(new Promise(ok=>navigator.serviceWorker.addEventListener('controllerchange',ok,{once:true})));
  const before=await version(),networkBody=await(await fetch(urls.network)).text(),cacheBody=await(await fetch(urls.cached)).text();let blockedOutcome;try{blockedOutcome=await(await fetch(urls.blocked)).text();}catch{blockedOutcome='error';}
  return {failedRegistration,before,networkBody,cacheBody,blockedOutcome};
 },{base,worker,failed,network,cached,blocked,replacement});
 // Change only the response bytes, then exercise the browser's update algorithm.
 add(worker,source('v2'),'application/javascript');
 outcome.after=await session.page.evaluate(async base=>{
  const bounded=p=>Promise.race([p,new Promise((_,reject)=>setTimeout(()=>reject(Error('update timeout')),15000))]);
  const old=navigator.serviceWorker.controller,reg=await navigator.serviceWorker.getRegistration(base);
  const changed=bounded(new Promise(ok=>navigator.serviceWorker.addEventListener('controllerchange',()=>{if(navigator.serviceWorker.controller!==old)ok();},{once:true})));
  await reg.update();await changed;
  return bounded(new Promise(resolve=>{const c=new MessageChannel();c.port1.onmessage=e=>{c.port1.close();resolve(e.data);};navigator.serviceWorker.controller.postMessage('version',[c.port2]);}));
 },base);await pause(300);await session.close();
 const all=session.records(),run={label,outcome,source:session.source,records:all.filter(row=>fixtures.has(row.url)),observerFaults:all.filter(row=>row.fault),workerEvidence:session.workerEvidence(),arrivals:replay.arrivals,faults:replay.faults};fs.writeFileSync(path.join(evidence,label+'.json'),JSON.stringify(run,null,2));
 assert.deepEqual(outcome,{failedRegistration:true,before:'v1',networkBody:'network response',cacheBody:'cached response',blockedOutcome:'error',after:'v2'});assert.equal(replay.arrivals.filter(row=>row.url===cached||row.url===blocked).length,0);assert.deepEqual(replay.arrivals.filter(row=>row.url===worker).map(row=>row.sha256),[sha(source('v1')),sha(source('v2'))]);assert.equal(run.workerEvidence.faults.length,0);
 const background=new Set(['clients2.google.com','www.google.com:443','accounts.google.com:443']);assert.equal(replay.faults.filter(f=>!(['plaintext-refused','connect-refused'].includes(f.code)&&background.has(f.authority))).length,0);assert.equal(run.observerFaults.length,0);
 report.runs.push({label,outcome,cacheNetworkArrivals:0,blockedNetworkArrivals:0,rejectedBackgroundConnections:replay.faults.length,workerObservationFaults:run.workerEvidence.faults,contextAcceptance:false});session=null;await replay.close();replay=null;console.log(label+' behavior passed');
}report.behaviorPassed=true;}catch(error){report.error=String(error);process.exitCode=1;}finally{if(session)await session.close();if(replay)await replay.close();fs.rmSync(root,{recursive:true,force:true});report.cleanup={removed:!fs.existsSync(root)};report.finished=new Date().toISOString();fs.writeFileSync(path.join(evidence,'report.json'),JSON.stringify(report,null,2));}
