// Actual owned utility suspension/loss; no injected decision result or timeout.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
import {serve} from '../pipeline/transport.mjs';
import {createCertificateSet} from './certificate-set.mjs';
import {openSession,pause,until} from './session.mjs';
import {acceptFixtureWebSocket} from './websocket-handshake.mjs';
const [configFile,evidence]=process.argv.slice(2),config=JSON.parse(fs.readFileSync(configFile));
assert(evidence&&!fs.existsSync(evidence));fs.mkdirSync(evidence,{recursive:true});
const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'blanc-ws-lifecycle-')));
const host='page.blanc-fixture.test',origin='https://'+host,url='wss://'+host+'/socket';
const certificates=createCertificateSet(path.join(root,'certificates'),[host]);
const workerBody=`function install(p){p.onmessage=e=>{if(e.data==='close'){close();return;}const s=new WebSocket(e.data,'blanc-fixture');s.onmessage=e=>{p.postMessage({message:e.data});s.close();};s.onerror=()=>p.postMessage({error:true});};p.start?.();p.postMessage({ready:true});}`;
const scripts={'/dedicated.js':workerBody+';install(self);','/shared.js':workerBody+';onconnect=e=>install(e.ports[0]);'};
const report={passed:false,nativeOnly:true,latencyBenchmark:false,runs:[]};
let session,transport,pausedPid=null,current;
function processes(){return execFileSync('/bin/ps',['-axo','pid=,ppid=,command='],{encoding:'utf8'}).split('\n').map(s=>{const m=s.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/);return m&&{pid:Number(m[1]),ppid:Number(m[2]),command:m[3]};}).filter(Boolean);}
function utility(label){const rows=processes(),profile=path.join(root,label,'profile');const browsers=rows.filter(r=>r.command.includes('--user-data-dir='+profile)&&!r.command.includes('--type='));assert.equal(browsers.length,1,'exact owned browser');const matches=rows.filter(r=>r.ppid===browsers[0].pid&&r.command.includes('--utility-sub-type=blanc.mojom.Blocker'));assert.equal(matches.length,1,'exact child blocker utility');return {browserPid:browsers[0].pid,utilityPid:matches[0].pid};}
try{
 for(const kind of ['regular','private'])for(const mode of ['document-close','dedicated-close','shared-close','timeout','utility-loss']){
  const label=kind+'-'+mode,arrivals=[],faults=[],events=[];current={label,kind,mode,arrivals,faults,events};
  const event=type=>events.push(type);
  transport=await serve({hosts:[host],tlsMaterial:certificates,fault:(code,authority)=>faults.push({code,authority}),upgrade:(req,socket,head)=>acceptFixtureWebSocket(req,socket,head,arrivals),respond:async(req,res)=>{
   if(!['/entry','/favicon.ico',...Object.keys(scripts)].includes(req.url)){res.writeHead(404);res.end();return;}
   res.writeHead(200,{'Content-Type':scripts[req.url]?'text/javascript':'text/html','Cache-Control':'no-store'});res.end(scripts[req.url]||'<!doctype html><title>Pending socket fixture</title>');
  }});
  session=await openSession({config,browserKind:'chromium',kind,label,root,transport,certificates});
  const page=session.page;await page.goto(origin+'/entry');
  const baseline=await page.evaluate(url=>new Promise(resolve=>{const s=new WebSocket(url,'blanc-fixture');s.onmessage=e=>{resolve(e.data);s.close();};s.onerror=()=>resolve('error');}),url);
  assert.equal(baseline,'blanc-handshake-ok');await until(()=>session.records().some(r=>r.event==='websocket-decision'&&r.engine_result===0));
  assert.equal(arrivals.length,1);event('positive-control');
  const cdp=await page.context().browser().newBrowserCDPSession();await cdp.send('Target.setDiscoverTargets',{discover:true});
  const destroyed=[];cdp.on('Target.targetDestroyed',e=>destroyed.push(e.targetId));
  let ownerTarget;
  if(mode==='dedicated-close'||mode==='shared-close'){
   await page.evaluate(async mode=>{globalThis.probeResult=null;await new Promise(resolve=>{
    globalThis.probeWorker=mode==='dedicated-close'?new Worker('/dedicated.js'):new SharedWorker('/shared.js');
    globalThis.probePort=mode==='dedicated-close'?probeWorker:probeWorker.port;
    probePort.onmessage=e=>{if(e.data.ready)resolve();else globalThis.probeResult=e.data;};probePort.start?.();
   });},mode);
   ownerTarget=await until(async()=>{const {targetInfos}=await cdp.send('Target.getTargets');return targetInfos.find(t=>t.url===origin+(mode==='dedicated-close'?'/dedicated.js':'/shared.js'));});
  }else ownerTarget=(await (await page.context().newCDPSession(page)).send('Target.getTargetInfo')).targetInfo;
  const owned=utility(label);current.processes=owned;current.ownerTarget=ownerTarget;
  process.kill(owned.utilityPid,'SIGSTOP');pausedPid=owned.utilityPid;event('utility-stopped');
  const before=new Set(session.records().filter(r=>r.event==='websocket-pending').map(r=>r.request_id));
  await page.evaluate(({mode,url})=>{
   globalThis.probeResult=null;
   if(mode==='dedicated-close'||mode==='shared-close'){probePort.postMessage(url);return;}
   globalThis.probeSocket=new WebSocket(url,'blanc-fixture');probeSocket.onmessage=e=>{globalThis.probeResult={message:e.data};probeSocket.close();};probeSocket.onerror=()=>{globalThis.probeResult={error:true};};
  },{mode,url});
  const pending=await until(()=>session.records().find(r=>r.event==='websocket-pending'&&!before.has(r.request_id)),5000);current.pendingId=pending.request_id;event('native-pending-confirmed');
  assert.equal(arrivals.length,1);
  if(mode.endsWith('-close')){
   if(mode==='document-close'){await page.context().newPage();await page.close();}
   else if(mode==='dedicated-close')await page.evaluate(()=>probeWorker.terminate());
   else await page.evaluate(()=>probePort.postMessage('close'));
   await until(()=>destroyed.includes(ownerTarget.targetId),10000);event('owner-target-destroyed');
   await until(()=>session.records().some(r=>r.request_id===pending.request_id&&r.event==='websocket-abandoned'),10000);event('native-abandoned');
   process.kill(owned.utilityPid,'SIGCONT');pausedPid=null;event('utility-resumed');await pause(1000);
   assert(!session.records().some(r=>r.request_id===pending.request_id&&r.event==='websocket-decision'));
  }else if(mode==='timeout'){
   await until(()=>session.records().some(r=>r.request_id===pending.request_id&&r.event==='websocket-timeout'),45000);event('native-timeout');
   await until(()=>page.evaluate(()=>globalThis.probeResult?.error===true),5000);
   process.kill(owned.utilityPid,'SIGCONT');pausedPid=null;event('utility-resumed');await pause(1000);
   const decisions=session.records().filter(r=>r.request_id===pending.request_id&&r.event==='websocket-decision');assert.equal(decisions.length,1);assert.equal(decisions[0].engine_result,-1);
  }else{
   process.kill(owned.utilityPid,'SIGKILL');pausedPid=null;event('utility-killed');
   await until(()=>page.evaluate(()=>globalThis.probeResult?.error===true),10000);
   const decision=await until(()=>session.records().find(r=>r.request_id===pending.request_id&&r.event==='websocket-decision'),5000);assert.equal(decision.engine_result,-1);
  }
  assert.equal(arrivals.length,1,'no held socket reached server');
  // Fresh request proves the browser remains usable; utility loss remains failed closed.
  const survivor=page.isClosed()?await page.context().newPage():page;
  if(page.isClosed())await survivor.goto(origin+'/entry');
  const recovery=await survivor.evaluate(url=>new Promise(resolve=>{const s=new WebSocket(url,'blanc-fixture');s.onmessage=e=>{resolve({message:e.data});s.close();};s.onerror=()=>resolve({error:true});}),url);
  assert.deepEqual(recovery,mode==='utility-loss'?{error:true}:{message:'blanc-handshake-ok'});
  current.recovery=recovery;current.records=session.records().filter(r=>r.event.startsWith('websocket-'));current.passed=true;
  fs.writeFileSync(path.join(evidence,label+'.json'),JSON.stringify(current,null,2));report.runs.push({label,passed:true,pendingId:pending.request_id});console.log(label+' passed');
  await cdp.detach();await session.close();session=null;await transport.close();transport=null;
 }
 report.passed=true;
}catch(e){report.error=String(e);if(current){current.records=session?.records();fs.writeFileSync(path.join(evidence,'partial.json'),JSON.stringify(current,null,2));}process.exitCode=1;}
finally{if(pausedPid){try{process.kill(pausedPid,'SIGCONT');}catch{}}if(session)await session.close();if(transport)await transport.close();fs.rmSync(root,{recursive:true,force:true});report.cleanup=!fs.existsSync(root);fs.writeFileSync(path.join(evidence,'report.json'),JSON.stringify(report,null,2));}
