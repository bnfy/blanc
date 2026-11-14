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
 for(const [kind,mode] of [['regular','hot-delete'],['regular','crash'],['private','crash']]) {
  const label=kind+'-'+mode,dir=path.join(root,label);fs.mkdirSync(dir);const profile=path.join(dir,'profile');fs.mkdirSync(profile);const log=path.join(dir,'decisions.jsonl');fs.writeFileSync(log,'');
  const row={kind,mode,events:[]};results.push(row);let context;
  const records=()=>fs.readFileSync(log,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
  const args={url:`https://page.blanc-fixture.test:${port}/transport`,fingerprint};
  try {
   const launch=()=>pw.chromium.launchPersistentContext(profile,{executablePath:config.chromium,headless:false,chromiumSandbox:true,args:['--use-mock-keychain','--no-proxy-server','--host-resolver-rules=MAP page.blanc-fixture.test 127.0.0.1, MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',`--blanc-blocker-assets=${config.engine}`,`--blanc-blocker-log=${log}`,`--blanc-prototype-assets=${config.ui}`,'--no-first-run','--disable-component-update','--disable-sync',...(mode==='hot-delete'&&row.restarted?['--profile-directory=Profile 1']:[])]});
   context=await launch();
   const browser=context.browser(),active=kind==='private'?await browser.newContext():context,page=await active.newPage(),origin=`http://127.0.0.1:${pageServer.address().port}`;await page.goto(origin);
   const cdp=await browser.newBrowserCDPSession();await cdp.send('Target.setDiscoverTargets',{discover:true});const destroyed=[];cdp.on('Target.targetDestroyed',e=>destroyed.push(e.targetId));
   const pageCDP=await active.newCDPSession(page),info=(await pageCDP.send('Target.getTargetInfo')).targetInfo;
   const contexts=await cdp.send('Target.getBrowserContexts');assert.equal(contexts.browserContextIds.includes(info.browserContextId),kind==='private');row.browserContextId=info.browserContextId;
   const positive=await page.evaluate(a=>runTransport(a),args);assert.equal(positive.echo,'blanc-http3-proof');row.events.push('positive-control');
   const versions=row.versionEvents=[];pageCDP.on('ServiceWorker.workerVersionUpdated',e=>versions.push(...e.versions));await pageCDP.send('ServiceWorker.enable');
   await page.evaluate(async()=>{const reg=await navigator.serviceWorker.register('/service.js');await navigator.serviceWorker.ready;globalThis.probeService=reg.active;});
   const owner=await until(async()=>{const r=await cdp.send('Target.getTargets');return r.targetInfos.find(t=>t.url===origin+'/service.js');});row.owner=owner;
   const version=await until(()=>versions.findLast(v=>v.scriptURL===origin+'/service.js'&&v.runningStatus==='running'&&v.status==='activated'));row.version=version;
   // The held request originates in the service worker in every teardown case.
   const owned=utility(profile);row.processes=owned;process.kill(owned.utilityPid,'SIGSTOP');pausedPid=owned.utilityPid;row.events.push('utility-stopped');
   const prior=new Set(records().map(r=>r.request_id)),at=serverRows.length;
   await page.evaluate(a=>{globalThis.probeResult=null;const ch=new MessageChannel();ch.port1.onmessage=e=>globalThis.probeResult=e.data;probeService.postMessage(a,[ch.port2]);},args);
   const pending=await until(()=>records().find(r=>r.event==='webtransport-pending'&&!prior.has(r.request_id)),5000);row.pendingId=pending.request_id;row.events.push('native-pending');
   if(mode==='hot-delete') {
    // Open a second regular profile in this exact disposable browser process.
    // Resume only to load the survivor before re-holding a new pending request.
    process.kill(owned.utilityPid,'SIGCONT');pausedPid=null;
    await until(()=>page.evaluate(()=>globalThis.probeResult),10000);
    const launcher=spawn(config.chromium,[`--user-data-dir=${profile}`,'--profile-directory=Profile 1','--no-first-run',origin+'/#independent'],{stdio:'ignore'});
    await new Promise((resolve,reject)=>launcher.once('exit',code=>code===0?resolve():reject(Error('profile launcher '+code))));
    const survivor=await until(()=>browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().endsWith('#independent')),15000);
    await until(()=>fs.existsSync(path.join(profile,'Profile 1/Preferences')),15000);row.events.push('independent-regular-profile-open');
    await survivor.goto('chrome://profile-picker/');await survivor.waitForFunction(()=>typeof chrome.send==='function');
    await survivor.evaluate(p=>chrome.send('getProfileStatistics',[p]),path.join(profile,'Default'));await pause(300);
    const oldIds=new Set(records().map(r=>r.request_id));row.serverBoundary=serverRows.length;
    process.kill(owned.utilityPid,'SIGSTOP');pausedPid=owned.utilityPid;
    await page.evaluate(a=>{const ch=new MessageChannel();ch.port1.onmessage=e=>globalThis.probeResult=e.data;probeService.postMessage(a,[ch.port2]);},args);
    const held=await until(()=>records().find(r=>r.event==='webtransport-pending'&&!oldIds.has(r.request_id)),5000);row.pendingId=held.request_id;
    await survivor.evaluate(p=>chrome.send('removeProfile',[p]),path.join(profile,'Default'));
    await until(()=>{const state=JSON.parse(fs.readFileSync(path.join(profile,'Local State')));return state.profile?.info_cache&&!Object.hasOwn(state.profile.info_cache,'Default');},15000);
    await until(()=>page.isClosed(),10000);assert(browser.isConnected());row.events.push('default-profile-removed-browser-survives');
    process.kill(owned.utilityPid,'SIGCONT');pausedPid=null;await pause(1500);
    row.pendingArrivals=serverRows.slice(row.serverBoundary);assert.equal(row.pendingArrivals.length,0,'deleted profile must not connect');row.pendingRecords=records().filter(r=>r.request_id===held.request_id);const refusal=row.pendingRecords.find(r=>r.event==='webtransport-decision');assert(refusal);assert.equal(refusal.engine_result,-1);assert.equal(refusal.profile_unavailable,true);
    await survivor.goto(origin);row.recovery=await survivor.evaluate(a=>runTransport(a),args);assert.equal(row.recovery.echo,'blanc-http3-proof');
    await context.close();context=null;
   } else {
    process.kill(owned.browserPid,'SIGKILL');await until(()=>!browser.isConnected(),10000);row.events.push('owned-browser-killed');
    try{process.kill(owned.utilityPid,'SIGCONT');}catch{}pausedPid=null;await pause(1500);
    row.pendingArrivals=serverRows.slice(at);assert.equal(row.pendingArrivals.length,0);row.pendingRecords=records().filter(r=>r.request_id===pending.request_id);context=null;
   }
   const restartBoundary=serverRows.length;row.restarted=true;context=await launch();
   const restartedBrowser=context.browser();if(mode==='hot-delete'){
    const state=JSON.parse(fs.readFileSync(path.join(profile,'Local State')));assert(!Object.hasOwn(state.profile.info_cache,'Default'));await until(()=>!fs.existsSync(path.join(profile,'Default')),10000);row.events.push('deleted-profile-absent-after-restart');
   }
   await pause(1500);row.restartArrivals=serverRows.slice(restartBoundary);assert.equal(row.restartArrivals.length,0,'no automatic replay after restart');
   const newActive=kind==='private'?await restartedBrowser.newContext():context,newPage=await newActive.newPage();await newPage.goto(origin);
   row.restartRecovery=await newPage.evaluate(a=>runTransport(a),args);assert.equal(row.restartRecovery.echo,'blanc-http3-proof');
   row.passed=!row.failures?.length;console.log(label+(row.passed?' passed':' failed: '+row.failures.join('; ')));
  } catch(e){row.error=String(e);process.exitCode=1;} finally {
   if(pausedPid){try{process.kill(pausedPid,'SIGCONT');}catch{}pausedPid=null;}
   row.records=records();if(context)await context.close();fs.rmSync(profile,{recursive:true,force:true});
   fs.writeFileSync(path.join(root,'report.json'),JSON.stringify({results,serverRows,errors},null,2));
  }
 }
 assert.equal(errors.length,0);
} finally {server.kill('SIGTERM');await new Promise(r=>server.once('exit',r));await new Promise(r=>pageServer.close(r));fs.writeFileSync(path.join(root,'report.json'),JSON.stringify({results,serverRows,errors},null,2));fs.rmSync(key,{force:true});}
