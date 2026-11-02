import {normalizePathRun} from './paths-compare.mjs';

export function compareSharedLifecycleRuns(electronA,electronB,nativeA,nativeB,fixtures,phases){
 const runs=[electronA,electronB,nativeA,nativeB],normalized=runs.map(run=>normalizePathRun(run,fixtures)),faults=normalized.flatMap((run,index)=>run.faults.map(fault=>runs[index].label+':'+fault)),phaseUrls=new Set(Object.values(phases).flat());
 const phaseObservations=index=>normalized[index].observations.filter(row=>phaseUrls.has(row.url));
 // Either simultaneous document may initiate the one-time worker script load.
 // Its referrer is not a worker subrequest result and is therefore excluded
 // from repetition stability; every transport/decision fault is still checked.
 for(const [a,b] of [[0,1],[2,3]])if(JSON.stringify(phaseObservations(a))!==JSON.stringify(phaseObservations(b))||JSON.stringify(runs[a].phaseResults)!==JSON.stringify(runs[b].phaseResults))faults.push('unstable-'+runs[a].browserKind);
 const electron=new Map(normalized[0].observations.map(row=>[row.url,row])),native=new Map(normalized[2].observations.map(row=>[row.url,row])),results=[];
 for(const [phase,urls] of Object.entries(phases)){
  const differences=[],gaps=[],observed=[];
  for(const url of urls){const left=electron.get(url),right=native.get(url);if(!left||!right){differences.push({url,reason:'missing-observation'});continue;}observed.push({url,decision:left.decision,workerContext:left.worker?.context});
   for(const key of ['method','type','referrer','initiatorPresent','initiator','profile','hop','decision'])if(left[key]!==right[key])differences.push({url,field:key,electron:left[key],chromium:right[key]});
   if(left.worker?.status!=='resolved'||right.worker?.status!=='resolved')gaps.push({url,reason:'shared-context-unresolved',electron:left.worker,chromium:right.worker});
   else if(JSON.stringify(left.worker.context)!==JSON.stringify(right.worker.context))differences.push({url,reason:'worker-context-mismatch',electron:left.worker.context,chromium:right.worker.context});
  }
  const expected=phase==='multi'?{documents:2,ports:2,endedDocuments:0}:{documents:1,ports:1,endedDocuments:1};
  for(const [browser,map] of [['electron',electron],['chromium',native]]){const context=map.get(urls[0])?.worker?.context,member=context?.clients?.members?.[0];if(context?.clients?.members?.length!==1||(member.documents||1)!==expected.documents||member.ports!==expected.ports||(context.clients.endedDocuments||0)!==expected.endedDocuments)differences.push({reason:'unexpected-client-set',browser,expected,actual:context?.clients});}
  const left=electronA.phaseResults[phase],right=nativeA.phaseResults[phase];if(!left||!right||JSON.stringify(left)!==JSON.stringify(right))differences.push({reason:'phase-outcome-difference',electron:left,chromium:right});
  results.push({phase,status:differences.length?'failed':gaps.length?'gap':'passed',differences,gaps,observed});
 }
 return {valid:faults.length===0,faults,results,fullAcceptance:false,scope:'two observed same-origin document clients, then one observed owner teardown; authored shared-worker requests only'};
}
