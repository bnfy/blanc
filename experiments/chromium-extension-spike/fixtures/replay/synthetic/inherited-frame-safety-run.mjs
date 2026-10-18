import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';
import {startSynthetic} from './transport.mjs';import {createCertificateSet} from './certificate-set.mjs';import {openSession,until} from './session.mjs';import {top,child,blocked,filters,html,fixtures} from './opaque-frame-fixtures.mjs';
const [configFile,payload,evidence]=process.argv.slice(2),config=JSON.parse(fs.readFileSync(configFile));assert(config.documentStart);assert(!fs.existsSync(evidence));fs.mkdirSync(evidence);
const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'blanc-inherited-safety-'))),certificates=createCertificateSet(path.join(root,'certificates'),[top,child,blocked].map(u=>new URL(u).hostname)),replay=await startSynthetic({fixtures:fixtures(),tlsMaterial:certificates});
const report={completed:false,checks:[],latencyMeasured:false};let session;
try{
 session=await openSession({config,browserKind:'chromium',kind:'regular',label:'inherited-safety',root,transport:replay,certificates,provider:'ublock-origin',uboPayload:payload});await session.uboConfigure();
 for(const phase of ['normal','exception','restored']){
  await session.uboSetFilters(filters+(phase==='exception'?'\npage.blanc-fixture.test#@#+js(set-constant, opaqueFlag, true)\npage.blanc-fixture.test#@#+js(no-fetch-if, /opaque-hit/)':''));await session.page.goto(top+'/root');
  for(const mode of ['srcdoc','blank']){
   const name=mode+'-inherited',body=html(name),begin=replay.arrivals.length;
   await session.page.evaluate(({mode,body})=>{const f=document.createElement('iframe');f.id=mode;if(mode==='srcdoc')f.srcdoc=body;document.body.append(f);},{mode,body});
   const el=await session.page.$('#'+mode),frame=await until(()=>el.contentFrame());if(mode==='blank')await frame.evaluate(body=>{document.open();document.write(body);document.close();},body);await frame.waitForSelector('#fixture-ready');
   const observed=await frame.evaluate(async()=>({first:window.first,requests:await window.requests,origin:window.origin})),arrivals=replay.arrivals.slice(begin),expected=phase!=='exception';
   assert.equal(observed.origin,top);assert.equal(observed.first.flag,expected);assert.equal(observed.first.getter,expected);assert.equal(observed.requests[0].result,'resolved');assert.equal(observed.requests[1].result,'rejected');assert.equal(arrivals.filter(a=>a.url===child+'/opaque-hit/'+name).length,expected?0:1);assert(!arrivals.some(a=>a.url===blocked+'/blanc-fixture/opaque/'+name));
   report.checks.push({phase,mode,passed:true,observed,arrivals});
  }
 }
 report.completed=true;
}catch(e){report.error=String(e);process.exitCode=1;}finally{if(session)await session.close();report.faults=replay.faults;await replay.close();fs.rmSync(root,{recursive:true,force:true});report.cleanup={removed:!fs.existsSync(root)};fs.writeFileSync(path.join(evidence,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
