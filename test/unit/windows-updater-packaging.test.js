const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');

test('the Windows installer carries Blanc\'s bounded old-process close loop', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const include = fs.readFileSync(path.join(ROOT, 'build/installer.nsh'), 'utf8');

  assert.deepEqual(pkg.build.win.target, ['nsis']);
  assert.match(include, /!include "getProcessInfo\.nsh"/);
  assert.match(include, /Var pid/);
  assert.match(include, /!macro customCheckAppRunning/);
  assert.match(include, /!insertmacro IS_POWERSHELL_AVAILABLE/);
  assert.match(include, /!insertmacro FIND_PROCESS "\$\{APP_EXECUTABLE_FILENAME\}"/);
  assert.match(include, /\$\{if\} \$\{isUpdated\}/);
  assert.match(include, /blancGracefulUpdateQuitLoop:/);
  assert.match(include, /Sleep 250/);
  assert.match(include, /\$R1 < 8/);
  assert.ok(
    include.indexOf('blancGracefulUpdateQuitLoop:') < include.indexOf('blancStopProcess:'),
    'an updater waits for normal app quit before using the kill fallback'
  );
  assert.match(include, /!insertmacro KILL_PROCESS "\$\{APP_EXECUTABLE_FILENAME\}" 1/);
  assert.match(include, /\$R1 < 15/);
  assert.match(include, /MB_RETRYCANCEL/);
  assert.match(include, /IDRETRY blancStopProcess/);
});
