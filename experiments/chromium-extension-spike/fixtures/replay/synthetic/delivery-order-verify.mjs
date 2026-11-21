import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';
export function verifyDeliveryOrder(r){
 assert(r.completed&&!r.error&&r.cleanup.removed&&r.diagnosticScheduling&&!r.latencyMeasured);
 assert.deepEqual(r.checks.map(x=>[x.target,x.mode]),[['native','drain'],['native','timeout'],['upstream','drain'],['upstream','timeout']]);
 for(const x of r.checks){
  assert(x.before.state.ready);assert(!x.held.state.ready);assert(x.held.state.generation>x.before.state.generation);
  assert.equal(x.held.result.settled,x.mode==='timeout');if(x.mode==='timeout')assert.match(x.held.result.error,/remains held/);
  if(x.target==='native'){
   assert.equal(x.pauseBoundary,'inside-native-ExecuteScript');assert.equal(x.before.native.pending,1);assert.equal(x.held.native.pending,1);assert.equal(x.held.premature,'refused');
   assert.equal(x.before.upstream,1);assert.equal(x.held.upstream,1);
  }else{
   assert.equal(x.pauseBoundary,'after-upstream-API-settlement-before-lease-release');assert.equal(x.before.native.pending,0);assert.equal(x.before.upstream,1);assert.equal(x.held.upstream,1);assert.equal(x.held.premature,'not-attempted');
   assert(x.before.events[0].resultLength>0,'exact loaded-tab API completion must have a result');
  }
  assert.equal(x.before.events.length,1);assert.equal(x.before.events[0].path,x.target);
  assert(x.after.state.ready);assert.equal(x.after.native.pending,0);assert.equal(x.after.upstream,0);
  assert(x.page.first&&x.page.flag);assert.equal(x.page.counts.bodies,1);
 }
 assert(r.records.some(x=>x.event==='ubo-early-deliveries'&&x.pending===1));
 assert(r.faults.every(f=>['plaintext-refused','connect-refused'].includes(f.code)&&['clients2.google.com','www.google.com:443','accounts.google.com:443'].includes(f.authority)));
 return {verified:true,nativeExecutionSchedules:2,upstreamAcknowledgementSchedules:2,combinedPendingObserved:true,timeoutAndRetry:true,duplicateBodies:0,upstreamDocumentIdentity:false,asyncEffectsCovered:false,fullAcceptance:false,latencyMeasured:false};
}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(verifyDeliveryOrder(JSON.parse(fs.readFileSync(path.join(process.argv[2],'report.json')))),null,2));
