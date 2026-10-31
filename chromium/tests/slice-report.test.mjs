import test from 'node:test';
import assert from 'node:assert/strict';
import {sliceReport} from './slice-report.mjs';
test('slice report counts only slice rows and keeps each failure reason',()=>{
 const {report,junit}=sliceReport({platform:'macos',candidate:'c',shippingCommit:'s',forkCommit:'f',scenarios:[
  {featureRows:['F1'],cases:[{id:'a',result:'pass'},{id:'b',result:'fail',error:'no control\nstack'}]},
  {featureRows:['F41'],cases:[{id:'c',result:'fail',error:'later slice'}]},
  {featureRows:['F2'],cases:[{id:'d',result:'undefined',missingSteps:[{reason:'native hook adapter missing',hooks:['x']}]}]}]},'S1');
 assert.deepEqual(report.summary,{pass:1,fail:1,undefined:1,excluded:0});
 assert.equal(report.rows.F1.cases[1].reason,'no control');
 assert.equal(report.rows.F2.cases[0].reason,'native hook adapter missing: x');
 assert.match(junit,/tests="3" failures="1" skipped="1"/);
});
