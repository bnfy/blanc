'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('private downloads are kept out of the persistent download store', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../src/main/downloads.js'), 'utf8');
  assert.match(source, /if \(isPrivate\) \{\s*privateFinished\.unshift\(record\)/);
  assert.match(source, /else \{\s*ensureStore\(\)\.update/);
  assert.doesNotMatch(source, /ensureStore\(\)\.update[\s\S]{0,160}privateFinished\.unshift/);
  assert.match(source, /privateFinished\.length = 0/);
});

test('both browsing sessions explicitly declare download privacy', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../src/main/main.js'), 'utf8');
  assert.match(source, /setupDownloads\(ses, boundBroadcastDownloadsActivity, \{ private: false \}\)/);
  assert.match(source, /setupDownloads\(privateSes, boundBroadcastDownloadsActivity, \{ private: true \}\)/);
});
