import {scriptLiteral} from '../../../script-literal.mjs';
// Authored redirect/worker graph. Labels describe probes, not expected decisions.
export const origin='https://page.blanc-fixture.test';
const url=p=>origin+'/blanc-fixture/paths/'+p;
export const entryUrl=url('start.html'),finalUrl=url('index.html');
export function pathFixtures({controlledService=false}={}){
 const fixtures=new Map(),cases=[];
 const add=(u,body,type='text/plain',location=null)=>{if(fixtures.has(u))throw Error('duplicate');fixtures.set(u,{status:location?302:200,contentType:type,body,...(location?{location}:{})});return u;};
 const blocked=(id,type='text/plain',body='authored blocked target')=>add('https://000491b06a.com/blanc-fixture/paths/'+id,body,type);
 const allowed=(id,type='text/plain',body='authored allowed target')=>add(url(id),body,type);
 function chain(id,n,target){let to=target;for(let i=n;i>0;i--)to=add(url(id+'-hop-'+i),'authored redirect','text/plain',to);return to;}
 function item(id,kind,start,hops){cases.push({id,kind,start,hops});return {id,kind,url:start};}
 const operations=[];
 let end=allowed('fetch-end');let start=chain('fetch-allow',1,end);operations.push(item('fetch-allow','fetch',start,[start,end]));
 end=blocked('fetch-block');start=chain('fetch-block',1,end);operations.push(item('fetch-block','fetch',start,[start,end]));
 end=allowed('unreachable-end');start=blocked('blocked-start');fixtures.set(start,{status:302,contentType:'text/plain',body:'authored blocked predecessor',location:end});operations.push(item('blocked-start','fetch',start,[start,end]));
 end=allowed('multi-end');start=chain('multi',2,end);operations.push(item('multi','fetch',start,[start,url('multi-hop-2'),end]));
 for(const state of ['allow','block']){
  end=state==='allow'?allowed('script-end.js','application/javascript','window.pathScripts.push("script-allow");'):blocked('script-block.js','application/javascript','window.pathScripts.push("script-block");');
  start=chain('script-'+state,1,end);operations.push(item('script-'+state,'script',start,[start,end]));
 }
 for(const kind of ['dedicated','shared','service']){
  const fetchAllow=allowed(kind+'-fetch'),fetchBlock=blocked(kind+'-block'),redirectBlock=blocked(kind+'-redirect-block');
  const redirect=chain(kind+'-redirect',1,redirectBlock);
  const importAllow=allowed(kind+'-import.js','application/javascript','self.imported=true;'),importBlock=blocked(kind+'-import-block.js','application/javascript','self.blockedImport=true;');
  const requests=[fetchAllow,fetchBlock,redirect];
  let code=`async function run(){const result={fetches:[],imports:[]};for(const u of ${scriptLiteral([importAllow,importBlock])}){try{importScripts(u);result.imports.push({url:u,outcome:'load'});}catch{result.imports.push({url:u,outcome:'error'});}}for(const u of ${scriptLiteral(requests)}){try{const r=await fetch(u);result.fetches.push({url:u,outcome:'load',body:await r.text()});}catch{result.fetches.push({url:u,outcome:'error'});}}return result;}\n`;
  if(kind==='service'){
   // Imports are first observed during worker evaluation, before installation.
   code=code.replace('async function run(){const result={fetches:[],imports:[]};','const imports=[];const init={imports};'+`for(const u of ${scriptLiteral([importAllow,importBlock])}){try{importScripts(u);imports.push({url:u,outcome:'load'});}catch{imports.push({url:u,outcome:'error'});}}`+'async function run(){const result={fetches:[],imports};');
   const repeat=`for(const u of ${scriptLiteral([importAllow,importBlock])}){try{importScripts(u);result.imports.push({url:u,outcome:'load'});}catch{result.imports.push({url:u,outcome:'error'});}}`;
   code=code.replace(repeat,'');
   code+='oninstall=e=>e.waitUntil(skipWaiting());onactivate=e=>e.waitUntil(clients.claim());onmessage=e=>e.waitUntil(run().then(result=>e.ports[0].postMessage(result)));';
  }else code+=kind==='dedicated'?'run().then(result=>postMessage(result));':'onconnect=e=>{const p=e.ports[0];p.start();run().then(result=>p.postMessage(result));};';
  const worker=allowed(kind+'.js','application/javascript',code);
  operations.push(item(kind,kind,worker,[worker,importAllow,importBlock,fetchAllow,fetchBlock,redirect,redirectBlock]));
 }
 const body=`<!doctype html><meta charset="utf-8"><link rel="icon" href="data:,"><title>Redirect and worker probes</title><script>
window.pathScripts=[];window.pathProbe={done:false,results:[]};(async()=>{for(const c of ${scriptLiteral(operations)}){
 const result=await new Promise(resolve=>{let w;let done=false;const finish=r=>{if(done)return;done=true;clearTimeout(timer);if(c.kind==='dedicated')w?.terminate();if(c.kind==='shared')w?.port.close();resolve({id:c.id,...r});};const timer=setTimeout(()=>finish({outcome:'timeout'}),15000);
 if(c.kind==='fetch'){fetch(c.url).then(async r=>finish({outcome:'load',body:await r.text()}),()=>finish({outcome:'error'}));}
 else if(c.kind==='script'){const s=document.createElement('script');s.onload=()=>finish({outcome:'load'});s.onerror=()=>finish({outcome:'error'});s.src=c.url;document.head.append(s);}
 else if(c.kind==='service'){(async()=>{try{const reg=await navigator.serviceWorker.register(c.url,{scope:${scriptLiteral(controlledService?'/blanc-fixture/paths/':'/blanc-fixture/paths/sw-scope/')}});const worker=reg.active||reg.waiting||reg.installing;if(worker.state!=='activated')await new Promise((ok,fail)=>{worker.addEventListener('statechange',()=>{if(worker.state==='activated')ok();else if(worker.state==='redundant')fail(Error('redundant'));});});if(${scriptLiteral(controlledService)}&&!navigator.serviceWorker.controller)await new Promise(ok=>navigator.serviceWorker.addEventListener('controllerchange',ok,{once:true}));const channel=new MessageChannel();channel.port1.onmessage=e=>{finish({outcome:'load',worker:e.data});channel.port1.close();};worker.postMessage('probe',[channel.port2]);}catch(e){finish({outcome:'error',message:String(e)});}})();}
 else{try{w=c.kind==='shared'?new SharedWorker(c.url):new Worker(c.url);const p=c.kind==='shared'?w.port:w;p.onmessage=e=>finish({outcome:'load',worker:e.data});w.onerror=()=>finish({outcome:'error'});if(c.kind==='shared')p.start();}catch(e){finish({outcome:'error',message:String(e)});}}
 });pathProbe.results.push(result);
}pathProbe.scripts=pathScripts;pathProbe.done=true;})();</script>`;
 add(origin+'/favicon.ico','','image/x-icon');add(finalUrl,body,'text/html');add(entryUrl,'authored navigation redirect','text/plain',finalUrl);
 return {fixtures,cases:[{id:'navigation',kind:'navigation',start:entryUrl,hops:[entryUrl,finalUrl]},...cases]};
}
