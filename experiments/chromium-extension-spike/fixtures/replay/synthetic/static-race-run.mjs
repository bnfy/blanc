import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';
import {openSession,until,pause} from './session.mjs';import {startSynthetic} from './transport.mjs';import {createCertificateSet} from './certificate-set.mjs';import {sha} from './generate.mjs';
const [configFile,payload,evidence]=process.argv.slice(2),config=JSON.parse(fs.readFileSync(configFile));assert(!fs.existsSync(evidence));fs.mkdirSync(evidence);
const host='https://page.blanc-fixture.test',filters='page.blanc-fixture.test##+js(set-constant, raceFlag, true)';
const fixtures=new Map([[host+'/race',{status:200,contentType:'text/html',body:'<!doctype html><link rel="icon" href="data:,"><body>authored parent'}],[host+'/favicon.ico',{status:204,contentType:'image/x-icon',body:''}]]);
const body='<!doctype html><script>window.first={flag:window.raceFlag===true,origin:window.origin};</script><div id=ready>authored race</div>';
const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'blanc-static-race-'))),certificates=createCertificateSet(path.join(root,'certificates'),[new URL(host).hostname]),replay=await startSynthetic({fixtures,tlsMaterial:certificates});
const report={completed:false,diagnosticScheduling:true,deliveryBarrier:true,lostReceiverRecovery:true,latencyMeasured:false,checks:[],sources:{}};for(const n of ['static-race-run.mjs','static-race-payload.mjs','session.mjs'])report.sources[n]=sha(fs.readFileSync(new URL(n,import.meta.url)));
fs.writeFileSync(path.join(evidence,'fixtures.json'),JSON.stringify({fixtures:[...fixtures],body,filters},null,2));let session;
try{
 session=await openSession({config,browserKind:'chromium',kind:'regular',label:'race',root,transport:replay,certificates,provider:'ublock-origin',uboPayload:payload});report.source=session.source;await session.uboConfigure();await session.uboSetFilters(filters);
 const popup=session.page.context().pages().find(p=>p.url().includes('/popup-fenix.html'));assert(popup);
 for(const mode of ['srcdoc','data','blob'])for(const phase of ['before-context','after-context','after-engine','after-confirm','after-dispatch'])for(const reload of ['held','completed','filter-reload']){
  await session.page.goto(host+'/race');
  await popup.evaluate(phase=>{const b=globalThis.chrome.extension.getBackgroundPage();b.__blancStaticRows.length=0;b.__blancRace.events.length=0;b.__blancRace.armed=phase;},phase);
  await session.page.evaluate(({mode,body})=>{const f=document.createElement('iframe');f.id='probe';if(mode==='srcdoc'){f.sandbox='allow-scripts';f.srcdoc=body;}else if(mode==='data')f.src='data:text/html,'+encodeURIComponent(body);else f.src=URL.createObjectURL(new Blob([body],{type:'text/html'}));document.body.append(f);},{mode,body});
  const frame=await (await session.page.$('#probe')).contentFrame();await frame.waitForSelector('#ready');
  await until(()=>popup.evaluate(()=>Boolean(globalThis.chrome.extension.getBackgroundPage().__blancRace.resume)));
  const before=await frame.evaluate(()=>({first:window.first,counts:window.__blancScriptletGateCounts,url:location.href,origin:window.origin}));assert(before.first.flag);assert.equal(before.counts.bodies,1);
  let state;
  if(phase==='after-dispatch'){
   await popup.evaluate(reload=>{const b=globalThis.chrome.extension.getBackgroundPage();b.__raceReload={before:b.__blancRace.state(),settled:false};b.__raceReload.promise=(async()=>{if(reload==='filter-reload')await b.µBlock.loadFilterLists();else{await b.__blancUboProbe.begin();if(reload==='completed')await b.__blancUboProbe.complete();}b.__raceReload.after=b.__blancRace.state();b.__raceReload.settled=true;})();},reload);
   await until(()=>popup.evaluate(()=>!globalThis.chrome.extension.getBackgroundPage().__blancRace.state().ready));await pause(100);
   const held=await popup.evaluate(()=>{const b=globalThis.chrome.extension.getBackgroundPage();return {settled:b.__raceReload.settled,state:b.__blancRace.state()};});assert.equal(held.settled,false);
   await popup.evaluate(()=>globalThis.chrome.extension.getBackgroundPage().__blancRace.resume());
   state=await popup.evaluate(async()=>{const b=globalThis.chrome.extension.getBackgroundPage();await b.__raceReload.promise;return {before:b.__raceReload.before,after:b.__raceReload.after};});state.heldBeforeReceiver=held;
  }else{
  state=await popup.evaluate(async reload=>{const b=globalThis.chrome.extension.getBackgroundPage(),before=b.__blancRace.state();if(reload==='filter-reload'){await b.µBlock.loadFilterLists();}else{await b.__blancUboProbe.begin();if(reload==='completed')await b.__blancUboProbe.complete();}const after=b.__blancRace.state();b.__blancRace.resume();return {before,after};},reload);
  }

  await pause(150);
  const after=await frame.evaluate(()=>({counts:window.__blancScriptletGateCounts,flag:window.raceFlag===true,origin:window.origin}));
  const observed=await popup.evaluate(()=>{const b=globalThis.chrome.extension.getBackgroundPage();return {events:b.__blancRace.events,rows:b.__blancStaticRows};});
  report.checks.push({mode,phase,reload,before,after,state,...observed});assert.equal(after.counts.bodies,1);assert(after.flag);assert.equal(observed.events.length,1);
  if(reload==='held')await popup.evaluate(()=>globalThis.chrome.extension.getBackgroundPage().__blancUboProbe.complete());
 }
 // A live but paused receiver must remain held. Concurrent real reload calls
 // share the same promise through the final ready acknowledgement; a rejected
 // drain can subsequently be retried after the exact receiver acknowledges.
 await session.page.goto(host+'/race');
 await popup.evaluate(()=>{const b=globalThis.chrome.extension.getBackgroundPage();b.__blancRace.armed='after-dispatch';});
 await session.page.evaluate(body=>{const f=document.createElement('iframe');f.id='live';f.sandbox='allow-scripts';f.srcdoc=body;document.body.append(f);},body);
 await until(()=>popup.evaluate(()=>Boolean(globalThis.chrome.extension.getBackgroundPage().__blancRace.resume)));
 report.lifetimeControls=await popup.evaluate(async()=>{
  const b=globalThis.chrome.extension.getBackgroundPage(),documentId=b.__blancRace.events.at(-1).metadata.documentId,generation=b.__blancRace.state().generation;
  const ask=async(id,epoch)=>{const r=await b.fetch('http://blanc-ubo-control.invalid/delivery-document?'+epoch,{method:'POST',body:JSON.stringify({documentId:id})});return {status:r.status,body:await r.json()};};
  let popupRejected;try{const r=await fetch('http://blanc-ubo-control.invalid/delivery-document?'+generation,{method:'POST',body:JSON.stringify({documentId})});popupRejected=r.status!==200;}catch{popupRejected=true;}
  return {documentId,live:await ask(documentId,generation),malformed:await ask('invalid',generation),stale:await ask(documentId,generation-1),malformedEpoch:await ask(documentId,generation+'junk'),popupRejected};
 });
 const live=await popup.evaluate(async()=>{
  const b=globalThis.chrome.extension.getBackgroundPage(),before=b.__blancRace.state(),event=b.__blancRace.events.at(-1),a=b.µBlock.loadFilterLists(),c=b.µBlock.loadFilterLists();
  let duplicateBegin,earlyComplete;try{await b.__blancUboProbe.begin();}catch(e){duplicateBegin=String(e);}try{await b.__blancUboProbe.complete(before.generation);}catch(e){earlyComplete=String(e);}
  const settled=await Promise.allSettled([a,c]);return {before,documentId:event.metadata.documentId,samePromise:a===c,duplicateBegin,earlyComplete,settled:settled.map(x=>({status:x.status,error:String(x.reason)})),held:b.__blancRace.state()};
 });
 live.networkBlocked=await session.page.evaluate(()=>fetch(location.href).then(()=>false,()=>true));
 await popup.evaluate(()=>globalThis.chrome.extension.getBackgroundPage().__blancRace.resume());await pause(100);
 live.afterRetry=await popup.evaluate(async()=>{const b=globalThis.chrome.extension.getBackgroundPage();await b.µBlock.loadFilterLists();return b.__blancRace.state();});
 live.staleCompletion=await popup.evaluate(async()=>{const b=globalThis.chrome.extension.getBackgroundPage(),old=b.__blancRace.state().generation,next=await b.__blancUboProbe.begin();let error;try{await b.__blancUboProbe.complete(old);}catch(e){error=String(e);}const held=b.__blancRace.state();await b.__blancUboProbe.complete(next);return {error,held,after:b.__blancRace.state()};});
 report.liveReceiver=live;assert(live.samePromise&&live.networkBlocked);assert(live.settled.every(x=>x.status==='rejected'));assert(live.afterRetry.ready);
 // Removal of a previously browser-verified document allows safe retirement.
 await session.page.goto(host+'/race');
 await popup.evaluate(()=>{const b=globalThis.chrome.extension.getBackgroundPage();b.__blancRace.armed='after-dispatch';});
 await session.page.evaluate(body=>{const f=document.createElement('iframe');f.id='lost';f.sandbox='allow-scripts';f.srcdoc=body;document.body.append(f);},body);
 await until(()=>popup.evaluate(()=>Boolean(globalThis.chrome.extension.getBackgroundPage().__blancRace.resume)));
 const beforeLost=await popup.evaluate(()=>{const b=globalThis.chrome.extension.getBackgroundPage();return {state:b.__blancRace.state(),documentId:b.__blancRace.events.at(-1).metadata.documentId};});
 await session.page.evaluate(()=>document.querySelector('#lost').remove());
 const lost=await popup.evaluate(async()=>{const b=globalThis.chrome.extension.getBackgroundPage();let error;try{await b.µBlock.loadFilterLists();}catch(e){error=String(e);}return {error:error??null,state:b.__blancRace.state()};});
 report.receiverLost={before:beforeLost.state,documentId:beforeLost.documentId,...lost};assert.equal(lost.error,null);assert(lost.state.ready);assert(lost.state.generation>beforeLost.state.generation);
 report.completed=true;
}catch(error){report.error=String(error);process.exitCode=1;}finally{if(session){report.records=session.records();await session.close();}report.arrivals=replay.arrivals;report.faults=replay.faults;await replay.close();fs.rmSync(root,{recursive:true,force:true});report.cleanup={removed:!fs.existsSync(root)};fs.writeFileSync(path.join(evidence,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({completed:report.completed,cases:report.checks.length,error:report.error}));}
