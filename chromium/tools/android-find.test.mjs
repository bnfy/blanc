// The find check (tests/android/find.mjs) reads the bar's "active/total" count.
import test from 'node:test';
import assert from 'node:assert/strict';
import {findCount} from '../tests/android/find.mjs';

test('the count is read as numbers, and none when the bar shows nothing', () => {
  assert.deepEqual(findCount('<node text="2/17" />'), [2, 17]);
  assert.equal(findCount('<node text="" />'), null);
  assert.equal(findCount('<node text="Domains" />'), null);
});
