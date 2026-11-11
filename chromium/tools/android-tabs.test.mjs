// The emulator checks reach the tab grid by swiping from the Island into the page, and read the tab
// count from the grid's header: the closed Island has no tab count (the iPhone dropped it in #1372).
import assert from 'node:assert/strict';
import test from 'node:test';
import {gridSwipe} from '../tests/android/island-menu.mjs';
import {tabCount} from '../tests/android/tabs.mjs';

const screen = island => `<node bounds="[0,0][1080,2400]"><node resource-id="me.bnfy.blanc.dev:id/blanc_island_domain" bounds="${island}" /></node>`;

test('the grid opens with a swipe from the Island into the page', () => {
  // At the bottom the page is above the Island, so the swipe goes up; at the top, down.
  assert.deepEqual(gridSwipe(screen('[200,2200][800,2300]')), ['500', '2250', '500', '1650']);
  assert.deepEqual(gridSwipe(screen('[200,150][800,250]')), ['500', '200', '500', '800']);
  assert.equal(gridSwipe('<node bounds="[0,0][1080,2400]" />'), null);
});

test('the tab count is read beside Open tabs in the grid', () => {
  assert.equal(tabCount('<node text="Open tabs" /><node text="3" />'), 3);
  assert.equal(tabCount('<node text="Open tabs" /><node text="" /><node text="12" />'), 12);
  // The closed Island shows no count.
  assert.equal(tabCount('<node text="3" resource-id="me.bnfy.blanc.dev:id/blanc_island_tab_count" />'), null);
});
