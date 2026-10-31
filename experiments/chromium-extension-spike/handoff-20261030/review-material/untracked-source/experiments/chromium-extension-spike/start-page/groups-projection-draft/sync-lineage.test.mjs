import assert from 'node:assert/strict';
import {syncLineage} from './sync-lineage.mjs';
const seen=[];const fake={openSync:(p)=>{seen.push(p);return p},fsyncSync:()=>{},closeSync:()=>{}};
syncLineage(fake,'/workspace/preview/evidence/groups','/workspace/preview');
assert.deepEqual(seen,['/workspace/preview/evidence/groups','/workspace/preview/evidence','/workspace/preview','/workspace']);
assert.throws(()=>syncLineage(fake,'/workspace/other','/workspace/preview'));
console.log('PASS evidence lineage flush and outside-root refusal');
