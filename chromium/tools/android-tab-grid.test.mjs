// The grid's emulator check (tests/android/tab-grid.mjs) counts cards by their label.
import test from 'node:test';
import assert from 'node:assert/strict';
import {cardLabels} from '../tests/android/tab-grid.mjs';

test('cards are found by their "Switch to" label', () => {
  const xml = '<node content-desc="Switch to New Tab" /><node content-desc="Close New Tab" /><node content-desc="Switch to About us" />';
  assert.deepEqual(cardLabels(xml), ['Switch to New Tab', 'Switch to About us']);
  assert.deepEqual(cardLabels('<node content-desc="Open tabs" />'), []);
});
