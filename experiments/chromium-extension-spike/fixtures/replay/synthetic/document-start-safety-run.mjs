import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';
import {startSynthetic} from './transport.mjs';import {createCertificateSet} from './certificate-set.mjs';import {openSession,pause} from './session.mjs';import {cosmeticOrigin as origin,cosmeticFilters} from './ubo-cosmetic-fixtures.mjs';
const [configFile,payload,oldPayload,evidence]=process.argv.slice(2),config=JSON.parse(fs.readFileSync(configFile));assert(config.documentStart);assert(!fs.existsSync(evidence));fs.mkdirSync(evidence);
const url=origin+'/blanc-fixture/cosmetic/safety',hit=origin+'/blanc-fixture/cosmetic/prevented-safety';
const fixtures=new Map([[url,{status:200,contentType:'text/html',body:`<!doctype html><script>window.pageRan=true;window.early={flag:window.blancParityFlag===true,getter:!!Object.getOwnPropertyDescriptor(window,'blancParityFlag')?.get};window.earlyFetch=fetch('${hit}').then(r=>r.text());</script><link rel="icon" href="data:,"><title>Gate safety</title>`}],[hit,{status:200,contentType:'text/plain',body:'NETWORK LEAK'}],[origin+'/favicon.ico',{status:204,contentType:'image/x-icon',body:''}]]);
const alternate='https://other.blanc-control.test/blanc-fixture/cosmetic/safety';fixtures.set(alternate,fixtures.get(url));
fs.writeFileSync(path.join(evidence,'fixtures.json'),JSON.stringify([...fixtures],null,2));fs.writeFileSync(path.join(evidence,'filters.txt'),cosmeticFilters);
const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'blanc-docstart-safety-'))),certificates=createCertificateSet(path.join(root,'certificates'),[new URL(origin).hostname,new URL(alternate).hostname]);
const report={checks:[],completed:false,latencyMeasured:false};let session,replay;
try{
 for(const kind of ['regular','private','missing-payload']){
  replay=await startSynthetic({fixtures,tlsMaterial:certificates});session=await openSession({config,browserKind:'chromium',kind:kind==='private'?'private':'regular',label:kind,root,transport:replay,certificates,provider:'ublock-origin',uboPayload:kind==='missing-payload'?oldPayload:payload});await session.uboConfigure();await session.uboSetFilters(cosmeticFilters);
  if(kind==='missing-payload'){
   await session.page.goto(url,{waitUntil:'commit'});await pause(3500);
   const dom=await session.page.evaluate(()=>({pageRan:window.pageRan===true,text:document.documentElement?.innerHTML||''}));
   assert.equal(dom.pageRan,false);assert(!replay.arrivals.some(x=>x.url===hit));report.checks.push({name:'missing-payload-timeout-blocks-first-inline',passed:true,dom});
  }else{
   await session.page.goto(url);const initial=await session.page.evaluate(async()=>({early:window.early,fetch:await window.earlyFetch}));
   assert.equal(initial.early.flag,kind==='regular');assert.equal(initial.early.getter,kind==='regular');assert.equal(initial.fetch,kind==='regular'?'':'NETWORK LEAK');report.checks.push({name:kind+'-profile-binding',passed:true,initial});
   if(kind==='regular'){
    await session.uboSetFilters(cosmeticFilters+'\npage.blanc-fixture.test#@#+js(set-constant, blancParityFlag, true)');await session.page.reload();
    const exempt=await session.page.evaluate(()=>window.early);assert.equal(exempt.flag,false);assert.equal(exempt.getter,false);report.checks.push({name:'scriptlet-exception-after-filter-generation-change',passed:true,exempt});
    await session.uboSetFilters(cosmeticFilters);await session.page.reload();const restored=await session.page.evaluate(()=>window.early);assert(restored.flag&&restored.getter);report.checks.push({name:'replacement-generation-restores-early-payload',passed:true,restored});
    await session.page.goto(alternate);const other=await session.page.evaluate(()=>window.early);assert.equal(other.flag,false);assert.equal(other.getter,false);await session.page.goto(url);const returned=await session.page.evaluate(()=>window.early);assert(returned.flag&&returned.getter);report.checks.push({name:'hostname-navigation-does-not-reuse-other-document-payload',passed:true,other,returned});
    const popup=session.page.context().pages().find(p=>p.url().includes('/popup-fenix.html'));assert(popup);
    const refused=await popup.evaluate(async()=>{const b=globalThis.chrome.extension.getBackgroundPage();const result={};for(const [name,target] of [['popup',globalThis],['stale-background',b]]){try{result[name]=(await target.fetch('http://blanc-ubo-control.invalid/script?0',{method:'POST',body:JSON.stringify({token:'fake',code:'window.forged=true'})})).status;}catch{result[name]='blocked';}}return result;});
    assert.equal(refused.popup,'blocked');assert.equal(refused['stale-background'],403);report.checks.push({name:'popup-and-stale-generation-cannot-deliver-code',passed:true,refused});
   }
  }
  await session.close();report[kind]={records:session.records(),arrivals:replay.arrivals,faults:replay.faults};session=null;await replay.close();replay=null;
 }
 report.completed=true;
}catch(error){report.error=String(error);process.exitCode=1;}
finally{if(session){report.partial={records:session.records(),arrivals:replay?.arrivals};await session.close();}if(replay)await replay.close();fs.rmSync(root,{recursive:true,force:true});report.cleanup={removed:!fs.existsSync(root)};fs.writeFileSync(path.join(evidence,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
