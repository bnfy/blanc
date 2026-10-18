// Separate matching outcomes from document-start functional acceptance.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';
export function verifyCosmetics(runs){
 assert.equal(runs.length,4);assert.deepEqual(runs.map(r=>r.label),['electron-a','electron-b','chromium-a','chromium-b']);
 const early=[];
 for(const run of runs){
  assert(run.faults.every(f=>['plaintext-refused','connect-refused'].includes(f.code)&&['clients2.google.com','www.google.com:443','accounts.google.com:443'].includes(f.authority)),'unexpected transport fault');
  assert.deepEqual(run.results.map(r=>r.mode),['normal','csp']);
  for(const r of run.results){
   assert.deepEqual(r.snapshots.map(s=>s.phase),['initial','insert-and-text','move-and-attribute']);
   for(const [i,s] of r.snapshots.entries()){
    const v=s.value;assert.equal(v.start,'ran');assert.equal(typeof v.startFlag,'boolean');assert.equal(v.currentFlag,true);
    const visible=i===0?['control','negative']:i===1?['control']:[];
    for(const id of ['static-ad','control','procedure','negative',...(i?['dynamic']:[])]){assert.equal(v.elements[id].connected,true);assert.equal(v.elements[id].display,visible.includes(id)?'block':'none',`${r.mode}/${s.phase}/${id}`);}
    if(i===0)assert.equal(v.elements.dynamic,null);
   }
   early.push({label:run.label,mode:r.mode,passed:r.snapshots[0].value.startFlag});
   assert.deepEqual(r.requests,{prevented:'',allowed:'allowed control'});assert.equal(r.preventedArrived,false);
  }
  assert(!run.arrivals.some(a=>a.url.endsWith('/prevented')));
  for(const suffix of ['/normal','/csp'])assert.equal(run.arrivals.filter(a=>a.url.endsWith(suffix)).length,1);
  assert.equal(run.arrivals.filter(a=>a.url.endsWith('/allowed')).length,2);
 }
 for(const r of runs.slice(1))assert.deepEqual(r.results,runs[0].results,'cosmetic/scriptlet parity mismatch');
 return {verified:true,runs:4,pages:8,boundedParityPassed:true,staticCss:true,hasTextMutations:true,lateConstant:true,lateFetchPrevention:true,documentStartPassed:early.every(r=>r.passed),documentStart:early,fullAcceptance:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const root=process.argv[2];const report=JSON.parse(fs.readFileSync(path.join(root,'report.json')));assert(report.completed);assert(report.cleanup.removed);console.log(JSON.stringify(verifyCosmetics(['electron-a','electron-b','chromium-a','chromium-b'].map(l=>JSON.parse(fs.readFileSync(path.join(root,l+'.json'))))),null,2));}
