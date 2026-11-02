// Recompute the corpus result from archived raw observations, not report flags.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
const root=process.argv[2],report=JSON.parse(fs.readFileSync(path.join(root,'report.json')));assert(report.completed);assert.equal(report.runs.length,4);
const runs=[],metadata=[];
for(const label of ['electron-a','electron-b','chromium-a','chromium-b']){
 const run=JSON.parse(fs.readFileSync(path.join(root,label+'.json'))),electron=label.startsWith('electron');assert(run.metadata.ready);assert.equal(run.metadata.autoUpdate,false);metadata.push(run.metadata);
 const rows=[];
 for(const page of run.pages){
  assert(page.faults.every(f=>['plaintext-refused','connect-refused'].includes(f.code)&&['clients2.google.com','www.google.com:443','accounts.google.com:443'].includes(f.authority)),'unexpected transport fault');assert(!page.rows.some(r=>r.fault),'provider observer fault');
  for(const item of page.normalized){
   const matches=page.rows.filter(r=>(r.input?.url||r.url)===item.url);assert.equal(matches.length,1);const r=matches[0],decision=r.result.cancel?'block':r.result.redirectUrl||r.result.redirectURL?'redirect':'allow';
   assert.equal(item.decision,decision);assert.equal(item.arrived,page.arrivals.some(a=>a.url===item.url));assert.equal(item.event,page.dom.loads.find(l=>l.id===item.id)?.event);
   assert.equal(item.executed,page.dom.executed.includes(item.id));assert.equal(item.child,page.dom.children.includes(item.id));
   if(decision==='block')assert.equal(item.arrived,false);if(decision==='allow')assert(item.arrived,'allowed original never arrived');
   if(electron){assert.equal(r.provider,'ublock-origin');assert.equal(r.status.phase,'ready');assert.equal(item.context.initiator,r.initiatorOrigin);assert.equal(item.context.top,r.frame.topOrigin);}
   else{assert.equal(item.context.initiator,r.input.initiator);assert.equal(r.input.frameId,0);assert.equal(r.input.parentFrameId,-1);const nav=page.rows.find(n=>n.input?.type==='main_frame');assert.equal(r.input.tabId,nav.input.tabId);assert.equal(item.context.top,new URL(nav.input.url).origin);assert.equal(item.context.method,r.input.method);assert.equal(item.context.type,r.input.type==='xmlhttprequest'?'xhr':r.input.type);}
   rows.push(item);
  }
 }
 assert.equal(rows.length,report.candidateCount);assert.equal(new Set(rows.map(r=>r.url)).size,report.candidateCount);runs.push(rows);
}
for(const m of metadata){assert.deepEqual(m.selected,metadata[0].selected);for(const k of m.selected)assert.equal(m.lists[k].entryCount,metadata[0].lists[k].entryCount);assert.equal(m.selected.reduce((n,k)=>n+m.lists[k].entryUsedCount,0),metadata[0].selected.reduce((n,k)=>n+metadata[0].lists[k].entryUsedCount,0));}
assert.deepEqual(runs[0],runs[1],'Electron instability');assert.deepEqual(runs[2],runs[3],'Chromium instability');
const differences=runs[0].flatMap((a,i)=>JSON.stringify(a)===JSON.stringify(runs[2][i])?[]:[{electron:a,chromium:runs[2][i]}]);assert.deepEqual(differences,report.differences);assert.equal(report.parityPassed,differences.length===0);
console.log(JSON.stringify({verified:true,requestsPerRun:report.candidateCount,differences:differences.length,parityPassed:report.parityPassed,scope:report.scope}));
