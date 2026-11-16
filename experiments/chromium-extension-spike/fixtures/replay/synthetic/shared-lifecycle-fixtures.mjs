import {workerAgent} from './shared-client-observer.mjs';
import {scriptLiteral} from '../../../script-literal.mjs';

export const lifecycleOrigin='https://page.blanc-fixture.test';
const url=name=>lifecycleOrigin+'/blanc-fixture/shared-lifecycle/'+name;
export const clientAUrl=url('client-a.html'),clientBUrl=url('client-b.html'),workerUrl=url('worker.js');

export function sharedLifecycleFixtures(){
 const fixtures=new Map();
 const add=(address,body,type='text/plain',location=null)=>{if(fixtures.has(address))throw Error('duplicate fixture');fixtures.set(address,{status:location?302:200,contentType:type,body,...(location?{location}:{})});return address;};
 const blocked=name=>add('https://000491b06a.com/blanc-fixture/shared-lifecycle/'+name,'authored blocked target');
 const phases={};
 for(const phase of ['multi','teardown']){
  const allow=add(url(phase+'-allow'),'authored allowed target'),block=blocked(phase+'-block'),redirectBlock=blocked(phase+'-redirect-block');
  const redirect=add(url(phase+'-redirect'),'authored redirect','text/plain',redirectBlock);
  phases[phase]=[allow,block,redirect,redirectBlock];
 }
 const worker=`const ownershipReady=(${workerAgent.toString()})();
const phaseUrls=${scriptLiteral(phases)};
onconnect=event=>{const port=event.ports[0];port.start();ownershipReady.then(()=>port.postMessage({kind:'ready'}));port.addEventListener('message',async message=>{
 const phase=message.data?.run;if(!Object.hasOwn(phaseUrls,phase))return;
 const results=[];for(const address of phaseUrls[phase].slice(0,3)){try{const response=await fetch(address);results.push({url:address,outcome:'load',body:await response.text()});}catch{results.push({url:address,outcome:'error'});}}
 port.postMessage({kind:'result',phase,results});
});};`;
 add(workerUrl,worker,'application/javascript');
 const page=label=>`<!doctype html><meta charset="utf-8"><link rel="icon" href="data:," /><title>${label}</title><script>
const worker=new SharedWorker(${scriptLiteral(workerUrl)},'blanc-shared-lifecycle');const port=worker.port;port.start();const waiting=new Map();
window.sharedProbe={label:${scriptLiteral(label)},ready:false,run:phase=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>{waiting.delete(phase);reject(Error('shared phase timeout'));},15000);waiting.set(phase,value=>{clearTimeout(timer);resolve(value);});port.postMessage({run:phase});})};
port.onmessage=event=>{if(event.data?.kind==='ready')sharedProbe.ready=true;else if(event.data?.kind==='result'){const done=waiting.get(event.data.phase);if(done){waiting.delete(event.data.phase);done(event.data);}}};
</script>`;
 add(clientAUrl,page('client-a'),'text/html');add(clientBUrl,page('client-b'),'text/html');add(lifecycleOrigin+'/favicon.ico','','image/x-icon');
 return {fixtures,phases};
}
