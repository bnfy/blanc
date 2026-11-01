'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { writeRuntimeState } = require('../../scripts/ecs-runtime-state.cjs');
test('candidate status atomically replaces complete private JSON snapshots', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ecs-state-test-'));
  const file = path.join(dir, 'ecs-runtime.json');
  try {
    for (const state of [{ drm: 'preparing' }, { drm: 'ready', version: '4.10.3112.0' }]) {
      writeRuntimeState(file, state);
      assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), state);
      assert.equal(fs.existsSync(`${file}.tmp`), false);
      if (process.platform !== 'win32') assert.equal(fs.statSync(file).mode & 0o777, 0o600);
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
