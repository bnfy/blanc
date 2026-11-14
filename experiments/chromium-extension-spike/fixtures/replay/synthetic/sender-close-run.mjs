// Native-only bounded teardown probe. Authored TLS responses, no upstream traffic.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {serve} from '../pipeline/transport.mjs';
import {createCertificateSet} from './certificate-set.mjs';
import {openSession,pause,until} from './session.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const [configFile,evidence]=process.argv.slice(2);
const config=JSON.parse(fs.readFileSync(configFile));
assert(evidence&&!fs.existsSync(evidence));fs.mkdirSync(evidence,{recursive:true});
const root=fs.mkdtempSync(path.join(os.tmpdir(),'blanc-sender-close-'));
const hosts=['page.blanc-fixture.test','000491b06a.com'];
const origin='https://'+hosts[0],blocked='https://'+hosts[1];
const certificates=createCertificateSet(path.join(root,'certificates'),hosts);
const report={nativeOnly:true,pairedParity:false,runs:[],started:new Date().toISOString(),engineSha256:sha(fs.readFileSync(path.join(config.engine,'engine.js'))),harnessSha256:sha(fs.readFileSync(new URL(import.meta.url)))};
let session,transport,release;
try{
for(const kind of ['regular','private'])for(const mechanism of ['keepalive','beacon']){
 const label=kind+'-'+mechanism,events=[],arrivals=[],faults=[];
 const event=(type,details={})=>events.push({type,at:Date.now(),...details});
 let resolveGate;const gate=new Promise(r=>resolveGate=r);release=resolveGate;
 const body='sender-close-'+label;
 transport=await serve({hosts,tlsMaterial:certificates,fault:(code,authority)=>faults.push({code,authority}),respond:async(req,res)=>{
  const url='https://'+req.headers.host+req.url;
  const route=new URL(url).pathname;
  const valid=req.headers.host===hosts[0]&&['/entry','/favicon.ico','/hold-allow','/hold-block','/finish-allow','/control-allow'].includes(route)||req.headers.host===hosts[1]&&['/finish-block','/control-block'].includes(route);
  if(!valid||!['GET','POST'].includes(req.method)){faults.push({code:'unmanifested',url,method:req.method});res.writeHead(502);res.end();return;}
  let bytes=Buffer.alloc(0);for await(const chunk of req){bytes=Buffer.concat([bytes,chunk]);if(bytes.length>1024)throw Error('oversize fixture body');}
  arrivals.push({url,method:req.method,bodySha256:sha(bytes),bytes:bytes.length,at:Date.now()});event('arrival',{url});
  if(route.startsWith('/hold-')){await gate;event('redirect-release',{url});res.writeHead(307,{Location:route==='/hold-allow'?origin+'/finish-allow':blocked+'/finish-block','Access-Control-Allow-Origin':'*'});res.end();return;}
  res.writeHead(200,{'Content-Type':route==='/entry'?'text/html':'text/plain','Access-Control-Allow-Origin':'*','Cache-Control':'no-store'});res.end(route==='/entry'?'<!doctype html><title>Sender closure</title>authored fixture':'ok');
 }});
 session=await openSession({config,browserKind:'chromium',kind,label,root,transport,certificates});
 const sender=session.page,context=sender.context();const survivor=await context.newPage();
 await sender.goto(origin+'/entry');
 const browserCDP=await context.browser().newBrowserCDPSession();await browserCDP.send('Target.setDiscoverTargets',{discover:true});
 const pageCDP=await context.newCDPSession(sender);const target=(await pageCDP.send('Target.getTargetInfo')).targetInfo;
 let destroyed=false;browserCDP.on('Target.targetDestroyed',p=>{if(p.targetId===target.targetId){destroyed=true;event('target-destroyed',{targetId:p.targetId});}});
 const controls=await sender.evaluate(async({origin,blocked})=>Promise.all([origin+'/control-allow',blocked+'/control-block'].map(async url=>{try{return {url,status:(await fetch(url,{mode:'no-cors'})).status};}catch(e){return {url,error:e.name};}})),{origin,blocked});
 const enqueue=await sender.evaluate(({origin,body,mechanism})=>['/hold-allow','/hold-block'].map(route=>{
  const url=origin+route;
  if(mechanism==='beacon')return {url,queued:navigator.sendBeacon(url,body)};
  fetch(url,{method:'POST',body,keepalive:true,mode:'no-cors'}).catch(()=>{});return {url,queued:null};
 }),{origin,body,mechanism});event('enqueue-returned');
 await until(()=>arrivals.filter(x=>x.url.includes('/hold-')).length===2,15000);
 await sender.close();await until(()=>destroyed,5000);event('sender-close-confirmed');
 assert(!survivor.isClosed());release();
 await pause(3000);
 const records=session.records();
 const terminals=arrivals.filter(x=>/\/finish-/.test(x.url));
 const run={label,source:session.source,target,controls,enqueue,events,arrivals,faults,records,connectionErrors:transport.connectionErrors,senderClosed:sender.isClosed(),targetDestroyed:destroyed,survivorAlive:!survivor.isClosed(),expectedBodySha256:sha(body),terminalArrivals:terminals};
 fs.writeFileSync(path.join(evidence,label+'.json'),JSON.stringify(run,null,2));
 report.runs.push({label,senderClosed:run.senderClosed,targetDestroyed:destroyed,terminalArrivals:terminals.map(x=>x.url),decisionCount:records.length});
 console.log(JSON.stringify(report.runs.at(-1)));
 await browserCDP.detach();await session.close();session=null;await transport.close();transport=null;
}
}catch(e){report.error=String(e);if(session)fs.writeFileSync(path.join(evidence,'partial.json'),JSON.stringify({records:session.records()},null,2));process.exitCode=1;}
finally{release?.();if(session)await session.close();if(transport)await transport.close();fs.rmSync(root,{recursive:true,force:true});report.cleanup=!fs.existsSync(root);report.finished=new Date().toISOString();fs.writeFileSync(path.join(evidence,'report.json'),JSON.stringify(report,null,2));}
