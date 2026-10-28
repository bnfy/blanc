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

test('the off state offers Add this device before the passphrase start, which keeps its warning', () => {
  assert.ok(at('id="syncPathCode"') < at('id="syncPathStart"'), 'Add this device comes before Start syncing');
  assert.ok(html.includes('data-i18n="settings.sync.off.addWithCode"'));
  assert.ok(html.includes('data-i18n="settings.sync.startOnlyFirstDevice"'), 'the start path carries the first-device warning');
});

test('the code path is one field, Connect, and a passphrase fallback link', () => {
  at('id="syncCodeForm"');
  at('id="syncCode"');
  at('id="syncUsePassphrase"');
  const form = html.slice(at('id="syncCodeForm"'), at('id="syncActive"'));
  assert.ok(form.includes('hidden'), 'the code form starts hidden');
  assert.ok(form.includes('autocapitalize="none"'), 'recovery codes must keep their case; short device codes normalize on submission');
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
  const on = html.slice(at('id="syncActive"'), at('id="syncDeviceList"') + 4000);
  assert.ok(on.includes('id="syncDeviceName"'), 'the field leads the Devices list as this device');
  assert.ok(on.includes('data-i18n-aria-label="settings.sync.deviceName"'));
  assert.ok(on.includes('data-i18n="settings.sync.deviceNameHint"'));
  assert.ok(/id="syncDeviceName"[^>]*data-i18n-ignore="placeholder"/.test(on), 'the placeholder is the computer’s name, not catalog text');
  const preload = fs.readFileSync(path.join(__dirname, '../../src/main/tab-preload.js'), 'utf8');
  assert.ok(preload.includes("syncDeviceNameSet: (name) => invoke('pages:settings:sync-device-name-set', name)"));
});

// Design 2026-10-28 §5.2, §5.4, §6.4.
test('the off state leads with Turn on Sync and keeps the passphrase paths under Other ways', () => {
  assert.ok(at('id="syncTurnOn"') < at('id="syncPathCode"'), 'Turn on Sync comes first');
  assert.ok(html.includes('data-i18n="settings.sync.off.haveCode"'));
  const other = html.slice(at('id="syncOtherWays"'), at('id="syncCodeForm"'));
  assert.ok(other.includes('id="syncPathStart"'), 'the passphrase start is under Other ways');
  assert.ok(other.includes('id="syncPathJoin"'), 'joining with a passphrase is under Other ways too');
});

test('the recovery prompt card and its buttons exist, and Not now calls the dismiss channel', () => {
  for (const id of ['syncRecoveryPrompt', 'syncRecoveryPromptCopy', 'syncRecoveryPromptNotNow']) at(`id="${id}"`);
  assert.ok(js.includes('syncRecoveryPromptDismiss()'));
  assert.ok(/origin\s*===\s*'generated'/.test(js), 'shown only on the device that started the sync');
});

test('the sheet has a joined state with the Spaces question and Done', () => {
  const sheet = html.slice(at('id="syncPairingDialog"'), html.indexOf('</dialog>', at('id="syncPairingDialog"')));
  for (const id of ['syncPairingJoined', 'syncPairingJoinedTitle', 'syncPairingQuestion', 'syncPairingSpacesOn', 'syncPairingSpacesNotNow', 'syncPairingRecovery', 'syncPairingDone']) {
    assert.ok(sheet.includes(`id="${id}"`), `${id} is inside the sheet`);
  }
  assert.ok(js.includes('onSyncPairJoined('));
  assert.ok(js.includes('syncPairWatch('));
});

test('turning Spaces on from the sheet also ends the joined record in main', () => {
  const at = js.indexOf("effect?.type === 'spaces-turn-on'");
  assert.ok(at >= 0);
  assert.ok(js.slice(at, at + 400).includes('syncPairCancel()'));
});

// Design 2026-10-28 §6.1–§6.2: the QR and Connect your iPhone.
test('Connect your iPhone, the start state and the QR are in the page, and only shown when offered', () => {
  at('id="syncConnectIphone"');
  const sheet = html.slice(at('id="syncPairingDialog"'), html.indexOf('</dialog>', at('id="syncPairingDialog"')));
  for (const id of ['syncPairingStart', 'syncPairingContinue', 'syncPairingAddThisFirst', 'syncPairingStartRetry', 'syncPairingQr']) {
    assert.ok(sheet.includes(`id="${id}"`), `${id} is inside the sheet`);
  }
  assert.ok(html.includes('<script src="qr-code.js"></script>'));
  assert.ok(html.indexOf('<script src="qr-code.js"></script>') < html.indexOf('<script src="settings.js"></script>'));
  assert.ok(js.includes('status.iphonePairing'), 'the page asks main whether iPhone pairing is offered');
  assert.ok(js.includes('blancQrCode.encode('));
});

// Review fixes (design 2026-10-28 §6.2, §9).
test('every state of the sheet has a visible way out', () => {
  const sheet = html.slice(at('id="syncPairingDialog"'), html.indexOf('</dialog>', at('id="syncPairingDialog"')));
  const notReady = sheet.slice(sheet.indexOf('id="syncPairingNotReady"'), sheet.indexOf('</div>', sheet.indexOf('id="syncPairingNotReady"')));
  assert.ok(notReady.includes('id="syncPairingNotReadyCancel"'), 'not ready has its own Cancel');
  const making = sheet.slice(sheet.indexOf('id="syncPairingMaking"'), sheet.indexOf('</div>', sheet.indexOf('id="syncPairingMaking"')));
  assert.ok(making.includes('id="syncPairingMakingCancel"'), 'making a code has Cancel');
});

test('the iPhone wording and the QR stay hidden unless main offers iPhone pairing', () => {
  assert.match(html, /<button id="syncConnectIphone" type="button" hidden /);
  assert.match(html, /<svg id="syncPairingQr" class="sync-pairing-qr" hidden /);
  assert.match(js, /connectIphoneBtn\.hidden = !iphonePairing \|\| !canCreate;/);
  assert.match(js, /pairingQr\.hidden = !\(iphonePairing && pv\.showing\);/);
  assert.match(js, /iphonePairing = status\.iphonePairing === true;/);
  const pagesJs = fs.readFileSync(path.join(__dirname, '../../src/main/pages.js'), 'utf8');
  assert.match(pagesJs, /iphonePairing: hooks\.syncPairing\?\.offered\?\.\(\) === true,/, 'false without the hook');
});

test('the QR keeps its colors in forced-colors mode', () => {
  const css = fs.readFileSync(path.join(pages, 'pages.css'), 'utf8');
  const rule = css.slice(css.indexOf('.sync-pairing-qr {'), css.indexOf('}', css.indexOf('.sync-pairing-qr {')));
  assert.match(rule, /forced-color-adjust: none;/);
});
