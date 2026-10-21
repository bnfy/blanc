'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '../../src/renderer/pages/clock-art.js'), 'utf8');
const sandbox = {};
vm.runInNewContext(source, sandbox);
const { lookup, fitHeight, insideDistance, glassMaps, luminance, shadowFor } = sandbox.blancClockArt;

// A face whose text width grows with its width axis and a little with weight,
// and whose stem grows with weight and a little with width; both are linear,
// so the bilinear table describes it exactly.
const widthOf = (s, w) => 3 * s + 0.2 * w;
const stemOf = (s, w) => 0.04 * w + 0.02 * s;
const STRETCHES = [25, 50, 75, 100, 151];
const WEIGHTS = [100, 400, 700, 1000];
const TABLE = {
  stretches: STRETCHES,
  weights: WEIGHTS,
  width: STRETCHES.map((s) => WEIGHTS.map((w) => widthOf(s, w))),
  stem: STRETCHES.map((s) => WEIGHTS.map((w) => stemOf(s, w))),
};
const close = (a, b, tolerance, message) => assert.ok(Math.abs(a - b) <= tolerance, `${message}: ${a} vs ${b}`);

test('the table is read between its samples', () => {
  close(lookup(TABLE, TABLE.width, 62.5, 550), widthOf(62.5, 550), 1e-9, 'width');
  close(lookup(TABLE, TABLE.stem, 30, 120), stemOf(30, 120), 1e-9, 'stem');
  close(lookup(TABLE, TABLE.width, 10, 50), widthOf(25, 100), 1e-9, 'held at the low corner');
});

test('taller figures keep the clock width and stem by narrowing and lightening', () => {
  const base = { stretch: 100, weight: 500 };
  assert.deepEqual({ ...fitHeight(TABLE, base, 1) }, base);
  for (const factor of [1.25, 1.5, 2]) {
    const fit = fitHeight(TABLE, base, factor);
    close(widthOf(fit.stretch, fit.weight) * factor, widthOf(100, 500), 0.01, `width at ${factor}x`);
    close(stemOf(fit.stretch, fit.weight) * factor, stemOf(100, 500), 0.01, `stem at ${factor}x`);
    assert.ok(fit.stretch < 100 && fit.weight < 500);
  }
});

test('past its narrowest the face stays narrowest and grows wider; past its lightest the stem thickens', () => {
  const fit = fitHeight(TABLE, { stretch: 100, weight: 500 }, 6);
  assert.equal(fit.stretch, 25);
  assert.ok(widthOf(fit.stretch, fit.weight) * 6 > widthOf(100, 500), 'the clock grows wider');
  const light = fitHeight(TABLE, { stretch: 100, weight: 120 }, 3);
  assert.equal(light.weight, 100);
});

// A glyph drawn from rows of '#' (ink) and '.' (none), one character a pixel.
function glyph(rows) {
  const width = rows[0].length;
  const alpha = new Uint8ClampedArray(width * rows.length);
  rows.forEach((row, r) => [...row].forEach((c, x) => { alpha[r * width + x] = c === '#' ? 255 : 0; }));
  return { alpha, width, height: rows.length };
}
const BAR = glyph([
  '...........',
  '.#########.',
  '.#########.',
  '.#########.',
  '.#########.',
  '.#########.',
  '.#########.',
  '.#########.',
  '...........',
]);

test('the distance field is deepest in the middle of a stroke and 0 outside', () => {
  const d = insideDistance(BAR.alpha, BAR.width, BAR.height);
  assert.equal(d[0], 0);
  assert.equal(d[1 * BAR.width + 1], 1, 'an edge pixel is one step in');
  assert.equal(d[4 * BAR.width + 5], 4, 'the centre is four steps in');
  assert.ok(d[4 * BAR.width + 2] < d[4 * BAR.width + 5]);
});

test('the glass bends the page across its bevel only, and lights its rim', () => {
  const { map, face } = glassMaps(BAR.alpha, BAR.width, BAR.height, { bevel: 3, bend: 4, scale: 8, tint: [20, 20, 20] });
  const red = (x, y) => map[(y * BAR.width + x) * 4];
  const green = (x, y) => map[(y * BAR.width + x) * 4 + 1];
  const alphaAt = (x, y) => face[(y * BAR.width + x) * 4 + 3];
  assert.equal(red(0, 0), 128, 'no bend outside');
  assert.ok(red(1, 4) < 128 && red(9, 4) > 128, 'the left edge bends one way, the right the other');
  assert.ok(green(5, 1) < 128 && green(5, 7) > 128, 'the top edge bends up, the bottom down');
  assert.equal(alphaAt(0, 0), 0, 'no light outside');
  assert.ok(alphaAt(1, 1) > alphaAt(5, 4), 'the rim is brighter than the body');
  assert.ok(alphaAt(5, 4) > 0, 'the body carries a little of its color');
});

test('the shadow is opposite to the ink, so every figure keeps an edge', () => {
  assert.ok(luminance([255, 255, 255]) > 0.99);
  assert.ok(luminance([0, 0, 0]) < 0.01);
  assert.match(shadowFor([255, 255, 255]), /rgb\(0 0 0/);
  assert.match(shadowFor([22, 19, 15]), /rgb\(255 255 255/);
  // A deep preset reads as dark ink, a toned-up pale one as light.
  assert.match(shadowFor([55, 102, 148]), /rgb\(255 255 255/);
  assert.match(shadowFor([233, 224, 205]), /rgb\(0 0 0/);
});

test("computed colors parse in both of Chromium's forms", () => {
  const { parseColor } = sandbox.blancClockArt;
  assert.deepEqual([...parseColor('rgb(55, 102, 148)')], [55, 102, 148]);
  assert.deepEqual([...parseColor('rgba(0, 0, 0, 0)')], [0, 0, 0]);
  // What a color-mix() computes to: channels 0–1, not 0–255.
  assert.deepEqual([...parseColor('color(srgb 0.8 0.85 0.9)')], [204, 217, 230]);
  assert.match(shadowFor(parseColor('color(srgb 0.95 0.95 0.95)')), /rgb\(0 0 0/, 'a pale toned ink still counts as light');
});

test("the page's tone preview mixes exactly as main does", () => {
  const { mixHex } = sandbox.blancClockArt;
  const { mix } = require('../../src/main/start-page-paint');
  for (const [a, b, t] of [['#376694', '#ffffff', 0.44], ['#9b4761', '#000000', 0.7], ['#3a3a3a', '#ffffff', 0]]) {
    assert.equal(mixHex(a, b, t), mix(a, b, t));
  }
});
