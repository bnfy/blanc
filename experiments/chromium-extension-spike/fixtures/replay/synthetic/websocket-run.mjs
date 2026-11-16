// Native-only handshake evidence. No live upstream servers or permanent profiles.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {serve} from '../pipeline/transport.mjs';
import {createCertificateSet} from './certificate-set.mjs';
import {openSession,pause} from './session.mjs';
import {acceptFixtureWebSocket} from './websocket-handshake.mjs';
const [configFile,evidence]=process.argv.slice(2),config=JSON.parse(fs.readFileSync(configFile));
assert(evidence&&!fs.existsSync(evidence));fs.mkdirSync(evidence,{recursive:true});
const root=fs.mkdtempSync(path.join(os.tmpdir(),'blanc-websocket-'));
const hosts=['page.blanc-fixture.test','000491b06a.com'];
const origin='https://'+hosts[0];
const certificates=createCertificateSet(path.join(root,'certificates'),hosts);
const sha=b=>createHash('sha256').update(b).digest('hex');
const report={nativeOnly:true,pairedParity:false,passed:false,runs:[],engineSha256:sha(fs.readFileSync(path.join(config.engine,'engine.js'))),harnessSha256:sha(fs.readFileSync(new URL(import.meta.url)))};
// Fixed authored worker sources; no reflected request URL or script interpolation.
const connectSource=`async function connect(url){return new Promise(resolve=>{
const ws=new WebSocket(url,'blanc-fixture');const timer=setTimeout(()=>{ws.close();resolve({timeout:true});},10000);
ws.onmessage=e=>{clearTimeout(timer);resolve({message:e.data,protocol:ws.protocol});ws.close();};
ws.onerror=()=>{clearTimeout(timer);resolve({error:true});};});}`;
const sources={
 '/dedicated.js':connectSource+';onmessage=async e=>postMessage(await connect(e.data));',
 '/shared.js':connectSource+';onconnect=e=>{const p=e.ports[0];p.onmessage=async e=>p.postMessage(await connect(e.data));p.start();};',
 '/service.js':connectSource+';oninstall=e=>e.waitUntil(skipWaiting());onactivate=e=>e.waitUntil(clients.claim());onmessage=e=>e.waitUntil(connect(e.data).then(r=>e.ports[0].postMessage(r)));',
};
let session,transport,currentRun;
try{
 for(const kind of ['regular','private']){
  const arrivals=[],faults=[];
  transport=await serve({hosts,tlsMaterial:certificates,fault:(code,authority)=>faults.push({code,authority}),upgrade:(req,socket,head)=>acceptFixtureWebSocket(req,socket,head,arrivals),respond:async(req,res)=>{
   if(req.headers.host!==hosts[0]||!['/entry','/favicon.ico',...Object.keys(sources)].includes(req.url)){res.writeHead(404);res.end();return;}
   res.writeHead(200,{'Content-Type':sources[req.url]?'text/javascript':'text/html','Cache-Control':'no-store'});res.end(sources[req.url]||'<!doctype html><title>WebSocket fixture</title>');
  }});
  session=await openSession({config,browserKind:'chromium',kind,label:kind,root,transport,certificates});
  await session.page.goto(origin+'/entry');
  const outcomes=[];currentRun={kind,outcomes,arrivals,faults};
  for(const owner of ['document','dedicated','shared','service'])for(const blocked of [false,true]){
   const url='wss://'+hosts[blocked?1:0]+'/socket';
   const result=await session.page.evaluate(async({owner,url})=>{
    if(owner==='document')return new Promise(resolve=>{
     const ws=new WebSocket(url,'blanc-fixture');const timer=setTimeout(()=>{ws.close();resolve({timeout:true});},10000);
     ws.onmessage=e=>{clearTimeout(timer);resolve({message:e.data,protocol:ws.protocol});ws.close();};
     ws.onerror=()=>{clearTimeout(timer);resolve({error:true});};
    });
    let worker,port;
    if(owner==='dedicated'){worker=new Worker('/dedicated.js');port=worker;}
    else if(owner==='shared'){worker=new SharedWorker('/shared.js');port=worker.port;port.start();}
    else{await navigator.serviceWorker.register('/service.js');const registration=await navigator.serviceWorker.ready;const channel=new MessageChannel();port=channel.port1;registration.active.postMessage(url,[channel.port2]);}
    const result=await new Promise(resolve=>{const timer=setTimeout(()=>resolve({timeout:true}),15000);port.onmessage=e=>{clearTimeout(timer);resolve(e.data);};if(owner!=='service')port.postMessage(url);});
    if(owner==='dedicated')worker.terminate();else port.close();
    return result;
   },{owner,url});
   outcomes.push({owner,blocked,url,result});
   if(blocked)assert.deepEqual(result,{error:true});else assert.deepEqual(result,{message:'blanc-handshake-ok',protocol:'blanc-fixture'});
  }
  await pause(500);
  const records=session.records().filter(x=>x.event==='websocket-decision');
  const run={kind,source:session.source,outcomes,arrivals,records,faults};
  fs.writeFileSync(path.join(evidence,kind+'.json'),JSON.stringify(run,null,2));
  assert.equal(arrivals.length,4);assert(arrivals.every(a=>a.host===hosts[0]&&a.origin===origin));
  assert.equal(records.length,8);assert(records.every(r=>r.private===(kind==='private')&&r.context_alive&&r.initiator_origin===origin));
  assert.equal(records.filter(r=>r.decision==='block'&&r.engine_result===1).length,4);
  assert.equal(records.filter(r=>r.decision==='allow'&&r.engine_result===0).length,4);
  assert.equal(records.filter(r=>r.owner==='frame-less-worker').length,4);
  report.runs.push({kind,passed:true,handshakes:arrivals.length,decisions:records.length});
  await session.close();session=null;await transport.close();transport=null;
 }
 for(const kind of ['regular','private']){
  const arrivals=[],faults=[];
  transport=await serve({hosts,tlsMaterial:certificates,fault:(code,authority)=>faults.push({code,authority}),upgrade:(req,socket,head)=>acceptFixtureWebSocket(req,socket,head,arrivals),respond:async(_req,res)=>{res.writeHead(404);res.end();}});
  session=await openSession({config:{...config,engine:path.join(root,'missing-assets')},browserKind:'chromium',kind,label:kind+'-missing-engine',root,transport,certificates});
  currentRun={kind,mode:'missing-engine',arrivals,faults};
  const outcome=await session.page.evaluate(url=>new Promise(resolve=>{
   const ws=new WebSocket(url,'blanc-fixture');const timer=setTimeout(()=>{ws.close();resolve({timeout:true});},10000);
   ws.onerror=()=>{clearTimeout(timer);resolve({error:true});};
   ws.onmessage=()=>{clearTimeout(timer);ws.close();resolve({unexpectedMessage:true});};
  }),'wss://'+hosts[0]+'/socket');
  await pause(500);
  const records=session.records().filter(r=>r.event==='websocket-decision');
  fs.writeFileSync(path.join(evidence,kind+'-missing-engine.json'),JSON.stringify({...currentRun,outcome,records},null,2));
  assert.deepEqual(outcome,{error:true});assert.equal(arrivals.length,0);
  assert.equal(records.length,1);assert.equal(records[0].engine_result,-1);assert.equal(records[0].private,kind==='private');
  report.runs.push({kind,mode:'missing-engine',passed:true,handshakes:0,decisions:records.length});
  await session.close();session=null;await transport.close();transport=null;
 }
 report.passed=true;
}catch(e){report.error=String(e);if(session)fs.writeFileSync(path.join(evidence,'partial.json'),JSON.stringify({...currentRun,records:session.records()},null,2));process.exitCode=1;}
finally{if(session)await session.close();if(transport)await transport.close();fs.rmSync(root,{recursive:true,force:true});report.cleanup=!fs.existsSync(root);fs.writeFileSync(path.join(evidence,'report.json'),JSON.stringify(report,null,2));}
