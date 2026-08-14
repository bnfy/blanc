'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('private downloads are kept out of the persistent download store', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../src/main/downloads.js'), 'utf8');
  assert.match(source, /if \(isPrivate\) \{\s*const finished = privateFinishedByProfile\.get\(profileId\) \?\? \[\];\s*finished\.unshift\(record\)/);
  assert.match(source, /else \{\s*ensureStore\(\)\.update/);
  assert.doesNotMatch(source, /ensureStore\(\)\.update[\s\S]{0,160}finished\.unshift/);
  assert.match(source, /privateFinishedByProfile\.delete\(activeLocalProfileId\(\)\)/);
});

test('every profile session explicitly declares download privacy and ownership', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../src/main/main.js'), 'utf8');
  assert.match(source, /setupDownloads\(ses, broadcastDownloadsActivity, \{\s*private: false,\s*profileId: DEFAULT_PROFILE_ID/);
  assert.match(source, /setupDownloads\(privateSes, broadcastDownloadsActivity, \{\s*private: true,\s*profileId: DEFAULT_PROFILE_ID/);
  assert.match(source, /setupDownloads\(owned\.normal, broadcastDownloadsActivity, \{\s*private: false,\s*profileId: owned\.profileId/);
  assert.match(source, /setupDownloads\(owned\.private, broadcastDownloadsActivity, \{\s*private: true,\s*profileId: owned\.profileId/);
});
