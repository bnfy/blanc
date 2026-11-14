/* global chrome */
import {createHash} from 'node:crypto';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';
import {openSession,until,pause} from './session.mjs';import {startSynthetic} from './transport.mjs';import {createCertificateSet} from './certificate-set.mjs';
const [cfg,payload,evidence]=process.argv.slice(2),config=JSON.parse(fs.readFileSync(cfg));assert(!fs.existsSync(evidence));fs.mkdirSync(evidence);
const host='https://page.blanc-fixture.test',body='<!doctype html><link rel="icon" href="data:,"><div id="marker">clean</div>';
const fixtures=new Map([['/a',body],['/queued',body+'<script src="/hold.js"></script>']].map(([p,body])=>[host+p,{status:200,contentType:'text/html',body}]));fixtures.set(host+'/hold.js',{status:200,contentType:'application/javascript',body:'void 0;'});
let release;const gates=new Map([[host+'/hold.js',new Promise(r=>{release=r;})]]),root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'blanc-lifecycle-leases-'))),certificates=createCertificateSet(path.join(root,'certificates'),[new URL(host).hostname]),replay=await startSynthetic({fixtures,tlsMaterial:certificates,gates});
const diagnostic=path.join(root,'component');fs.cpSync(payload,diagnostic,{recursive:true});const start=path.join(diagnostic,'js/start.js');fs.appendFileSync(start,"\nglobalThis.leaseProbe={api:await import('./blanc-upstream-delivery.js'),barrier:await import('./blanc-static-delivery.js'),guard:await import('./blanc-reload-guard.js')};\n");
fs.copyFileSync(start,path.join(evidence,'diagnostic-start.js'));fs.copyFileSync(path.join(diagnostic,'LICENSE.txt'),path.join(evidence,'LICENSE.txt'));
const report={completed:false,checks:[],latencyMeasured:false,diagnostic:{change:'read-only exports of actual API/barrier/guard modules; no delay or bypass',startSha256:createHash('sha256').update(fs.readFileSync(start)).digest('hex')}};let session;
try{
 session=await openSession({config,browserKind:'chromium',kind:'regular',label:'leases',root,transport:replay,certificates,provider:'ublock-origin',uboPayload:diagnostic});await session.uboConfigure();await session.uboSetFilters('');
 const popup=session.page.context().pages().find(p=>p.url().includes('/popup-fenix.html'));assert(popup);const page=session.page;
 const snapshot=()=>popup.evaluate(()=>({size:chrome.extension.getBackgroundPage().leaseProbe.barrier.upstreamDeliveries.size(),guard:chrome.extension.getBackgroundPage().leaseProbe.guard.current(),result:chrome.extension.getBackgroundPage().leaseResult,reload:chrome.extension.getBackgroundPage().leaseReload}));
 await page.goto(host+'/a');const tab=await popup.evaluate(async()=> (await chrome.tabs.query({})).find(t=>t.url==='https://page.blanc-fixture.test/a').id);
 const enqueue=async frameId=>{await popup.evaluate(({tab,frameId})=>{chrome.extension.getBackgroundPage().leaseResult={settled:false};chrome.extension.getBackgroundPage().leaseProbe.api.executeScript(tab,{frameId,runAt:'document_end',code:"document.querySelector('#marker').textContent='stale';true"}).then(result=>{chrome.extension.getBackgroundPage().leaseResult={settled:true,result};});},{tab,frameId});await until(async()=> (await snapshot()).size===1);await pause(100);assert.equal((await snapshot()).result.settled,false);};
 const beginReload=()=>popup.evaluate(()=>{chrome.extension.getBackgroundPage().leaseReload={settled:false};chrome.extension.getBackgroundPage().µBlock.loadFilterLists().then(()=>{chrome.extension.getBackgroundPage().leaseReload={settled:true};},e=>{chrome.extension.getBackgroundPage().leaseReload={settled:true,error:String(e)};});});
 for(const kind of ['subframe-detach','renderer-crash']){
  let frameId=0,before;
  if(kind==='subframe-detach'){
   await page.evaluate(url=>{const f=document.createElement('iframe');f.id='child';f.src=url;document.body.append(f);},host+'/queued');
   await until(()=>replay.arrivals.filter(a=>a.url===host+'/hold.js').length===1);
   before=await popup.evaluate(async tab=>(await chrome.webNavigation.getAllFrames({tabId:tab})).find(f=>f.parentFrameId===0),tab);assert(before);frameId=before.frameId;
  }else{
   await page.goto(host+'/queued',{waitUntil:'commit'});await until(()=>replay.arrivals.filter(a=>a.url===host+'/hold.js').length===2);before=await popup.evaluate(tab=>chrome.webNavigation.getFrame({tabId:tab,frameId:0}),tab);
  }
  await enqueue(frameId);await beginReload();await until(async()=>!(await snapshot()).guard.ready);const held=await snapshot();assert.equal(held.size,1);assert.equal(held.reload.settled,false);
  let crashed=false;
  if(kind==='subframe-detach')await page.evaluate(()=>document.querySelector('#child').remove());
  else{const cdp=await page.context().newCDPSession(page);page.on('crash',()=>{crashed=true;});void cdp.send('Page.crash').catch(()=>{});await until(()=>crashed);}
  await until(async()=>{const s=await snapshot();return s.result.settled&&s.reload.settled;});const after=await snapshot();assert.equal(after.size,0);assert(after.guard.ready);assert(!after.reload.error);assert(Array.isArray(after.result.result)&&after.result.result.every(x=>x===null));
  if(kind==='renderer-crash')await popup.evaluate(({tab,url})=>chrome.tabs.update(tab,{url}),{tab,url:host+'/a'});
  let recovered;await until(async()=>{recovered=await popup.evaluate(tab=>chrome.webNavigation.getFrame({tabId:tab,frameId:0}),tab);return recovered?.url===host+'/a'&&recovered.documentId!==before.documentId;});
  const control=await popup.evaluate(async({tab,id})=>new Promise(resolve=>chrome.tabs.executeScript(tab,{blancDocumentId:id,code:"document.querySelector('#marker')?.textContent"},r=>{const e=chrome.runtime.lastError;resolve(e?{error:e.message}:{result:r});})),{tab,id:recovered.documentId});assert.equal(control.result?.[0],'clean');
  report.checks.push({kind,before,held,after,crashed,recovered,control});
 }
 report.completed=true;
}catch(e){report.error=String(e);process.exitCode=1;}finally{release();if(session)await session.close();report.faults=replay.faults;report.arrivals=replay.arrivals;await replay.close();fs.rmSync(root,{recursive:true,force:true});report.cleanup={removed:!fs.existsSync(root)};fs.writeFileSync(path.join(evidence,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({completed:report.completed,error:report.error}));}
