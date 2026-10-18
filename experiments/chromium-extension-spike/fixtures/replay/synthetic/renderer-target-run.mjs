/* global chrome */
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';
import {openSession,until,pause} from './session.mjs';import {startSynthetic} from './transport.mjs';import {createCertificateSet} from './certificate-set.mjs';
const [cfg,payload,evidence]=process.argv.slice(2),config={...JSON.parse(fs.readFileSync(cfg)),rendererTokenMismatchProbe:true};assert(!fs.existsSync(evidence));fs.mkdirSync(evidence);
const host='https://page.blanc-fixture.test',other='https://other.blanc-fixture.test',body='<!doctype html><link rel="icon" href="data:,"><div id="marker">untouched</div>';
const fixtures=new Map([['/test',body],['/next',body],['/queued',body+'<script src="/hold.js"></script>']].map(([p,b])=>[host+p,{status:200,contentType:'text/html',body:b}]));fixtures.set(other+'/next',{status:200,contentType:'text/html',body});
const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'blanc-renderer-target-'))),certificates=createCertificateSet(path.join(root,'certificates'),[new URL(host).hostname,new URL(other).hostname]),replay=await startSynthetic({fixtures,tlsMaterial:certificates});
const report={completed:false,checks:[],latencyMeasured:false,scope:'Transport-token fault injection plus real runAt queue navigation. Fault injection is diagnostic, not an observed naturally occurring IPC race.',permissionPromptRaceTested:false};let session;
try{
 session=await openSession({config,browserKind:'chromium',kind:'regular',label:'renderer-target',root,transport:replay,certificates,provider:'ublock-origin',uboPayload:payload});await session.uboConfigure();await session.uboSetFilters('');
 const popup=session.page.context().pages().find(p=>p.url().includes('/popup-fenix.html'));assert(popup);await session.page.goto(host+'/test');
 const tab=await popup.evaluate(async()=>{return (await chrome.tabs.query({})).find(t=>t.url==='https://page.blanc-fixture.test/test').id;});
 const snapshot=()=>popup.evaluate(tab=>chrome.webNavigation.getFrame({tabId:tab,frameId:0}),tab);
 const invoke=o=>popup.evaluate(({tab,o})=>new Promise(resolve=>chrome.tabs.executeScript(tab,o,result=>{const e=chrome.runtime.lastError;resolve(e?{error:e.message}:{result});})),{tab,o});
 const code="document.querySelector('#marker').textContent='targeted';true";
 for(const runAt of ['document_start','document_end','document_idle']){
  await session.page.goto(host+'/test');const frame=await snapshot();
  const denied=await invoke({code:'/*blanc-renderer-token-mismatch*/'+code,runAt,blancDocumentId:frame.documentId});assert(denied.error);const deniedMarker=await session.page.locator('#marker').textContent();assert.equal(deniedMarker,'untouched');
  const accepted=await invoke({code,runAt,blancDocumentId:frame.documentId});assert.equal(accepted.result?.[0],true);report.checks.push({kind:'renderer-mismatch',runAt,frame,denied,deniedMarker,accepted});
 }
 // Explicit legacy control: the diagnostic marker cannot affect unconstrained calls.
 await session.page.goto(host+'/test');const legacy=await invoke({code:'/*blanc-renderer-token-mismatch*/'+code});assert.equal(legacy.result?.[0],true);report.checks.push({kind:'legacy-control',result:legacy});
 for(const mode of ['release','same-url','cross-path','cross-origin']){
  let held;await session.page.route(host+'/hold.js',route=>{held=route;});
  await session.page.goto(host+'/queued',{waitUntil:'commit'});await until(()=>held);const before=await snapshot();
  await popup.evaluate(({tab,code,id})=>{globalThis.__queuedResult=null;chrome.tabs.executeScript(tab,{code,runAt:'document_end',blancDocumentId:id},result=>{const e=chrome.runtime.lastError;globalThis.__queuedResult=e?{error:e.message}:{result};});},{tab,code,id:before.documentId});
  await pause(200);assert.equal(await popup.evaluate(()=>globalThis.__queuedResult),null);
  if(mode==='release')await held.fulfill({status:200,contentType:'application/javascript',body:'void 0;'});
  else {held=null;await session.page.goto(mode==='cross-origin'?other+'/next':host+(mode==='same-url'?'/queued':'/next'),{waitUntil:'commit'});if(mode==='same-url'){await until(()=>held);await held.fulfill({status:200,contentType:'application/javascript',body:'void 0;'});}}
  await until(()=>popup.evaluate(()=>globalThis.__queuedResult!==null));const result=await popup.evaluate(()=>globalThis.__queuedResult);const after=await snapshot();
  const observation={kind:'queued-navigation',mode,before,after,result,pendingBeforeNavigation:true};report.checks.push(observation);
  if(mode==='release'){assert.equal(result.result?.[0],true);assert.equal(after.documentId,before.documentId);}
  else {assert.notEqual(after.documentId,before.documentId);await session.page.waitForLoadState('domcontentloaded');await pause(100);observation.replacementMarker=await session.page.locator('#marker').textContent();assert.equal(observation.replacementMarker,'untouched');assert(result.error||(Array.isArray(result.result)&&(result.result.length===0||(result.result.length===1&&result.result[0]===null))));}
  await session.page.unroute(host+'/hold.js');
 }
 report.completed=true;
}catch(e){report.error=String(e);process.exitCode=1;}finally{if(session)await session.close();report.faults=replay.faults;report.arrivals=replay.arrivals;await replay.close();fs.rmSync(root,{recursive:true,force:true});report.cleanup={removed:!fs.existsSync(root)};fs.writeFileSync(path.join(evidence,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({completed:report.completed,checks:report.checks.length,error:report.error}));}
