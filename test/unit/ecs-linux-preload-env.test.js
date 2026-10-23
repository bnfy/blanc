'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { linuxPreloadEnv } = require('../../scripts/ecs-linux-preload-env.cjs');
test('legacy callers never inject preload and require the native selector for patched candidates', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ecs-preload-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  assert.deepEqual(linuxPreloadEnv(root, root), {});
  fs.writeFileSync(path.join(root, 'blanc-cdm-preload.so'), 'fixture');
  assert.throws(() => linuxPreloadEnv(root, root), /self-contained Linux launcher/);
});
