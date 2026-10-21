import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
export const modes=['srcdoc','data','blob'],phases=['before-context','after-context','after-engine','after-confirm','after-dispatch'];
export function verifyRace(r,{baseline=false,actualReload=true}={}){
 assert(r.completed&&r.cleanup.removed&&r.diagnosticScheduling);assert.equal(r.latencyMeasured,false);assert.equal(r.source.browserKind,'chromium');assert.equal(r.source.isOffTheRecord,false);
 const reloads=actualReload?['held','completed','filter-reload']:['held','completed'];
 assert.deepEqual(r.checks.map(x=>[x.mode,x.phase,x.reload]),modes.flatMap(m=>phases.flatMap(p=>reloads.map(l=>[m,p,l]))));
 let dropped=0,stale=0;
 for(const x of r.checks){
  assert(x.before.first.flag&&x.after.flag);assert.equal(x.before.counts.bodies,1);assert.equal(x.after.counts.bodies,1);
  const expectedStale=x.phase==='after-dispatch'||baseline&&x.phase==='after-confirm';
  assert.equal(x.after.counts.attempts-x.before.counts.attempts,Number(expectedStale));assert.equal(x.rows.length,1);assert.equal(x.rows[0].replied,expectedStale);
  assert(x.state.before.ready);assert(x.state.after.generation>x.state.before.generation);assert.equal(x.state.after.ready,x.reload!=='held');
  assert.equal(x.events.length,1);const event=x.events[0];assert.equal(event.stage,x.phase);assert.equal(event.before.generation,x.state.before.generation);assert.equal(event.after.generation,x.state.after.generation);
  if(r.deliveryBarrier&&x.phase==='after-dispatch'){assert.equal(x.state.heldBeforeReceiver.settled,false);assert.equal(x.state.heldBeforeReceiver.state.ready,false);assert.equal(x.state.heldBeforeReceiver.state.generation,x.state.after.generation);}
  const sender=x.rows[0].sender;assert.equal(sender.id,'oddhmofgkplblkmckempfepikkophank');assert.equal(sender.url,x.before.url);assert.equal(sender.origin,x.before.origin);assert.equal(x.after.origin,x.before.origin);
  assert.equal(event.metadata.generation,x.state.before.generation);assert.equal((event.metadata.identity??event.metadata).documentId,sender.documentId);
  expectedStale?stale++:dropped++;
 }
 if(r.deliveryBarrier){
  assert(r.receiverLost.before.ready);assert(r.receiverLost.state.generation>r.receiverLost.before.generation);
  const control=r.records.filter(x=>x.event==='ubo-control'&&x.accepted);
  if(r.lostReceiverRecovery){
   assert.equal(r.receiverLost.error,null);assert(r.receiverLost.state.ready);assert.equal(control.at(-1).action,'/ready');
   assert(r.records.some(x=>x.event==='ubo-delivery-document'&&x.documentId===r.receiverLost.documentId&&x.exists===false));
   const c=r.lifetimeControls;assert(c.popupRejected);assert.equal(c.live.status,200);assert.equal(c.live.body.documentId,c.documentId);assert.equal(c.live.body.exists,true);for(const name of ['malformed','stale','malformedEpoch'])assert.equal(c[name].status,403);
   const live=r.liveReceiver;assert(live.before.ready&&live.samePromise&&live.networkBlocked);assert.equal(live.held.ready,false);assert(live.held.generation>live.before.generation);
   assert.match(live.duplicateBegin,/already pending/);assert.match(live.earlyComplete,/Superseded/);assert.equal(live.settled.length,2);for(const result of live.settled){assert.equal(result.status,'rejected');assert.match(result.error,/remains held/);}
   assert(live.afterRetry.ready);assert(live.afterRetry.generation>live.held.generation);
   assert.match(live.staleCompletion.error,/Superseded/);assert.equal(live.staleCompletion.held.ready,false);assert(live.staleCompletion.after.ready);
   assert(r.records.some(x=>x.event==='ubo-delivery-document'&&x.documentId===live.documentId&&x.exists===true));
   assert(!r.records.some(x=>x.event==='ubo-delivery-document'&&x.documentId===live.documentId&&x.exists===false));
  }else{assert.equal(r.receiverLost.state.ready,false);assert.match(r.receiverLost.error,/reload remains held/);assert.equal(control.at(-1).action,'/begin');}
 }

 assert(r.faults.every(f=>['plaintext-refused','connect-refused'].includes(f.code)&&['clients2.google.com','www.google.com:443','accounts.google.com:443'].includes(f.authority)));
 return {verified:true,diagnosticSchedules:r.checks.length,droppedBeforeDelivery:dropped,staleDeliveryAttempts:r.deliveryBarrier?0:stale,committedDeliveriesDrained:r.deliveryBarrier?stale:0,duplicateBodies:0,actualFilterReloadCases:actualReload?15:0,fullAcceptance:false,staticDeliveryResetOrdering:r.deliveryBarrier===true,lostReceiverHeld:r.deliveryBarrier===true&&!r.lostReceiverRecovery,destroyedReceiverRecovered:r.lostReceiverRecovery===true,liveReceiverTimeoutAndRetry:r.lostReceiverRecovery===true,overlapAndStaleCompletionRefused:r.lostReceiverRecovery===true,afterDispatchAtomicity:false,latencyMeasured:false};
}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(verifyRace(JSON.parse(fs.readFileSync(path.join(process.argv[2],'report.json'))),{baseline:process.argv.includes('--baseline'),actualReload:!process.argv.includes('--guard-only')}),null,2));
