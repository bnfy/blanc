'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { parseDisplayMediaOptions } = require('../../src/main/display-capture-constraints');

test('omitted video is required video', () => {
  const p = parseDisplayMediaOptions(undefined);
  assert.equal(p.ok, true);
  assert.equal(p.videoRequired, true);
  assert.equal(p.audioRequested, false);
});

test('video false is TypeError before picker', () => {
  assert.equal(parseDisplayMediaOptions({ video: false }).errorName, 'TypeError');
});

test('valid frameRate does not fail before picker', () => {
  const p = parseDisplayMediaOptions({ video: { frameRate: { ideal: 30 } }, audio: true });
  assert.equal(p.ok, true);
  assert.equal(p.audioRequested, true);
  assert.deepEqual(p.videoConstraints, { frameRate: { ideal: 30 } });
});
