'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { cases } = require('./fixtures/qr/pair-links.json');

// The pairing sheet's QR (design 2026-10-28 §6.2): a first-party encoder,
// byte mode, level M, checked module for module against an independent
// reference encoder's output (scripts/build-qr-fixtures.mjs).
let QrCode;
test.before(() => { QrCode = require('../../src/renderer/pages/qr-code'); });

const rows = (matrix) => matrix.modules.map((row) => row.map((dark) => (dark ? '1' : '0')).join(''));

test('every fixture matches module for module, version and mask included', () => {
  for (const fixture of cases) {
    const matrix = QrCode.encode(fixture.text, fixture.forcedMask === null ? {} : { mask: fixture.forcedMask });
    const label = `${fixture.text.slice(0, 30)} mask ${fixture.forcedMask ?? 'auto'}`;
    assert.equal(matrix.version, fixture.version, label);
    assert.equal(matrix.mask, fixture.mask, label);
    assert.deepEqual(rows(matrix), fixture.rows, label);
  }
});

test('a pair link is version 3, 29 × 29', () => {
  const matrix = QrCode.encode('https://blanc.day/pair#K7MR4PX2');
  assert.equal(matrix.version, 3);
  assert.equal(matrix.size, 29);
  assert.equal(matrix.modules.length, 29);
});

test('the format bits read back as level M and the chosen mask', () => {
  const matrix = QrCode.encode('https://blanc.day/pair#K7MR4PX2');
  // The copy around the top-left finder, least significant bit first: down
  // column 8 (rows 0–5, 7, 8), then left along row 8 (columns 7, 5…0).
  const m = matrix.modules;
  const bits = [m[0][8], m[1][8], m[2][8], m[3][8], m[4][8], m[5][8], m[7][8], m[8][8], m[8][7], m[8][5], m[8][4], m[8][3], m[8][2], m[8][1], m[8][0]];
  const value = bits.reduce((acc, bit, i) => acc | ((bit ? 1 : 0) << i), 0) ^ 0x5412;
  assert.equal(value >> 13, 0b00, 'level M');
  assert.equal((value >> 10) & 0b111, matrix.mask);
});

test('more than 62 bytes is out of range', () => {
  assert.throws(() => QrCode.encode('x'.repeat(63)), RangeError);
});

test('svgPath draws every dark module inside a four-module quiet zone', () => {
  const matrix = QrCode.encode('A');
  const d = QrCode.svgPath(matrix);
  const squares = d.match(/M\d+ \d+h1v1h-1z/g);
  assert.equal(squares.length, matrix.modules.flat().filter(Boolean).length);
  const coords = squares.map((s) => s.match(/M(\d+) (\d+)/).slice(1).map(Number));
  assert.ok(coords.every(([x, y]) => x >= 4 && y >= 4 && x < matrix.size + 4 && y < matrix.size + 4));
  assert.equal(QrCode.viewBoxSize(matrix), matrix.size + 8);
});
