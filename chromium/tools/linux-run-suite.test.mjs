import assert from 'node:assert/strict';
import test from 'node:test';
import { suiteArguments } from '../linux/run-suite.mjs';

test('a Linux suite run requires the f0 slice and accepts one nonempty filter', () => {
  assert.deepEqual(suiteArguments(['--slice=f0']), []);
  assert.deepEqual(suiteArguments(['--slice=f0', '--only=tab-groups']), ['--only=tab-groups']);
  for (const bad of [
    [], ['--slice=s1'], ['--slice=f0', '--only='], ['--slice=f0', '--only=a', '--only=b'],
    ['--slice=f0', '--case-list=x'], ['--only=a'], ['--slice=f0', '--slice=f0'],
  ]) assert.throws(() => suiteArguments(bad), undefined, bad.join(' '));
});
