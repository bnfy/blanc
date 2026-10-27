'use strict';

const assert = require('node:assert/strict');
const { withoutInterfaceKeys } = require('../support/without-interface-keys');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '../..');
const read = (p) => withoutInterfaceKeys(fs.readFileSync(path.join(root, p), 'utf8'));

test('Sync is the second Settings group in nav and content order', () => {
  const html = read('src/renderer/pages/settings.html');
  const navOrder = [...html.matchAll(/data-group="([a-z]+)"/g)].map((m) => m[1]);
  assert.deepEqual(navOrder.slice(0, 2), ['general', 'sync']);
  const sectionOrder = [...html.matchAll(/<section class="settings-group" id="group-([a-z]+)"/g)].map((m) => m[1]);
  assert.deepEqual(sectionOrder.slice(0, 2), ['general', 'sync']);
});

test('the off state offers two explicit paths and a not-found choice', () => {
  const html = read('src/renderer/pages/settings.html');
  // Design 2026-10-16 §4.2: adding a device with a code comes first; the
  // name-and-passphrase join path is reached from inside that step.
  assert.match(html, /id="syncPathCode"[\s\S]{0,900}?Add this device to my sync/);
  assert.match(html, /id="syncPathStart"[\s\S]{0,900}?Start syncing from this device/);
  assert.ok(html.indexOf('id="syncPathCode"') < html.indexOf('id="syncPathStart"'));
  assert.match(html, /id="syncUsePassphrase"[\s\S]{0,200}?Use my sync name and passphrase instead/);
  assert.match(html, /<button id="syncTryAgain" type="button">Try again<\/button>/);
  assert.match(html, /<button id="syncStartNew" type="button" class="quiet">Start a new sync with these<\/button>/);
  assert.match(html, /Nothing was found under that name and passphrase\. Check for typos, including capital letters, then try again\./);
  assert.match(html, /Sync your favorites, settings and device names across your devices, and, if you choose, open tabs\.\s+Everything is end-to-end encrypted/);
  assert.match(html, /Blanc can’t read it/);
  assert.doesNotMatch(html, /can recover|tamper|never lose/i);
});

test('the setup form follows the selected three-step visual guide', () => {
  const html = read('src/renderer/pages/settings.html');
  const css = read('src/renderer/pages/pages.css');
  const js = read('src/renderer/pages/settings.js');

  assert.match(html, /id="syncSetupTitle"/);
  assert.match(html, /id="syncSetupIntro"/);
  assert.match(html, /class="sync-guide"/);
  assert.match(html, /class="sync-guide-step"[\s\S]*?data-step="1"[\s\S]*?data-step="2"[\s\S]*?data-step="3"/);
  assert.match(html, /Your passphrase stays on your devices\. It’s never sent to Blanc\./);
  assert.match(html, /class="sync-guide-icon"[^>]*aria-hidden="true"/);
  assert.match(css, /\.sync-guide-step::before/);
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*?\.sync-guide-step/);
  assert.match(js, /setupTitle\.textContent = v\.setupTitle/);
  assert.match(js, /setupIntro\.textContent = v\.setupIntro/);
  assert.match(js, /new ResizeObserver\(scheduleUpdate\)/, 'dynamic setup height keeps the Sync nav item selected');
  assert.match(js, /anchoredGroup = activeGroups\.find\([\s\S]*?location\.hash/,
    'a deep-linked Sync sheet keeps the Sync navigation marker');
});

test('the on state leads with who you are and what syncs, then devices, then more options', () => {
  const html = read('src/renderer/pages/settings.html');
  const on = html.slice(html.indexOf('<div id="syncActive" hidden>'), html.indexOf('id="group-profiles"'));
  // Redesign 2026-10-27: the common path first, rarer actions one level deeper.
  const order = ['class="settings-card sync-hero"', 'class="settings-card sync-devices-card"', '<details class="settings-card sync-more">', '<dialog class="sync-sheet" id="syncPairingDialog"'];
  const at = order.map((needle) => on.indexOf(needle));
  assert.ok(at.every((i) => i >= 0), JSON.stringify(at));
  assert.deepEqual([...at].sort((a, b) => a - b), at, 'hero, devices, more options, then the Add device sheet');
  // Identity: monogram, sync name, a status dot and the last sync.
  assert.match(on, /<span class="sync-avatar" id="syncAvatar" aria-hidden="true"><\/span>/);
  assert.match(on, /<span class="page-sr-only">Sync name<\/span>\s*<strong class="sync-hero-name" id="syncStatusHandle">/);
  assert.match(on, /<span class="sync-hero-status" id="syncStatusLine"><span class="sync-status-dot" aria-hidden="true"><\/span><span id="syncStatusData"><\/span><\/span>/);
  // The error and the retry for a pending erasure live in one callout.
  assert.match(on, /<div class="sync-error" id="syncStatusErrorRow" hidden>\s*<p><strong>Last error<\/strong> <span id="syncStatusError"><\/span><\/p>\s*<button id="syncEraseRetry" hidden>Try again<\/button>\s*<\/div>/);
  // What syncs: Favorites and Settings always; Open tabs is this device's switch.
  assert.match(on, /<span class="sync-what-label">Favorites<\/span><span class="sync-what-state">Always on<\/span>/);
  assert.match(on, /<span class="sync-what-label">Settings<\/span><span class="sync-what-state">Always on<\/span>/);
  assert.match(on, /<label class="sync-what sync-what-toggle" id="syncTabsShareSetting" role="listitem">[\s\S]*?<span class="toggle"><input id="syncTabsShare" type="checkbox" aria-labelledby="syncTabsShareLabel" aria-describedby="syncTabsShareHint" \/><span class="track"><\/span><\/span>\s*<\/label>/);
  assert.doesNotMatch(html, /id="syncStatusTabs"/);
  // Devices: this device first, its name the field; others are drawn by settings.js.
  assert.match(on, /<li class="sync-device sync-device-self">[\s\S]*?<input id="syncDeviceName" class="sync-device-name" type="text" maxlength="80" autocomplete="off" spellcheck="false" aria-label="This device’s name" aria-describedby="syncDeviceNameHint" \/>[\s\S]*?<span class="sync-badge">This device<\/span>/);
  assert.match(on, /<span class="sync-device-name-hint" id="syncDeviceNameHint">How your other devices list this one\. Leave empty to use the computer’s name\.<\/span>/);
  assert.match(on, /<p class="sync-devices-missing">Don’t see a device\? Update Blanc on it, or turn on Open tabs there\.<\/p>/);
  const js = read('src/renderer/pages/settings.js');
  // The wording itself is covered behaviourally by relativeSyncTime's tests;
  // this only pins the wiring, including that no absolute timestamp is used.
  assert.match(js, /const lastSynced = relativeSyncTime\(status\.lastSyncedAt\);/);
  assert.match(js, /syncStatusData\.textContent = lastSynced \? t\('settings\.sync\.lastSynced', \{ when: lastSynced \}\) : t\('settings\.sync\.notSynced'\);/);
  assert.doesNotMatch(js, /toLocaleString\(\)[\s\S]{0,80}syncStatusData/);
  assert.match(js, /statusLine\.dataset\.state = status\.lastError \? 'error' : \(lastSynced \? 'ok' : 'pending'\);/);
  assert.match(js, /syncStatusErrorRow\.hidden = !status\.lastError/);
  assert.match(js, /if \(document\.activeElement !== deviceNameEl\) deviceNameEl\.value = status\.deviceName \|\| '';/,
    'a status refresh never overwrites a name being typed');
  assert.match(js, /deviceNameEl\.placeholder = status\.deviceNamePublished \|\| '';/);
  assert.match(js, /deviceNameEl\.addEventListener\('change',[\s\S]*?settings\.syncDeviceNameSet\(deviceNameEl\.value\)/);
});

test('the device list renders names as text from the Settings bridge, never ids', () => {
  const js = read('src/renderer/pages/settings.js');
  assert.match(js, /listed = await window\.bowserPages\.settings\.syncDevices\(\);/);
  assert.match(js, /if \(request !== devicesRequest \|\| !listed\) return;/, 'a late reply never overwrites a newer list');
  assert.match(js, /name\.textContent = device\.name;/);
  assert.doesNotMatch(js, /innerHTML[\s\S]{0,40}device\.name/);
  assert.doesNotMatch(js, /device\.(id|deviceId)/);
  assert.match(js, /drawDeviceIcon\(icon, device\.platform\)/);
});

test('the visual redesign preserves every established on-state control and handler', () => {
  const html = read('src/renderer/pages/settings.html');
  const js = read('src/renderer/pages/settings.js');

  assert.match(html, /<button id="syncNow">Sync now<\/button>/);
  assert.match(html, /<button id="syncAddDevice" type="button" class="sync-add">Add device<\/button>/);
  // More options: each rarer action is a row with a short button that a screen
  // reader announces with the row's label and hint.
  const more = html.slice(html.indexOf('<details class="settings-card sync-more">'), html.indexOf('</details>'));
  assert.match(more, /<span class="sync-more-title">More options<\/span>/);
  assert.match(more, /<span id="syncSwitchLabel">Connect to a different sync with a code<\/span>[\s\S]{0,400}?<button id="syncSwitchOpen" type="button" aria-describedby="syncSwitchLabel syncSwitchHint">Enter code<\/button>/);
  assert.match(more, /<span id="syncRecoveryLabel">Recovery code<\/span>[\s\S]{0,500}?<button id="syncRecoveryCopy" type="button" aria-describedby="syncRecoveryLabel syncRecoveryHint">Copy<\/button>/);
  assert.match(more, /<span id="syncTurnOffLabel">Turn off sync<\/span>[\s\S]{0,500}?<input id="syncWipe" type="checkbox" \/> <span>Also delete synced data<\/span><\/label>\s*<\/div>\s*<button id="syncDisable" class="danger" aria-describedby="syncTurnOffLabel syncTurnOffHint">Turn off<\/button>/);
  assert.match(more, /<button id="syncSwitchOpen"[^>]*>[^<]*<\/button>\s*<form id="syncSwitch" class="sync-panel sync-switch" hidden>/);
  // The pairing code is a modal sheet; its notice stays in the Devices card,
  // so an expired or failed code is still explained after the sheet closes.
  assert.match(html, /<dialog class="sync-sheet" id="syncPairingDialog" aria-labelledby="syncPairingTitle">\s*<div id="syncPairing" class="sync-pairing" hidden>/);
  assert.ok(html.indexOf('id="syncPairingNotice"') < html.indexOf('id="syncPairingDialog"'));
  assert.match(js, /if \(pv\.showing && !pairingDialog\.open\) pairingDialog\.showModal\(\);\s*if \(!pv\.showing && pairingDialog\.open\) pairingDialog\.close\(\);/);
  assert.match(js, /pairingDialog\.addEventListener\('cancel', \(event\) => \{ event\.preventDefault\(\); dispatchPairing\(\{ type: 'cancel' \}\); \}\);/);

  assert.match(js, /nowBtn\.addEventListener\('click',[\s\S]*?settings\.syncNow\(\)/);
  assert.match(js, /disableBtn\.addEventListener\('click', \(\) => turnOff\(canWipeRemote && wipeEl\.checked\)\)/);
  assert.match(js, /eraseRetry\.addEventListener\('click', \(\) => turnOff\(true\)\)/);
  assert.match(js, /async function turnOff\(wipeRemote\)[\s\S]*?settings\.syncDisable\(\{ wipeRemote \}\)/);
  assert.match(js, /wipeEl\.checked = res\.ok \? false : wipeEl\.checked/,
    'a failed remote wipe stays selected for a safe retry');
  assert.match(js, /wipeEl\.closest\('label'\)\.hidden = !canWipeRemote/);
  assert.match(js, /tabsShareEl\.addEventListener\('change',[\s\S]*?settings\.syncTabsSet\(tabsShareEl\.checked\)/);
});

test('the shared Spaces control is a What syncs tile beside Open tabs, its note under the grid', () => {
  const js = read('src/renderer/pages/settings-shared-spaces.js');
  assert.match(js, /anchor=document\.getElementById\('syncTabsShareSetting'\)/);
  assert.match(js, /tile\.className='sync-what sync-what-toggle';tile\.id='sharedSpacesTile'/);
  assert.match(js, /toggle\.id='sharedSpacesToggle'/);
  assert.match(js, /anchor\.after\(tile\)/);
  // The acceptance steps read the unavailable notice from #sharedSpacesControl.
  assert.match(js, /row\.className='sync-what-note';row\.id='sharedSpacesControl'/);
  assert.match(js, /row\.append\(detail,note\);anchor\.parentElement\.after\(row\)/);
});

test('settings.js drives the flow through the reducer and performs effects once', () => {
  const html = read('src/renderer/pages/settings.html');
  assert.match(html, /<script src="settings-sync-setup-model\.js"><\/script>\s*<script src="settings-sync-pairing-model\.js"><\/script>\s*<script src="settings\.js"><\/script>/);
  const js = read('src/renderer/pages/settings.js');
  assert.match(js, /const \{ createSyncSetupModel, transition, view, relativeSyncTime \} = window\.blancSyncSetupModel/);
  assert.match(js, /function dispatch\(event\) \{[\s\S]*?const \{ state: next, effect \} = transition\(model, event\)/);
  assert.match(js, /if \(effect\?\.type === 'preflight'\)/);
  assert.match(js, /if \(effect\?\.type === 'enable'\)/);
  assert.match(js, /effect\.path === 'join'/, 'result copy derives from the effect, not live state');
  const enableEffect = js.slice(js.indexOf('async function performEnable('), js.indexOf('async function performPreflight('));
  assert.ok(enableEffect.length > 0);
  assert.doesNotMatch(enableEffect, /model\.path === 'join'/, 'async enable copy must use its captured effect; synchronous field labels may use the current model');
  assert.match(js, /type: 'enable-reply', token: effect\.token/);
  // A failed enable never becomes a transient note: the error belongs to the
  // Last error row (persisted credentials) or the reducer's notice (not).
  assert.match(js, /: t\('settings\.sync\.on'\)\)\s*: null;/);
  assert.doesNotMatch(js, /: res\.message;/);
  // enable is only ever reached through a dispatched effect.
  assert.equal((js.match(/settings\.syncEnable\(/g) ?? []).length, 1);
  assert.doesNotMatch(js, /Profile Sync/);
});

test('user-facing settings copy no longer says Profile Sync', () => {
  assert.doesNotMatch(read('src/renderer/pages/settings.html'), /Profile Sync/);
});
