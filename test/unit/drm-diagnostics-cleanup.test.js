'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { withDiagnosticProfile } = require('../../scripts/drm-diagnostics.cjs');

for (const fail of [false, true]) {
  test(`diagnostic owner removes nested profile files after ${fail ? 'failure' : 'success'}`, async () => {
    let profile;
    const run = withDiagnosticProfile(async directory => {
      profile = directory;
      await fs.mkdir(path.join(directory, 'Default', 'Cache'), { recursive: true });
      await fs.writeFile(path.join(directory, 'Default', 'Cache', 'data'), 'test');
      if (fail) throw new Error('launch failure');
      return 'complete';
    });
    if (fail) await assert.rejects(run, /launch failure/);
    else assert.equal(await run, 'complete');
    await assert.rejects(fs.lstat(profile), { code: 'ENOENT' });
  });
}
