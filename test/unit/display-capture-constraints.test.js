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

test('advanced and mandatory display constraints reject before opening a picker', () => {
  for (const options of [
    { video: { advanced: [] } },
    { video: { width: { min: 640 } } },
    { video: { displaySurface: { exact: 'monitor' } } },
    { video: true, audio: { sampleRate: { exact: 48000 } } },
  ]) assert.equal(parseDisplayMediaOptions(options).errorName, 'TypeError');
});

test('valid frameRate does not fail before picker', () => {
  const p = parseDisplayMediaOptions({ video: { frameRate: { ideal: 30 } }, audio: true });
  assert.equal(p.ok, true);
  assert.equal(p.audioRequested, true);
  assert.deepEqual(p.videoConstraints, { frameRate: { ideal: 30 } });
});
