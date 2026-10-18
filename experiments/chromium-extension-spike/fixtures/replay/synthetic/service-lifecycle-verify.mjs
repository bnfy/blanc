import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
const root=process.argv[2],report=JSON.parse(fs.readFileSync(path.join(root,'report.json')));assert(report.behaviorPassed);assert.equal(report.runs.length,8);
for(const summary of report.runs){
 const run=JSON.parse(fs.readFileSync(path.join(root,summary.label+'.json'))),electron=run.source.browserKind==='electron';
 if(report.updateMode==='same-url-registration-update'){
  assert.equal(run.workerEvidence.faults.length,0);
  const responses=run.arrivals.filter(row=>row.url.endsWith('/worker.js'));
  assert.equal(responses.length,2);assert.notEqual(responses[0].sha256,responses[1].sha256);assert.equal(run.outcome.after,'v2');
  for(const e of run.workerEvidence.events.filter(e=>e.method==='Observer.detachedDuringSetup'))assert(run.workerEvidence.events.some(d=>d.method==='Target.detachedFromTarget'&&d.params.sessionId===e.params.sessionId&&d.params.targetId===e.params.targetId));
 }
 for(const [suffix,decision] of [['/network','allow'],['/blocked','block']]){
  const rows=run.records.filter(row=>row.url.endsWith(suffix));assert.equal(rows.length,1,summary.label+suffix);const row=rows[0];
  assert.equal(electron?row.status.phase:row.status,'ready');assert.equal(electron?(row.result.cancel?'block':'allow'):row.decision,decision);assert.equal(electron?row.profileKind:row.profile_kind,run.source.kind);
  assert.equal(electron?row.initiatorOrigin:row.initiator_origin,'https://page.blanc-fixture.test');assert.equal(electron?row.initiatorOriginPresent:row.initiator_present,true);
 }
 assert(!run.arrivals.some(row=>row.url.endsWith('/cached')||row.url.endsWith('/blocked')));
}
console.log('8 behavior runs verified against actual ready-provider network decisions; strict worker-context acceptance remains open');
