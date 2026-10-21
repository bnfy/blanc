import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';
import {startSynthetic} from './transport.mjs';import {createCertificateSet} from './certificate-set.mjs';import {openSession,pause} from './session.mjs';import {sha} from './generate.mjs';import {cosmeticOrigin as origin,cosmeticFilters} from './ubo-cosmetic-fixtures.mjs';
const observe=process.argv.includes('--observe');
const [configPath,payload,evidence]=process.argv.slice(2),config=JSON.parse(fs.readFileSync(configPath));assert(!fs.existsSync(evidence));fs.mkdirSync(evidence);
const base=origin+'/blanc-fixture/cosmetic/',fixtures=new Map([[origin+'/favicon.ico',{status:204,contentType:'image/x-icon',body:''}]]);
for(const mode of ['normal','csp'])for(const stage of ['cold','reload','fresh']){
 const id=mode+'-'+stage,url=base+id;
 fixtures.set(url,{status:200,contentType:'text/html',body:`<!doctype html><meta charset="utf-8">${mode==='csp'?'<meta http-equiv="Content-Security-Policy" content="default-src \'self\'; script-src \'nonce-fixture\'; style-src \'none\'">':''}<script nonce="fixture">
 const descriptor=Object.getOwnPropertyDescriptor(window,'blancParityFlag');
 window.early={at:Date.now(),flag:window.blancParityFlag===true,getter:!!descriptor?.get,ready:document.readyState};
 window.earlyFetch=fetch('${base}prevented-${id}').then(r=>r.text());
 </script><title>Early scriptlet probe</title>`});
 fixtures.set(base+'prevented-'+id,{status:200,contentType:'text/plain',body:'NETWORK LEAK'});
}
const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'blanc-scriptlet-timing-'))),certificates=createCertificateSet(path.join(root,'certificates'),[new URL(origin).hostname]);fs.writeFileSync(path.join(evidence,'fixtures.json'),JSON.stringify([...fixtures],null,2));
const report={observeInjection:observe,scope:'diagnostic first inline, immediate fetch, reload and fresh navigation; no latency qualification',runs:[],completed:false,nativeBuilds:0,latencyMeasured:false,sources:{}};
for(const f of ['scriptlet-timing-run.mjs','scriptlet-timing-observer.mjs','session.mjs','transport.mjs'])report.sources[f]=sha(fs.readFileSync(new URL(f,import.meta.url)));
let session,replay;
try{for(const browserKind of ['electron','chromium'])for(const repetition of ['a','b']){
 const label=browserKind+'-'+repetition;replay=await startSynthetic({fixtures,tlsMaterial:certificates});session=await openSession({config,browserKind,kind:'regular',label,root,transport:replay,certificates,provider:'ublock-origin',uboPayload:payload});await session.uboConfigure();await session.uboSetFilters(cosmeticFilters);if(observe)await session.uboObserveInjection();
 const pages=[];
 for(const mode of ['normal','csp'])for(const stage of ['cold','reload','fresh']){
  const id=mode+'-'+stage;const before=replay.arrivals.length;
  if(stage==='reload')await session.page.reload();else await session.page.goto(base+id);
  const early=await session.page.evaluate(async()=>({early:window.early,fetch:await window.earlyFetch}));await pause(400);
  const late=await session.page.evaluate(()=>({flag:window.blancParityFlag===true,getter:!!Object.getOwnPropertyDescriptor(window,'blancParityFlag')?.get,ready:document.readyState}));
  pages.push({mode,stage,url:session.page.url(),...early,late,arrivals:replay.arrivals.slice(before),injections:observe?await session.uboInjectionRecords():null});
 }
 fs.writeFileSync(path.join(evidence,label+'.json'),JSON.stringify({label,source:session.source,pages,faults:replay.faults,records:await session.uboRecords()},null,2));report.runs.push({label});await session.close();session=null;await replay.close();replay=null;console.log(label+' captured');
}report.completed=true;}catch(error){report.error=String(error);process.exitCode=1;}
finally{if(session)await session.close();if(replay)await replay.close();fs.rmSync(root,{recursive:true,force:true});report.cleanup={removed:!fs.existsSync(root)};fs.writeFileSync(path.join(evidence,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
