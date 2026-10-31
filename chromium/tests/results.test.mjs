import test from 'node:test';
import assert from 'node:assert/strict';
import {aggregateCases} from './results.mjs';
test('an outline passes only after every example passes',()=>{
 assert.equal(aggregateCases([{result:'pass'},{result:'pass'}]),'pass');
 assert.equal(aggregateCases([{result:'pass'},{result:'undefined'}]),'undefined');
 assert.equal(aggregateCases([{result:'pass'},{result:'fail'}]),'fail');
});
test('an adapter gap cannot become an exclusion or a passing declaration',()=>{
 assert.equal(aggregateCases([{result:'undefined'}]),'undefined');
 assert.throws(()=>aggregateCases([{result:'excluded'}]),/reason/);
 assert.equal(aggregateCases([{result:'excluded',exclusionReason:'mobile only'}]),'excluded');
});
test('empty and unknown outcomes cannot create vacuous passes',()=>{
 assert.throws(()=>aggregateCases([]),/no executable cases/);
 assert.throws(()=>aggregateCases([{result:'unknown'}]),/Unknown/);
});
