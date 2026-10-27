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

test('the on state opens with a summary, then this device, and keeps the error in one conditional callout', () => {
  const html = read('src/renderer/pages/settings.html');
  const on = html.slice(html.indexOf('<div id="syncActive" hidden>'), html.indexOf('id="group-profiles"'));
  // Two cards in the Settings card-and-row grammar: this sync and this device,
  // then the actions that add, move or remove devices.
  assert.match(on, /<div class="settings-card settings-card--mixed sync-overview">[\s\S]*<div class="settings-card settings-card--mixed sync-actions">/);
  assert.match(on, /<span class="sync-summary-label">Sync name<\/span>\s*<strong class="sync-summary-name" id="syncStatusHandle">/);
  assert.match(on, /<span class="sync-summary-meta"><span>Favorites and settings<\/span> <span class="sync-summary-when" id="syncStatusData"><\/span><\/span>/);
  // This device's name follows the summary: the Island never lists the device
  // you are on, so it is renamed here (island lower-section §7.1).
  assert.ok(on.indexOf('id="syncStatusHandle"') < on.indexOf('id="syncDeviceName"'));
  assert.ok(on.indexOf('id="syncDeviceName"') < on.indexOf('id="syncTabsShare"'));
  assert.match(on, /<label for="syncDeviceName">This device’s name<\/label>\s*<span class="hint" id="syncDeviceNameHint">How your other devices list this one\. Leave empty to use the computer’s name\.<\/span>\s*<\/div>\s*<input id="syncDeviceName" type="text" maxlength="80" autocomplete="off" spellcheck="false" aria-describedby="syncDeviceNameHint" \/>/);
  // The error and the retry for a pending erasure live in one callout.
  assert.match(on, /<div class="sync-error" id="syncStatusErrorRow" hidden>\s*<p><strong>Last error<\/strong> <span id="syncStatusError"><\/span><\/p>\s*<button id="syncEraseRetry" hidden>Try again<\/button>\s*<\/div>/);
  // Open-tab sharing is its switch; no status line repeats it.
  assert.doesNotMatch(html, /id="syncStatusTabs"/);
  const js = read('src/renderer/pages/settings.js');
  // The wording itself is covered behaviourally by relativeSyncTime's tests;
  // this only pins the wiring, including that no absolute timestamp is used.
  assert.match(js, /const lastSynced = relativeSyncTime\(status\.lastSyncedAt\);/);
  assert.match(js, /syncStatusData\.textContent = lastSynced \? t\('settings\.sync\.lastSynced', \{ when: lastSynced \}\) : t\('settings\.sync\.notSynced'\);/);
  assert.doesNotMatch(js, /toLocaleString\(\)[\s\S]{0,80}syncStatusData/);
  assert.doesNotMatch(js, /syncStatusTabs/);
  assert.match(js, /syncStatusErrorRow\.hidden = !status\.lastError/);
  assert.match(js, /if \(document\.activeElement !== deviceNameEl\) deviceNameEl\.value = status\.deviceName \|\| '';/,
    'a status refresh never overwrites a name being typed');
  assert.match(js, /deviceNameEl\.placeholder = status\.deviceNamePublished \|\| '';/);
  assert.match(js, /deviceNameEl\.addEventListener\('change',[\s\S]*?settings\.syncDeviceNameSet\(deviceNameEl\.value\)/);
});

test('the visual redesign preserves every established on-state control and handler', () => {
  const html = read('src/renderer/pages/settings.html');
  const js = read('src/renderer/pages/settings.js');

  assert.match(html, /<button id="syncNow">Sync now<\/button>/);
  // Each action is a row: a label and hint, then a short button that a screen
  // reader announces with the row's label and hint.
  assert.match(html, /<span id="syncAddDeviceLabel">Add another device<\/span>[\s\S]{0,400}?<button id="syncAddDevice" type="button" aria-describedby="syncAddDeviceLabel syncAddDeviceHint">Show code<\/button>/);
  assert.match(html, /<span id="syncSwitchLabel">Connect to a different sync with a code<\/span>[\s\S]{0,400}?<button id="syncSwitchOpen" type="button" aria-describedby="syncSwitchLabel syncSwitchHint">Enter code<\/button>/);
  assert.match(html, /<span id="syncRecoveryLabel">Recovery code<\/span>[\s\S]{0,500}?<button id="syncRecoveryCopy" type="button" aria-describedby="syncRecoveryLabel syncRecoveryHint">Copy<\/button>/);
  assert.match(html, /<span id="syncTurnOffLabel">Turn off sync<\/span>[\s\S]{0,500}?<input id="syncWipe" type="checkbox" \/> <span>Also delete synced data<\/span><\/label>\s*<\/div>\s*<button id="syncDisable" class="danger" aria-describedby="syncTurnOffLabel syncTurnOffHint">Turn off<\/button>/);
  assert.match(html, /<span id="syncTabsShareLabel">Share this device’s open tabs with your other devices<\/span>[\s\S]{0,120}?<label class="toggle"><input id="syncTabsShare" type="checkbox" aria-labelledby="syncTabsShareLabel" \/><span class="track"><\/span><\/label>/);
  // The pairing panel and the switch form open inside their own rows.
  assert.match(html, /<button id="syncAddDevice"[^>]*>[^<]*<\/button>\s*<div id="syncPairing" class="sync-panel sync-pairing" hidden>/);
  assert.match(html, /<button id="syncSwitchOpen"[^>]*>[^<]*<\/button>\s*<form id="syncSwitch" class="sync-panel sync-switch" hidden>/);

  assert.match(js, /nowBtn\.addEventListener\('click',[\s\S]*?settings\.syncNow\(\)/);
  assert.match(js, /disableBtn\.addEventListener\('click', \(\) => turnOff\(canWipeRemote && wipeEl\.checked\)\)/);
  assert.match(js, /eraseRetry\.addEventListener\('click', \(\) => turnOff\(true\)\)/);
  assert.match(js, /async function turnOff\(wipeRemote\)[\s\S]*?settings\.syncDisable\(\{ wipeRemote \}\)/);
  assert.match(js, /wipeEl\.checked = res\.ok \? false : wipeEl\.checked/,
    'a failed remote wipe stays selected for a safe retry');
  assert.match(js, /wipeEl\.closest\('label'\)\.hidden = !canWipeRemote/);
  assert.match(js, /tabsShareEl\.addEventListener\('change',[\s\S]*?settings\.syncTabsSet\(tabsShareEl\.checked\)/);
});

test('the shared Spaces control is a Settings row after the open-tabs switch', () => {
  const js = read('src/renderer/pages/settings-shared-spaces.js');
  assert.match(js, /anchor=document\.getElementById\('syncTabsShareSetting'\)/);
  assert.match(js, /row\.className='setting sync-action';row\.id='sharedSpacesControl'/);
  assert.match(js, /label\.className='toggle'/);
  assert.match(js, /toggle\.id='sharedSpacesToggle'/);
  assert.match(js, /anchor\.after\(row\)/);
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
