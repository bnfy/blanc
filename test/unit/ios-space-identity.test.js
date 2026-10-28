'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
test('the iPhone copy of the Space presets and symbols matches space-identity.js', () => {
  const result = spawnSync(process.execPath, ['scripts/build-ios-space-identity.cjs', '--check'], { cwd: path.resolve(__dirname, '../..'), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
});
