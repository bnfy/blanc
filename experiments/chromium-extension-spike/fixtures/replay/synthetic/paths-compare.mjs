import {correlateWorker} from './worker-context.mjs';
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {sha} from './generate.mjs';
const controls=new Set(['https://page.blanc-fixture.test/favicon.ico']);
const services=new Set(['clients2.google.com','www.google.com:443','accounts.google.com:443']);
export function normalizePathRun(run,fixtures){
 const faults=[],map=new Map(),ids=new Map();
 if(!run.complete||run.observerFaults?.length||run.unexpectedPageRequests?.length)faults.push('incomplete-or-observer-fault');
 for(const f of run.faults||[])if(!(['plaintext-refused','connect-refused'].includes(f.code)&&services.has(f.authority)))faults.push('transport:'+f.code);
 const arrivals=new Map();for(const a of run.arrivals){if(arrivals.has(a.url))faults.push('duplicate-arrival');arrivals.set(a.url,a);if(!fixtures.has(a.url))faults.push('unmanifested-arrival');}
 for(const r of run.records){
  if(controls.has(r.url))continue;
  if(map.has(r.url))faults.push('ambiguous-request');if(!fixtures.has(r.url))faults.push('unmanifested-decision');
  let x;
  if(run.browserKind==='electron'){
   if(r.status?.phase!=='ready'||r.result?.redirectURL)faults.push('invalid-electron-decision');
   const hop=ids.get(r.requestId)||0;ids.set(r.requestId,hop+1);
   x={url:r.url,method:r.method,type:r.resourceType,referrer:r.referrer,initiatorPresent:r.initiatorOriginPresent,initiator:r.initiatorOriginPresent?r.initiatorOrigin:'absent',top:r.resourceType==='mainFrame'?new URL(r.url).origin:r.frame?.topOrigin||'unresolved',role:r.resourceType==='mainFrame'?'main':r.frame?(r.frame.url===r.frame.topUrl?'main':'sub'):'unresolved',profile:r.profileKind,hop,decision:r.result?.cancel===true?'block':'allow'};
  }else{
   if(r.status!=='ready'||![0,1].includes(r.engine_result)||r.decision!==(r.engine_result===0?'allow':'block'))faults.push('invalid-native-decision');
   x={url:r.url,method:r.method,type:r.resource_type,referrer:r.referrer,initiatorPresent:r.initiator_present,initiator:r.initiator_origin,top:r.top_frame_origin,role:r.frame_role,profile:r.profile_kind,hop:r.redirect_index,decision:r.decision};
  }
  if(x.top==='unresolved'||x.role==='unresolved'){const worker=correlateWorker(run,r);x.worker={status:worker.status,reason:worker.reason,context:worker.context};}
  if(x.profile!==run.kind||typeof x.initiatorPresent!=='boolean'||(x.initiatorPresent?x.initiator==='absent':x.initiator!=='absent'))faults.push('invalid-context');
  const a=arrivals.get(r.url);
  if(x.decision==='block'&&a)faults.push('blocked-arrival');
  if(x.decision==='allow'&&(!a||a.sha256!==sha(fixtures.get(r.url)?.body||'')))faults.push('allowed-body-missing');
  map.set(r.url,x);
 }
 for(const a of run.arrivals)if(!controls.has(a.url)&&!map.has(a.url))faults.push('arrival-without-decision');
 return {faults,observations:[...map.values()].sort((a,b)=>a.url.localeCompare(b.url))};
}
export function comparePathRuns(electronA,electronB,nativeA,nativeB,fixtures,cases){
 const runs=[electronA,electronB,nativeA,nativeB],normalized=runs.map(r=>normalizePathRun(r,fixtures));const faults=normalized.flatMap((r,i)=>r.faults.map(f=>runs[i].label+':'+f));
 for(const [a,b] of [[0,1],[2,3]])if(JSON.stringify(normalized[a].observations)!==JSON.stringify(normalized[b].observations)||JSON.stringify(runs[a].dom)!==JSON.stringify(runs[b].dom))faults.push('unstable-'+runs[a].browserKind);
 const e=new Map(normalized[0].observations.map(r=>[r.url,r])),n=new Map(normalized[2].observations.map(r=>[r.url,r])),results=[];
 // Check reachability against each browser's own observed predecessor decision.
 // Two equally incomplete recordings are not a stable successful graph.
 for(const [which,map] of [['electron',e],['chromium',n]])for(const c of cases){
  for(let i=0;i<c.hops.length;i++){
   const url=c.hops[i],parent=c.hops.find(p=>fixtures.get(p)?.location===url);
   const worker=['dedicated','shared','service'].includes(c.kind);
   const shouldIssue=i===0?true:parent?map.get(parent)?.decision==='allow':worker?map.get(c.hops[0])?.decision==='allow':false;
   if(shouldIssue&&!map.has(url))faults.push(which+':missing-required-hop:'+url);
   if(!shouldIssue&&map.has(url))faults.push(which+':unreachable-hop-issued:'+url);
  }
 }

 for(const c of cases){
  const differences=[],gaps=[],observed=[];
  for(const url of c.hops){
   const left=e.get(url),right=n.get(url);
   if(!left&&!right){observed.push({url,issued:false});continue;}
   if(!left||!right){differences.push({url,reason:'missing-observation'});continue;}
   observed.push({url,issued:true,decision:left.decision,hop:left.hop,...(left.worker?.status==='resolved'&&right.worker?.status==='resolved'?{workerContext:left.worker.context}:{} )});
   for(const key of ['method','type','referrer','initiatorPresent','initiator','profile','hop','decision'])if(left[key]!==right[key])differences.push({url,field:key,electron:left[key],chromium:right[key]});
   if([left.top,right.top,left.role,right.role].includes('unresolved')){
    if(left.worker?.status==='resolved'&&right.worker?.status==='resolved'){
     if(JSON.stringify(left.worker.context)!==JSON.stringify(right.worker.context))differences.push({url,reason:'worker-context-mismatch',electron:left.worker.context,chromium:right.worker.context});
    }else gaps.push({url,reason:'top-frame-or-role-unresolved',electron:{top:left.top,role:left.role,worker:left.worker},chromium:{top:right.top,role:right.role,worker:right.worker}});
   }
   else for(const key of ['top','role'])if(left[key]!==right[key])differences.push({url,field:key,electron:left[key],chromium:right[key]});
  }
  if(c.kind!=='navigation'){
   const a=electronA.dom.results.find(r=>r.id===c.id),b=nativeA.dom.results.find(r=>r.id===c.id);
   if(!a||!b||a.outcome==='timeout'||JSON.stringify(a)!==JSON.stringify(b))differences.push({reason:'DOM-or-worker-outcome-difference'});
   if(['dedicated','shared','service'].includes(c.kind)&&(a?.outcome!=='load'||b?.outcome!=='load'))gaps.push({reason:'worker-subrequests-not-exercised'});
  }
  if(!observed.some(r=>r.issued))differences.push({reason:'case-not-issued'});
  results.push({id:c.id,status:differences.length?'failed':gaps.length?'gap':'passed',differences,gaps,observed});
 }
 if(JSON.stringify(electronA.dom.scripts)!==JSON.stringify(nativeA.dom.scripts))faults.push('script-execution-difference');
 const covered=new Set(cases.flatMap(c=>c.hops));for(const url of new Set([...e.keys(),...n.keys()]))if(!covered.has(url))faults.push('unexplained-request');
 return {valid:faults.length===0,faults,results,fullAcceptance:false,scope:'authored GET redirects; live-owner dedicated/shared probes; service-worker imports and message-triggered fetches with independently observed controlled-client sets; no general worker acceptance'};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const dir=process.argv[2],fixtures=new Map(JSON.parse(fs.readFileSync(path.join(dir,'fixtures.json')))),cases=JSON.parse(fs.readFileSync(path.join(dir,'cases.json'))),summary={profiles:{},fullAcceptance:false};
 for(const kind of ['regular','private']){const read=label=>JSON.parse(fs.readFileSync(path.join(dir,label+'.json')));summary.profiles[kind]=comparePathRuns(...['electron','chromium'].flatMap(b=>['a','b'].map(l=>read(b+'-'+kind+'-'+l))),fixtures,cases);}
 fs.writeFileSync(path.join(dir,'comparison.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));
 if(Object.values(summary.profiles).some(r=>!r.valid||r.results.some(c=>c.status==='failed')))process.exitCode=1;
}
