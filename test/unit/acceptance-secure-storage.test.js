'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const main = fs.readFileSync(path.join(__dirname, '../../src/main/main.js'), 'utf8');

function launch({ packaged = false, platform = 'linux', enabled = '1', secure = '1' } = {}) {
  // Playwright's loader runs before the app entry and forces this fallback.
  const switches = new Map([['password-store', 'basic']]);
  const app = { isPackaged: packaged, commandLine: {
    removeSwitch: name => switches.delete(name),
    appendSwitch: (name, value) => switches.set(name, value),
  } };
  vm.runInNewContext(main.split("const { enforceLinuxSandbox }")[0], {
    require: name => { assert.equal(name, 'electron'); return { app }; },
    process: { platform, env: { BLANC_TEST: enabled, BLANC_TEST_SECURE_STORAGE: secure } },
  });
  return switches.get('password-store');
}

test('Linux acceptance replaces Playwright basic storage before app startup', () => {
  assert.equal(launch(), 'gnome-libsecret');
});
test('secure acceptance override cannot change packaged or ordinary launches', () => {
  for (const options of [{ packaged: true }, { platform: 'darwin' }, { platform: 'win32' },
    { enabled: '0' }, { enabled: '' }, { secure: '0' }, { secure: '' }]) {
    assert.equal(launch(options), 'basic');
  }
});
