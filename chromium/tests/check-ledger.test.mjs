import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {checkLedger} from './lib/check-ledger.mjs';

test('passed records a check and takes its id off pending', () => {
  const result = {candidate: 'c', checks: []};
  const passed = checkLedger(result, ['F41-83', 'double open', 'F41-92']);
  assert.deepEqual(result.pending, ['F41-83', 'double open', 'F41-92']);
  passed('double open: both answer ok');
  assert.deepEqual(result.checks, ['double open: both answer ok']);
  assert.deepEqual(result.pending, ['F41-83', 'F41-92']);
  passed('F41-83: no heading');
  assert.deepEqual(result.pending, ['F41-92']);
  assert.throws(() => passed('nothing: unknown'), /unknown check/);
});

test('the Spaces across profiles check uses the ledger and lists every check it passes', () => {
  const source = fs.readFileSync(new URL('./native-spaces-across-profiles.mjs', import.meta.url), 'utf8');
  assert.match(source, /import \{checkLedger\} from '\.\/lib\/check-ledger\.mjs';/);
  assert.ok(!/function passed\(/.test(source), 'no local passed() of its own');
  const ids = JSON.parse(source.match(/const CHECKS=(\[[^\]]*\]);/)[1].replace(/'/g, '"'));
  const used = [...source.matchAll(/passed\('([^':]+):/g)].map(m => m[1]);
  assert.deepEqual(used, ids, 'one passed() per check, in run order');
});
