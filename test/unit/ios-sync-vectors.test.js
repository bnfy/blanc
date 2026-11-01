'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
test('ios sync vectors match desktop modules', () => {
  const result = spawnSync(process.execPath, ['scripts/build-ios-sync-vectors.cjs', '--check'], { cwd: path.resolve(__dirname, '../..'), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
});
