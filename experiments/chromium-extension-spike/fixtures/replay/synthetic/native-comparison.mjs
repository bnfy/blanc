// Compare actual native hook observations, not CDP-inferred initiators or seeded answers.
import {sha} from './generate.mjs';
const fields=['url','method','resource_type','initiator_origin','top_frame_origin','frame_role','profile_kind','redirect_index'];
export function compareNative(manifest,oracle,reference,run,fixtures){
 const faults=[],differences=[],descendants=[];
 const counts={candidateUrls:0,electronBlocked:0,electronAllowed:0,blockToAllow:0,allowToBlock:0,matchedDecisions:0,coverageControls:0,nativeRequests:run.nativeRecords.length};
 if(!oracle.stable||!run.complete||run.faults?.length||run.nativeBlockerInstalled!==true||run.engineReadyCount!==1)faults.push('incomplete-native-run');
 const byUrl=new Map(), arrivals=new Map();
 for(const r of run.nativeRecords){if(byUrl.has(r.url))faults.push('repeated-native-context:'+r.url);byUrl.set(r.url,r);}
 for(const a of run.arrivals){if(arrivals.has(a.url))faults.push('repeated-arrival:'+a.url);arrivals.set(a.url,a);}
 const expected=new Set(),loadedScripts=[];
 function check(url,expectedDecision,context,engineSource){
  expected.add(url);const r=byUrl.get(url);if(!r){faults.push('missing-native-observation:'+url);return null;}
  if(r.status!=='ready'||![0,1].includes(r.engine_result)||r.decision!==(r.engine_result===0?'allow':'block'))faults.push('invalid-native-decision:'+url);
  if(typeof r.initiator_present!=='boolean'||(r.initiator_present?(r.initiator_origin==='absent'):(r.initiator_origin!=='absent')))faults.push('invalid-initiator-presence:'+url);
  if(fields.some(k=>r[k]!==context[k]))faults.push('native-context-mismatch:'+url);
  if(r.referrer!==engineSource)faults.push('engine-source-mismatch:'+url);
  const requests=run.requests.filter(x=>x.url===url);
  if(requests.length!==1)faults.push('cdp-observation-mismatch:'+url);
  const request=requests[0],a=arrivals.get(url);
  if(r.decision==='allow'){
   const response=request&&run.responses.find(x=>x.requestId===request.requestId);
   if(!a||a.sha256!==sha(fixtures.get(url).body)||!request||!run.finished.includes(request.requestId)||!response||response.status!==200||response.fromDiskCache||response.fromServiceWorker)faults.push('allowed-response-incomplete:'+url);
  }else if(a||!request||!run.failures.some(x=>x.requestId===request.requestId&&x.errorText==='net::ERR_BLOCKED_BY_CLIENT'))faults.push('blocked-request-not-cancelled:'+url);
  if(expectedDecision!==null&&r.decision!==expectedDecision)differences.push({url,electron:expectedDecision,chromium:r.decision,contextMatched:!fields.some(k=>r[k]!==context[k])});
  return r;
 }
 const oracleByUrl=new Map(oracle.oracle.map(r=>[r.context.url,r]));
 const referenceByUrl=new Map(reference.records.map(r=>[r.url,r]));
 for(const item of oracle.oracle){
  const ref=referenceByUrl.get(item.context.url);
  if(!ref){faults.push('missing-reference-source');continue;}
  // Descendants may disappear if the fork wrongly blocks the parent. Record
  // that consequence below, rather than inventing a decision for an unissued request.
  const parent=manifest.candidates.find(c=>c.descendantUrl===item.context.url);
  if(parent&&byUrl.get(parent.url)?.decision==='block'){
   expected.add(item.context.url);if(byUrl.has(item.context.url)||arrivals.has(item.context.url))faults.push('blocked-parent-child-issued');
   if(oracleByUrl.get(parent.url)?.decision==='allow')descendants.push({url:item.context.url,parent:parent.url,observed:'suppressed-by-fork-block'});
   continue;
  }
  check(item.context.url,item.decision,item.context,ref.referrer);
 }
 for(const c of manifest.candidates){
  const expectedItem=oracleByUrl.get(c.url),r=byUrl.get(c.url);
  if(!r||!expectedItem){faults.push('missing-candidate:'+c.id);continue;}
  const loads=run.execution.loads.filter(l=>l.id===c.id);
  if(loads.length!==1||loads[0].event!==(r.decision==='allow'?'load':'error'))faults.push('dom-outcome-mismatch:'+c.id);
  if(c.kind==='coverage-control')counts.coverageControls++;
  else{counts.candidateUrls++;counts[expectedItem.decision==='block'?'electronBlocked':'electronAllowed']++;
   if(r.decision===expectedItem.decision)counts.matchedDecisions++;
   else counts[expectedItem.decision==='block'?'blockToAllow':'allowToBlock']++;}
  if(c.resourceType==='script'&&r.decision==='allow'){
   loadedScripts.push(c.id);
   if(!oracleByUrl.has(c.descendantUrl)){
    const context={...expectedItem.context,url:c.descendantUrl,resource_type:'xhr'};
    const root='https://page.blanc-fixture.test/blanc-fixture/index.html';
    // New descendant has no Electron decision, so it cannot count toward parity.
    // Context is measured and reported; it must be bound to the actual page.
    const child=byUrl.get(c.descendantUrl);
    if(child)check(c.descendantUrl,null,context,child.referrer);
    else faults.push('missing-fork-child:'+c.id);
    if(child?.top_frame_origin!==new URL(root).origin)faults.push('fork-child-context');
    descendants.push({url:c.descendantUrl,parent:c.url,observed:child?.decision,parityCounted:false});
   }
  }
 }
 if(JSON.stringify([...run.execution.executed].sort())!==JSON.stringify(loadedScripts.sort()))faults.push('script-execution-mismatch');
 const loadedChildren=loadedScripts.filter(id=>{const c=manifest.candidates.find(x=>x.id===id);return byUrl.get(c.descendantUrl)?.decision==='allow';});
 if(JSON.stringify([...run.execution.children].sort())!==JSON.stringify(loadedChildren.sort()))faults.push('child-execution-mismatch');
 for(const r of run.nativeRecords)if(!expected.has(r.url))faults.push('unexplained-native-request:'+r.url);
 for(const r of run.requests)if(!expected.has(r.url))faults.push('unexplained-cdp-request:'+r.url);
 for(const a of run.arrivals)if(!expected.has(a.url))faults.push('unexplained-arrival:'+a.url);
 return {kind:'native-synthetic-fixture-comparison',valid:faults.length===0,parity:faults.length===0&&differences.length===0,
  faults,counts,differences,descendants,nativeContextMatched:faults.every(f=>!f.includes('context')&&!f.includes('source-mismatch')),
  acceptance:false,scope:'single main frame; script/xhr/image/stylesheet; regular/private; exact observed initiator, referrer and top frame. Full request-path and cosmetic matrix remains incomplete.'};
}
