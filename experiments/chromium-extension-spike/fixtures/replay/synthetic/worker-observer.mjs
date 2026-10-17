// Observation only, in a disposable browser. Pausing a newly created worker lets
// Network be enabled before execution; never use this instrumentation for latency.
import net from 'node:net';
import assert from 'node:assert/strict';
export async function freePort(){const server=net.createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;await new Promise(resolve=>server.close(resolve));return port;}
export async function observeWorkers(port,fixtures){
 let endpoint;
 for(let i=0;i<100;i++){try{endpoint=(await(await fetch(`http://127.0.0.1:${port}/json/version`,{signal:AbortSignal.timeout(1000)})).json()).webSocketDebuggerUrl;if(endpoint)break;}catch{ /* The owned browser may still be starting. */ }await new Promise(resolve=>setTimeout(resolve,100));}
 assert(endpoint,'Owned browser CDP endpoint unavailable');const address=new URL(endpoint);assert.equal(address.hostname,'127.0.0.1');assert.equal(Number(address.port),port);
 const ws=new WebSocket(endpoint),pending=new Map(),ready=new Map(),breakpoints=new Map(),events=[],faults=[];let sequence=0,closed=false,pageSession;
 await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
 const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++sequence;const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method));},10000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));});
 ws.onclose=()=>{closed=true;for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('Observer connection closed'));}pending.clear();};
 ws.onmessage=event=>{
  const message=JSON.parse(event.data);
  if(message.id){const p=pending.get(message.id);if(p){clearTimeout(p.timer);pending.delete(message.id);message.error?p.reject(Error(JSON.stringify(message.error))):p.resolve(message.result);}return;}
  const {method,params,sessionId}=message;let saved;
  if(method==='Network.requestWillBeSent'){
   if(!fixtures.has(params.request.url))return;
   // Do not archive cookies, arbitrary headers, response certificates or bodies.
   saved={requestId:params.requestId,url:params.request.url,method:params.request.method,referrer:params.request.headers.Referer||'',type:params.type,documentURL:params.documentURL,frameId:params.frameId||null,wallTime:params.wallTime,timestamp:params.timestamp,redirectFrom:params.redirectResponse?.url||null};
  }else if(['Target.attachedToTarget','Target.detachedFromTarget','Runtime.executionContextCreated','ServiceWorker.workerVersionUpdated','ServiceWorker.workerRegistrationUpdated','Page.frameNavigated'].includes(method))saved=params;
  if(saved)events.push({method,params:saved,...(sessionId?{sessionId}:{}),sequence:events.length,observedAt:Date.now()});
  if(method==='Debugger.paused'){
   (async()=>{try{const id=breakpoints.get(sessionId);if(!id)throw Error('Unexpected worker debugger pause');await send('Debugger.removeBreakpoint',{breakpointId:id},sessionId);breakpoints.delete(sessionId);await send('Network.enable',{},sessionId);}finally{await send('Debugger.resume',{},sessionId);}})().catch(error=>faults.push(String(error)));
  }
  if(method==='Target.attachedToTarget'){
   const child=params.sessionId;
   const task=(async()=>{try{await send('Network.enable',{},child);await send('Runtime.enable',{},child);if(params.targetInfo.type!=='page'){await send('Debugger.enable',{},child);const point=await send('Debugger.setInstrumentationBreakpoint',{instrumentation:'beforeScriptExecution'},child);breakpoints.set(child,point.breakpointId);}if(params.targetInfo.type==='page'){await send('Page.enable',{},child);await send('ServiceWorker.enable',{},child);}}finally{if(params.waitingForDebugger)await send('Runtime.runIfWaitingForDebugger',{},child);}})();
   ready.set(child,task);task.catch(error=>faults.push(String(error)));
  }
 };
 await send('Target.setAutoAttach',{autoAttach:true,waitForDebuggerOnStart:true,flatten:true,filter:[{type:'shared_worker'},{type:'service_worker'},{exclude:true}]});
 return {events,faults,attachPage:async targetId=>{const {sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});assert(ready.has(sessionId));await ready.get(sessionId);pageSession=sessionId;},close:async()=>{if(!closed){try{if(pageSession){const before=events.length;await send('ServiceWorker.disable',{},pageSession);await send('ServiceWorker.enable',{},pageSession);for(let i=0;i<50&&!events.slice(before).some(e=>e.method==='ServiceWorker.workerVersionUpdated');i++)await new Promise(resolve=>setTimeout(resolve,20));if(!events.slice(before).some(e=>e.method==='ServiceWorker.workerVersionUpdated'))faults.push('Missing final client snapshot');}await send('Target.setAutoAttach',{autoAttach:false,waitForDebuggerOnStart:false,flatten:true});}finally{ws.close();}}}};
}
