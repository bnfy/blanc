'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  isOnePasswordAvailable,
  matchesOnePasswordShortcut,
  onePasswordAccelerator,
} = require('../../src/main/onepassword-availability');

test('1Password login fill is available on macOS, Windows and Linux only', () => {
  assert.equal(isOnePasswordAvailable('darwin'), true);
  assert.equal(isOnePasswordAvailable('win32'), true);
  assert.equal(isOnePasswordAvailable('linux'), true);
  assert.equal(isOnePasswordAvailable('freebsd'), false);
  assert.equal(isOnePasswordAvailable('aix'), false);
  assert.equal(isOnePasswordAvailable(''), false);
});

test('each platform gets its own fill shortcut, and others get none', () => {
  assert.equal(onePasswordAccelerator('darwin'), 'Cmd+Alt+P');
  assert.equal(onePasswordAccelerator('win32'), 'Ctrl+Shift+P');
  assert.equal(onePasswordAccelerator('linux'), 'Ctrl+Shift+P');
  assert.equal(onePasswordAccelerator('freebsd'), null);
});

test('Windows and Linux match exactly Ctrl+Shift+P before page dispatch', () => {
  const press = (input) => ({ type: 'keyDown', key: 'P', control: true, shift: true, ...input });
  for (const platform of ['win32', 'linux']) {
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
