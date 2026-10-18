import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {correlateWorker} from './worker-context.mjs';
const root=process.argv[2],report=JSON.parse(fs.readFileSync(path.join(root,'report.json')));assert(report.behaviorPassed);assert.equal(report.runs.length,8);
const paired=new Map(),proofs=[],updateGaps=[];
for(const summary of report.runs){
 const run=JSON.parse(fs.readFileSync(path.join(root,summary.label+'.json'))),electron=run.source.browserKind==='electron';
 if(report.updateMode==='same-url-registration-update'){
  assert.equal(run.workerEvidence.faults.length,0);
  const responses=run.arrivals.filter(row=>row.url.endsWith('/worker.js'));
  assert.equal(responses.length,2);assert.notEqual(responses[0].sha256,responses[1].sha256);assert.equal(run.outcome.after,'v2');
  for(const e of run.workerEvidence.events.filter(e=>e.method==='Observer.detachedDuringSetup'))assert(run.workerEvidence.events.some(d=>d.method==='Target.detachedFromTarget'&&d.params.sessionId===e.params.sessionId&&d.params.targetId===e.params.targetId));
  const scripts=run.records.filter(row=>row.url.endsWith('/worker.js'));assert.equal(scripts.length,2);
  const update=correlateWorker({...run,browserKind:run.source.browserKind,kind:run.source.kind},scripts[1]);assert.equal(update.status,'gap');
  updateGaps.push({label:summary.label,hookOccurrence:2,devtoolsRequestId:scripts[1].devtools_request_id??'not-exposed-by-electron',reason:update.reason});
 }
 for(const [suffix,decision] of [['/network','allow'],['/blocked','block'],['/missing.js','allow']]){
  const rows=run.records.filter(row=>row.url.endsWith(suffix));assert.equal(rows.length,1,summary.label+suffix);const row=rows[0];
  assert.equal(electron?row.status.phase:row.status,'ready');assert.equal(electron?(row.result.cancel?'block':'allow'):row.decision,decision);assert.equal(electron?row.profileKind:row.profile_kind,run.source.kind);
  assert.equal(electron?row.initiatorOrigin:row.initiator_origin,'https://page.blanc-fixture.test');assert.equal(electron?row.initiatorOriginPresent:row.initiator_present,true);
  const correlation=correlateWorker({...run,browserKind:run.source.browserKind,kind:run.source.kind},row);assert.equal(correlation.status,'resolved',summary.label+suffix+JSON.stringify(correlation));
  const key=summary.label.replace(/^(electron|chromium)-/,'')+suffix,actual={context:correlation.context,url:row.url,method:row.method,referrer:row.referrer,type:electron?row.resourceType:row.resource_type,initiator:electron?row.initiatorOrigin:row.initiator_origin,decision};
  if(paired.has(key))assert.deepEqual(actual,paired.get(key));else paired.set(key,actual);
  proofs.push({label:summary.label,url:row.url,...correlation});
 }
 assert(!run.arrivals.some(row=>row.url.endsWith('/cached')||row.url.endsWith('/blocked')));
}
if(process.argv[3])fs.writeFileSync(process.argv[3],JSON.stringify({passed:true,scope:'single controlled client fetch and exact-token HTTP-failed initial loader',proofs,updateGaps,remainingGaps:['startup failures without token-linked HTTP response','update script correlation','multiple clients and in-flight ownership','cache-only context']},null,2));
console.log('8 behavior runs, 16 controlled fetch contexts and 8 HTTP-failed loader identities verified; update-script context remains open');
