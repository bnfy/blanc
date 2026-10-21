import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha } from './generate.mjs';
const top='https://page.blanc-fixture.test',child='https://child.blanc-control.test';
export const lateCases=['opaque-srcdoc','data','blob','sandbox-blob','nested-srcdoc','nested-data','nested-blob','child-origin-blob'];
export function verifyOpaqueLate(report, readPayload) {
 assert(report.completed && report.cleanup.removed); assert.equal(report.latencyMeasured,false);
 assert.equal(report.source.browserKind,'chromium'); assert.equal(report.source.kind,'regular'); assert.equal(report.source.isOffTheRecord,false);
 assert.deepEqual(report.checks.map(r=>[r.cycle,r.name]),[0,1].flatMap(c=>lateCases.map(n=>[c,n])));
 assert(report.faults.every(f=>['plaintext-refused','connect-refused'].includes(f.code)&&['clients2.google.com','www.google.com:443','accounts.google.com:443'].includes(f.authority)));
 const summary={verified:true,extensionRepeatPasses:0,permissionDeniedGaps:0,unresolvedBlobGaps:0,directMechanismPasses:0,fullAcceptance:false,latencyMeasured:false};
 const documentIds=new Set();
 for(const r of report.checks){
  const d=r.delivery,origin=r.name==='blob'?top:r.name==='child-origin-blob'?child:'null';
  const expectedSelection=r.name==='child-origin-blob'?child:top;
  assert.equal(d.selectedOrigin,expectedSelection);assert.equal(d.isolatedInjectorSentinelReset,true);
  for(const field of ['before','afterExtension','afterDirect']){
   const s=r[field];assert.equal(s.origin,origin);assert(s.flag&&s.first.flag&&s.first.getter);assert.equal(s.counts.bodies,1);assert(Number.isInteger(s.counts.attempts)&&s.counts.attempts>=1);
   assert.equal(s.first.topSelection,expectedSelection===top);assert.equal(s.first.childSelection,expectedSelection===child);
  }
  assert.equal(r.directDiagnosticDeliveries,2);assert.equal(r.afterDirect.counts.attempts,r.afterExtension.counts.attempts+2);summary.directMechanismPasses++;
  for(const [key,suffix] of [['mainWorldSha256','.main-world.js'],['assembledSha256','.assembled.js']]){
   assert.match(d[key],/^[a-f0-9]{64}$/);if(readPayload)assert.equal(sha(readPayload(d[key]+suffix)),d[key]);
  }
  if(d.target){
   assert.equal(d.identitySource,'webNavigation-exact-leaf');assert.equal(d.target.url,r.url);assert(d.target.frameId>0);assert.equal(typeof d.target.documentId,'string');
   assert(!documentIds.has(d.target.documentId),'new document must not reuse an identity');documentIds.add(d.target.documentId);
   const candidates=d.frames.filter(f=>f.url===r.url&&f.frameId!==0&&!d.frames.some(x=>x.parentFrameId===f.frameId));
   assert.equal(candidates.length,1);assert.deepEqual(candidates[0],d.target);assert.equal(d.attempts.length,2);
   if(['data','nested-data'].includes(r.name)){
    assert(r.url.startsWith('data:text/html'));assert.equal(d.probe.error,null);assert.equal(d.probe.results.length,1);
    assert.deepEqual(d.probe.results[0],{origin,ready:true,frameName:'authored fixture '+r.name});
    for(const attempt of d.attempts){assert.equal(attempt.error,null);assert.deepEqual(attempt.results,[0]);}
    assert(r.afterExtension.counts.attempts>=r.before.counts.attempts+2,'actual main-world arrival required');summary.extensionRepeatPasses++;
   }else{
    assert(['opaque-srcdoc','nested-srcdoc'].includes(r.name));assert.equal(r.url,'about:srcdoc');
    for(const attempt of [d.probe,...d.attempts]){assert.equal(attempt.results,null);assert.match(attempt.error,/Cannot access "about:srcdoc" at origin "null"/);}
    assert.equal(r.afterExtension.counts.attempts,r.before.counts.attempts);summary.permissionDeniedGaps++;
   }
  }else{
   assert(r.name.includes('blob'));assert(r.url.startsWith('blob:'));assert.equal(d.identitySource,'unresolved');assert.equal(d.probe,null);assert.deepEqual(d.attempts,[]);
   assert(d.discovery&&Array.isArray(d.discovery.messages));assert.equal(d.discovery.result.error,null);
   assert(!d.frames.some(f=>f.url===r.url));assert(!d.discovery.messages.some(x=>x.message.href===r.url||x.sender.url===r.url));
   assert.equal(r.afterExtension.counts.attempts,r.before.counts.attempts);summary.unresolvedBlobGaps++;
  }
 }
 return summary;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const root=process.argv[2];console.log(JSON.stringify(verifyOpaqueLate(JSON.parse(fs.readFileSync(path.join(root,'report.json'))),p=>fs.readFileSync(path.join(root,p))),null,2));
}
