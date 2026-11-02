import assert from 'node:assert/strict';import fs from 'node:fs';import {fileURLToPath} from 'node:url';
export function verifyDedup(report){
 assert(report.completed&&report.cleanup.removed);assert.equal(report.latencyMeasured,false);assert.equal(report.checks.length,6);
 assert.deepEqual(report.checks.map(x=>[x.repeat,x.mode]),[0,1].flatMap(r=>['srcdoc','blank','opaque-srcdoc'].map(m=>[r,m])));
 assert(report.faults.every(f=>['plaintext-refused','connect-refused'].includes(f.code)&&['clients2.google.com','www.google.com:443','accounts.google.com:443'].includes(f.authority)));
 for(const row of report.checks){
  assert(row.before.first.flag&&row.before.first.getter&&row.after.flag);assert.equal(row.before.counts.bodies,1);assert.equal(row.after.counts.bodies,1);
  assert.equal(row.delivery.deliberateLateDeliveries,2);assert.equal(row.delivery.isolatedInjectorSentinelReset,true);assert(Number.isInteger(row.delivery.frameId)&&row.delivery.frameId>0);
  assert.equal(row.delivery.url,row.mode==='blank'?'about:blank':'about:srcdoc');assert.equal(row.before.origin,row.mode==='opaque-srcdoc'?'null':'https://page.blanc-fixture.test');assert.equal(row.after.origin,row.before.origin);
  if(row.mode==='opaque-srcdoc'){assert.equal(row.passed,false);assert.equal(row.scope,'early-pass-late-delivery-unproven');}
  else{assert(row.passed);assert.equal(row.scope,'inherited-repeat-delivery-pass');assert(row.before.counts.attempts>=1);assert(row.after.counts.attempts>=row.before.counts.attempts+2);}
 }
 return {verified:true,inheritedRepeatPasses:4,opaqueEarlyOnly:2,opaqueRepeatDeliveryGaps:2,fullAcceptance:false,latencyMeasured:false};
}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(verifyDedup(JSON.parse(fs.readFileSync(process.argv[2]))),null,2));
