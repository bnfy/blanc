// Disposable-fixture observation, never production or latency instrumentation.
// A random challenge traverses the actual browser-created MessagePort. Script
// URL/name or the fixture's intended owner never establishes the peer relation.
export function pageAgent(){
 const emit=value=>globalThis.__blancWorkerOwnership(JSON.stringify(value));
 const Native=globalThis.SharedWorker;if(!Native)throw Error('SharedWorker unavailable');
 const tokens=new Set();
 globalThis.SharedWorker=new Proxy(Native,{construct(target,args,newTarget){
  const worker=Reflect.construct(target,args,newTarget),token=crypto.randomUUID();tokens.add(token);
  emit({type:'client-created',token});
  const port=worker.port,close=port.close;
  port.close=function(...values){emit({type:'client-port-close',token});return Reflect.apply(close,this,values);};
  port.postMessage({__blancWorkerOwnershipChallenge:token});
  return worker;
 }});
 addEventListener('pagehide',()=>{for(const token of tokens)emit({type:'client-document-gone',token});},{capture:true});
 emit({type:'page-agent-installed'});
}
export function workerAgent(){
 // This authored probe installs before its connect handler and buffers until
 // the browser's independently attached Runtime binding exists. No request
 // runs until buffered connection observations have been delivered.
 const queued=[];let active=false;
 const emit=value=>{if(active)globalThis.__blancWorkerOwnership(JSON.stringify(value));else queued.push(value);};
 addEventListener('connect',event=>{
  if(event.ports.length!==1)throw Error('Unexpected shared connection port count');
  const port=event.ports[0],portToken=crypto.randomUUID();emit({type:'worker-connect',portToken});
  const close=port.close;port.close=function(...values){emit({type:'worker-port-close',portToken});return Reflect.apply(close,this,values);};
  port.addEventListener('message',event=>{
   const token=event.data?.__blancWorkerOwnershipChallenge;
   if(typeof token!=='string')return;
   event.stopImmediatePropagation();emit({type:'worker-peer',portToken,token});
  },{capture:true});
  port.start();
 },{capture:true});
 emit({type:'worker-agent-installed'});
 return new Promise((resolve,reject)=>{let tries=0;const ready=()=>{
  if(typeof globalThis.__blancWorkerOwnership==='function'){
   active=true;for(const event of queued)emit(event);queued.length=0;resolve();
  }else if(++tries>=250)reject(Error('Worker ownership observer unavailable'));
  else setTimeout(ready,20);
 };ready();});
}
export const pageAgentSource=`(${pageAgent.toString()})();`;
export const workerAgentSource=`(${workerAgent.toString()})();`;
