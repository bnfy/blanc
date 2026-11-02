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
  ['pages:settings:sync-start-new', 'sync.startNew('],
  ['pages:settings:sync-recovery-prompt-dismiss', 'sync.dismissRecoveryPrompt('],
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

test('starting a sync names it in the interface language and completes the moving-in Sync task', () => {
  const at = source.indexOf("handle('pages:settings:sync-start-new'");
  const body = source.slice(at, at + 500);
  assert.ok(body.includes("t('settings.sync.defaultName')"));
  assert.ok(body.includes('syncMigrationCompleted: true'));
});

test('the pairing watch is settings-guarded and reports only visibility', () => {
  const at = source.indexOf("handleEvent('pages:settings:sync-pair-watch', 'settings'");
  assert.ok(at >= 0);
  assert.ok(source.slice(at, at + 300).includes('hooks.syncPairing?.watch('));
});

test('the joined event carries only the device name and platform', () => {
  const main = fs.readFileSync(path.join(__dirname, '../../src/main/main.js'), 'utf8');
  const sends = [...main.matchAll(/send\('pages:settings:sync-pair-joined',\s*(\{[^}]*\})\)/g)].map((m) => m[1].replace(/\s+/g, ''));
  assert.deepEqual(sends, ['{name,platform}']);
});
