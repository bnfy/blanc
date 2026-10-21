// Observe the real uBO providers over identical, complete authored responses.
// No latency qualification and no real-web block-rate claim.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';
import {startSynthetic} from './transport.mjs';import {createCertificateSet} from './certificate-set.mjs';import {openSession,pause} from './session.mjs';import {pageUrl,pageResponse} from './page.mjs';import {sha} from './generate.mjs';
const [configPath,corpus,payload,evidence,mode='full']=process.argv.slice(2),config=JSON.parse(fs.readFileSync(configPath));assert(!fs.existsSync(evidence));fs.mkdirSync(evidence);
const manifest=JSON.parse(fs.readFileSync(path.join(corpus,'candidate-manifest.json'))),fixtures=new Map(JSON.parse(fs.readFileSync(path.join(corpus,'responses.json'))));
const candidates=mode==='probe'?manifest.candidates.slice(0,24):manifest.candidates;
assert(new Set(candidates.map(c=>c.url)).size===candidates.length);
const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'blanc-ubo-parity-'))),certificates=createCertificateSet(path.join(root,'certificates'),[...new Set([...fixtures.keys()].map(u=>new URL(u).hostname))]);
const report={started:new Date().toISOString(),scope:'synthetic uBO corpus decision and authored behavior comparison; regular profile only',candidateCount:candidates.length,mode,latencyMeasured:false,nativeBuilds:0,fullAcceptance:false,runs:[],sources:{},gaps:['private uBO intentionally disabled; private Ghostery previously tested','cosmetic and scriptlet outcomes','broader request-path coverage','privilege containment','cross-runtime update-script identity']};
for(const name of ['ubo-parity-run.mjs','session.mjs','page.mjs','transport.mjs'])report.sources[name]=sha(fs.readFileSync(new URL(name,import.meta.url)));
report.corpusSha256=sha(fs.readFileSync(path.join(corpus,'candidate-manifest.json')));report.responsesSha256=sha(fs.readFileSync(path.join(corpus,'responses.json')));
let session,replay;
try{
 for(const browserKind of ['electron','chromium'])for(const repetition of ['a','b']){
  const label=browserKind+'-'+repetition;replay=await startSynthetic({fixtures,tlsMaterial:certificates});session=await openSession({config,browserKind,kind:'regular',label,root,transport:replay,certificates,provider:'ublock-origin',uboPayload:payload});
  await session.uboConfigure();const metadata=await session.uboMetadata();assert.equal(metadata.autoUpdate,false);const pages=[];
  for(let index=0;index<candidates.length;index+=200){
   const batch=candidates.slice(index,index+200);fixtures.set(pageUrl,pageResponse(batch));
   const start=(await session.uboRecords()).length,arrivalStart=replay.arrivals.length,faultStart=replay.faults.length;
   await session.page.goto(pageUrl,{waitUntil:'commit',timeout:60000});await session.page.waitForFunction(()=>window.pilot?.done,null,{timeout:180000});await pause(300);
   const dom=await session.page.evaluate(()=>({loads:window.pilot.loads,executed:window.blancFixtureExecuted||[],children:window.blancFixtureChildren||[]}));
   const rows=(await session.uboRecords()).slice(start),arrivals=replay.arrivals.slice(arrivalStart),faults=replay.faults.slice(faultStart);
   assert.equal(dom.loads.length,batch.length);assert(!dom.loads.some(l=>l.event==='timeout'));
   assert(!faults.some(f=>f.code==='unmanifested-request'),'unmanifested traffic');
   const nativeRoot=rows.find(r=>r.input?.type==='main_frame'&&r.input.url===pageUrl);
   const normalized=batch.map(c=>{
    const matches=rows.filter(r=>(r.input?.url||r.url)===c.url);assert.equal(matches.length,1,label+' '+c.id+' decision count');const row=matches[0];
    if(browserKind==='electron'){assert.equal(row.provider,'ublock-origin');assert.equal(row.status.phase,'ready');}
    const input=row.input;
    const context=browserKind==='electron'?{method:row.method,type:row.resourceType,initiator:row.initiatorOriginPresent?row.initiatorOrigin:'absent',top:row.frame?.topOrigin,profile:row.profileKind,main:row.frame?.url===row.frame?.topUrl}:{method:input.method,type:input.type==='xmlhttprequest'?'xhr':input.type,initiator:Object.hasOwn(input,'initiator')?input.initiator:'absent',top:nativeRoot&&input.tabId===nativeRoot.input.tabId?new URL(nativeRoot.input.url).origin:null,profile:session.source.isOffTheRecord?'private':'regular',main:input.frameId===0&&input.parentFrameId===-1};
    assert.equal(context.type,c.resourceType);assert.equal(context.top,new URL(pageUrl).origin);assert.equal(context.initiator,new URL(pageUrl).origin);assert(context.main);
    const result=row.result,decision=result.cancel?'block':result.redirectUrl||result.redirectURL?'redirect':'allow';
    return {id:c.id,url:c.url,type:c.resourceType,context,decision,redirect:result.redirectUrl||result.redirectURL||null,event:dom.loads.find(l=>l.id===c.id).event,arrived:arrivals.some(a=>a.url===c.url),executed:dom.executed.includes(c.id),child:dom.children.includes(c.id)};
   });
   assert(normalized.every(r=>r.decision!=='block'||!r.arrived),'blocked original reached proxy');
   pages.push({index,normalized,dom,rows,arrivals,faults});fs.writeFileSync(path.join(evidence,label+'-page-'+index+'.json'),JSON.stringify(pages.at(-1)));console.log(label+' '+Math.min(index+200,candidates.length)+'/'+candidates.length);
  }
  fs.writeFileSync(path.join(evidence,label+'.json'),JSON.stringify({source:session.source,metadata,pages},null,2));report.runs.push({label,candidates:pages.flatMap(p=>p.normalized).length});
  await session.close();session=null;await replay.close();replay=null;
 }
 const load=label=>JSON.parse(fs.readFileSync(path.join(evidence,label+'.json'))).pages.flatMap(p=>p.normalized);
 report.metadata=Object.fromEntries(report.runs.map(r=>[r.label,JSON.parse(fs.readFileSync(path.join(evidence,r.label+'.json'))).metadata]));
 const electron=load('electron-a'),native=load('chromium-a');
 // Redirect destinations are compared literally: any ID translation must be
 // explicit evidence, never quietly treated as an equivalent allow decision.
 const differences=(a,b)=>a.flatMap((r,i)=>JSON.stringify(r)===JSON.stringify(b[i])?[]:[{electron:r,chromium:b[i]}]);
 report.electronStability=differences(electron,load('electron-b'));report.chromiumStability=differences(native,load('chromium-b'));report.differences=differences(electron,native);
 report.counts=Object.fromEntries(['electron','chromium'].map((k,i)=>[k,[electron,native][i].reduce((out,r)=>(out[r.decision]=(out[r.decision]||0)+1,out),{})]));
 report.completed=true;report.parityPassed=!report.electronStability.length&&!report.chromiumStability.length&&!report.differences.length;
}catch(error){report.error=String(error);process.exitCode=1;}
finally{
 if(session){fs.writeFileSync(path.join(evidence,'partial.json'),JSON.stringify({source:session.source,records:await session.uboRecords(),arrivals:replay?.arrivals,faults:replay?.faults},null,2));await session.close();}
 if(replay)await replay.close();fs.rmSync(root,{recursive:true,force:true});report.cleanup={removed:!fs.existsSync(root)};report.finished=new Date().toISOString();fs.writeFileSync(path.join(evidence,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
