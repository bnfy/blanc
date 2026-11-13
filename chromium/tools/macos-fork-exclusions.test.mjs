import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {macosForkExclusions} from '../tests/macos-fork-exclusions.mjs';

test('construction exclusions never remove a previously executed pass or product failure',()=>{
 const baseline=JSON.parse(fs.readFileSync(new URL('../scenarios/baseline-macos-9987cc7166c3c921.json',import.meta.url)));
 const cases=new Map(baseline.scenarios.flatMap(s=>s.cases).map(c=>[c.id,c]));
 const notes=fs.readFileSync(new URL('../CODEX-NOTES-gaps5.md',import.meta.url),'utf8');
 assert.equal(Object.keys(macosForkExclusions).length,22);
 for(const [id,reason] of Object.entries(macosForkExclusions)){
  assert.equal(cases.get(id)?.result,'undefined',id);
  assert.ok(reason.length>30,id);
  assert.ok(notes.includes('`'+id.replace('spec/acceptance/','')+'` | c |'),id);
 }
});
