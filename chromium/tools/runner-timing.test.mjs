import test from 'node:test';
import assert from 'node:assert/strict';
import {measuredAttempt,phase,timedOut,timingSummary} from '../tests/lib/timing.mjs';
test('failed and retried attempts retain nested phase costs and timeout evidence',async()=>{
 const attempts=[];
 for(let attempt=1;attempt<=2;attempt++){
  const row={id:'case',attempt,totalMs:10,phases:{},timeouts:[]};
  await assert.rejects(measuredAttempt(row,()=>phase('steps',async()=>{
   await phase('blockerReadiness',async()=>{timedOut('poll','blocker',5);throw Error('timeout');});
  })),/timeout/);
  attempts.push(row);
 }
 const summary=timingSummary(attempts);
 assert.equal(summary.totals.retries.count,1);
 assert.equal(summary.totals.timeouts.count,2);
 assert.equal(summary.totals.phases.steps.count,2);
 assert.ok(summary.totals.phases.steps.exclusiveMs<=summary.totals.phases.steps.totalMs);
 assert.equal(summary.slowestCases[0].attempts,2);
 const isolated={id:'other',attempt:1,totalMs:1,phases:{},timeouts:[]};
 await measuredAttempt(isolated,async()=>{});
 timedOut('poll','outside an attempt',7);
 assert.equal(isolated.timeouts.length,0);
});
test('a frozen shipping timeout is annotated once without changing the error',async()=>{
 const row={phases:{},timeouts:[]},error=Error('timed out waiting for the sent page');
 await assert.rejects(measuredAttempt(row,()=>phase('steps',()=>phase('shipping poll',()=>{throw error;}))),e=>e===error);
 assert.equal(row.timeouts.length,1);
 assert.equal(row.timeouts[0].kind,'phase-timeout');
 assert.equal(row.timeouts[0].phase,'shipping poll');
 assert.match(row.timeouts[0].durationScope,/upper bound/);
});
