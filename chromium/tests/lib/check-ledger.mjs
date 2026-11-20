// A native check whose steps build on each other: `pending` starts as every
// check id in run order and loses each one as it passes, so a failure part
// way leaves in result.json the checks that never ran. A check's text starts
// with its id and a colon.
import assert from 'node:assert/strict';
export function checkLedger(result,ids){
 result.checks??=[];result.pending=[...ids];
 return function passed(text){
  const id=ids.find(c=>text.startsWith(c+':'));assert.ok(id,'unknown check '+text);
  result.checks.push(text);result.pending=result.pending.filter(p=>p!==id);
 };
}
