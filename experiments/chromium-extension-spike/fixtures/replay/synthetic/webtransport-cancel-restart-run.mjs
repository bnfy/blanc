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
 for(const kind of ['regular','private']) for(const lossPoint of ['at-prompt','after-cancel']) {
  const mode='cancel-deletion',label=kind+'-'+lossPoint,dir=path.join(root,label);fs.mkdirSync(dir);const profile=path.join(dir,'profile');fs.mkdirSync(profile);const log=path.join(dir,'decisions.jsonl');fs.writeFileSync(log,'');
  const schedule={kind,mode,lossPoint,cycles:[]};results.push(schedule);let context;
  const records=()=>fs.readFileSync(log,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
  const args=host=>({url:`https://${host}:${port}/transport`,fingerprint});
  try {
   const launchOptions={executablePath:config.chromium,headless:false,chromiumSandbox:true,args:['--enable-logging',`--log-file=${path.join(dir,'chromium.log')}`,'--vmodule=web_transport_throttle_context=1','--use-mock-keychain','--no-proxy-server','--host-resolver-rules=MAP page.blanc-fixture.test 127.0.0.1, MAP 000491b06a.com 127.0.0.1, MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',`--blanc-blocker-assets=${config.engine}`,`--blanc-blocker-log=${log}`,`--blanc-prototype-assets=${config.ui}`,'--no-first-run','--disable-component-update','--disable-sync']};
   context=await pw.chromium.launchPersistentContext(profile,launchOptions);
   const browser=context.browser(),active=kind==='private'?await browser.newContext():context,page=await active.newPage(),origin=`http://127.0.0.1:${pageServer.address().port}`;await page.goto(origin);
   const pageCDP=await active.newCDPSession(page),info=(await pageCDP.send('Target.getTargetInfo')).targetInfo,cdp=await browser.newBrowserCDPSession();
   assert.equal((await cdp.send('Target.getBrowserContexts')).browserContextIds.includes(info.browserContextId),kind==='private');
   assert.equal((await page.evaluate(a=>runTransport(a),args('page.blanc-fixture.test'))).echo,'blanc-http3-proof');
   await page.evaluate(async()=>{const reg=await navigator.serviceWorker.register('/service.js');await navigator.serviceWorker.ready;globalThis.probeService=reg.active;});
   let picker,dialog;
   if(mode==='cancel-deletion') {
    const launcher=spawn(config.chromium,[`--user-data-dir=${profile}`,'--profile-directory=Profile 1','--no-first-run',origin+'/#independent'],{stdio:'ignore'});await new Promise((resolve,reject)=>launcher.once('exit',c=>c===0?resolve():reject(Error('launcher '+c))));
    picker=await until(()=>browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().endsWith('#independent')),15000);await until(()=>fs.existsSync(path.join(profile,'Profile 1/Preferences')),15000);
    await picker.goto('chrome://profile-picker/');await picker.waitForFunction(()=>typeof chrome.send==='function');await picker.evaluate(p=>chrome.send('getProfileStatistics',[p]),path.join(profile,'Default'));await pause(300);
    page.on('dialog',d=>{dialog=d;});await pageCDP.send('Runtime.evaluate',{expression:"window.onbeforeunload=e=>{e.preventDefault();e.returnValue='';}",userGesture:true});
   }
   for(let cycle=1;cycle<=1;cycle++) {
   const count=16,row={cycle,count,events:[]};schedule.cycles.push(row);
   if(mode==='cancel-deletion'){await picker.evaluate(p=>chrome.send('getProfileStatistics',[p]),path.join(profile,'Default'));await pause(300);dialog=null;await pageCDP.send('Runtime.evaluate',{expression:"window.onbeforeunload=e=>{e.preventDefault();e.returnValue='';}",userGesture:true});}
   const owned=utility(profile);row.processes=owned;const prior=new Set(records().map(r=>r.request_id)),at=serverRows.length;
   process.kill(owned.utilityPid,'SIGSTOP');pausedPid=owned.utilityPid;
   const requests=Array.from({length:count},(_,i)=>({id:i,type:i<count/2?'document':'service',blocked:i%2===1,...args(i%2?'000491b06a.com':'page.blanc-fixture.test')}));row.requests=requests;
   await page.evaluate(requests=>{globalThis.batchResults=[];for(const q of requests){if(q.type==='document')runTransport(q).then(result=>batchResults.push({id:q.id,result}));else {const ch=new MessageChannel();ch.port1.onmessage=e=>batchResults.push({id:q.id,result:e.data});probeService.postMessage(q,[ch.port2]);}}},requests);
   const pending=await until(()=>{const p=records().filter(r=>r.event==='webtransport-pending'&&!prior.has(r.request_id));return p.length>=2&&p.length<count&&p;},10000);row.pendingIds=pending.map(r=>r.request_id);row.admittedAtCancellation=row.pendingIds.slice();row.queuedAtCancellation=count-row.pendingIds.length;row.events.push('mixed-admitted-and-not-yet-admitted');assert.equal(serverRows.length,at);
   if(mode==='cancel-deletion') {
    await picker.evaluate(p=>chrome.send('removeProfile',[p]),path.join(profile,'Default'));await until(()=>dialog,10000);assert.equal(dialog.type(),'beforeunload');row.events.push('native-beforeunload');row.admittedAtPrompt=records().filter(r=>r.event==='webtransport-pending'&&!prior.has(r.request_id)).map(r=>r.request_id);assert(row.admittedAtPrompt.length>0&&row.admittedAtPrompt.length<count);row.throttleAtPrompt=fs.readFileSync(path.join(dir,'chromium.log'),'utf8').split('\n').filter(l=>l.includes('web_transport_throttle_context.cc:')).slice(-100);assert.equal(serverRows.length,at);if(lossPoint==='at-prompt'){assert.equal(utility(profile).utilityPid,owned.utilityPid);process.kill(owned.utilityPid,'SIGKILL');pausedPid=null;row.events.push('utility-killed-at-prompt');}await dialog.dismiss();row.events.push('deletion-cancelled');
    assert(!page.isClosed());await pageCDP.send('Runtime.evaluate',{expression:'window.onbeforeunload=null'});
    await until(()=>{try{const cache=JSON.parse(fs.readFileSync(path.join(profile,'Local State'))).profile?.info_cache;return cache&&Object.hasOwn(cache,'Default');}catch{return false;}},15000);row.events.push('default-profile-retained');
   }
   if(lossPoint==='after-cancel'){assert.equal(utility(profile).utilityPid,owned.utilityPid);process.kill(owned.utilityPid,'SIGKILL');pausedPid=null;row.events.push('utility-killed-after-cancel');}
   row.outcomes=await until(async()=>{const r=await page.evaluate(()=>globalThis.batchResults);return r.length===count&&r;},60000);await pause(1000);
   row.pendingIds=records().filter(r=>r.event==='webtransport-pending'&&!prior.has(r.request_id)).map(r=>r.request_id);
   row.decisions=records().filter(r=>r.event==='webtransport-decision'&&row.pendingIds.includes(r.request_id));row.arrivals=serverRows.slice(at);
   assert.equal(row.decisions.length,count);assert.equal(new Set(row.decisions.map(r=>r.request_id)).size,count);
   for(const q of requests){const outcome=row.outcomes.find(o=>o.id===q.id).result;assert.equal(outcome.ready,false);assert(!outcome.error.includes('fixture deadline'));}
   assert.equal(row.decisions.filter(r=>r.engine_result===0).length,0);assert.equal(row.decisions.filter(r=>r.engine_result===-1).length,count);assert(row.decisions.every(r=>r.private===(kind==='private')));
   const connects=row.arrivals.filter(r=>r.event==='connect');assert.equal(connects.length,0);assert(connects.every(r=>r.headers[':authority'].startsWith('page.blanc-fixture.test:')));
   row.fresh=await page.evaluate(a=>runTransport(a),args('page.blanc-fixture.test'));assert.equal(row.fresh.ready,false);assert(!row.fresh.error.includes('fixture deadline'));assert.equal(serverRows.filter(r=>r.event==='connect').length,serverRows.slice(0,at).filter(r=>r.event==='connect').length);row.passed=true;console.log(label+' cycle '+cycle+' passed');
   }
   schedule.beforeRestartRecords=records();
   const serverAtRestart=serverRows.length;
   await context.close();context=null;
   assert(Object.hasOwn(JSON.parse(fs.readFileSync(path.join(profile,'Local State'))).profile.info_cache,'Default'));
   context=await pw.chromium.launchPersistentContext(profile,launchOptions);
   await pause(1500);
   schedule.restartQuietArrivals=serverRows.slice(serverAtRestart);
   assert(!schedule.restartQuietArrivals.some(r=>r.event==='connect'));
   const restartedBrowser=context.browser(),restartCDP=await restartedBrowser.newBrowserCDPSession();
   schedule.privateContextsAfterRestart=(await restartCDP.send('Target.getBrowserContexts')).browserContextIds;
   assert.equal(schedule.privateContextsAfterRestart.length,0);
   const restartedActive=kind==='private'?await restartedBrowser.newContext():context;
   const restartedPage=await restartedActive.newPage();await restartedPage.goto(origin);
   const target=(await (await restartedActive.newCDPSession(restartedPage)).send('Target.getTargetInfo')).targetInfo;
   assert.equal((await restartCDP.send('Target.getBrowserContexts')).browserContextIds.includes(target.browserContextId),kind==='private');
   const recordAtFresh=records().length,serverAtFresh=serverRows.length;
   schedule.restartAllowed=await restartedPage.evaluate(a=>runTransport(a),args('page.blanc-fixture.test'));
   assert.equal(schedule.restartAllowed.echo,'blanc-http3-proof');
   schedule.restartBlocked=await restartedPage.evaluate(a=>runTransport(a),args('000491b06a.com'));
   assert.equal(schedule.restartBlocked.ready,false);assert(!schedule.restartBlocked.error.includes('fixture deadline'));
   await pause(1000);schedule.restartFreshRecords=records().slice(recordAtFresh);schedule.restartFreshArrivals=serverRows.slice(serverAtFresh);
   const restartedDecisions=schedule.restartFreshRecords.filter(r=>r.event==='webtransport-decision');
   assert.equal(restartedDecisions.length,2);assert.equal(restartedDecisions[0].engine_result,0);assert.equal(restartedDecisions[1].engine_result,1);
   const restartedConnects=schedule.restartFreshArrivals.filter(r=>r.event==='connect');assert.equal(restartedConnects.length,1);assert(restartedConnects[0].headers[':authority'].startsWith('page.blanc-fixture.test:'));
   schedule.profileRetainedAfterRestart=Object.hasOwn(JSON.parse(fs.readFileSync(path.join(profile,'Local State'))).profile.info_cache,'Default');assert(schedule.profileRetainedAfterRestart);
   schedule.passed=true;console.log(label+' restart passed');
  } catch(e){schedule.error=String(e);process.exitCode=1;} finally {
   if(pausedPid){try{process.kill(pausedPid,'SIGCONT');}catch{}pausedPid=null;}
   schedule.records=records();if(context)await context.close();fs.rmSync(profile,{recursive:true,force:true});fs.writeFileSync(path.join(root,'report.json'),JSON.stringify({results,serverRows,errors},null,2));
  }
 }
 assert.equal(errors.length,0);
} finally {server.kill('SIGTERM');await new Promise(r=>server.once('exit',r));await new Promise(r=>pageServer.close(r));fs.writeFileSync(path.join(root,'report.json'),JSON.stringify({results,serverRows,errors},null,2));fs.rmSync(key,{force:true});}
