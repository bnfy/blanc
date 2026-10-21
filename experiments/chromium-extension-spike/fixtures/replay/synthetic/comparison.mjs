import {sha} from './generate.mjs';
// Observed URL/type/profile/response comparison, deliberately not native-context
// parity. Candidate labels and seed rules never select either browser's answer.
export function compareBaseline(manifest,oracle,run,fixtures){
 const faults=[],differences=[],descendants=[];
 const counts={candidates:0,electronBlockedChromiumLoaded:0,bothLoaded:0,coverageControls:0,forkOnlyChildren:0};
 const types={script:'Script',xhr:'Fetch',image:'Image',stylesheet:'Stylesheet'};
 if(!oracle.stable||!run.complete||run.faults?.length||run.failures?.length||run.nativeBlockerInstalled!==false)faults.push('incomplete-or-faulted-negative-control');
 const scripts=[];
 const checkResponse=(url,type)=>{
  const records=run.requests.filter(r=>r.url===url),arrivals=run.arrivals.filter(a=>a.url===url);
  if(records.length!==1||arrivals.length!==1){faults.push('missing-or-ambiguous-request:'+url);return false;}
  const r=records[0],response=run.responses.find(x=>x.requestId===r.requestId);
  if(r.method!=='GET'||r.redirectResponsePresent||r.type!==type||!run.finished.includes(r.requestId)||
   !response||response.status!==200||response.fromDiskCache||response.fromServiceWorker||
   !fixtures.has(url)||arrivals[0].sha256!==sha(fixtures.get(url).body)){faults.push('response-or-type-mismatch:'+url);return false;}
  return true;
 };
 checkResponse('https://page.blanc-fixture.test/blanc-fixture/index.html','Document');
 const expected=new Set(['https://page.blanc-fixture.test/blanc-fixture/index.html']);
 for(const c of manifest.candidates){
  expected.add(c.url);
  const observations=oracle.oracle.filter(r=>r.context.url===c.url);
  if(observations.length!==1||observations[0].context.profile_kind!==run.profileKind||observations[0].context.resource_type!==c.resourceType){faults.push('oracle-context-mismatch:'+c.id);continue;}
  const decision=observations[0].decision;
  if(!['allow','block'].includes(decision)){faults.push('invalid-oracle-decision');continue;}
  checkResponse(c.url,types[c.resourceType]);
  const loads=run.execution.loads.filter(l=>l.id===c.id);
  if(loads.length!==1||loads[0].event!=='load')faults.push('candidate-did-not-load:'+c.id);
  if(c.kind==='coverage-control')counts.coverageControls++;
  else {
   counts.candidates++;
   if(decision==='block'){counts.electronBlockedChromiumLoaded++;differences.push({id:c.id,url:c.url,type:c.resourceType,electron:'block',chromium:'loaded-authored-response',nativeContextMatched:false});}
   else counts.bothLoaded++;
  }
  if(c.resourceType==='script'){
   scripts.push(c.id);expected.add(c.descendantUrl);checkResponse(c.descendantUrl,'Fetch');
   const exists=oracle.oracle.some(r=>r.context.url===c.descendantUrl);
   if(!exists&&decision==='block'){counts.forkOnlyChildren++;descendants.push({url:c.descendantUrl,parent:c.url,observed:'executed-and-loaded'});}
   else if(!exists)faults.push('unexpected-oracle-child-absence:'+c.id);
  }
 }
 if(JSON.stringify([...run.execution.executed].sort())!==JSON.stringify([...scripts].sort())||JSON.stringify([...run.execution.children].sort())!==JSON.stringify([...scripts].sort()))faults.push('script-or-child-execution-mismatch');
 for(const r of run.requests)if(!expected.has(r.url))faults.push('unexpected-request');
 for(const r of run.arrivals)if(!expected.has(r.url))faults.push('unexpected-arrival');
 return {kind:'pre-integration-negative-control',transportComplete:faults.length===0,faults,counts,differences,descendants,
  acceptance:false,syntheticFixtureParity:null,nativeBlockerInstalled:false,nativeContextMatched:false,
  explanation:'Actual Chromium 157 loads compared with stable Electron decisions. No native blocker or request_initiator observer exists, so this validates the harness and exposes the integration gap; it is not a criterion-3 blocker trial.'};
}
