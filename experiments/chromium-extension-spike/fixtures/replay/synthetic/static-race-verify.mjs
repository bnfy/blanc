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
 if(r.deliveryBarrier){assert(r.receiverLost.before.ready);assert.equal(r.receiverLost.state.ready,false);assert(r.receiverLost.state.generation>r.receiverLost.before.generation);assert.match(r.receiverLost.error,/reload remains held/);const control=r.records.filter(x=>x.event==='ubo-control'&&x.accepted);assert.equal(control.at(-1).action,'/begin');}
 assert(r.faults.every(f=>['plaintext-refused','connect-refused'].includes(f.code)&&['clients2.google.com','www.google.com:443','accounts.google.com:443'].includes(f.authority)));
 return {verified:true,diagnosticSchedules:r.checks.length,droppedBeforeDelivery:dropped,staleDeliveryAttempts:r.deliveryBarrier?0:stale,committedDeliveriesDrained:r.deliveryBarrier?stale:0,duplicateBodies:0,actualFilterReloadCases:actualReload?15:0,fullAcceptance:false,staticDeliveryResetOrdering:r.deliveryBarrier===true,lostReceiverHeld:r.deliveryBarrier===true,afterDispatchAtomicity:false,latencyMeasured:false};
}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(verifyRace(JSON.parse(fs.readFileSync(path.join(process.argv[2],'report.json'))),{baseline:process.argv.includes('--baseline'),actualReload:!process.argv.includes('--guard-only')}),null,2));
