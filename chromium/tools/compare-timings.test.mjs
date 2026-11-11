import test from 'node:test';
import assert from 'node:assert/strict';
import {compareTimings} from '../tests/compare-timings.mjs';
const sample=()=>({candidate:'native-a',timingHarnessSha256:'hash',totals:{totalMs:100,phases:{steps:{exclusiveMs:70}},retries:{count:0},timeouts:{count:0}},
 attempts:Array.from({length:60},(_,i)=>({id:`spec/${Math.floor(i/10)}.feature:${i}:plain`,result:'pass'}))});
test('timing comparisons reject faster runs that changed their sample or native candidate',()=>{
 const a=sample(),b=sample();b.attempts.pop();assert.throws(()=>compareTimings(a,b),/sample changed/);
 b.attempts=a.attempts;b.candidate='native-b';assert.throws(()=>compareTimings(a,b),/same native candidate/);
});
test('timing improvements retain failed-case and lost-pass evidence',()=>{
 const a=sample(),b=sample();b.totals.totalMs=50;b.attempts[0].result='fail';
 const result=compareTimings(a,b);assert.equal(result.afterMs,50);assert.deepEqual(result.lostPasses,[a.attempts[0].id]);
});
