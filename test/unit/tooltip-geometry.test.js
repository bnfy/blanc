'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { tooltipRequest, tooltipBounds, MAX_TEXT, MAX_WIDTH, MAX_HEIGHT } = require('../../src/main/tooltip-geometry');

const anchor = { x: 100, y: 12, width: 24, height: 24 };

test('a well-formed request is kept, its size rounded up', () => {
  assert.deepEqual(tooltipRequest({ text: ' Reload ', anchor, width: 50.2, height: 23.5, privateTheme: true }), {
    text: 'Reload', anchor, width: 51, height: 24, privateTheme: true,
  });
});

test('anything but a real request is refused', () => {
  for (const raw of [
    null, 'Reload', {},
    { text: '', anchor, width: 50, height: 24 },
    { text: 'x'.repeat(MAX_TEXT + 1), anchor, width: 50, height: 24 },
    { text: 42, anchor, width: 50, height: 24 },
    { text: 'Reload', width: 50, height: 24 },
    { text: 'Reload', anchor: { ...anchor, x: NaN }, width: 50, height: 24 },
    { text: 'Reload', anchor: { ...anchor, width: -1 }, width: 50, height: 24 },
    { text: 'Reload', anchor, width: 0, height: 24 },
    { text: 'Reload', anchor, width: 50, height: Infinity },
  ]) assert.equal(tooltipRequest(raw), null, JSON.stringify(raw));
});

test('a reported size can never grow the view past its cap', () => {
  const request = tooltipRequest({ text: 'Reload', anchor, width: 5000, height: 5000 });
  assert.equal(request.width, MAX_WIDTH);
  assert.equal(request.height, MAX_HEIGHT);
  assert.equal(tooltipRequest({ text: 'Reload', anchor, width: 50, height: 24, privateTheme: 'yes' }).privateTheme, false);
});

test('the view sits centered under the button', () => {
  const bounds = tooltipBounds({ anchor, width: 60, height: 24 }, { windowWidth: 1200, windowHeight: 800 });
  assert.deepEqual(bounds, { x: 82, y: 42, width: 60, height: 24 });
});

test('the view stays inside the window at either edge', () => {
  const left = tooltipBounds({ anchor: { x: 0, y: 12, width: 20, height: 20 }, width: 120, height: 24 }, { windowWidth: 1200, windowHeight: 800 });
  assert.equal(left.x, 4);
  const right = tooltipBounds({ anchor: { x: 1190, y: 12, width: 10, height: 20 }, width: 120, height: 24 }, { windowWidth: 1200, windowHeight: 800 });
  assert.equal(right.x, 1200 - 120 - 4);
});

test('with no room below, the view goes above the button', () => {
  const bounds = tooltipBounds({ anchor: { x: 100, y: 770, width: 24, height: 24 }, width: 60, height: 24 }, { windowWidth: 1200, windowHeight: 800 });
  assert.equal(bounds.y, 770 - 24 - 6);
});
