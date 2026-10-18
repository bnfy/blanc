import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';
import {openSession,until,pause} from './session.mjs';import {startSynthetic} from './transport.mjs';import {createCertificateSet} from './certificate-set.mjs';import {sha} from './generate.mjs';
const [configFile,payload,evidence]=process.argv.slice(2),config=JSON.parse(fs.readFileSync(configFile));assert(!fs.existsSync(evidence));fs.mkdirSync(evidence);
const host='https://page.blanc-fixture.test',filters='page.blanc-fixture.test##+js(set-constant, raceFlag, true)';
const fixtures=new Map([[host+'/race',{status:200,contentType:'text/html',body:'<!doctype html><link rel="icon" href="data:,"><body>authored parent'}],[host+'/favicon.ico',{status:204,contentType:'image/x-icon',body:''}]]);
const body='<!doctype html><script>window.first={flag:window.raceFlag===true,origin:window.origin};</script><div id=ready>authored race</div>';
const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'blanc-static-race-'))),certificates=createCertificateSet(path.join(root,'certificates'),[new URL(host).hostname]),replay=await startSynthetic({fixtures,tlsMaterial:certificates});
const report={completed:false,diagnosticScheduling:true,latencyMeasured:false,checks:[],sources:{}};for(const n of ['static-race-run.mjs','static-race-payload.mjs','session.mjs'])report.sources[n]=sha(fs.readFileSync(new URL(n,import.meta.url)));
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
  const state=await popup.evaluate(async reload=>{const b=globalThis.chrome.extension.getBackgroundPage(),before=b.__blancRace.state();if(reload==='filter-reload'){await b.µBlock.loadFilterLists();}else{await b.__blancUboProbe.begin();if(reload==='completed')await b.__blancUboProbe.complete();}const after=b.__blancRace.state();b.__blancRace.resume();return {before,after};},reload);
  await pause(150);
  const after=await frame.evaluate(()=>({counts:window.__blancScriptletGateCounts,flag:window.raceFlag===true,origin:window.origin}));
  const observed=await popup.evaluate(()=>{const b=globalThis.chrome.extension.getBackgroundPage();return {events:b.__blancRace.events,rows:b.__blancStaticRows};});
  report.checks.push({mode,phase,reload,before,after,state,...observed});assert.equal(after.counts.bodies,1);assert(after.flag);assert.equal(observed.events.length,1);
  if(reload==='held')await popup.evaluate(()=>globalThis.chrome.extension.getBackgroundPage().__blancUboProbe.complete());
 }
 report.completed=true;
}catch(error){report.error=String(error);process.exitCode=1;}finally{if(session){report.records=session.records();await session.close();}report.arrivals=replay.arrivals;report.faults=replay.faults;await replay.close();fs.rmSync(root,{recursive:true,force:true});report.cleanup={removed:!fs.existsSync(root)};fs.writeFileSync(path.join(evidence,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({completed:report.completed,cases:report.checks.length,error:report.error}));}
