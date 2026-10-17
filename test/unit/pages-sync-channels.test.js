'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

// The pairing channels are Settings-guarded and status-only. pages.js needs a
// live Electron to load, so this pins the source the way
// sync-tab-state-ready.test.js pins startProfileSync; the reply shapes
// themselves are proven by sync-pairing-flows.test.js.
const source = fs.readFileSync(path.join(__dirname, '../../src/main/pages.js'), 'utf8');

const CHANNELS = [
  ['pages:settings:sync-pair-begin', 'sync.beginPairing('],
  ['pages:settings:sync-pair-cancel', 'sync.cancelPairing('],
  ['pages:settings:sync-pair-state', 'sync.pairingState('],
  ['pages:settings:sync-join-code', 'sync.joinWithCode('],
  ['pages:settings:sync-switch-code', 'sync.switchWithCode('],
  ['pages:settings:sync-recovery-code-copy', 'sync.copyRecoveryCode('],
  ['pages:settings:sync-device-name-set', 'sync.setThisDeviceName('],
];

test('every pairing channel is registered for the settings page and maps to its sync entry point', () => {
  for (const [channel, call] of CHANNELS) {
    const at = source.indexOf(`handle('${channel}', 'settings'`);
    assert.ok(at >= 0, `${channel} is a settings-guarded handler`);
    const body = source.slice(at, source.indexOf('\n  handle(', at + 1) > 0 ? source.indexOf('\n  handle(', at + 1) : at + 800);
    assert.ok(body.includes(call), `${channel} calls ${call}`);
  }
});

test('the recovery-code channel passes interface text in and returns no code', () => {
  const at = source.indexOf("handle('pages:settings:sync-recovery-code-copy'");
  const body = source.slice(at, at + 600);
  assert.ok(body.includes("t('settings.sync.recovery.dialogMessage')"), 'dialog copy is resolved at the Settings boundary');
  assert.ok(!/code:/.test(body), 'the handler never builds a reply field named code');
});

test('joining with a code completes the moving-in Sync task like enabling does', () => {
  const at = source.indexOf("handle('pages:settings:sync-join-code'");
  assert.ok(source.slice(at, at + 400).includes('syncMigrationCompleted: true'));
});
