'use strict';

// On macOS a tab view detached while it had focus can keep reporting
// isFocused(), and Electron's getFocusedWebContents() returns the first
// contents that does. Only contents on screen in the window can hold the
// keyboard, so they are asked first.

const assert = require('node:assert/strict');
const test = require('node:test');
const { onScreenFocusedContents } = require('../../src/main/focused-contents');

const contents = (id, focused = false) => ({ id, isDestroyed: () => false, isFocused: () => focused });
const view = (wc, visible = true) => ({ webContents: wc, getVisible: () => visible });
const windowWith = (own, children) => ({ isDestroyed: () => false, webContents: own, contentView: { children } });

test('a focused page on screen wins over a hidden tab that also reports focus', () => {
  const stale = contents(43, true);
  const page = contents(45, true);
  const window = windowWith(contents(1), [view(stale, false), view(page)]);
  assert.equal(onScreenFocusedContents(window, stale), page);
});

test("the window's own document counts as on screen", () => {
  const strip = contents(1, true);
  assert.equal(onScreenFocusedContents(windowWith(strip, [view(contents(45))]), null), strip);
});

test('a hidden view never answers, even when it is the only one reporting focus', () => {
  const stale = contents(43, true);
  const fallback = contents(7);
  assert.equal(onScreenFocusedContents(windowWith(contents(1), [view(stale, false)]), fallback), fallback);
});

test('views without contents and destroyed contents are skipped', () => {
  const gone = { id: 9, isDestroyed: () => true, isFocused: () => true };
  const page = contents(45, true);
  const window = windowWith(contents(1), [{ getVisible: () => true }, view(gone), view(page)]);
  assert.equal(onScreenFocusedContents(window, null), page);
});

test('with nothing on screen focused, or no live window, it falls back', () => {
  const fallback = contents(7);
  assert.equal(onScreenFocusedContents(windowWith(contents(1), [view(contents(45))]), fallback), fallback);
  assert.equal(onScreenFocusedContents(null, fallback), fallback);
  assert.equal(onScreenFocusedContents({ isDestroyed: () => true }, fallback), fallback);
});
