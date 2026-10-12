'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  isOnePasswordAvailable,
  isOnePasswordDeviceSupported,
  matchesOnePasswordShortcut,
  onePasswordAccelerator,
} = require('../../src/main/onepassword-availability');

// Windows is off until #735 (1Password re-asks to approve Blanc during one fill).
test('1Password login fill is available on macOS and Linux only', () => {
  assert.equal(isOnePasswordAvailable('darwin'), true);
  assert.equal(isOnePasswordAvailable('win32'), false);
  assert.equal(isOnePasswordAvailable('linux'), true);
  assert.equal(isOnePasswordAvailable('freebsd'), false);
  assert.equal(isOnePasswordAvailable('aix'), false);
  assert.equal(isOnePasswordAvailable(''), false);
});

test('each platform gets its own fill shortcut, and others get none', () => {
  assert.equal(onePasswordAccelerator('darwin'), 'Cmd+Alt+P');
  assert.equal(onePasswordAccelerator('win32'), null);
  assert.equal(onePasswordAccelerator('linux'), 'Ctrl+Shift+P');
  assert.equal(onePasswordAccelerator('freebsd'), null);
});

test('Linux matches exactly Ctrl+Shift+P before page dispatch', () => {
  const press = (input) => ({ type: 'keyDown', key: 'P', control: true, shift: true, ...input });
  for (const platform of ['linux']) {
    assert.equal(matchesOnePasswordShortcut(press({}), platform), true);
    assert.equal(matchesOnePasswordShortcut(press({ key: 'p' }), platform), true);
    assert.equal(matchesOnePasswordShortcut(press({ type: 'keyUp' }), platform), false);
    assert.equal(matchesOnePasswordShortcut(press({ shift: false }), platform), false, 'Ctrl+P prints');
    assert.equal(matchesOnePasswordShortcut(press({ alt: true }), platform), false);
    assert.equal(matchesOnePasswordShortcut(press({ meta: true }), platform), false);
    assert.equal(matchesOnePasswordShortcut(press({ isComposing: true }), platform), false);
    assert.equal(matchesOnePasswordShortcut(press({ modifiers: ['control', 'shift', 'altgraph'] }), platform), false);
  }
  // macOS relies on its native menu key equivalent; other platforms have none.
  assert.equal(matchesOnePasswordShortcut(press({}), 'darwin'), false);
  assert.equal(matchesOnePasswordShortcut(press({}), 'win32'), false);
  assert.equal(matchesOnePasswordShortcut(press({}), 'freebsd'), false);
});

test('the sandboxed chrome preload mirrors the supported platform list', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const { SUPPORTED_PLATFORMS } = require('../../src/main/onepassword-availability');
  const preload = fs.readFileSync(path.join(__dirname, '../../src/main/preload.js'), 'utf8');
  const match = preload.match(/const ONE_PASSWORD_AVAILABLE = \[([^\]]*)\]\.includes\(process\.platform\);/);
  assert.ok(match, 'preload.js must gate 1Password on an explicit platform list');
  assert.deepEqual(match[1].split(',').map((entry) => entry.trim().replace(/^'|'$/g, '')),
    [...SUPPORTED_PLATFORMS]);
});

// Blanc ships x64 only on Windows. On Windows on Arm it runs translated, and
// the Arm version of 1Password installs an Arm64 SDK library that an x64
// process can't load, so every fill and Verify would fail with a misleading
// "turn on the SDK setting" message.
test('1Password fill is unsupported only for Blanc translated to Arm64 on Windows', () => {
  assert.equal(isOnePasswordDeviceSupported({ platform: 'win32', runningUnderARM64Translation: true }), false);
  assert.equal(isOnePasswordDeviceSupported({ platform: 'win32', runningUnderARM64Translation: false }), true);
  // Rosetta on macOS loads 1Password's universal library and stays supported.
  assert.equal(isOnePasswordDeviceSupported({ platform: 'darwin', runningUnderARM64Translation: true }), true);
  assert.equal(isOnePasswordDeviceSupported({ platform: 'linux', runningUnderARM64Translation: undefined }), true);
});
