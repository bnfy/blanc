'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { calculateSpacesBounds, SPACES_MENU_PAD, SPACES_MENU_SIDE, SPACES_MENU_GAP, SPACES_MENU_WIDTH } = require('../../src/main/chrome-layout');

// Where the menu itself sits inside the view (styles.css places it there).
const menuLeft = (b) => b.x + SPACES_MENU_SIDE;

test('the Spaces menu opens under the mark with room for its shadow', () => {
  const b = calculateSpacesBounds({ windowWidth: 1440, windowHeight: 900, stripHeight: 68, anchorLeft: 520, anchorBottom: 50 });
  assert.deepEqual(b, { x: 520 - SPACES_MENU_SIDE, y: 50 + SPACES_MENU_GAP - SPACES_MENU_PAD, width: SPACES_MENU_WIDTH + SPACES_MENU_SIDE * 2, height: 640 });
});

test('the view leaves the shadow room to fade out at the sides, and covers no more of the Island above', () => {
  // --shadow-popover's outer layer is `0 10px 44px -4px`: it is still visible
  // 16px out, and has faded out by 44px.
  assert.ok(SPACES_MENU_SIDE >= 44, `side room ${SPACES_MENU_SIDE}`);
  assert.equal(SPACES_MENU_PAD, 16);
});

test('styles.css places the menu where the view leaves room for it', () => {
  const css = fs.readFileSync(path.join(__dirname, '../../src/renderer/styles.css'), 'utf8');
  const rule = css.match(/body:is\(\[data-mode="spaces"\], \[data-closing="spaces"\]\) #workspaceSwitcher\.ws-switcher \{([^}]*)\}/);
  assert.ok(rule, 'the spaces-mode rule');
  assert.match(rule[1], new RegExp(`top: ${SPACES_MENU_PAD}px`));
  assert.match(rule[1], new RegExp(`left: ${SPACES_MENU_SIDE}px`));
});

test('the menu stays inside a narrow or short window, its shadow room may run past the edge', () => {
  const narrow = calculateSpacesBounds({ windowWidth: 640, windowHeight: 480, stripHeight: 68, anchorLeft: 600, anchorBottom: 50 });
  assert.equal(menuLeft(narrow) + SPACES_MENU_WIDTH, 640, 'pushed left just enough to fit');
  assert.equal(narrow.y + narrow.height <= 480, true);
  const nearLeft = calculateSpacesBounds({ windowWidth: 640, windowHeight: 480, stripHeight: 68, anchorLeft: 12, anchorBottom: 50 });
  assert.equal(menuLeft(nearLeft), 12, 'still lined up with a mark near the left edge');
  const tiny = calculateSpacesBounds({ windowWidth: 200, windowHeight: 100, stripHeight: 68, anchorLeft: 20, anchorBottom: 50 });
  assert.equal(menuLeft(tiny), 0, 'narrower than the menu: it starts at the window edge');
  assert.equal(tiny.height, 100 - tiny.y);
});

test('an anchor outside the strip or missing falls back to the strip, centred', () => {
  const below = calculateSpacesBounds({ windowWidth: 1000, windowHeight: 800, stripHeight: 68, anchorLeft: 100, anchorBottom: 500 });
  assert.equal(below.y, 68 + SPACES_MENU_GAP - SPACES_MENU_PAD, 'never below the strip');
  const none = calculateSpacesBounds({ windowWidth: 1000, windowHeight: 800, stripHeight: 68, anchorLeft: null, anchorBottom: null });
  assert.equal(menuLeft(none), Math.round((1000 - SPACES_MENU_WIDTH) / 2));
  const junk = calculateSpacesBounds({ windowWidth: NaN, windowHeight: undefined, stripHeight: -5, anchorLeft: 'x', anchorBottom: {} });
  assert.deepEqual(junk, { x: 0, y: 0, width: 0, height: 0 });
});
