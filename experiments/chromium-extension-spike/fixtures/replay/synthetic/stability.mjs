// Synthetic-only adapter of the reviewed pipeline stability gate. Public recording admission stays unchanged.
import {createHash} from 'node:crypto';
const hash=s=>createHash('sha256').update(s).digest('hex');
const canonical=v=>JSON.stringify(v,Object.keys(v).sort());
function normalize(run, faults) {
  const map=new Map();
  if(!run.complete||!Array.isArray(run.records)||!run.records.length||!Array.isArray(run.faults)||run.faults.length||!Array.isArray(run.arrivals)){faults.push('incomplete-or-faulted-run');return map;}
  const roots=new Map();
  for(const r of run.records)if(r.resourceType==='mainFrame'){
    if(roots.has(r.profileKind))faults.push('multiple-navigation-roots');
    roots.set(r.profileKind,r.url);
  }
  const arrivals=new Map();
  for(const a of run.arrivals||[]){if(arrivals.has(a.url))faults.push('ambiguous-response-selection');arrivals.set(a.url,a);}
  for(const r of run.records){
    const root=roots.get(r.profileKind);if(!root){faults.push('missing-root');continue;}
    if(!['regular','private'].includes(r.profileKind)||r.error||r.status?.phase!=='ready'||r.result?.redirectURL){faults.push('invalid-decision');continue;}
    if(!['mainFrame','script','xhr','image','stylesheet'].includes(r.resourceType)||!r.frame||r.frame.url!==r.frame.topUrl){faults.push('unsupported-frame-or-type');continue;}
    if(r.method!=='GET'||typeof r.initiatorOriginPresent!=='boolean'||(!r.initiatorOriginPresent&&r.initiatorOrigin!==null)){faults.push('invalid-context');continue;}
    if(typeof r.referrer!=='string'||!r.result||typeof r.result!=='object'||Array.isArray(r.result)||('cancel' in r.result&&typeof r.result.cancel!=='boolean')){faults.push('incomplete-decision');continue;}
    const nav=r.resourceType==='mainFrame';
    if(!nav&&(r.frame.topUrl!==root||typeof r.frame.topOrigin!=='string'||r.frame.topOrigin!==new URL(root).origin)){faults.push('unresolved-top-frame');continue;}
    if(r.initiatorOriginPresent&&(!r.initiatorOrigin||r.initiatorOrigin==='null')){faults.push('opaque-or-unresolved-initiator');continue;}
    const context={url:r.url,method:r.method,resource_type:r.resourceType,
      initiator_origin:r.initiatorOriginPresent?r.initiatorOrigin:'absent',
      top_frame_origin:nav?new URL(r.url).origin:r.frame.topOrigin,
      frame_role:'main',profile_kind:r.profileKind,redirect_index:0};
    const key=hash(canonical(context));
    if(map.has(key)){faults.push('ambiguous-repeated-request');continue;}
    const decision=r.result?.cancel?'block':'allow',arrival=arrivals.get(r.url);
    if(decision==='allow'&&(!arrival||typeof arrival.sha256!=='string'||!arrival.sha256))faults.push('missing-allowed-response');
    if(decision==='block'&&arrival)faults.push('blocked-request-arrived');
    map.set(key,{id:key,context,decision,parent:nav?null:root,
      responseSha256:arrival?.sha256||null,engineSource:r.referrer});
  }
  for(const url of arrivals.keys())if(!run.records.some(r=>r.url===url))faults.push('unexpected-transport-request');
  return map;
}
export function compareReplays(left,right) {
  const faults=[];
  for(const run of [left,right])if(!['appSha','bootstrapSha','engineSha','filtersSha','electron','chromium','policySha'].every(k=>typeof run.environment?.[k]==='string'&&run.environment[k]))faults.push('missing-environment');
  if(!left.runId||left.runId===right.runId||!left.bundleSha256||left.bundleSha256!==right.bundleSha256||
     !left.environment||JSON.stringify(left.environment)!==JSON.stringify(right.environment))faults.push('run-isolation-or-environment');
  const a=normalize(left,faults),b=normalize(right,faults);
  if(a.size!==b.size)faults.push('request-count-mismatch');
  for(const [key,value] of a)if(!b.has(key)||JSON.stringify(value)!==JSON.stringify(b.get(key)))faults.push('request-context-decision-or-response-mismatch');
  for(const key of b.keys())if(!a.has(key))faults.push('unexpected-request');
  return {stable:faults.length===0,faults,requestCount:a.size,
    oracle:faults.length?[]:[...a.values()].map(({id,context,decision})=>({id,context,decision})),
    captureProvenanceVerified:false,scope:'authored single-main-frame script/xhr/image/stylesheet only; no redirects, repeated-context ambiguity, workers or opaque origins'};
}
