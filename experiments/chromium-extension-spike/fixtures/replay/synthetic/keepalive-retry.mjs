// Explicit experimental FetchRetry fixture; no production feature/config change.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
import {serve} from '../pipeline/transport.mjs';import {createCertificateSet} from './certificate-set.mjs';import {openSession,until,pause} from './session.mjs';
const [cfg,out]=process.argv.slice(2);assert(out&&!fs.existsSync(out));fs.mkdirSync(out,{recursive:true});
const config={...JSON.parse(fs.readFileSync(cfg)),nativeTimingTrace:false,fetchRetryProbe:true};
const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'blanc-fetch-retry-'))),host='retry.blanc-fixture.test',origin='https://'+host,certificates=createCertificateSet(path.join(root,'certificates'),[host]);
const report={complete:false,scope:'experimental FetchRetry explicitly enabled only in isolated fixtures; post-close GET retry after connection reset',runs:[]};let session,transport,release;
try{for(const kind of ['regular','private'])for(const fail of [false,true]){
 const label=kind+(fail?'-utility-loss':'-healthy'),events=[],arrivals=[],traces=[];let held;const gate=new Promise(r=>release=r);const event=(name,extra={})=>events.push({name,at:Date.now(),...extra});
 transport=await serve({hosts:[host],tlsMaterial:certificates,fault:()=>{},respond:async(req,res)=>{
  const url='https://'+req.headers.host+req.url;if(req.headers.host!==host||!['/page','/retry','/favicon.ico'].includes(req.url)||req.method!=='GET'){res.writeHead(502);res.end();return;}
  arrivals.push({url,at:Date.now(),headers:req.headers});
  if(req.url==='/retry'&&!req.headers['retry-attempts']){held=true;await gate;event('reset-first-connection');assert.equal(typeof req.socket._parent?.resetAndDestroy,'function','Missing TCP reset control');req.socket._parent.resetAndDestroy();return;}
  res.writeHead(200,{'Content-Type':req.url==='/page'?'text/html':'text/plain','Cache-Control':'no-store','Connection':'close'});res.end(req.url==='/page'?'<!doctype html><title>Retry fixture</title><link rel="icon" href="data:,">Retry fixture':'retry-ok');
 }});
 session=await openSession({config,browserKind:'chromium',kind,label,root,transport,certificates});
 const sender=session.page,context=sender.context(),survivor=await context.newPage();await sender.goto(origin+'/page');await survivor.goto(origin+'/page');
 const cdp=await context.browser().newBrowserCDPSession();await cdp.send('Target.setDiscoverTargets',{discover:true});const pc=await context.newCDPSession(sender);const target=(await pc.send('Target.getTargetInfo')).targetInfo.targetId;let destroyed=false;cdp.on('Target.targetDestroyed',e=>{if(e.targetId===target){destroyed=true;event('sender-destroyed');}});
 cdp.on('Tracing.dataCollected',p=>traces.push(...p.value.filter(e=>e.name==='Blanc.DecisionTiming'||e.name.startsWith('KeepAliveURLLoader'))));
 await cdp.send('Tracing.start',{transferMode:'ReportEvents',traceConfig:{recordMode:'recordUntilFull',includedCategories:['loading','disabled-by-default-blanc.latency'],excludedCategories:['*'],traceBufferSizeInKb:8192}});
 const feature=await sender.evaluate(()=>{let observed=false;new Request('/retry',{keepalive:true,retryOptions:{get maxAttempts(){observed=true;return 1},maxAge:10000}});return observed});assert(feature,'RetryOptions dictionary was not enabled');
 await sender.evaluate(()=>{fetch('/retry',{keepalive:true,retryOptions:{maxAttempts:1,initialDelay:1000,maxAge:10000,retryAfterUnload:true}}).catch(()=>{});});await until(()=>held,10000);
 await sender.close();await until(()=>destroyed,5000);assert(!survivor.isClosed());
 if(fail){const lines=execFileSync('/bin/ps',['-axo','pid=,ppid=,command='],{encoding:'utf8'}).split('\n').map(s=>s.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/)).filter(Boolean).map(m=>({pid:+m[1],ppid:+m[2],command:m[3]}));const browsers=lines.filter(p=>p.command.includes('--user-data-dir='+path.join(root,label,'profile'))&&!p.command.includes('--type='));assert.equal(browsers.length,1);const utilities=lines.filter(p=>p.ppid===browsers[0].pid&&p.command.includes('--utility-sub-type=blanc.mojom.Blocker'));assert.equal(utilities.length,1);process.kill(utilities[0].pid,'SIGKILL');event('owned-utility-terminated',{pid:utilities[0].pid});await pause(300);}
 let waitError;release();if(!fail)await until(()=>arrivals.some(a=>a.url.endsWith('/retry')&&a.headers['retry-attempts']==='1'),12000).catch(e=>{waitError=String(e)});else await pause(11500);
 const done=new Promise(r=>cdp.once('Tracing.tracingComplete',r));await cdp.send('Tracing.end');const completion=await done;assert(!completion.dataLossOccurred);await cdp.detach();
 const attempts=arrivals.filter(a=>a.url.endsWith('/retry')),decisions=traces.filter(e=>e.name==='Blanc.DecisionTiming').map(e=>e.args?.debug||e.args);
 const run={label,feature,waitError,events,attempts,traces,decisions,source:session.source};report.runs.push(run);fs.writeFileSync(path.join(out,label+'.json'),JSON.stringify(run,null,2));
 assert.equal(traces.filter(e=>e.name==='KeepAliveURLLoader::Start').length,2,'No actual native FetchRetry restart');
 const retries=attempts.filter(a=>a.headers['retry-attempts']);assert.equal(retries.length,fail?0:1,'Unexpected FetchRetry server arrivals');if(!fail){assert.equal(retries[0].headers['retry-attempts'],'1');assert(retries[0].at>events.find(e=>e.name==='sender-destroyed').at,'Retry did not follow closure');}else assert(decisions.some(e=>e.result===-1),'Missing native retry refusal');
 console.log(JSON.stringify({label,attempts:attempts.length,results:decisions.map(e=>e.result)}));await session.close();session=null;await transport.close();transport=null;
}report.complete=true;}catch(e){report.error=String(e);process.exitCode=1;}finally{release?.();if(session)await session.close();if(transport)await transport.close();fs.rmSync(root,{recursive:true,force:true});report.cleanup=!fs.existsSync(root);fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({complete:report.complete,error:report.error,runs:report.runs.length}));}
