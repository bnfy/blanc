import fs from 'node:fs';
import http from 'node:http';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {callFunction} from '/private/tmp/blanc-chromium157-work/experiments/chromium-extension-spike/cdp-function.mjs';
const root=process.argv[2];assert(root?.startsWith('/private/tmp/blanc-f12-navigation-restart-20261026/'));
const app=process.argv[3]||'/private/tmp/blanc-navigation-candidate-20261026/Blanc Chromium Preview.app';
const native=process.argv.includes('--native');
const assets='/private/tmp/blanc-navigation-candidate-20261026/Blanc Chromium Preview.app/Contents/Resources';
const report={complete:false,runs:[],checks:[]},clients=[],events=[],hits=[];let child,browser;
function check(name,pass,detail){report.checks.push({name,pass:!!pass,detail});}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,ms=20000){const end=Date.now()+ms;while(Date.now()<end){const r=await fn();if(r)return r;await sleep(50);}throw Error('condition timeout');}
async function connect(url){const ws=new WebSocket(url);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});let id=0;const pending=new Map();ws.onmessage=({data})=>{const e=JSON.parse(data);if(e.id){const p=pending.get(e.id);if(p){pending.delete(e.id);clearTimeout(p.timer);e.error?p.reject(Error(JSON.stringify(e.error))):p.resolve(e.result);}}else if(e.method)events.push(e);};const c={close:()=>ws.close(),send(method,params={}){return new Promise((resolve,reject)=>{const n=++id,timer=setTimeout(()=>{pending.delete(n);reject(Error(method+' timeout'));},45000);pending.set(n,{resolve,reject,timer});ws.send(JSON.stringify({id:n,method,params}));});}};clients.push(c);return c;}
const server=http.createServer((req,res)=>{hits.push({url:req.url,host:req.headers.host,method:req.method});if(req.url.startsWith('/start/')){res.writeHead(302,{Location:req.url.replace('/start/','/original/')});res.end();}else{res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'});res.end('<!doctype html><title>Navigation restart fixture</title><link rel="icon" href="data:,"><body>navigation replacement destination</body>');}});
async function stopTrace(){await browser.send('Tracing.end');const done=await until(()=>events.find(e=>e.method==='Tracing.tracingComplete'));events.splice(events.indexOf(done),1);let data='';while(true){const r=await browser.send('IO.read',{handle:done.params.stream});data+=r.base64Encoded?Buffer.from(r.data,'base64').toString():r.data;if(r.eof)break;}await browser.send('IO.close',{handle:done.params.stream});return JSON.parse(data).traceEvents;}
try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port,origin='http://127.0.0.1:'+port;
 const engine=fs.readFileSync(assets+'/BlancBlocker/engine.js');const oracle=vm.createContext({blancEncode:s=>new TextEncoder().encode(s),blancDecode:b=>new TextDecoder('utf8',{ignoreBOM:true}).decode(b)});vm.runInContext(engine.toString(),oracle,{timeout:30000});
 const blocked='http://googleads.g.doubleclick.net:'+port+'/blocked';report.oracle={engineSha256:createHash('sha256').update(engine).digest('hex'),mainFrame:oracle.blancDecide(blocked,'mainFrame',origin),subFrame:oracle.blancDecide(blocked,'subFrame',origin)};assert.equal(report.oracle.mainFrame,0);assert.equal(report.oracle.subFrame,1);
 for(const mode of ['regular','private']){
  events.length=0;const profile=root+'/profile-'+mode;assert(!fs.existsSync(profile));fs.mkdirSync(profile);const row={mode,profile,cases:[]};report.runs.push(row);const fd=fs.openSync(root+'/'+mode+'-launch.log','w');
  const args=['--user-data-dir='+profile,'--remote-debugging-port=0','--no-first-run','--no-default-browser-check','--host-resolver-rules=MAP googleads.g.doubleclick.net 127.0.0.1'];if(native)args.push('--blanc-prototype-assets='+assets+'/BlancAssets','--blanc-blocker-assets='+assets+'/BlancBlocker');
  child=spawn(app+'/Contents/MacOS/'+(native?'Blanc Prototype':'Blanc Preview Launcher'),args,{stdio:['ignore',fd,fd]});child.on('exit',(code,signal)=>child.result={code,signal});
  const debugPort=await until(()=>{const p=profile+'/DevToolsActivePort';return fs.existsSync(p)&&Number(fs.readFileSync(p,'utf8').split('\n')[0]);});const base='http://127.0.0.1:'+debugPort;browser=await connect((await fetch(base+'/json/version').then(r=>r.json())).webSocketDebuggerUrl);const context=mode==='private'?(await browser.send('Target.createBrowserContext',{disposeOnDetach:true})).browserContextId:null;row.browserContextId=context;
  const target=await browser.send('Target.createTarget',{url:origin+'/page',...(context?{browserContextId:context}:{})});const info=await until(async()=>(await fetch(base+'/json/list').then(r=>r.json())).find(x=>x.id===target.targetId));const page=await connect(info.webSocketDebuggerUrl);await page.send('Network.enable');await page.send('Page.enable');await page.send('Page.navigate',{url:origin+'/page'});await until(()=>callFunction(page,url=>location.href===url,[origin+'/page']));
  await page.send('Fetch.enable',{patterns:[{urlPattern:'*',requestStage:'Request'}]});
  for(const kind of ['main-same']){
   const label=kind+'/'+mode,url=origin+'/start/'+label,replacement=((kind==='sub-allow'||kind==='main-same')?origin:'http://googleads.g.doubleclick.net:'+port)+'/replacement/'+label;
   const start=hits.length,eventStart=events.length,handled=new Set(),result={kind,url,replacement,interceptions:[]};row.cases.push(result);
   await browser.send('Tracing.start',{categories:'-*,disabled-by-default-blanc.attribution',transferMode:'ReturnAsStream'});
   let done=false;
   const operation=(kind.startsWith('main')?page.send('Page.navigate',{url}).then(value=>({navigation:value})):callFunction(page,url=>new Promise(resolve=>{document.querySelectorAll('iframe').forEach(f=>f.remove());const f=document.createElement('iframe');f.onload=()=>resolve({dom:'load'});f.onerror=()=>resolve({dom:'error'});f.src=url;document.body.append(f);}),[url])).then(value=>{done=true;return value;});
   const deadline=Date.now()+20000;
   while(!done&&Date.now()<deadline){
    for(const e of events.slice(eventStart).filter(e=>e.method==='Fetch.requestPaused'&&!handled.has(e.params.requestId))){
     const q=e.params;handled.add(q.requestId);const args={requestId:q.requestId};if(q.request.url===origin+'/original/'+label)args.url=replacement;
     result.interceptions.push({url:q.request.url,networkId:q.networkId,requestId:q.requestId,replacement:args.url||null});await page.send('Fetch.continueRequest',args);
    }
    await sleep(10);
   }
   assert(done,'intercepted navigation did not finish');result.value=await operation;
   const trace=await stopTrace();fs.writeFileSync(root+'/'+mode+'-'+kind+'-trace.json',JSON.stringify(trace,null,2));result.native=trace.filter(e=>['Blanc.RequestDecision','Blanc.RedirectFollow'].includes(e.name));result.events=events.slice(eventStart).filter(e=>e.method.startsWith('Network.'));result.hits=hits.slice(start);
   const ids=new Set(result.interceptions.map(q=>q.networkId).filter(Boolean));const digests=new Set([...ids].map(id=>createHash('sha256').update(id).digest('hex').toUpperCase()));const decisions=result.native.filter(e=>e.name==='Blanc.RequestDecision');result.decisions=decisions;
   check(mode+'/'+kind+': exactly one redirected URL replacement',result.interceptions.filter(q=>q.replacement===replacement).length===1,result.interceptions);
   check(mode+'/'+kind+': original redirect URL never arrives',!result.hits.some(h=>h.url==='/original/'+label),result.hits);
   check(mode+'/'+kind+': initial request arrives exactly once',result.hits.filter(h=>h.url==='/start/'+label).length===1,result.hits);
   check(mode+'/'+kind+': replacement admission matches frame policy',result.hits.filter(h=>h.url==='/replacement/'+label).length===(kind==='sub-block'?0:1),result.hits);
   check(mode+'/'+kind+': all native decisions join actual intercepted request identity',decisions.length>0&&decisions.every(e=>digests.has(e.args.request_digest)),result.native);
   check(mode+'/'+kind+': native decisions preserve private context',decisions.length>0&&decisions.every(e=>e.args.private===(mode==='private')));
   check(mode+'/'+kind+': replacement restart gets a new zero-index decision',decisions.length===3&&decisions.map(e=>e.args.redirect_index).join(',')==='0,1,0'&&decisions[0].args.result===0&&decisions[1].args.result===0&&decisions[2].args.result===(kind==='sub-block'?1:0),decisions);
   if(kind.startsWith('main'))check(mode+'/main: replacement commits under deliberate main-frame allow',!result.value.navigation.errorText&&await callFunction(page,()=>document.title,[])==='Navigation restart fixture',result.value);
  }
  await page.send('Fetch.disable');
  await browser.send('Browser.close');await until(()=>child.result);row.exit=child.result;check(mode+': clean browser exit',child.result.code===0&&!child.result.signal);clients.splice(0).forEach(c=>c.close());child=null;browser=null;
 }
 report.complete=true;
}catch(error){report.error=String(error.stack||error);}finally{if(browser)await browser.send('Browser.close').catch(()=>{});if(child)await until(()=>child.result,10000).catch(()=>child.kill('SIGTERM'));clients.forEach(c=>c.close());server.closeAllConnections();await new Promise(r=>server.close(r));report.hits=hits;fs.writeFileSync(root+'/report.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({complete:report.complete,passed:report.checks.filter(x=>x.pass).length,failed:report.checks.filter(x=>!x.pass).map(x=>x.name),error:report.error}));}if(!report.complete||report.checks.some(x=>!x.pass))process.exitCode=1;
