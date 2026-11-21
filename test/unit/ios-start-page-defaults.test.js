'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

test('iOS Start Page layouts and default match the shared settings schema', () => {
  const root = path.resolve(__dirname, '../..');
  const result = spawnSync(process.execPath, ['scripts/ios-start-page-settings.mjs', '--check'], {
    cwd: root, encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

