import {sharedClients} from './shared-client-context.mjs';
import {serviceScriptContext} from './service-script-context.mjs';
// Strict sidecar correlation. Raw hook top/frame fields are never overwritten.
// Only the owned, offline path probe enables this observer; ambiguous joins fail.
export function correlateWorker(run,row){
 const ev=run.workerEvidence;if(!ev||ev.faults.length)return {status:'gap',reason:'worker-observer-unavailable'};
 const initial=serviceScriptContext(run,row);if(initial)return initial;
 const events=ev.events;let boundRow=row,redirectParent=false;
 let requests=events.filter(e=>e.method==='Network.requestWillBeSent'&&e.params.url===boundRow.url);
 // Native interception may block before OnReceiveRedirect reaches the renderer.
 // Follow only the same logged DevTools request ID and contiguous native hops,
 // never a fixture's expected redirect graph or a different request's URL.
 while(requests.length===0&&run.browserKind==='chromium'&&boundRow.redirect_index>0&&boundRow.devtools_request_id&&boundRow.devtools_request_id!=='absent'){
  const parents=(run.records||[]).filter(r=>r.devtools_request_id===boundRow.devtools_request_id&&r.redirect_index===boundRow.redirect_index-1&&r.decision==='allow');
  if(parents.length!==1)break;boundRow=parents[0];redirectParent=true;
  requests=events.filter(e=>e.method==='Network.requestWillBeSent'&&e.params.url===boundRow.url);
 }
 if(requests.length!==1)return {status:'gap',reason:'worker-request-not-unique'};
 const request=requests[0],p=request.params;
 const attached=events.filter(e=>e.method==='Target.attachedToTarget'&&e.params.sessionId===request.sessionId&&e.sequence<request.sequence);
 if(attached.length!==1)return {status:'gap',reason:'worker-target-unresolved'};
 const target=attached[0].params.targetInfo,page=run.source?.observedPageTarget;
 if(!['shared_worker','service_worker'].includes(target.type))return {status:'gap',reason:'not-worker-target'};
 if(!page?.browserContextId||target.browserContextId!==page.browserContextId)return {status:'gap',reason:'worker-profile-mismatch'};
 if(p.frameId||p.method!==boundRow.method||p.referrer!==(boundRow.referrer||''))return {status:'gap',reason:'worker-request-context-mismatch'};
 if(run.browserKind==='chromium'){
  if(!row.devtools_request_id||row.devtools_request_id==='absent'||p.requestId!==row.devtools_request_id)return {status:'gap',reason:'native-worker-request-id-mismatch'};
 }else{
  // Electron's proxy ID is not a CDP request ID. Require a bijection in this
  // finite run, plus method/referrer and a bounded observed time window.
  // CDP resource types are diagnostic only; the two actual hook types are
  // compared by paths-compare (importScripts is reported as Other by CDP).
  const time=Date.parse(row.timestamp);if(!Number.isFinite(time)||!Number.isFinite(p.wallTime)||Math.abs(time-p.wallTime*1000)>2000)return {status:'gap',reason:'electron-worker-time-mismatch'};
 }
 const contexts=events.filter(e=>e.method==='Runtime.executionContextCreated'&&e.sessionId===request.sessionId);
 // Runtime may announce the worker's first realm after its first import event.
 // Require exactly one realm for this target's entire observed lifetime.
 if(contexts.length!==1)return {status:'gap',reason:'worker-execution-context-ambiguous'};
 let origin;try{origin=new URL(contexts[0].params.context.origin).origin;if(origin==='null'||origin!==new URL(target.url).origin)throw Error();}catch{return {status:'gap',reason:'worker-origin-unresolved'};}
 const context={kind:target.type,scriptUrl:target.url,executionOrigin:origin,profileKind:run.kind,documentFrame:'not-associated'};
 const proof={targetId:target.targetId,sessionId:request.sessionId,requestId:p.requestId,eventSequence:request.sequence,join:run.browserKind==='chromium'?(redirectParent?'native-redirect-parent-id':'native-devtools-id'):'unique-observed-request-and-time',devtoolsType:p.type};
 if(target.type==='shared_worker'){const result=sharedClients(run,request);return result.status==='resolved'?{status:'resolved',context:{...context,clients:result.clients},proof:{...proof,connections:result.proof}}:{status:'gap',reason:result.reason,context:{...context,clients:{kind:'connected-documents',status:'unobserved'}},proof};}
 const versions=events.flatMap(e=>e.method==='ServiceWorker.workerVersionUpdated'?e.params.versions.filter(v=>v.targetId===target.targetId).map(v=>({...v,sequence:e.sequence})):[]);
 const ids=new Set(versions.map(v=>v.versionId));
 if(ids.size!==1||!versions.some(v=>v.sequence<request.sequence)||!versions.some(v=>v.sequence>request.sequence)||versions.some(v=>v.scriptURL!==target.url||!Array.isArray(v.controlledClients)))return {status:'gap',reason:'service-client-snapshot-incomplete',context,proof};
 const before=versions.filter(v=>v.sequence<request.sequence).at(-1),after=versions.find(v=>v.sequence>request.sequence);
 const sets=[before,after].map(v=>JSON.stringify([...v.controlledClients].sort()));
 if(new Set(sets).size!==1)return {status:'gap',reason:'service-client-set-changed',context,proof};
 const clients=[];
 for(const id of before.controlledClients){
  // Do not guess subframe topology or unobserved clients. The sole page target
  // is directly selected through Playwright's CDP handle, never by active tab.
  if(id!==page.targetId)return {status:'gap',reason:'service-client-not-observed',context,proof};
  const origins=events.filter(e=>e.method==='Runtime.executionContextCreated'&&e.sequence<request.sequence&&e.params.context.auxData?.isDefault&&e.params.context.auxData.frameId===id).map(e=>e.params.context.origin).filter(o=>/^https?:\/\//.test(o));
  if(new Set(origins).size!==1)return {status:'gap',reason:'service-client-origin-ambiguous',context,proof};
  clients.push({role:'observed-page-target',origin:origins[0]});
 }
 context.clients={kind:'controlled-documents',status:'observed-stable',members:clients};
 return {status:'resolved',context,proof};
}
