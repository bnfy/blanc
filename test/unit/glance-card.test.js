'use strict';

// Floating Glance (spec 2026-10-20-floating-glance-design.md): the card's
// default frame, clamping, moves, resizes and the remembered fractions.
const assert = require('node:assert/strict');
const test = require('node:test');
const {
  CARD_MIN_WIDTH, CARD_MIN_HEIGHT, CARD_HEADER_VISIBLE,
  defaultCardFrame, clampCardFrame, frameToFractions, fractionsToFrame,
  moveCardFrame, resizeCardFrame, cardGeometry,
} = require('../../src/main/glance-card');

const wide = { x: 0, y: 68, width: 1600, height: 932 };
const inside = (frame, area) => frame.x >= area.x && frame.y >= area.y
  && frame.x + frame.width <= area.x + area.width && frame.y + frame.height <= area.y + area.height;

test('the first Glance is a large card centered below the Island', () => {
  assert.deepEqual(defaultCardFrame(wide), { x: 250, y: 84, width: 1100, height: 884 });
});

test('a narrower page area gets a card 80% of its width', () => {
  assert.equal(defaultCardFrame({ x: 0, y: 68, width: 1000, height: 732 }).width, 800);
});

test('the card is never smaller than 360 by 280', () => {
  const clamped = clampCardFrame({ x: 400, y: 200, width: 200, height: 100 }, wide);
  assert.equal(clamped.width, CARD_MIN_WIDTH);
  assert.equal(clamped.height, CARD_MIN_HEIGHT);
});

test('a page area smaller than the minimum card is filled less an 8 px margin', () => {
  const area = { x: 0, y: 68, width: 300, height: 200 };
  assert.deepEqual(clampCardFrame({ x: 10, y: 80, width: 600, height: 500 }, area), { x: 8, y: 76, width: 284, height: 184 });
});

test('a card dragged off the top keeps its header on screen', () => {
  const frame = clampCardFrame({ x: 300, y: 68 - 30, width: 800, height: 600 }, wide);
  assert.ok(frame.y >= wide.y && frame.y + CARD_HEADER_VISIBLE <= wide.y + wide.height);
});

test('a frame remembered on a much larger window opens inside a small one', () => {
  const big = { x: 0, y: 68, width: 2560, height: 1332 };
  const small = { x: 0, y: 68, width: 900, height: 532 };
  const remembered = frameToFractions({ x: 1800, y: 900, width: 700, height: 480 }, big);
  const frame = fractionsToFrame(remembered, small);
  assert.ok(inside(frame, small), JSON.stringify(frame));
  assert.ok(frame.width >= CARD_MIN_WIDTH && frame.height >= CARD_MIN_HEIGHT);
});

test('no remembered frame gives the default frame', () => {
  assert.deepEqual(fractionsToFrame(null, wide), defaultCardFrame(wide));
});

test('fractions round-trip on the same page area', () => {
  const frame = { x: 120, y: 140, width: 700, height: 500 };
  assert.deepEqual(fractionsToFrame(frameToFractions(frame, wide), wide), frame);
});

test('a move past the edge stops at the clamp and comes back without an offset', () => {
  const start = defaultCardFrame(wide);
  const right = moveCardFrame(start, 5000, 0, wide);
  assert.equal(right.x + right.width, wide.x + wide.width);
  const back = moveCardFrame(right, -5000, 0, wide);
  assert.equal(back.x, wide.x);
  assert.equal(back.width, start.width);
});

test('a resize from the top-left stops at the minimum and keeps the bottom-right corner', () => {
  const start = { x: 200, y: 200, width: 800, height: 600 };
  const frame = resizeCardFrame(start, 'nw', 1000, 1000, wide);
  assert.deepEqual(
    { width: frame.width, height: frame.height, right: frame.x + frame.width, bottom: frame.y + frame.height },
    { width: CARD_MIN_WIDTH, height: CARD_MIN_HEIGHT, right: 1000, bottom: 800 },
  );
});

test('a resize from the right grows the card up to the page edge', () => {
  const frame = resizeCardFrame({ x: 200, y: 200, width: 800, height: 600 }, 'e', 5000, 0, wide);
  assert.equal(frame.x, 200);
  assert.equal(frame.x + frame.width, wide.x + wide.width);
});

test('the card geometry holds the chrome ring, the header and the page inside the border', () => {
  assert.deepEqual(cardGeometry({ x: 250, y: 84, width: 1100, height: 884 }), {
    chrome: { x: 242, y: 76, width: 1116, height: 900 },
    header: { x: 250, y: 84, width: 1100, height: 40 },
    page: { x: 251, y: 124, width: 1098, height: 843 },
  });
});
