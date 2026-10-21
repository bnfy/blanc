import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
export function verifyHelperDelivery(r){
 assert(r.completed&&!r.error&&r.cleanup.removed&&r.diagnosticScheduling&&!r.latencyMeasured);
 assert.deepEqual(r.checks.map(x=>[x.target,x.mode]),[['procedural','drain'],['procedural','timeout']]);
 for(const x of r.checks){
  assert(x.before.state.ready&&!x.held.state.ready&&x.after.state.ready);
  assert(x.held.state.generation>x.before.state.generation);
  assert.equal(x.before.events.length,1);
  const e=x.before.events[0];assert.equal(e.path,'procedural');assert.equal(e.file,'/js/contentscript-extra.js');assert(e.resultLength>0);
  assert.equal(x.before.upstream,1);assert.equal(x.held.upstream,1);assert.equal(x.after.upstream,0);assert.equal(x.after.native.pending,0);
  assert.equal(x.held.result.settled,x.mode==='timeout');if(x.mode==='timeout')assert.match(x.held.result.error,/remains held/);
  assert.equal(x.pauseBoundary,'after-upstream-API-settlement-before-lease-release');
  assert(x.page.first&&x.page.flag);assert.equal(x.page.procedure,'none');assert.equal(x.page.counts.bodies,1);
 }
 assert(r.faults.every(f=>['plaintext-refused','connect-refused'].includes(f.code)&&['clients2.google.com','www.google.com:443','accounts.google.com:443'].includes(f.authority)));
 return {verified:true,proceduralCompletionSchedules:2,timeoutAndRetry:true,awaitedCosmeticOutcome:true,otherHelperRuntimeCoverage:false,exactDocumentIdentity:false,asyncEffectsCovered:false,fullAcceptance:false,latencyMeasured:false};
}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(verifyHelperDelivery(JSON.parse(fs.readFileSync(path.join(process.argv[2],'report.json')))),null,2));
