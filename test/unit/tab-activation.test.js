'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  recordActivation,
  previousSurvivor,
  previousActiveSurvivor,
} = require('../../src/main/tab-activation');

test('recordActivation appends, keeping one occurrence per id', () => {
  let h = [];
  h = recordActivation(h, 'a');
  h = recordActivation(h, 'b');
  h = recordActivation(h, 'c');
  assert.deepEqual(h, ['a', 'b', 'c']);
  // Re-activating moves the id to the end instead of duplicating it.
  h = recordActivation(h, 'a');
  assert.deepEqual(h, ['b', 'c', 'a']);
});

test('recordActivation ignores empty ids and never mutates its input', () => {
  const h = ['a'];
  assert.deepEqual(recordActivation(h, null), ['a']);
  assert.deepEqual(recordActivation(h, undefined), ['a']);
  const next = recordActivation(h, 'b');
  assert.deepEqual(h, ['a'], 'input must not be mutated');
  assert.deepEqual(next, ['a', 'b']);
});

test('previousSurvivor walks back to the most recent surviving id', () => {
  const alive = new Set(['a', 'b']);
  assert.equal(previousSurvivor(['a', 'b', 'c'], (id) => alive.has(id)), 'b');
});

test('previousSurvivor skips dead ids and returns null when exhausted', () => {
  assert.equal(previousSurvivor(['x', 'y'], () => false), null);
  assert.equal(previousSurvivor([], () => true), null);
  assert.equal(previousSurvivor(undefined, () => true), null);
});

test('previousActiveSurvivor skips the current tab', () => {
  assert.equal(
    previousActiveSurvivor(['a', 'b', 'c'], 'c', () => true),
    'b'
  );
});

test('recording a last-tab switch makes the shortcut alternate back', () => {
  let history = ['a', 'b', 'c'];
  const firstTarget = previousActiveSurvivor(history, 'c', () => true);
  assert.equal(firstTarget, 'b');

  history = recordActivation(history, firstTarget);
  assert.deepEqual(history, ['a', 'c', 'b']);
  assert.equal(previousActiveSurvivor(history, 'b', () => true), 'c');
});

test('previousActiveSurvivor skips closed tabs and exhausts safely', () => {
  const alive = new Set(['a', 'c']);
  assert.equal(
    previousActiveSurvivor(['a', 'b', 'c'], 'c', (id) => alive.has(id)),
    'a'
  );
  assert.equal(previousActiveSurvivor(['c'], 'c', () => true), null);
});

// Closing A (active) then B keeps walking history: A → B → C.
test('successive closes chain through history', () => {
  let history = ['c', 'b', 'a'];
  const alive = new Set(['a', 'b', 'c']);

  alive.delete('a');
  history = history.filter((id) => alive.has(id));
  assert.equal(previousSurvivor(history, (id) => alive.has(id)), 'b');

  alive.delete('b');
  history = history.filter((id) => alive.has(id));
  assert.equal(previousSurvivor(history, (id) => alive.has(id)), 'c');
});
