import { callFunction } from '../../cdp-function.mjs';
import fs from 'node:fs';
import http from 'node:http';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const root = '/private/tmp/blanc-f12-redirect-overrides-20261024/signed';
const app = '/private/tmp/blanc-prerender-final-20261024/Blanc Chromium Preview.app';
const assets = '/private/tmp/blanc-prerender-final-20261024/Blanc Chromium Preview.app/Contents/Resources';
let generation = 1, child, browser;
const clients = [], events = [], hits = [];
const report = { complete: false, runs: [], checks: [] };
function check(name, ok, detail) {
  report.checks.push({ name, pass: !!ok, detail });
  // Keep collecting independent cases; retain failures in the final report.
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 15000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { const x = await fn(); if (x) return x; await sleep(100); }
  throw Error('condition timeout');
}
async function connect(url) {
  const ws = new WebSocket(url);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let id = 0;
  const pending = new Map();
  ws.onmessage = ({ data }) => {
    const x = JSON.parse(data);
    if (x.id) {
      const f = pending.get(x.id);
      if (f) { pending.delete(x.id); clearTimeout(f.timer); x.error ? f.reject(Error(JSON.stringify(x.error))) : f.resolve(x.result); }
    } else if (x.method?.startsWith('Network.') || x.method?.startsWith('Tracing.') || x.method?.startsWith('Fetch.')) events.push(x);
  };
  const c = {
    close: () => ws.close(),
    send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const n = ++id, timer = setTimeout(() => { pending.delete(n); reject(Error(method + ' timeout')); }, 25000);
        pending.set(n, { resolve, reject, timer }); ws.send(JSON.stringify({ id: n, method, params }));
      });
    },
    async eval(expression) {
      const x = await c.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (x.exceptionDetails) throw Error(JSON.stringify(x.exceptionDetails));
      return x.result.value;
    }
  };
  clients.push(c); return c;
}


const server=http.createServer((req,res)=>{
 const path=req.url, label=path.split('/').at(-1);
 hits.push({path,host:req.headers.host,method:req.method,keep:req.headers['x-keep']||null,remove:req.headers['x-remove']||null,edited:req.headers['x-edited']||null});
 if(path.startsWith('/start/')){res.writeHead(302,{Location:(label==='headers'?'/hop/':'/original/')+label});res.end();}
 else if(path.startsWith('/hop/')){res.writeHead(302,{Location:'/finish/'+label});res.end();}
 else {res.writeHead(200,{'Content-Type':path==='/page'?'text/html':'application/json','Cache-Control':'no-store'});res.end(path==='/page'?'<title>Redirect override checks</title><link rel="icon" href="data:,">':JSON.stringify({path}));}
});
async function stopTrace(){await browser.send('Tracing.end');const done=await until(()=>events.find(x=>x.method==='Tracing.tracingComplete'));events.splice(events.indexOf(done),1);let data='';while(true){const r=await browser.send('IO.read',{handle:done.params.stream});data+=r.base64Encoded?Buffer.from(r.data,'base64').toString():r.data;if(r.eof)break;}await browser.send('IO.close',{handle:done.params.stream});return JSON.parse(data).traceEvents;}
try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 for(const mode of ['regular','private']){
  events.length=0;const profile=root+'/profile-final-'+mode;assert(!fs.existsSync(profile));const row={mode,profile,cases:[]};report.runs.push(row);const fd=fs.openSync(root+'/'+mode+'-launch.log','w');
  child=spawn(app+'/Contents/MacOS/Blanc Preview Launcher',['--user-data-dir='+profile,'--remote-debugging-port=0','--no-first-run','--no-default-browser-check','--host-resolver-rules=MAP googleads.g.doubleclick.net 127.0.0.1'],{stdio:['ignore',fd,fd]});child.on('exit',(code,signal)=>child.result={code,signal});
  const port=await until(()=>{const p=profile+'/DevToolsActivePort';return fs.existsSync(p)&&Number(fs.readFileSync(p,'utf8').split('\n')[0]);});const base='http://127.0.0.1:'+port;browser=await connect((await fetch(base+'/json/version').then(r=>r.json())).webSocketDebuggerUrl);
  const context=mode==='private'?(await browser.send('Target.createBrowserContext',{disposeOnDetach:true})).browserContextId:null;row.browserContextId=context;
  const target=await browser.send('Target.createTarget',{url:origin+'/page',...(context?{browserContextId:context}:{})});const info=await until(async()=>(await fetch(base+'/json/list').then(r=>r.json())).find(t=>t.id===target.targetId));const page=await connect(info.webSocketDebuggerUrl);await page.send('Page.navigate',{url:origin+'/page'});await until(()=>callFunction(page, url => location.href === url, [origin+'/page']));await page.send('Network.enable');const controlStart=hits.length;const direct=await callFunction(page, url => fetch(url).then(()=>true,()=>false), ['http://googleads.g.doubleclick.net:'+server.address().port+'/control-block']);row.directControl={resolved:direct,serverHits:hits.slice(controlStart),errors:events.filter(e=>e.method==='Network.loadingFailed')};check(mode+': direct blocked-host control is refused before server arrival',!direct&&hits.length===controlStart&&row.directControl.errors.some(e=>e.params.errorText.includes('ERR_BLOCKED_BY_CLIENT')));await page.send('Fetch.enable',{patterns:[{urlPattern:'*',requestStage:'Request'}]});
  for(const label of ['replace-block']){
   const start=hits.length, eventStart=events.length, handled=new Set();const c={label,interceptions:[]};row.cases.push(c);
   await browser.send('Tracing.start',{categories:'-*,disabled-by-default-blanc.attribution',transferMode:'ReturnAsStream'});
   let done=false;const fp=callFunction(page, async url => {try{const r=await fetch(url,{headers:{'X-Keep':'original-keep','X-Remove':'original-remove'}});return {ok:true,data:await r.json()}}catch(e){return {ok:false,error:e.name}}}, [origin+'/start/'+label]).then(value=>{done=true;return value;});
   const deadline=Date.now()+15000;
   while(!done && Date.now()<deadline){
    for(const e of events.slice(eventStart).filter(e=>e.method==='Fetch.requestPaused'&&!handled.has(e.params.requestId))){
     const q=e.params;handled.add(q.requestId);const path=new URL(q.request.url).pathname;const args={requestId:q.requestId};
     if(label==='headers'&&path==='/hop/headers'){
      args.headers=Object.entries(q.request.headers).filter(([k])=>!['x-remove','x-edited'].includes(k.toLowerCase())).map(([name,value])=>({name,value:String(value)}));args.headers.push({name:'X-Edited',value:'redirect-edit'});
     }
     if(label!=='headers'&&path==='/original/'+label) args.url=`http://${label==='replace-block'?'googleads.g.doubleclick.net':'127.0.0.1'}:${server.address().port}/replacement/${label}`;
     c.interceptions.push({path,networkId:q.networkId,requestId:q.requestId,modifiedHeaders:!!args.headers,replacement:args.url||null});await page.send('Fetch.continueRequest',args);
    }
    await sleep(10);
   }
   assert(done,'intercepted request did not complete');c.value=await fp;c.serverHits=hits.slice(start);c.networkEvents=events.slice(eventStart).filter(e=>e.method.startsWith('Network.'));
   const trace=await stopTrace();fs.writeFileSync(root+'/'+mode+'-'+label+'-trace.json',JSON.stringify(trace,null,2));c.native=trace.filter(e=>['Blanc.RequestDecision','Blanc.RedirectFollow'].includes(e.name));
   check(mode+': signed candidate refuses the replaced blocked URL',!c.value.ok&&!c.serverHits.some(h=>h.path==='/replacement/replace-block'),c.serverHits);

  }
  await page.send('Fetch.disable');await browser.send('Browser.close');await until(()=>child.result);row.exit=child.result;check(mode+': clean browser exit',row.exit.code===0&&!row.exit.signal);clients.splice(0).forEach(c=>c.close());child=null;browser=null;
 }
 report.finished=true;report.complete=report.checks.every(c=>c.pass);
}catch(error){report.error=String(error.stack||error)}finally{if(browser)await browser.send('Browser.close').catch(()=>{});if(child)await until(()=>child.result,8000).catch(()=>child.kill('SIGTERM'));clients.forEach(c=>c.close());server.closeAllConnections();await new Promise(r=>server.close(r));report.serverHits=hits;fs.writeFileSync(root+'/report.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({complete:report.complete,checks:report.checks.map(c=>({name:c.name,pass:c.pass})),error:report.error}));}if(!report.complete)process.exitCode=1;
