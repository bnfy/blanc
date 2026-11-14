import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';
import {openSession,until,pause} from './session.mjs';import {startSynthetic} from './transport.mjs';import {createCertificateSet} from './certificate-set.mjs';import {sha} from './generate.mjs';
const [configFile,payload,evidence]=process.argv.slice(2),config=JSON.parse(fs.readFileSync(configFile));assert(!fs.existsSync(evidence));fs.mkdirSync(evidence);
const host='https://page.blanc-fixture.test',filters='page.blanc-fixture.test##+js(set-constant, raceFlag, true)\npage.blanc-fixture.test##+js(remove-class, remove-me, #probe)\npage.blanc-fixture.test##.procedural:has-text(SPONSORED)';
const body='<!doctype html><link rel="icon" href="data:,"><script>window.first=window.raceFlag===true;</script><body><div id="probe" class="remove-me">authored</div><div id="procedure" class="procedural">SPONSORED</div>';
const fixtures=new Map([[host+'/test',{status:200,contentType:'text/html',body}],[host+'/favicon.ico',{status:204,contentType:'image/x-icon',body:''}]]);
const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'blanc-delivery-order-'))),certificates=createCertificateSet(path.join(root,'certificates'),[new URL(host).hostname]),replay=await startSynthetic({fixtures,tlsMaterial:certificates});
const report={completed:false,diagnosticScheduling:true,latencyMeasured:false,checks:[],sources:{}};for(const n of ['helper-delivery-run.mjs','delivery-order-payload.mjs','session.mjs'])report.sources[n]=sha(fs.readFileSync(new URL(n,import.meta.url)));
fs.writeFileSync(path.join(evidence,'fixtures.json'),JSON.stringify({fixtures:[...fixtures],filters},null,2));let session,cdp;
try{
 session=await openSession({config,browserKind:'chromium',kind:'regular',label:'ordering',root,transport:replay,certificates,provider:'ublock-origin',uboPayload:payload});report.source=session.source;await session.uboConfigure();await session.uboSetFilters(filters);
 const popup=session.page.context().pages().find(p=>p.url().includes('/popup-fenix.html'));assert(popup);
 cdp=await session.page.context().newCDPSession(session.page);await cdp.send('Debugger.enable');let paused;cdp.on('Debugger.paused',event=>{paused=event;});
 for(const target of ['procedural'])for(const mode of ['drain','timeout']){
  await session.page.goto('about:blank');paused=null;
  if(target==='upstream'){await session.page.goto(host+'/test');await pause(200);}
  await popup.evaluate(target=>{const b=globalThis.chrome.extension.getBackgroundPage();b.__blancDeliveryProbe.armed=target;b.__blancDeliveryProbe.events.length=0;},target);
  const navigation=target==='procedural'?session.page.goto(host+'/test').then(()=>({ok:true}),e=>({error:String(e)})):Promise.resolve({ok:true});
  if(target==='upstream')await popup.evaluate(async url=>{const b=globalThis.chrome.extension.getBackgroundPage(),tabs=await b.chrome.tabs.query({url}),tab=tabs.find(t=>t.url===url);if(!tab)throw Error('No exact fixture tab');b.__blancScriptletEngine.injectNow({tabId:tab.id,frameId:0,url:tab.url,ancestors:[]});},host+'/test');
  try {await until(()=>target==='native'?paused:popup.evaluate(()=>Boolean(globalThis.chrome.extension.getBackgroundPage().__blancDeliveryProbe.resume)),10000);} catch(error) {report.pauseFailure=await popup.evaluate(()=>{const b=globalThis.chrome.extension.getBackgroundPage();return {armed:b.__blancDeliveryProbe.armed,events:b.__blancDeliveryProbe.events,size:b.__blancDeliveryProbe.size(),state:b.__blancDeliveryProbe.state()};});throw error;}
  const before=await popup.evaluate(async()=>{const b=globalThis.chrome.extension.getBackgroundPage(),state=b.__blancDeliveryProbe.state(),r=await b.fetch('http://blanc-ubo-control.invalid/early-deliveries?'+state.generation);return {state,native:await r.json(),upstream:b.__blancDeliveryProbe.size(),events:b.__blancDeliveryProbe.events};});
  assert.equal(before.events.length,1);assert.equal(before.events[0].path,target);
  assert.equal(target==='native'?before.native.pending:before.upstream,1);
  await popup.evaluate(()=>{const b=globalThis.chrome.extension.getBackgroundPage();b.__blancReloadResult={settled:false};b.µBlock.loadFilterLists().then(()=>{b.__blancReloadResult={settled:true,ok:true};},e=>{b.__blancReloadResult={settled:true,error:String(e)};});});
  await pause(mode==='timeout'?3400:120);
  const held=await popup.evaluate(async(target)=>{const b=globalThis.chrome.extension.getBackgroundPage(),state=b.__blancDeliveryProbe.state(),r=await b.fetch('http://blanc-ubo-control.invalid/early-deliveries?'+state.generation);let premature='not-attempted';if(target==='native')try{const a=await b.fetch('http://blanc-ubo-control.invalid/ready?'+state.generation);premature=a.status;}catch{premature='refused';}return {state,native:await r.json(),upstream:b.__blancDeliveryProbe.size(),result:b.__blancReloadResult,premature};},target);
  // Native direct ready is guarded in C++; upstream readiness is guarded by the
  // trusted provider protocol. Do not send a bypassing ready request for it.
  assert(!held.state.ready);assert.equal(held.result.settled,mode==='timeout');if(mode==='timeout')assert.match(held.result.error,/remains held/);
  if(target==='native')await cdp.send('Debugger.resume');else await popup.evaluate(()=>globalThis.chrome.extension.getBackgroundPage().__blancDeliveryProbe.resume());const navigated=await navigation;assert(navigated.ok,navigated.error);
  if(mode==='timeout')await popup.evaluate(()=>globalThis.chrome.extension.getBackgroundPage().µBlock.loadFilterLists());else await until(()=>popup.evaluate(()=>globalThis.chrome.extension.getBackgroundPage().__blancReloadResult.settled));
  await until(()=>popup.evaluate(()=>globalThis.chrome.extension.getBackgroundPage().__blancDeliveryProbe.size()===0));
  const after=await popup.evaluate(async()=>{const b=globalThis.chrome.extension.getBackgroundPage(),state=b.__blancDeliveryProbe.state(),r=await b.fetch('http://blanc-ubo-control.invalid/early-deliveries?'+state.generation);return {state,native:await r.json(),upstream:b.__blancDeliveryProbe.size(),result:b.__blancReloadResult};});
  const page=await session.page.evaluate(()=>({first:window.first,flag:window.raceFlag,counts:window.__blancScriptletGateCounts,procedure:getComputedStyle(document.querySelector('#procedure')).display}));
  assert(after.state.ready);assert.equal(after.native.pending,0);assert.equal(after.upstream,0);assert(page.first&&page.flag);await until(()=>session.page.evaluate(()=>getComputedStyle(document.querySelector('#procedure')).display==='none'));page.procedure=await session.page.evaluate(()=>getComputedStyle(document.querySelector('#procedure')).display);
  report.checks.push({target,mode,before,held,after,page,pauseBoundary:target==='native'?'inside-native-ExecuteScript':'after-upstream-API-settlement-before-lease-release'});
 }
 report.completed=true;
}catch(error){report.error=String(error);process.exitCode=1;}finally{if(cdp)await cdp.send('Debugger.resume').catch(()=>{});if(session){report.records=session.records();await session.close();}report.arrivals=replay.arrivals;report.faults=replay.faults;await replay.close();fs.rmSync(root,{recursive:true,force:true});report.cleanup={removed:!fs.existsSync(root)};fs.writeFileSync(path.join(evidence,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({completed:report.completed,cases:report.checks.length,error:report.error}));}
