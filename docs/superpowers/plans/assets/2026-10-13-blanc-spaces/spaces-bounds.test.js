'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateSpacesBounds, SPACES_MENU_PAD, SPACES_MENU_GAP, SPACES_MENU_WIDTH } = require('../../src/main/chrome-layout');

test('the Spaces menu opens under the mark with room for its shadow', () => {
  const b = calculateSpacesBounds({ windowWidth: 1440, windowHeight: 900, stripHeight: 68, anchorLeft: 520, anchorBottom: 50 });
  assert.deepEqual(b, { x: 520 - SPACES_MENU_PAD, y: 50 + SPACES_MENU_GAP - SPACES_MENU_PAD, width: SPACES_MENU_WIDTH + SPACES_MENU_PAD * 2, height: 640 });
});

test('the menu stays inside a narrow or short window', () => {
  const narrow = calculateSpacesBounds({ windowWidth: 640, windowHeight: 480, stripHeight: 68, anchorLeft: 600, anchorBottom: 50 });
  assert.equal(narrow.x + narrow.width <= 640, true);
  assert.equal(narrow.y + narrow.height <= 480, true);
  const tiny = calculateSpacesBounds({ windowWidth: 200, windowHeight: 100, stripHeight: 68, anchorLeft: 20, anchorBottom: 50 });
  assert.deepEqual([tiny.x, tiny.width], [0, 200]);
  assert.equal(tiny.height, 100 - tiny.y);
});

test('an anchor outside the strip or missing falls back to the strip, centred', () => {
  const below = calculateSpacesBounds({ windowWidth: 1000, windowHeight: 800, stripHeight: 68, anchorLeft: 100, anchorBottom: 500 });
  assert.equal(below.y, 68 + SPACES_MENU_GAP - SPACES_MENU_PAD, 'never below the strip');
  const none = calculateSpacesBounds({ windowWidth: 1000, windowHeight: 800, stripHeight: 68, anchorLeft: null, anchorBottom: null });
  assert.equal(none.x, Math.round((1000 - none.width) / 2));
  const junk = calculateSpacesBounds({ windowWidth: NaN, windowHeight: undefined, stripHeight: -5, anchorLeft: 'x', anchorBottom: {} });
  assert.deepEqual(junk, { x: 0, y: 0, width: 0, height: 0 });
});
