// The emulator check for the Sunrise menu (tests/android/island-menu.mjs) reads
// the menu's entries from a UI Automator dump in the order they're drawn.
import test from 'node:test';
import assert from 'node:assert/strict';
import {menuEntries, nodeBounds} from '../tests/android/island-menu.mjs';

const node = (text, top) => `<node text="${text}" resource-id="" bounds="[10,${top}][300,${top + 40}]" />`;

test('entries come back top to bottom', () => {
  const xml = node('New Private Tab', 300) + node('Save to Favorites', 100) + node('Share', 200);
  assert.deepEqual(menuEntries(xml), ['Save to Favorites', 'Share', 'New Private Tab']);
});

test('a menu that isn\'t open has no entries', () => {
  assert.deepEqual(menuEntries('<node text="Start Page" bounds="[0,0][1,1]" />'), []);
});

test('nodes are found by id or text', () => {
  const xml = '<node text="" resource-id="me.bnfy.blanc.dev:id/blanc_island_menu" bounds="[1,2][3,4]" />';
  assert.deepEqual(nodeBounds(xml, {id: 'blanc_island_menu'}), {left: 1, top: 2, right: 3, bottom: 4});
  assert.equal(nodeBounds(xml, {id: 'blanc_island_private'}), null);
});
