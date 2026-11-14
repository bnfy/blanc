import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {spawn,execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {until,pause} from './session.mjs';
const [configFile,root,python]=process.argv.slice(2);
const config=JSON.parse(fs.readFileSync(configFile));fs.mkdirSync(root);
const key=path.join(root,'key.pem'),cert=path.join(root,'cert.pem');
execFileSync('openssl',['req','-x509','-newkey','ec','-pkeyopt','ec_paramgen_curve:prime256v1','-nodes','-keyout',key,'-out',cert,'-days','10','-subj','/CN=page.blanc-fixture.test']);
const der=execFileSync('openssl',['x509','-in',cert,'-outform','DER']);
const fingerprint=[...createHash('sha256').update(der).digest()];
const client=fs.readFileSync(new URL('./webtransport-client.js',import.meta.url),'utf8');
const install="function install(p){p.onmessage=async e=>{if(e.data==='close'){close();return;}p.postMessage(await runTransport(e.data));};p.start?.();p.postMessage({workerReady:true,available:typeof WebTransport==='function'});}";
const scripts={'/client.js':client,'/dedicated.js':client+install+';install(self);','/shared.js':client+install+';onconnect=e=>install(e.ports[0]);','/service.js':client+";oninstall=()=>skipWaiting();onactivate=e=>e.waitUntil(clients.claim());onmessage=e=>{e.waitUntil(runTransport(e.data).then(r=>e.ports[0].postMessage(r)));};"};
const pageServer=http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':scripts[req.url]?'text/javascript':'text/html','Cache-Control':'no-store'});res.end(scripts[req.url]||'<!doctype html><title>WT lifecycle</title><script src="/client.js"></script>');});
await new Promise(r=>pageServer.listen(0,'127.0.0.1',r));
// Reserve a UDP port independently: QUIC does not use the page server's TCP port.
const dgram=await import('node:dgram');const reservation=dgram.createSocket('udp4');await new Promise(r=>reservation.bind(0,'127.0.0.1',r));const port=reservation.address().port;await new Promise(r=>reservation.close(r));
const serverRows=[];let carry='';
const server=spawn(python,[new URL('./webtransport-server.py',import.meta.url).pathname,cert,key,String(port)],{stdio:['ignore','pipe','pipe']});
server.stdout.on('data',b=>{carry+=b;let i;while((i=carry.indexOf('\n'))>=0){const line=carry.slice(0,i);carry=carry.slice(i+1);serverRows.push(JSON.parse(line));}});
const errors=[];server.stderr.on('data',b=>errors.push(String(b)));
const pw=await import(pathToFileURL(config.playwright));const results=[];let pausedPid=null;
function utility(profile){
 const rows=execFileSync('/bin/ps',['-axo','pid=,ppid=,command='],{encoding:'utf8'}).split('\n').map(s=>{const m=s.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/);return m&&{pid:Number(m[1]),ppid:Number(m[2]),command:m[3]};}).filter(Boolean);
 const browsers=rows.filter(r=>r.command.includes('--user-data-dir='+profile)&&!r.command.includes('--type='));assert.equal(browsers.length,1);
 const utilities=rows.filter(r=>r.ppid===browsers[0].pid&&r.command.includes('--utility-sub-type=blanc.mojom.Blocker'));assert.equal(utilities.length,1);return {browserPid:browsers[0].pid,utilityPid:utilities[0].pid};
}
try {
 await until(()=>serverRows.some(r=>r.event==='ready'));
 for(const kind of ['regular','private']) for(const mode of ['workers','document-close','dedicated-close','shared-close','timeout','utility-loss']) {
  const label=kind+'-'+mode,dir=path.join(root,label);fs.mkdirSync(dir);const profile=path.join(dir,'profile');fs.mkdirSync(profile);const log=path.join(dir,'decisions.jsonl');fs.writeFileSync(log,'');
  const row={kind,mode,events:[],checks:[]};results.push(row);let context;
  const records=()=>fs.readFileSync(log,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
  const args=host=>({url:`https://${host}:${port}/transport`,fingerprint});
  try {
   context=await pw.chromium.launchPersistentContext(profile,{executablePath:config.chromium,headless:false,chromiumSandbox:true,args:['--use-mock-keychain','--no-proxy-server','--host-resolver-rules=MAP page.blanc-fixture.test 127.0.0.1, MAP 000491b06a.com 127.0.0.1, MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',`--blanc-blocker-assets=${config.engine}`,`--blanc-blocker-log=${log}`,`--blanc-prototype-assets=${config.ui}`,'--no-first-run','--disable-component-update','--disable-sync']});
   const browser=context.browser(),active=kind==='private'?await browser.newContext():context,page=await active.newPage(),origin=`http://127.0.0.1:${pageServer.address().port}`;await page.goto(origin);
   const cdp=await browser.newBrowserCDPSession();await cdp.send('Target.setDiscoverTargets',{discover:true});const destroyed=[];cdp.on('Target.targetDestroyed',e=>destroyed.push(e.targetId));
   const info=(await (await active.newCDPSession(page)).send('Target.getTargetInfo')).targetInfo;
   const contexts=await cdp.send('Target.getBrowserContexts');assert.equal(contexts.browserContextIds.includes(info.browserContextId),kind==='private');
   const positive=await page.evaluate(a=>runTransport(a),args('page.blanc-fixture.test'));assert.equal(positive.echo,'blanc-http3-proof');row.events.push('positive-control');
   const makeWorker=async type=>{
    await page.evaluate(async type=>{globalThis.probeResult=null;
     if(type==='service') {const reg=await navigator.serviceWorker.register('/service.js');await navigator.serviceWorker.ready;globalThis.probeService=reg.active;return;}
     await new Promise(resolve=>{globalThis.probeWorker=type==='dedicated'?new Worker('/dedicated.js'):new SharedWorker('/shared.js');globalThis.probePort=type==='dedicated'?probeWorker:probeWorker.port;probePort.onmessage=e=>{if(e.data.workerReady)resolve();else globalThis.probeResult=e.data;};probePort.start?.();});
    },type);
    return until(async()=>{const r=await cdp.send('Target.getTargets');return r.targetInfos.find(t=>t.url===origin+'/'+type+'.js');});
   };
   const start=async(type,host)=>page.evaluate(({type,a})=>{globalThis.probeResult=null;if(type==='document')runTransport(a).then(r=>globalThis.probeResult=r);else if(type==='service'){const ch=new MessageChannel();ch.port1.onmessage=e=>globalThis.probeResult=e.data;probeService.postMessage(a,[ch.port2]);}else probePort.postMessage(a);},{type,a:args(host)});
   if(mode==='workers') {
    for(const type of ['dedicated','shared','service']) {
     const owner=await makeWorker(type);
     for(const host of ['page.blanc-fixture.test','000491b06a.com']) {
      const before=records().length,at=serverRows.length;await start(type,host);const result=await until(()=>page.evaluate(()=>globalThis.probeResult),20000);await pause(500);
      const decisions=records().slice(before).filter(r=>r.event==='webtransport-decision');assert.equal(decisions.length,1);const blocked=host==='000491b06a.com';assert.equal(decisions[0].engine_result,blocked?1:0);assert.equal(result.ready,!blocked);const arrivals=serverRows.slice(at);
      if(blocked)assert.equal(arrivals.length,0);else {assert.equal(result.echo,'blanc-http3-proof');assert(arrivals.some(r=>r.event==='connect'));}
      row.checks.push({type,host,owner,result,decisions,arrivals});
     }
     if(type==='dedicated')await page.evaluate(()=>probeWorker.terminate());else if(type==='shared')await page.evaluate(()=>probePort.postMessage('close'));
    }
   } else {
    const type=mode.startsWith('dedicated')?'dedicated':mode.startsWith('shared')?'shared':'document';const owner=type==='document'?info:await makeWorker(type);row.owner=owner;
    const owned=utility(profile);row.processes=owned;process.kill(owned.utilityPid,'SIGSTOP');pausedPid=owned.utilityPid;row.events.push('utility-stopped');
    const prior=new Set(records().map(r=>r.request_id)),at=serverRows.length;await start(type,'page.blanc-fixture.test');const pending=await until(()=>records().find(r=>r.event==='webtransport-pending'&&!prior.has(r.request_id)),5000);row.pendingId=pending.request_id;row.events.push('native-pending');
    if(mode.endsWith('-close')) {
     if(type==='document'){await active.newPage();await page.close();}else if(type==='dedicated')await page.evaluate(()=>probeWorker.terminate());else await page.evaluate(()=>probePort.postMessage('close'));
     await until(()=>destroyed.includes(owner.targetId),10000);row.events.push('target-destroyed');
     await pause(1000);row.abandonedBeforeResume=records().some(r=>r.request_id===pending.request_id&&r.event==='webtransport-abandoned');
     process.kill(owned.utilityPid,'SIGCONT');pausedPid=null;await pause(1000);row.terminalAfterResume=records().filter(r=>r.request_id===pending.request_id);
    } else {
     if(mode==='utility-loss'){process.kill(owned.utilityPid,'SIGKILL');pausedPid=null;row.events.push('utility-killed');}
     else {await until(()=>records().some(r=>r.request_id===pending.request_id&&r.event==='webtransport-timeout'),45000);row.events.push('native-timeout');}
     const result=await until(()=>page.evaluate(()=>globalThis.probeResult),10000);assert.equal(result.ready,false);row.pendingResult=result;
     if(pausedPid){process.kill(pausedPid,'SIGCONT');pausedPid=null;}await pause(1000);
     const decisions=records().filter(r=>r.request_id===pending.request_id&&r.event==='webtransport-decision');assert.equal(decisions.length,1);assert.equal(decisions[0].engine_result,-1);
    }
    row.pendingArrivals=serverRows.slice(at);assert.equal(row.pendingArrivals.length,0);
    const survivor=page.isClosed()?await active.newPage():page;if(page.isClosed())await survivor.goto(origin);
    const recovery=await survivor.evaluate(a=>runTransport(a),args('page.blanc-fixture.test'));assert.equal(recovery.ready,mode!=='utility-loss');if(recovery.ready)assert.equal(recovery.echo,'blanc-http3-proof');row.recovery=recovery;
   }
   row.passed=true;console.log(label+' passed');
  } catch(e){row.error=String(e);process.exitCode=1;} finally {
   if(pausedPid){try{process.kill(pausedPid,'SIGCONT');}catch{}pausedPid=null;}
   row.records=records();if(context)await context.close();fs.rmSync(profile,{recursive:true,force:true});
   fs.writeFileSync(path.join(root,'report.json'),JSON.stringify({results,serverRows,errors},null,2));
  }
 }
 assert.equal(errors.length,0);
} finally {server.kill('SIGTERM');await new Promise(r=>server.once('exit',r));await new Promise(r=>pageServer.close(r));fs.writeFileSync(path.join(root,'report.json'),JSON.stringify({results,serverRows,errors},null,2));fs.rmSync(key,{force:true});}
