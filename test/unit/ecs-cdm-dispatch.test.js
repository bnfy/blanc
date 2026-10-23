'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

test('native candidate dispatcher accepts only one sandboxed CDM service tuple', { skip: process.platform !== 'darwin' }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-cdm-dispatch-unit-'));
  try {
    const source = path.resolve(__dirname, '../../scripts/ecs-cdm-dispatch.c');
    fs.writeFileSync(path.join(dir, 'test.c'), `#define main dispatcher_main\n#include ${JSON.stringify(source)}\n#undef main\nint main(int argc, char **argv) { return is_cdm(argc, argv) ? 0 : 1; }\n`);
    const executable = path.join(dir, 'test');
    execFileSync('xcrun', ['clang', '-Wall', '-Wextra', '-Werror', path.join(dir, 'test.c'), '-o', executable]);
    const good = ['--type=utility', '--utility-sub-type=media.mojom.CdmServiceBroker', '--service-sandbox-type=cdm', '--seatbelt-client=5'];
    execFileSync(executable, good);
    for (const args of [[], good.slice(0, 3), ...good.map((_, i) => good.filter((__, j) => i !== j)),
      ...good.map(value => [...good, value]), [...good, '--no-sandbox'], [...good, '--disable-sandbox'],
      [...good.slice(0, 3), '--seatbelt-client=abc'], [...good, '--type=renderer'],
      ['--type=utility', '--utility-sub-type=node.mojom.NodeService', '--service-sandbox-type=none', '--seatbelt-client=5']]) {
      assert.throws(() => execFileSync(executable, args));
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
