'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

// Settings → Sync markup and wiring for device pairing (design 2026-10-16
// §4.1, §4.1a, §4.2, §4.3). The page is static HTML plus settings.js; both
// are pinned here as source, the way other page tests in this suite do.
const pages = path.join(__dirname, '../../src/renderer/pages');
const html = fs.readFileSync(path.join(pages, 'settings.html'), 'utf8');
const js = fs.readFileSync(path.join(pages, 'settings.js'), 'utf8');

const at = (needle) => {
  const i = html.indexOf(needle);
  assert.ok(i >= 0, `settings.html contains ${needle}`);
  return i;
};

test('the off state offers Add this device first and warns on Start syncing', () => {
  assert.ok(at('id="syncPathCode"') < at('id="syncPathStart"'), 'Add this device comes before Start syncing');
  assert.ok(!html.includes('id="syncPathJoin"'), 'the passphrase path is reached from the code step, not a third button');
  assert.ok(html.includes('data-i18n="settings.sync.addThisDevice"'));
  assert.ok(html.includes('data-i18n="settings.sync.startOnlyFirstDevice"'), 'the start path carries the first-device warning');
});

test('the code path is one field, Connect, and a passphrase fallback link', () => {
  at('id="syncCodeForm"');
  at('id="syncCode"');
  at('id="syncUsePassphrase"');
  const form = html.slice(at('id="syncCodeForm"'), at('id="syncActive"'));
  assert.ok(form.includes('hidden'), 'the code form starts hidden');
  assert.ok(form.includes('autocapitalize="characters"'));
});

test('the on state has Add another device, the pairing panel, the switch panel and Copy recovery code', () => {
  const on = html.slice(at('id="syncActive"'), at('id="group-profiles"'));
  for (const id of ['syncAddDevice', 'syncPairing', 'syncPairingCode', 'syncPairingRemaining', 'syncPairingCopy', 'syncPairingCancel',
    'syncSwitchOpen', 'syncSwitch', 'syncSwitchName', 'syncSwitchWipe', 'syncSwitchCode', 'syncSwitchSubmit', 'syncSwitchCancel',
    'syncRecoveryCopy', 'syncRecoveryNote']) {
    assert.ok(on.includes(`id="${id}"`), `on state has #${id}`);
  }
  const panel = on.slice(on.indexOf('id="syncPairing"'), on.indexOf('id="syncPairingCancel"'));
  assert.ok(/<[^>]*id="syncPairing"[^>]*hidden/.test(on), 'the pairing panel starts hidden');
  assert.ok(panel.includes('data-i18n-ignore'), 'the code itself is never localized');
  assert.ok(/<[^>]*id="syncSwitch"[^>]*hidden/.test(on), 'the switch panel starts hidden');
});

test('settings.js renders the code from the view, drives the countdown, and never shows the recovery code', () => {
  assert.ok(js.includes('window.blancSyncPairingModel'));
  assert.ok(js.includes('pairingCodeEl.textContent = pv.codeText'), 'the code text comes from the view, never a raw string');
  assert.ok(js.includes("syncPairState()"), 'a reopened page resumes the live code');
  assert.ok(js.includes('syncRecoveryCodeCopy()'));
  assert.ok(!js.includes('recoveryCodeEl'), 'no element ever holds the recovery code');
});

test('the pairing model script loads before settings.js', () => {
  assert.ok(at('settings-sync-pairing-model.js') < at('<script src="settings.js">'));
});

test('this device’s name is edited in the on state and reaches main through the Settings bridge', () => {
  const on = html.slice(at('id="syncActive"'), at('id="syncNow"'));
  assert.ok(on.includes('id="syncDeviceName"'), 'the field is in the on-state status list');
  assert.ok(on.includes('data-i18n="settings.sync.deviceName"'));
  assert.ok(on.includes('data-i18n="settings.sync.deviceNameHint"'));
  assert.ok(/id="syncDeviceName"[^>]*data-i18n-ignore="placeholder"/.test(on), 'the placeholder is the computer’s name, not catalog text');
  const preload = fs.readFileSync(path.join(__dirname, '../../src/main/tab-preload.js'), 'utf8');
  assert.ok(preload.includes("syncDeviceNameSet: (name) => invoke('pages:settings:sync-device-name-set', name)"));
});
