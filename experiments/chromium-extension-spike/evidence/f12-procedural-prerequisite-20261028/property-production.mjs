import fs from 'node:fs';
import http from 'node:http';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
const dir=process.argv[2],kind=process.argv[3]||'regular';assert(dir&&!fs.existsSync(dir));fs.mkdirSync(dir,{recursive:true});
const portReservation=http.createServer();await new Promise(r=>portReservation.listen(0,'127.0.0.1',r));const debugPort=portReservation.address().port;await new Promise(r=>portReservation.close(r));
const profile=process.env.BLANC_UI_RESTART_PROFILE||dir+'/profile',checks=[],hits=[];let child;const connections=[];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,ms=20000){const end=Date.now()+ms;while(Date.now()<end){try{const v=await fn();if(v)return v}catch{}await sleep(100)}throw Error('condition timeout')}
async function connect(url){const endpoint=new URL(url);assert(endpoint.protocol==='ws:'&&endpoint.hostname==='127.0.0.1'&&endpoint.port===String(debugPort)&&/^\/devtools\/(browser|page)\/[a-zA-Z0-9-]+$/.test(endpoint.pathname)&&!endpoint.search&&!endpoint.hash&&!endpoint.username&&!endpoint.password,'Unexpected CDP endpoint');const w=new WebSocket(endpoint.href);await new Promise((r,j)=>{w.onopen=r;w.onerror=j});let i=0;const p=new Map();w.onmessage=e=>{const x=JSON.parse(e.data),q=p.get(x.id);if(q){p.delete(x.id);clearTimeout(q.t);x.error?q.j(Error(JSON.stringify(x.error))):q.r(x.result)}};const c={send(method,params={}){return new Promise((r,j)=>{const id=++i,t=setTimeout(()=>{p.delete(id);j(Error(method+' timeout'))},15000);p.set(id,{r,j,t});w.send(JSON.stringify({id,method,params}))})},async eval(expression){const r=await c.send('Runtime.evaluate',{expression:'(async()=>('+expression+'))()',awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value}};connections.push(w);return c}
function check(name,value,detail){checks.push({name,pass:!!value,detail});fs.writeFileSync(dir+'/progress.json',JSON.stringify(checks,null,2));assert(value,name)}
const server=http.createServer((req,res)=>{hits.push(req.url);
if(req.url==='/foreign.css'){res.setHeader('Content-Type','text/css');res.setHeader('Access-Control-Allow-Origin','*');res.end('.foreign::before {content:"Partner";}');return;}
res.setHeader('Content-Type','text/html');res.end('<title>Recovery UI fixture</title><style id="source">.subject::before {content:"Partner";}</style><link rel="stylesheet" crossorigin="anonymous" href="http://foreign.example:'+server.address().port+'/foreign.css"><section class="pMain" id="target"><div class="subject"></div></section><section class="pMain" id="neutral"><div>Ordinary</div></section><section class="pMain" id="foreign"><div class="foreign"></div></section><div id="outside"></div>')});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://gamepadla.com:'+server.address().port;
const binary=process.env.BLANC_UI_BINARY||'/Users/anthonyjloria/Projects/BlancChromium157Recovery/src/out/BlancPrototype/Blanc Prototype.app/Contents/MacOS/Blanc Prototype';
const repo='/Users/anthonyjloria/Documents/ChatGPT/Blanc Browser/Chromium Preview/repo/experiments/chromium-extension-spike';
const args=['--host-resolver-rules=MAP gamepadla.com 127.0.0.1, MAP foreign.example 127.0.0.1, MAP neutral.example 127.0.0.1','--no-proxy-server','--user-data-dir='+profile,'--remote-debugging-port='+debugPort,'--no-first-run','--no-default-browser-check','--use-mock-keychain',...(process.env.BLANC_UI_BINARY?[]:['--blanc-prototype-assets='+repo+'/generated','--blanc-blocker-assets=/Users/anthonyjloria/Documents/ChatGPT/Blanc Browser/Chromium Preview/artifacts/procedural-properties-combined-20261028']),...(kind==='private'?['--incognito']:[]),origin+'/start'];
let report={kind,binary,args,checks,complete:false};
try{const fd=fs.openSync(dir+'/launch.log','w');child=spawn(binary,args,{stdio:['ignore',fd,fd]});child.on('exit',(code,signal)=>report.exit={code,signal});const base='http://127.0.0.1:'+debugPort;const version=await until(async()=>{const response=await fetch(base+'/json/version');return response.ok&&response.json()});const browser=await connect(version.webSocketDebuggerUrl);
const targets=()=>fetch(base+'/json/list').then(r=>r.json());const pageInfo=await until(async()=>(await targets()).find(t=>t.url===origin+'/start'));const page=await connect(pageInfo.webSocketDebuggerUrl);
await until(async()=>await page.eval('document.title')==='Recovery UI fixture',40000);check('healthy request reaches fixture',true);
const islandInfo=await until(async()=>(await targets()).find(t=>t.url.startsWith('chrome://blanc-prototype')));const island=await connect(islandInfo.webSocketDebuggerUrl);
await island.eval(`globalThis.fixtureRpc=(method)=>new Promise((resolve,reject)=>{const id='fixture-'+crypto.randomUUID(),old=window.blancPrototypeReply;window.blancPrototypeReply=(n,ok,v)=>{if(n===id){window.blancPrototypeReply=old;ok?resolve(v):reject(Error(String(v)))}else old(n,ok,v)};chrome.send('blancPrototype',[id,method,[]])})`);
check('health is ready',await island.eval('(await fixtureRpc("snapshot")).blockerHealth')==='ready');
const hidden=id=>page.eval('getComputedStyle(document.getElementById('+JSON.stringify(id)+')).display===\"none\"');
await until(()=>hidden('target'));check('pinned nested property rule hides parent',true);
check('neutral parent remains visible',!await hidden('neutral'));
await until(()=>page.eval('getComputedStyle(document.querySelector(".foreign"),"::before").content.includes("Partner")'));
check('readable foreign stylesheet excluded',!await hidden('foreign'));
await page.eval('document.getElementById("source").textContent='+JSON.stringify('.subject::before {content: "Ordinary";}'));
await until(async()=>!await hidden('target'));check('stylesheet mutation removes stale hide',true);
await page.eval('document.getElementById("source").textContent='+JSON.stringify('.subject::before {content: "Partner";}'));
await until(()=>hidden('target'));check('stylesheet mutation restores hide',true);
await page.eval('document.getElementById("outside").append(document.querySelector(".subject"))');
await until(async()=>!await hidden('target'));check('matching child moved outside parent reveals it',true);
await page.eval('document.getElementById("target").append(document.querySelector(".subject"))');
await until(()=>hidden('target'));check('matching child returned hides parent',true);
report.complete=true;report.stage='affected native cosmetics and pinned scriptlet controls';fs.writeFileSync(dir+'/protocol-report.json',JSON.stringify(report,null,2));if(process.env.BLANC_UI_HOLD==='1'){fs.writeFileSync(dir+'/live.json',JSON.stringify({pid:child.pid,base,origin,kind}));await until(()=>fs.existsSync(dir+'/release'),3600000)}await browser.send('Browser.close');
}catch(e){console.error(e);report.error='Fixture failed; inspect captured stderr and launch.log'}finally{connections.forEach(w=>w.close());if(child&&!report.exit){child.kill('SIGTERM');await sleep(1000)}server.closeAllConnections();await new Promise(r=>server.close(r));report.requestCount=hits.length;fs.writeFileSync(dir+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify({complete:report.complete,error:report.error,checks:checks.length}));}if(!report.complete)process.exitCode=1;
