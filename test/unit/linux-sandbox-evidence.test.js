const test = require('node:test');
const assert = require('node:assert/strict');
const { parseBlancProcess } = require('../../scripts/linux-sandbox-evidence');
test('native process collection matches executable names and excludes the harness and its wrappers', () => {
  for (const command of ['/usr/bin/node scripts/verify.mjs /tmp/squashfs-root/blanc', '/usr/bin/dbus-run-session node verify.mjs /tmp/squashfs-root/blanc', '/bin/bash /tmp/blanc', '/tmp/blanc-helper']) {
    assert.equal(parseBlancProcess(`123 100 ${command}`), null);
  }
  assert.deepEqual(parseBlancProcess('123 100 /tmp/.mount_Blancabc/blanc --user-data-dir=/tmp/profile'), { pid: 123, type: 'browser' });
  assert.deepEqual(parseBlancProcess('124 123 /tmp/squashfs-root/blanc --type=renderer --no-sandbox'), { pid: 124, type: 'renderer' });
});
