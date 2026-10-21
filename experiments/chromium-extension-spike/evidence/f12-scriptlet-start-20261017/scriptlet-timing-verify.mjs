import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';
export function verifyTiming(runs){
 assert.deepEqual(runs.map(r=>r.label),['electron-a','electron-b','chromium-a','chromium-b']);
 const observations=[];
 for(const r of runs){
  assert(r.faults.every(f=>['plaintext-refused','connect-refused'].includes(f.code)&&['clients2.google.com','www.google.com:443','accounts.google.com:443'].includes(f.authority)),'unexpected transport fault');
  assert.deepEqual(r.pages.map(p=>p.mode+'/'+p.stage),['normal/cold','normal/reload','normal/fresh','csp/cold','csp/reload','csp/fresh']);
  for(const p of r.pages){
   assert.equal(p.early.ready,'loading');assert.equal(typeof p.early.flag,'boolean');assert.equal(typeof p.early.getter,'boolean');assert(p.late.flag&&p.late.getter,'late injection failed');
   const id=p.mode+'-'+(p.stage==='reload'?'cold':p.stage);assert(p.url.endsWith('/'+id));
   const arrivals=p.arrivals.filter(a=>a.url.endsWith('/prevented-'+id));assert(arrivals.length<=1);
   assert.equal(p.fetch,arrivals.length?'NETWORK LEAK':'','DOM/transport disagreement');
   if(p.injections!==null){assert(Array.isArray(p.injections));assert(p.injections.some(x=>x.hasConstant&&x.runAt==='document_start'));}
   observations.push({label:r.label,mode:p.mode,stage:p.stage,earlyConstant:p.early.flag,earlyGetter:p.early.getter,earlyFetchPrevented:arrivals.length===0});
  }
 }
 return {verified:true,pages:observations.length,earlyConstantPasses:observations.filter(x=>x.earlyConstant&&x.earlyGetter).length,earlyFetchPasses:observations.filter(x=>x.earlyFetchPrevented).length,documentStartPassed:observations.every(x=>x.earlyConstant&&x.earlyGetter&&x.earlyFetchPrevented),latencyQualified:false,observations};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const root=process.argv[2],report=JSON.parse(fs.readFileSync(path.join(root,'report.json')));assert(report.completed&&report.cleanup.removed);console.log(JSON.stringify(verifyTiming(['electron-a','electron-b','chromium-a','chromium-b'].map(l=>JSON.parse(fs.readFileSync(path.join(root,l+'.json'))))),null,2));}
