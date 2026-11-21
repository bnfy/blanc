import fs from 'node:fs';
import http from 'node:http';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {callFunction} from '/private/tmp/blanc-chromium157-work/experiments/chromium-extension-spike/cdp-function.mjs';
const root=process.argv[2];assert(root?.startsWith('/private/tmp/blanc-f12-navigation-20261026/'));
const app=process.argv[3]||'/private/tmp/blanc-devtools-candidate-20261026/Blanc Chromium Preview.app';
const native=process.argv.includes('--native');
const assets='/private/tmp/blanc-devtools-candidate-20261026/Blanc Chromium Preview.app/Contents/Resources';
const report={complete:false,runs:[],checks:[]},clients=[],events=[],hits=[];let child,browser;
function check(name,pass,detail){report.checks.push({name,pass:!!pass,detail});}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,ms=20000){const end=Date.now()+ms;while(Date.now()<end){const r=await fn();if(r)return r;await sleep(50);}throw Error('condition timeout');}
async function connect(url){const ws=new WebSocket(url);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});let id=0;const pending=new Map();ws.onmessage=({data})=>{const e=JSON.parse(data);if(e.id){const p=pending.get(e.id);if(p){pending.delete(e.id);clearTimeout(p.timer);e.error?p.reject(Error(JSON.stringify(e.error))):p.resolve(e.result);}}else if(e.method)events.push(e);};const c={close:()=>ws.close(),send(method,params={}){return new Promise((resolve,reject)=>{const n=++id,timer=setTimeout(()=>{pending.delete(n);reject(Error(method+' timeout'));},45000);pending.set(n,{resolve,reject,timer});ws.send(JSON.stringify({id:n,method,params}));});}};clients.push(c);return c;}
const server=http.createServer((req,res)=>{hits.push({url:req.url,host:req.headers.host,method:req.method});res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'});res.end('<!doctype html><title>Navigation admission fixture</title><link rel="icon" href="data:,"><body>isolated navigation fixture</body>');});
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
  for(const outcome of ['allow','block']){
   const url=(outcome==='allow'?origin:'http://googleads.g.doubleclick.net:'+port)+'/'+outcome+'/'+mode,start=hits.length,eventStart=events.length;const result={outcome,url};row.cases.push(result);
   await browser.send('Tracing.start',{categories:'-*,disabled-by-default-blanc.attribution',transferMode:'ReturnAsStream'});
   result.dom=await callFunction(page,url=>new Promise(resolve=>{document.querySelectorAll('iframe').forEach(f=>f.remove());const f=document.createElement('iframe');f.onload=()=>resolve('load');f.onerror=()=>resolve('error');f.src=url;document.body.append(f);}),[url]);
   const trace=await stopTrace();fs.writeFileSync(root+'/'+mode+'-'+outcome+'-trace.json',JSON.stringify(trace,null,2));result.native=trace.filter(e=>e.name==='Blanc.RequestDecision');result.events=events.slice(eventStart).filter(e=>e.method.startsWith('Network.')||e.method.startsWith('Page.'));result.hits=hits.slice(start);const request=result.events.find(e=>e.method==='Network.requestWillBeSent'&&e.params.request.url===url);result.requestId=request?.params.requestId;const digest=request&&createHash('sha256').update(request.params.requestId).digest('hex').toUpperCase();result.decisions=result.native.filter(e=>e.args.request_digest===digest);
   check(mode+'/'+outcome+': protocol observes exact subframe document',request?.params.type==='Document'&&!!request.params.frameId);
   check(mode+'/'+outcome+': admission matches engine before server arrival',outcome==='allow'?result.hits.some(h=>h.url==='/'+outcome+'/'+mode):!result.hits.some(h=>h.url==='/'+outcome+'/'+mode),result.hits);
   check(mode+'/'+outcome+': native decision joins exact request and profile',result.decisions.length===1&&result.decisions[0].args.private===(mode==='private')&&result.decisions[0].args.result===(outcome==='allow'?0:1),result.native);
  }
  await browser.send('Browser.close');await until(()=>child.result);row.exit=child.result;check(mode+': clean browser exit',child.result.code===0&&!child.result.signal);clients.splice(0).forEach(c=>c.close());child=null;browser=null;
 }
 report.complete=true;
}catch(error){report.error=String(error.stack||error);}finally{if(browser)await browser.send('Browser.close').catch(()=>{});if(child)await until(()=>child.result,10000).catch(()=>child.kill('SIGTERM'));clients.forEach(c=>c.close());server.closeAllConnections();await new Promise(r=>server.close(r));report.hits=hits;fs.writeFileSync(root+'/report.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({complete:report.complete,passed:report.checks.filter(x=>x.pass).length,failed:report.checks.filter(x=>!x.pass).map(x=>x.name),error:report.error}));}if(!report.complete||report.checks.some(x=>!x.pass))process.exitCode=1;
