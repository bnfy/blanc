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

test('iOS appearance bundle matches the shared desktop clock and paint rules', () => {
  const root = path.resolve(__dirname, '../..');
  const result = spawnSync(process.execPath, ['scripts/ios-start-page-rules.mjs', '--check'], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  require('../../src/renderer/pages/ios-start-rules');
  const clock = require('../../src/main/start-clock-style');
  const paint = require('../../src/main/start-page-paint');
  for (const font of clock.FONT_IDS) {
    const selection = { font, weight: 900, height: 220, color: 'iris', tone: 25, style: 'glass' };
    assert.deepEqual(globalThis.BlancStartRules.clock.clockStyle(selection), clock.clockStyle(selection));
  }
  for (const fill of paint.FILLS) {
    assert.deepEqual(globalThis.BlancStartRules.paint.colorWallpaper({ preset: 'sky', fill }), paint.colorWallpaper({ preset: 'sky', fill }));
  }
});
