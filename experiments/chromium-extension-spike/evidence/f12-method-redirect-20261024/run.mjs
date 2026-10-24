import fs from 'node:fs';
import http from 'node:http';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const root = '/private/tmp/blanc-f12-method-redirect-20261024';
const app = '/private/tmp/blanc-chromium157-update/src/out/BlancPrototype/Blanc Prototype.app';
const assets = '/private/tmp/blanc-prerender-final-20261024/Blanc Chromium Preview.app/Contents/Resources';
let generation = 1, child, browser;
const clients = [], events = [], hits = [];
const report = { complete: false, runs: [], checks: [] };
function check(name, ok, detail) {
  report.checks.push({ name, pass: !!ok, detail });
  assert(ok, name);
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
    } else if (x.method?.startsWith('Network.') || x.method?.startsWith('Tracing.')) events.push(x);
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

const server = http.createServer(async(req,res)=>{
  const parts=req.url.split('/'); const bytes=[]; for await(const chunk of req)bytes.push(chunk);
  const body=Buffer.concat(bytes).toString();
  hits.push({path:req.url,host:req.headers.host,method:req.method,body,contentType:req.headers['content-type']||null,probe:req.headers['x-probe']||null});
  if(parts[1]==='start'){
    const status=Number(parts[2]);const blocked=parts[3]==='block';
    res.writeHead(status,{Location:`http://${blocked?'googleads.g.doubleclick.net':'127.0.0.1'}:${server.address().port}/finish/${parts[2]}/${parts[3]}`,'Cache-Control':'no-store'});res.end();
  }else{res.writeHead(200,{'Content-Type':parts[1]==='page'?'text/html':'application/json','Cache-Control':'no-store'});res.end(parts[1]==='page'?'<title>Method redirects</title><link rel="icon" href="data:,">':JSON.stringify({method:req.method,body}));}
});
async function stopTrace(){await browser.send('Tracing.end');const done=await until(()=>events.find(x=>x.method==='Tracing.tracingComplete'));events.splice(events.indexOf(done),1);let data='';while(true){const r=await browser.send('IO.read',{handle:done.params.stream});data+=r.base64Encoded?Buffer.from(r.data,'base64').toString():r.data;if(r.eof)break;}await browser.send('IO.close',{handle:done.params.stream});return JSON.parse(data).traceEvents;}
try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r)); const origin='http://127.0.0.1:'+server.address().port;
 for(const mode of ['regular','private']){
  events.length=0;const profile=root+'/profile-'+mode;assert(!fs.existsSync(profile));const row={mode,profile,cases:[]};report.runs.push(row);
  const fd=fs.openSync(root+'/'+mode+'-launch.log','w');
  child=spawn(app+'/Contents/MacOS/Blanc Prototype',['--user-data-dir='+profile,'--remote-debugging-port=0','--no-first-run','--no-default-browser-check','--host-resolver-rules=MAP googleads.g.doubleclick.net 127.0.0.1','--blanc-prototype-assets='+assets+'/BlancAssets','--blanc-blocker-assets='+assets+'/BlancBlocker'],{stdio:['ignore',fd,fd]});child.on('exit',(code,signal)=>child.result={code,signal});
  const port=await until(()=>{const p=profile+'/DevToolsActivePort';return fs.existsSync(p)&&Number(fs.readFileSync(p,'utf8').split('\n')[0]);});const base='http://127.0.0.1:'+port;
  browser=await connect((await fetch(base+'/json/version').then(r=>r.json())).webSocketDebuggerUrl);
  const context=mode==='private'?(await browser.send('Target.createBrowserContext',{disposeOnDetach:true})).browserContextId:null;row.browserContextId=context;
  const target=await browser.send('Target.createTarget',{url:origin+'/page',...(context?{browserContextId:context}:{})});
  const info=await until(async()=>(await fetch(base+'/json/list').then(r=>r.json())).find(t=>t.id===target.targetId));const page=await connect(info.webSocketDebuggerUrl);await page.send('Page.navigate',{url:origin+'/page'});await until(()=>page.eval('location.href==='+JSON.stringify(origin+'/page')));await page.send('Network.enable');
  await browser.send('Tracing.start',{categories:'-*,disabled-by-default-blanc.attribution',transferMode:'ReturnAsStream'});
  for(const status of [303,308])for(const outcome of ['allow','block']){
   const path=`/start/${status}/${outcome}`, body=`${mode}-${status}-${outcome}`, start=hits.length;
   const value=await page.eval(`(async()=>{try{const r=await fetch(${JSON.stringify(origin+path)},{method:'POST',body:${JSON.stringify(body)},headers:{'Content-Type':'text/plain','X-Probe':'method-check'}});return {ok:true,status:r.status,data:await r.json()}}catch(e){return {ok:false,error:e.name}}})()`);
   const request=await until(()=>events.find(e=>e.method==='Network.requestWillBeSent'&&e.params.request.url===origin+path));
   row.cases.push({status,outcome,body,value,requestId:request.params.requestId,serverHits:hits.slice(start)});
  }
  const trace=await stopTrace();fs.writeFileSync(root+'/'+mode+'-trace.json',JSON.stringify(trace,null,2));row.decisions=trace.filter(e=>e.name==='Blanc.RequestDecision');row.networkEvents=events.filter(e=>e.method?.startsWith('Network.'));
  for(const c of row.cases){
   const label=`${mode}/${c.status}/${c.outcome}`;const expected=c.status===303?'GET':'POST';const key=createHash('sha256').update(c.requestId).digest('hex').toUpperCase();const decisions=row.decisions.filter(d=>d.args.request_digest===key);c.nativeDecisions=decisions;
   check(label+': exact request has initial and redirected decisions',decisions.length===2&&decisions[0].args.redirect_index===0&&decisions[1].args.redirect_index===1,decisions);
   check(label+': native method and profile follow redirect',decisions[0].args.method==='POST'&&decisions[1].args.method===expected&&decisions.every(d=>d.args.private===(mode==='private')));
   check(label+': expected native terminal decision',decisions[0].args.result===0&&decisions[1].args.result===(c.outcome==='allow'?0:1));
   const terminal=c.serverHits.filter(h=>h.path.startsWith('/finish/'));
   check(label+': initial POST body and header reach only authored start',c.serverHits[0].method==='POST'&&c.serverHits[0].body===c.body&&c.serverHits[0].probe==='method-check');
   if(c.outcome==='allow'){
    check(label+': final method body and response match',c.value.ok&&terminal.length===1&&terminal[0].method===expected&&terminal[0].body===(expected==='GET'?'':c.body)&&c.value.data.method===expected&&c.value.data.body===terminal[0].body);
    check(label+': content type is removed only on POST to GET',terminal[0].contentType===(expected==='GET'?null:'text/plain'));
   }else check(label+': blocked redirect rejects without destination arrival',!c.value.ok&&terminal.length===0);
  }
  check(mode+': trace payload is limited to opaque key method hop profile result',row.decisions.every(d=>Object.keys(d.args).every(k=>['request_digest','method','redirect_index','private','result'].includes(k))&&!JSON.stringify(d.args).includes(origin)));
  await browser.send('Browser.close');await until(()=>child.result);row.exit=child.result;check(mode+': clean browser exit',row.exit.code===0&&!row.exit.signal);clients.splice(0).forEach(c=>c.close());child=null;browser=null;
 }
 report.complete=true;
}catch(error){report.error=String(error.stack||error)}finally{if(browser)await browser.send('Browser.close').catch(()=>{});if(child)await until(()=>child.result,8000).catch(()=>child.kill('SIGTERM'));clients.forEach(c=>c.close());server.closeAllConnections();await new Promise(r=>server.close(r));report.serverHits=hits;fs.writeFileSync(root+'/report.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({complete:report.complete,checks:report.checks.map(c=>({name:c.name,pass:c.pass})),error:report.error}));}if(!report.complete)process.exitCode=1;
