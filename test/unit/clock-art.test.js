'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '../../src/renderer/pages/clock-art.js'), 'utf8');
const sandbox = {};
vm.runInNewContext(source, sandbox);
const { stretchRows, resampleRows, refractionMap, luminance, shadowFor, shadowFilter } = sandbox.blancClockArt;

// A glyph drawn from rows of '#' (ink) and '.' (none), one character a pixel.
function glyph(rows) {
  const width = rows[0].length;
  const alpha = new Uint8ClampedArray(width * rows.length);
  rows.forEach((row, r) => [...row].forEach((c, x) => { alpha[r * width + x] = c === '#' ? 255 : 0; }));
  return { alpha, width, height: rows.length };
}
const sum = (values) => [...values].reduce((a, b) => a + b, 0);

// A "1": a flag at the top, a long stem, a base bar.
const ONE = glyph([
  '..........',
  '....###...',
  '...####...',
  '....###...',
  '....###...',
  '....###...',
  '....###...',
  '....###...',
  '....###...',
  '....###...',
  '....###...',
  '..#######.',
  '..#######.',
  '..........',
]);

test('the stretch goes to the stem, never to the bar or the flag', () => {
  const heights = stretchRows(ONE.alpha, ONE.width, ONE.height, 1, 12, 20);
  assert.ok(Math.abs(sum(heights) - (ONE.height + 20)) < 1e-9, 'every added pixel is placed');
  for (const r of [11, 12]) assert.equal(heights[r], 1, `bar row ${r} keeps its height`);
  for (const r of [0, 1, 13]) assert.equal(heights[r], 1, `row ${r} beyond the cap height and baseline keeps its height`);
  assert.ok(heights[2] < 1.05, 'the flag, a little wider than the stem, barely moves');
  const stem = [4, 5, 6, 7, 8, 9].map((r) => heights[r]);
  assert.ok(stem.every((h) => h > 3), `stem rows grow: ${stem}`);
});

test('nothing stretches at factor one', () => {
  const heights = stretchRows(ONE.alpha, ONE.width, ONE.height, 1, 12, 0);
  assert.deepEqual([...heights], new Array(ONE.height).fill(1));
});

test("a colon's dots keep their size and spread apart", () => {
  const colon = glyph([
    '.....',
    '.....',
    '.....',
    '.....',
    '.###.',
    '.###.',
    '.....',
    '.....',
    '.....',
    '.....',
    '.###.',
    '.###.',
    '.....',
  ]);
  const heights = stretchRows(colon.alpha, colon.width, colon.height, 0, 12, 40);
  for (const r of [4, 5, 10, 11]) assert.equal(heights[r], 1, `dot row ${r} keeps its height`);
  const between = sum([6, 7, 8, 9].map((r) => heights[r])) - 4;
  const above = sum([1, 2, 3].map((r) => heights[r])) - 3;
  assert.ok(between > above * 2, `most of it goes between the dots (${between} vs ${above})`);
  const drawn = resampleRows(colon.alpha, colon.width, colon.height, heights);
  // Each dot is still exactly two rows of ink: nothing smears into the gap.
  let inkRows = 0;
  for (let r = 0; r < drawn.height; r++) if (drawn.alpha[r * colon.width + 2]) inkRows++;
  assert.equal(inkRows, 4);
});

test('resampling repeats rows to the new height without blending', () => {
  const heights = stretchRows(ONE.alpha, ONE.width, ONE.height, 1, 12, 20);
  const drawn = resampleRows(ONE.alpha, ONE.width, ONE.height, heights);
  assert.equal(drawn.height, ONE.height + 20);
  assert.ok(drawn.alpha.every((v) => v === 0 || v === 255), 'only ink and none');
  // The stem column is ink from the flag down through the base.
  let run = 0;
  for (let r = 0; r < drawn.height; r++) if (drawn.alpha[r * ONE.width + 5]) run++;
  assert.equal(run, 12 + 20);
});

test('the refraction map is neutral away from edges and pushes across them', () => {
  const width = 9, height = 3;
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 3; x < width; x++) rgba[(y * width + x) * 4 + 3] = 255;
  const map = refractionMap(rgba, width, height, 0.2);
  const red = (x, y) => map[(y * width + x) * 4];
  assert.equal(red(0, 1), 128);
  assert.equal(red(7, 1), 128);
  assert.notEqual(red(3, 1), 128, 'the edge bends');
  assert.equal(map[(1 * width + 3) * 4 + 1], 128, 'a vertical edge bends sideways only');
});

test('the shadow is opposite to the ink, so every figure keeps an edge', () => {
  assert.ok(luminance([255, 255, 255]) > 0.99);
  assert.ok(luminance([0, 0, 0]) < 0.01);
  assert.match(shadowFor([255, 255, 255]), /rgb\(0 0 0/);
  assert.match(shadowFor([22, 19, 15]), /rgb\(255 255 255/);
  // A deep preset reads as dark ink, a toned-up pale one as light.
  assert.match(shadowFor([55, 102, 148]), /rgb\(255 255 255/);
  assert.match(shadowFor([233, 224, 205]), /rgb\(0 0 0/);
  const filter = shadowFilter(shadowFor([255, 255, 255]));
  assert.equal((filter.match(/drop-shadow\(/g) ?? []).length, 3);
  assert.doesNotMatch(filter, /,\s*0 /, 'layers are split between shadows, not inside rgb()');
});
