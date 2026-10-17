// In Chromium's OnServiceWorkerMainScriptRequestWillBeSent, the initial
// request's DevTools ID is assigned from this new worker's DevTools token.
// It is independent of URL matching and can survive a missed Network event.
export function serviceScriptContext(run,row){
 const events=run.workerEvidence.events,page=run.source?.observedPageTarget;
 const targets=events.filter(e=>e.method==='Target.attachedToTarget'&&e.params.targetInfo.type==='service_worker');
 const candidates=targets.filter(e=>run.browserKind==='chromium'
  ?row.factory_kind==='service-worker-script'&&row.devtools_request_id===e.params.targetInfo.targetId
  :events.some(r=>r.method==='Network.requestWillBeSent'&&r.sessionId===e.params.sessionId&&r.params.url===row.url&&r.params.requestId===e.params.targetInfo.targetId));
 if(!candidates.length)return null;
 const gap=reason=>({status:'gap',reason});
 if(candidates.length!==1)return gap('service-script-target-ambiguous');
 const attached=candidates[0],target=attached.params.targetInfo,session=attached.params.sessionId;
 if(!page?.browserContextId||target.browserContextId!==page.browserContextId)return gap('worker-profile-mismatch');
 if(run.browserKind==='chromium'&&row.redirect_index!==0)return gap('service-script-not-initial-hop');
 if(row.url!==target.url||row.method!=='GET'||(row.resource_type||row.resourceType)!=='script')return gap('service-script-request-mismatch');
 if(run.browserKind==='electron'){
  const requests=events.filter(e=>e.method==='Network.requestWillBeSent'&&e.params.url===row.url);
  if(requests.length!==1)return gap('service-script-request-ambiguous');
  const p=requests[0].params,time=Date.parse(row.timestamp);
  if(p.method!==row.method||p.frameId||p.type!=='Script'||!Number.isFinite(time)||!Number.isFinite(p.wallTime)||Math.abs(time-p.wallTime*1000)>2000)return gap('service-script-event-mismatch');
  // Browser-emitted RequestSent serializes request.headers, which omits the
  // separate ResourceRequest.referrer. Do not compare that omitted header here;
  // actual referrers from both blocking hooks still compare exactly.
 }
 const contexts=events.filter(e=>e.method==='Runtime.executionContextCreated'&&e.sessionId===session);
 if(contexts.length!==1)return gap('worker-execution-context-ambiguous');
 const versions=events.flatMap(e=>e.method==='ServiceWorker.workerVersionUpdated'?e.params.versions.filter(v=>v.targetId===target.targetId).map(v=>({...v,sequence:e.sequence})):[]);
 if(new Set(versions.map(v=>v.versionId)).size!==1||versions.some(v=>v.scriptURL!==row.url)||versions[0]?.status!=='new'||!versions.some(v=>v.status==='new'&&v.runningStatus==='starting'&&Array.isArray(v.controlledClients)&&v.controlledClients.length===0&&v.sequence<contexts[0].sequence))return gap('service-script-new-version-unproved');
 let origin;try{origin=new URL(contexts[0].params.context.origin).origin;if(origin==='null'||origin!==new URL(target.url).origin)throw Error();}catch{return gap('worker-origin-unresolved');}
 return {status:'resolved',context:{kind:'service_worker',phase:'initial-script-fetch',scriptUrl:target.url,executionOrigin:origin,profileKind:run.kind,documentFrame:'not-associated',clients:{kind:'controlled-documents',status:'not-applicable-before-installation',members:[]}},proof:{targetId:target.targetId,join:run.browserKind==='chromium'?'native-main-script-target-token':'electron-main-script-event-token',versionId:versions[0].versionId}};
}
