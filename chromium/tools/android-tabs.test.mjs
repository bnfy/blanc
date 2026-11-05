// The emulator tab check (tests/android/tabs.mjs) reads the Island's count.
import test from 'node:test';
import assert from 'node:assert/strict';
import {tabCount} from '../tests/android/tabs.mjs';

test('the Island\'s count is read in either attribute order', () => {
  assert.equal(tabCount('<node text="3" resource-id="me.bnfy.blanc.dev:id/blanc_island_tab_count" />'), 3);
  assert.equal(tabCount('<node resource-id="me.bnfy.blanc.dev:id/blanc_island_tab_count" text="12" />'), 12);
  assert.equal(tabCount('<node text="3" resource-id="x:id/other" />'), null);
});
