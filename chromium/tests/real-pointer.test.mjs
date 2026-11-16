// The window placement that keeps a test window out from under the real
// pointer (lib/real-pointer.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import {clearOfPointer} from './lib/real-pointer.mjs';

const screen = {left: 0, top: 25, width: 2560, height: 1415};
const bounds = {left: 22, top: 52, width: 1200, height: 843};

test('a pointer clear of the window moves nothing', () => {
  assert.equal(clearOfPointer({x: 1400, y: 300}, bounds, screen), null);
  assert.equal(clearOfPointer(null, bounds, screen), null);
});

test('a pointer inside the window sends it to the first side that fits', () => {
  // The Mac Studio on 2026-11-16: the pointer near the window's right edge.
  const to = clearOfPointer({x: 1215, y: 183}, bounds, screen);
  assert.deepEqual(to, {left: 1256, top: 52});
  assert.ok(to.left > 1215 + 40 - 1 && to.left + bounds.width <= screen.width);
  // Room on the left wins when there is some.
  assert.deepEqual(clearOfPointer({x: 1800, y: 400}, {...bounds, left: 1000}, screen), {left: 559, top: 52});
});

test('a pointer just outside the window is left alone', () => {
  assert.notEqual(clearOfPointer({x: 1228, y: 183}, bounds, screen), null);
  assert.equal(clearOfPointer({x: 1231, y: 183}, bounds, screen), null);
});

test('a small screen gets the tight margin', () => {
  // The Mac Studio's display: 40px clear fits on no side, 8px fits on the left.
  assert.deepEqual(clearOfPointer({x: 1215, y: 183}, bounds, {left: 0, top: 25, width: 1920, height: 1000}), {left: 6, top: 52});
});

test('nowhere to go on a small screen leaves the window alone', () => {
  assert.equal(clearOfPointer({x: 600, y: 400}, bounds, {left: 0, top: 25, width: 1440, height: 875}), null);
});
