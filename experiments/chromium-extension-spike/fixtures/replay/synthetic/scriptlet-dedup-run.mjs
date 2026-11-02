import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';
import {startSynthetic} from './transport.mjs';import {createCertificateSet} from './certificate-set.mjs';import {openSession,until,pause} from './session.mjs';import {top,child,blocked,filters,html,fixtures} from './opaque-frame-fixtures.mjs';
const [configFile,payload,evidence]=process.argv.slice(2),config=JSON.parse(fs.readFileSync(configFile));assert(config.documentStart);assert(!fs.existsSync(evidence));fs.mkdirSync(evidence);
const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'blanc-dedup-'))),certificates=createCertificateSet(path.join(root,'certificates'),[top,child,blocked].map(u=>new URL(u).hostname)),replay=await startSynthetic({fixtures:fixtures(),tlsMaterial:certificates});
const report={completed:false,checks:[],latencyMeasured:false};let session;
try{
 session=await openSession({config,browserKind:'chromium',kind:'regular',label:'dedup',root,transport:replay,certificates,provider:'ublock-origin',uboPayload:payload});await session.uboConfigure();await session.uboSetFilters(filters);
 for(const repeat of [0,1])for(const mode of ['srcdoc','blank','opaque-srcdoc']){
  await session.page.goto(top+'/root');const name=mode==='blank'?'blank-inherited':mode==='srcdoc'?'srcdoc-inherited':'srcdoc-opaque';
  await session.page.evaluate(({mode,body})=>{const f=document.createElement('iframe');f.id='probe';if(mode==='opaque-srcdoc')f.sandbox='allow-scripts';if(mode!=='blank')f.srcdoc=body;document.body.append(f);},{mode,body:html(name)});
  const el=await session.page.$('#probe'),frame=await until(()=>el.contentFrame());if(mode==='blank')await frame.evaluate(body=>{document.open();document.write(body);document.close();},html(name));await frame.waitForSelector('#fixture-ready');await frame.evaluate(()=>window.requests);
  const before=await frame.evaluate(()=>({first:window.first,counts:window.__blancScriptletGateCounts,origin:window.origin}));assert(before.first.flag&&before.first.getter);assert.equal(before.counts.bodies,1);
  // Stress the actual extension executeScript path with the engine's assembled
  // payload. This is deliberate repeat delivery, not a claim of natural repeats.
  const popup=session.page.context().pages().find(p=>p.url().includes('/popup-fenix.html'));assert(popup);
  const delivery=await popup.evaluate(async({top,mode})=>{const b=globalThis.chrome.extension.getBackgroundPage();const tabs=await b.chrome.tabs.query({});const tab=tabs.find(t=>t.url===top+'/root');if(!tab)throw Error('missing fixture tab');const frames=await b.chrome.webNavigation.getAllFrames({tabId:tab.id});const candidates=frames.filter(f=>f.parentFrameId===0&&f.url===(mode==='blank'?'about:blank':'about:srcdoc'));if(candidates.length!==1)throw Error('ambiguous fixture frame');const frame=candidates[0];const engine=b.__blancScriptletEngine;
   const details=engine.retrieve({tabId:tab.id,frameId:frame.frameId,nocache:true,url:top+'/',hostname:new URL(top).hostname,domain:'blanc-fixture.test',ancestors:[{hostname:new URL(top).hostname,domain:'blanc-fixture.test'}]});if(!details?.code)throw Error('missing real engine script');
   for(let i=0;i<2;i++)await b.vAPI.tabs.executeScript(tab.id,{frameId:frame.frameId,code:'self.uBO_scriptletsInjected=undefined;\n'+details.code,matchAboutBlank:true,runAt:'document_start'});
   return {tabId:tab.id,frameId:frame.frameId,url:frame.url,deliberateLateDeliveries:2,isolatedInjectorSentinelReset:true};
  },{top,mode});await pause(100);
  const after=await frame.evaluate(()=>({counts:window.__blancScriptletGateCounts,flag:window.opaqueFlag===true,origin:window.origin}));report.checks.push({repeat,mode,before,delivery,after,passed:false});assert.equal(after.counts.bodies,1);if(mode!=='opaque-srcdoc')assert(after.counts.attempts>=before.counts.attempts+2,'both late payloads must actually reach main world');assert(after.flag);assert.equal(after.origin,mode==='opaque-srcdoc'?'null':top);
  report.checks.at(-1).passed=mode!=='opaque-srcdoc';report.checks.at(-1).scope=mode==='opaque-srcdoc'?'early-pass-late-delivery-unproven':'inherited-repeat-delivery-pass';
 }
 report.completed=true;
}catch(e){report.error=String(e);process.exitCode=1;}finally{if(session)await session.close();report.arrivals=replay.arrivals;report.faults=replay.faults;await replay.close();fs.rmSync(root,{recursive:true,force:true});report.cleanup={removed:!fs.existsSync(root)};fs.writeFileSync(path.join(evidence,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
