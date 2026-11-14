import assert from 'node:assert/strict';import {sha} from './generate.mjs';
export function percentiles(values){assert(values.length&&values.every(v=>Number.isFinite(v)&&v>=0));const a=[...values].sort((a,b)=>a-b);return Object.fromEntries([['p50',.5],['p95',.95],['p99',.99]].map(([k,q])=>[k,a[Math.ceil(q*a.length)-1]]));}
export function medianRepetitions(repetitions){assert.equal(repetitions.length,5);assert(repetitions.every(r=>r.valid&&!r.warmup));return Object.fromEntries(['p50','p95','p99'].map(k=>[k,repetitions.map(r=>r.percentilesMs[k]).sort((a,b)=>a-b)[2]]));}
export function validateLatencyPage({browserKind,rows,dom,arrivals,expected,reference,fixtures,candidates}){
 const faults=[],byUrl=new Map(),seenArrivals=new Map(),latencies=[];
 if(rows.some(r=>r.fault))faults.push('observer-fault');
 const records=rows.filter(r=>fixtures.has(r.url));
 for(const r of records){if(byUrl.has(r.url))faults.push('duplicate-observation');byUrl.set(r.url,r);}
 for(const a of arrivals){if(seenArrivals.has(a.url))faults.push('duplicate-arrival');seenArrivals.set(a.url,a);}
 for(const [url,ref] of expected){const r=byUrl.get(url);if(!r){faults.push('missing-observation:'+url);continue;}
  const decision=browserKind==='electron'?(r.result?.cancel===true?'block':'allow'):r.decision;
  if(decision!==ref.decision)faults.push('decision-difference:'+url);
  const ctx=browserKind==='electron'?{url:r.url,method:r.method,resource_type:r.resourceType,initiator_origin:r.initiatorOriginPresent?r.initiatorOrigin:'absent',top_frame_origin:r.resourceType==='mainFrame'?new URL(r.url).origin:r.frame?.topOrigin,frame_role:r.resourceType==='mainFrame'?'main':r.frame?(r.frame.url===r.frame.topUrl?'main':'sub'):'unresolved',profile_kind:r.profileKind,redirect_index:0}:r;
  for(const key of Object.keys(ref.context))if(ctx[key]!==ref.context[key])faults.push('context-mismatch:'+key+':'+url);
  if(r.referrer!==reference.get(url)?.referrer)faults.push('referrer-mismatch:'+url);
  if(browserKind==='chromium'&&(r.status!=='ready'||![0,1].includes(r.engine_result)||r.decision!==(r.engine_result===0?'allow':'block')))faults.push('engine-failure:'+url);
  if(browserKind==='electron'&&r.status?.phase!=='ready')faults.push('electron-not-ready');
  if(decision==='allow'&&seenArrivals.get(url)?.sha256!==sha(fixtures.get(url).body))faults.push('allowed-response:'+url);
  if(decision==='block'&&seenArrivals.has(url))faults.push('blocked-arrival:'+url);
 }
 for(const r of records){if(!expected.has(r.url))faults.push('extra-observation:'+r.url);const us=browserKind==='electron'?r.observer_to_result_us:r.hook_to_decision_us;if(!Number.isFinite(us)||us<0)faults.push('missing-timing');else latencies.push(us/1000);}
 for(const a of arrivals)if(!expected.has(a.url))faults.push('extra-arrival:'+a.url);
 const executed=[];for(const c of candidates){const d=expected.get(c.url)?.decision;const loads=dom.loads.filter(l=>l.id===c.id);if(loads.length!==1||loads[0].event!==(d==='block'?'error':'load'))faults.push('DOM-load:'+c.id);if(c.resourceType==='script'&&d==='allow')executed.push(c.id);}
 if(JSON.stringify([...dom.executed].sort())!==JSON.stringify(executed.sort())||JSON.stringify([...dom.children].sort())!==JSON.stringify(executed.sort()))faults.push('script-child-completion');
 return {valid:faults.length===0,faults,latencies,records};
}
