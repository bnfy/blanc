import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';
import {openSession,until,pause} from './session.mjs';import {startSynthetic} from './transport.mjs';import {createCertificateSet} from './certificate-set.mjs';import {sha} from './generate.mjs';
const [configFile,payload,evidence]=process.argv.slice(2),config=JSON.parse(fs.readFileSync(configFile));assert(!fs.existsSync(evidence));fs.mkdirSync(evidence);
const navigationMode=process.argv.includes('--navigation');
const host='https://page.blanc-fixture.test',body='<!doctype html><link rel="icon" href="data:,"><div id="ad">authored ad</div><noscript><span id="fallback">authored fallback</span></noscript>';
const fixtures=new Map([[host+'/test',{status:200,contentType:'text/html',body}],[host+'/next',{status:200,contentType:'text/html',body}],[host+'/favicon.ico',{status:204,contentType:'image/x-icon',body:''}]]);
const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'blanc-helper-channels-'))),certificates=createCertificateSet(path.join(root,'certificates'),[new URL(host).hostname]),replay=await startSynthetic({fixtures,tlsMaterial:certificates});
const report={completed:false,diagnosticScheduling:true,latencyMeasured:false,checks:[],sources:{}};for(const n of ['helper-channels-run.mjs','delivery-order-payload.mjs','session.mjs'])report.sources[n]=sha(fs.readFileSync(new URL(n,import.meta.url)));
fs.writeFileSync(path.join(evidence,'fixtures.json'),JSON.stringify([...fixtures],null,2));let session,cdp;
try{
 session=await openSession({config,browserKind:'chromium',kind:'regular',label:'channels',root,transport:replay,certificates,provider:'ublock-origin',uboPayload:payload});report.source=session.source;await session.uboConfigure();await session.uboSetFilters('page.blanc-fixture.test###ad');
 const popup=session.page.context().pages().find(p=>p.url().includes('/popup-fenix.html'));assert(popup);
 cdp=await session.page.context().newCDPSession(session.page);const contexts=new Map();cdp.on('Runtime.executionContextCreated',e=>contexts.set(e.context.id,e.context));cdp.on('Runtime.executionContextDestroyed',e=>contexts.delete(e.executionContextId));cdp.on('Runtime.executionContextsCleared',()=>contexts.clear());await cdp.send('Runtime.enable');
 for(const target of (navigationMode?['picker']:['logger','noscript','picker']))for(const mode of (navigationMode?['same-url','cross-url']:['drain','timeout'])){
  await session.page.goto('about:blank');
  await popup.evaluate(({target})=>{const b=globalThis.chrome.extension.getBackgroundPage();b.µBlock.toggleHostnameSwitch({name:'no-scripting',hostname:'page.blanc-fixture.test',state:target==='noscript',tabId:0});if(target==='logger')b.__blancDeliveryProbe.enableLogger();b.__blancDeliveryProbe.armed=target==='picker'?null:target;b.__blancDeliveryProbe.events.length=0;}, {target});
  await session.page.goto(host+'/test');
  let pickerContext;
  if(target==='picker'){
   await pause(300);await popup.evaluate(()=>{const p=globalThis.chrome.extension.getBackgroundPage().__blancDeliveryProbe;p.armed='picker';p.events.length=0;globalThis.chrome.extension.getBackgroundPage().__blancHelperDocuments=[];});
   await until(async()=>{for(const [id,c] of contexts){if(c.auxData?.isDefault)continue;const r=await cdp.send('Runtime.evaluate',{contextId:id,expression:'typeof vAPI!=="undefined" && !!vAPI.messaging',returnByValue:true}).catch(()=>null);if(r?.result.value===true){pickerContext=id;return true;}}return false;});
   await cdp.send('Runtime.evaluate',{contextId:pickerContext,expression:"globalThis.__pickerResult={settled:false};vAPI.messaging.send('elementPicker',{what:'elementPickerArguments'}).then(value=>{globalThis.__pickerResult={settled:true,value};});",returnByValue:true});
  }
  try{await until(()=>popup.evaluate(()=>Boolean(globalThis.chrome.extension.getBackgroundPage().__blancDeliveryProbe.resume)),10000);}catch(error){report.pauseFailure=await popup.evaluate(()=>{const p=globalThis.chrome.extension.getBackgroundPage().__blancDeliveryProbe;return {armed:p.armed,events:p.events,size:p.size()};});throw error;}
  const before=await popup.evaluate(()=>{const p=globalThis.chrome.extension.getBackgroundPage().__blancDeliveryProbe;return {state:p.state(),size:p.size(),events:p.events};});assert.equal(before.events.length,1);assert.equal(before.events[0].path,target);assert(before.events[0].resultLength>0);assert.equal(before.size,1);
  const pickerBefore=pickerContext?await cdp.send('Runtime.evaluate',{contextId:pickerContext,expression:'globalThis.__pickerResult',returnByValue:true}):null;if(pickerBefore)assert.equal(pickerBefore.result.value.settled,false);
  let identity=null;
  if(navigationMode){
   identity=await popup.evaluate(async()=>{const b=globalThis.chrome.extension.getBackgroundPage(),event=b.__blancDeliveryProbe.events[0],frame=await b.chrome.webNavigation.getFrame({tabId:event.tabId,frameId:event.frameId});return {frame,entries:b.__blancHelperDocuments.filter(x=>x.file===event.file),event};});
   assert.equal(identity.entries.length,1);assert.equal(identity.entries[0].documentId,identity.frame.documentId);assert.equal(identity.entries[0].tabId,identity.event.tabId);assert.equal(identity.entries[0].frameId,identity.event.frameId);assert.equal(identity.entries[0].url,host+'/test');
   await session.page.goto(host+(mode==='same-url'?'/test':'/next'));
   identity.after=await popup.evaluate(async event=>{const b=globalThis.chrome.extension.getBackgroundPage();return {frame:await b.chrome.webNavigation.getFrame({tabId:event.tabId,frameId:event.frameId}),pending:b.__blancDeliveryProbe.size()};},identity.event);
   assert.notEqual(identity.after.frame.documentId,identity.frame.documentId);assert.equal(identity.after.pending,1);
   pickerContext=null;
  }
  await popup.evaluate(()=>{const b=globalThis.chrome.extension.getBackgroundPage();b.__reload={settled:false};b.µBlock.loadFilterLists().then(()=>{b.__reload={settled:true,ok:true};},e=>{b.__reload={settled:true,error:String(e)};});});await pause(mode==='timeout'?3400:120);
  const held=await popup.evaluate(()=>{const b=globalThis.chrome.extension.getBackgroundPage(),p=b.__blancDeliveryProbe;return {state:p.state(),size:p.size(),reload:b.__reload};});assert(!held.state.ready);assert.equal(held.size,1);assert.equal(held.reload.settled,mode==='timeout');if(mode==='timeout')assert.match(held.reload.error,/remains held/);
  await popup.evaluate(()=>globalThis.chrome.extension.getBackgroundPage().__blancDeliveryProbe.resume());await until(()=>popup.evaluate(()=>globalThis.chrome.extension.getBackgroundPage().__blancDeliveryProbe.size()===0));
  if(mode==='timeout')await popup.evaluate(()=>globalThis.chrome.extension.getBackgroundPage().µBlock.loadFilterLists());else await until(()=>popup.evaluate(()=>globalThis.chrome.extension.getBackgroundPage().__reload.settled));
  const after=await popup.evaluate(()=>{const p=globalThis.chrome.extension.getBackgroundPage().__blancDeliveryProbe;return {state:p.state(),size:p.size()};});assert(after.state.ready);assert.equal(after.size,0);
  const outcome=await session.page.evaluate(()=>({fallback:document.querySelector('#fallback')?.textContent,noscriptCount:document.querySelectorAll('noscript').length,adDisplay:getComputedStyle(document.querySelector('#ad')).display}));if(target==='noscript'){assert.equal(outcome.noscriptCount,0);assert.equal(outcome.fallback,'authored fallback');}
  let pickerAfter=null;if(pickerContext){await until(async()=>{pickerAfter=(await cdp.send('Runtime.evaluate',{contextId:pickerContext,expression:'globalThis.__pickerResult',returnByValue:true})).result.value;return pickerAfter.settled;});assert.match(pickerAfter.value.pickerURL,/^chrome-extension:\/\//);}
  report.checks.push({target,mode,identity,before,held,after,outcome,pickerBefore:pickerBefore?.result.value,pickerAfter});
 }
 report.completed=true;
}catch(error){report.error=String(error);process.exitCode=1;}finally{if(session){report.records=session.records();await session.close();}report.arrivals=replay.arrivals;report.faults=replay.faults;await replay.close();fs.rmSync(root,{recursive:true,force:true});report.cleanup={removed:!fs.existsSync(root)};fs.writeFileSync(path.join(evidence,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({completed:report.completed,cases:report.checks.length,error:report.error}));}
