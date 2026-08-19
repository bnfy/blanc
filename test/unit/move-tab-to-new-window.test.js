'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { pickSurvivorTabId } = require('../../src/main/tab-context-menu-model');

test('survivor is the next tab, or the previous when moving the last', () => {
  assert.equal(pickSurvivorTabId([1, 2, 3], 2), 3);
  assert.equal(pickSurvivorTabId([1, 2, 3], 3), 2);
  assert.equal(pickSurvivorTabId([1, 2, 3], 1), 2);
  assert.equal(pickSurvivorTabId([5], 5), null); // sole tab — caller must guard
});
