// Observation only, in a disposable browser. Authored shared-worker probes
// wait for the Runtime binding before issuing requests. Never use for latency.
import net from 'node:net';
import assert from 'node:assert/strict';
import {pageAgentSource} from './shared-client-observer.mjs';
export function detachedSetup(error,events){
 return (error.code===-32001||(error.code===-32000&&error.protocolMessage==='Inspected target navigated or closed'))&&typeof error.sessionId==='string'&&events.some(e=>e.method==='Target.detachedFromTarget'&&e.params.sessionId===error.sessionId);
}
export async function freePort(){const server=net.createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;await new Promise(resolve=>server.close(resolve));return port;}
export async function observeWorkers(port,fixtures){
 let endpoint;
 for(let i=0;i<100;i++){try{endpoint=(await(await fetch(`http://127.0.0.1:${port}/json/version`,{signal:AbortSignal.timeout(1000)})).json()).webSocketDebuggerUrl;if(endpoint)break;}catch{ /* The owned browser may still be starting. */ }await new Promise(resolve=>setTimeout(resolve,100));}
 assert(endpoint,'Owned browser CDP endpoint unavailable');const address=new URL(endpoint);assert.equal(address.hostname,'127.0.0.1');assert.equal(Number(address.port),port);
 const ws=new WebSocket(endpoint),pending=new Map(),ready=new Map(),events=[],faults=[],setupErrors=[],pageSessions=new Set();let sequence=0,closed=false;
 await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
 const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++sequence;const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method));},10000);pending.set(id,{resolve,reject,timer,method,sessionId});ws.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));});
 ws.onclose=()=>{closed=true;for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('Observer connection closed'));}pending.clear();};
 ws.onmessage=event=>{
  const message=JSON.parse(event.data);
  if(message.id){const p=pending.get(message.id);if(p){clearTimeout(p.timer);pending.delete(message.id);message.error?p.reject(Object.assign(Error(JSON.stringify(message.error)),{method:p.method,sessionId:p.sessionId,code:message.error.code,protocolMessage:message.error.message})):p.resolve(message.result);}return;}
  const {method,params,sessionId}=message;let saved;
  if(method==='Network.requestWillBeSent'){
   if(!fixtures.has(params.request.url))return;
   // Do not archive cookies, arbitrary headers, response certificates or bodies.
   saved={requestId:params.requestId,url:params.request.url,method:params.request.method,referrer:params.request.headers.Referer||'',type:params.type,documentURL:params.documentURL,frameId:params.frameId||null,wallTime:params.wallTime,timestamp:params.timestamp,redirectFrom:params.redirectResponse?.url||null};
  }else if(method==='Network.responseReceived'&&fixtures.has(params.response.url)){
   // Response identity/status only: no headers, cookies or certificate material.
   saved={requestId:params.requestId,url:params.response.url,status:params.response.status,type:params.type,frameId:params.frameId||null};
  }else if(method==='Runtime.bindingCalled'&&params.name==='__blancWorkerOwnership'){
   try{const value=JSON.parse(params.payload);assert(['page-agent-installed','client-created','client-port-close','client-document-gone','worker-agent-installed','worker-connect','worker-peer','worker-port-close'].includes(value.type));saved={executionContextId:params.executionContextId,type:value.type};for(const key of ['token','portToken'])if(value[key]!==undefined){assert(typeof value[key]==='string'&&/^[0-9a-f-]{36}$/.test(value[key]));saved[key]=value[key];}assert(Object.keys(value).every(k=>['type','token','portToken'].includes(k)));}catch(error){faults.push('Invalid ownership observation: '+error);}
  }else if(method==='Debugger.paused')saved={reason:params.reason,hitBreakpoints:params.hitBreakpoints};
  else if(['Target.attachedToTarget','Target.detachedFromTarget','Runtime.executionContextCreated','Runtime.executionContextDestroyed','Runtime.executionContextsCleared','ServiceWorker.workerVersionUpdated','ServiceWorker.workerRegistrationUpdated','Page.frameNavigated'].includes(method))saved=params;
  if(saved)events.push({method,params:saved,...(sessionId?{sessionId}:{}),sequence:events.length,observedAt:Date.now()});
  if(method==='Target.attachedToTarget'){
   const child=params.sessionId;
   // The protocol error can precede its detach event. Reconcile at close, never
   // by URL or by assuming every session error is an expected failed startup.
   const recordError=error=>setupErrors.push({error,targetId:params.targetInfo.targetId});
   const task=(async()=>{try{await send('Network.enable',{},child);await send('Runtime.enable',{},child);await send('Runtime.addBinding',{name:'__blancWorkerOwnership'},child);if(params.targetInfo.type==='page'){await send('Page.enable',{},child);await send('Page.addScriptToEvaluateOnNewDocument',{source:pageAgentSource},child);await send('ServiceWorker.enable',{},child);}}catch(error){recordError(error);}finally{if(params.waitingForDebugger&&!events.some(e=>e.method==='Target.detachedFromTarget'&&e.params.sessionId===child)){try{await send('Runtime.runIfWaitingForDebugger',{},child);}catch(error){recordError(error);}}}})();
   ready.set(child,task);task.catch(error=>faults.push(JSON.stringify({message:String(error),method:error.method,sessionId:error.sessionId,code:error.code})));
  }
 };
 await send('Target.setAutoAttach',{autoAttach:true,waitForDebuggerOnStart:true,flatten:true,filter:[{type:'shared_worker'},{type:'service_worker'},{exclude:true}]});
 return {events,faults,attachPage:async targetId=>{const {sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});assert(ready.has(sessionId));await ready.get(sessionId);pageSessions.add(sessionId);return sessionId;},close:async()=>{if(!closed){try{for(const pageSession of pageSessions){const before=events.length;try{await send('ServiceWorker.disable',{},pageSession);await send('ServiceWorker.enable',{},pageSession);for(let i=0;i<50&&!events.slice(before).some(e=>e.method==='ServiceWorker.workerVersionUpdated');i++)await new Promise(resolve=>setTimeout(resolve,20));if(!events.slice(before).some(e=>e.method==='ServiceWorker.workerVersionUpdated'))faults.push('Missing final client snapshot');}catch(error){if(!events.some(e=>e.method==='Target.detachedFromTarget'&&e.params.sessionId===pageSession))faults.push(String(error));}}await send('Target.setAutoAttach',{autoAttach:false,waitForDebuggerOnStart:false,flatten:true});}finally{await Promise.allSettled([...ready.values()]);for(const {error,targetId} of setupErrors){if(detachedSetup(error,events))events.push({method:'Observer.detachedDuringSetup',params:{sessionId:error.sessionId,targetId,command:error.method,code:error.code,contextComplete:false},sequence:events.length,observedAt:Date.now()});else faults.push(JSON.stringify({message:String(error),method:error.method,sessionId:error.sessionId,code:error.code}));}ws.close();}}}};
}
