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

test('the on state lists categories and keeps the error in one conditional row', () => {
  const html = read('src/renderer/pages/settings.html');
  assert.match(html, /<dt>Sync name<\/dt><dd id="syncStatusHandle">/);
  // This device's name sits right after Sync name: the Island never lists
  // the device you are on, so it is renamed here (island lower-section §7.1).
  assert.match(html, /<dd id="syncStatusHandle"><\/dd><\/div>\s*<div><dt><label for="syncDeviceName">This device’s name<\/label><\/dt><dd><input id="syncDeviceName" type="text" maxlength="80" autocomplete="off" spellcheck="false" aria-describedby="syncDeviceNameHint" \/><span class="sync-device-name-hint" id="syncDeviceNameHint">How your other devices list this one\. Leave empty to use the computer’s name\.<\/span><\/dd><\/div>/);
  assert.match(html, /<dt>Favorites and settings<\/dt><dd id="syncStatusData">/);
  assert.match(html, /<dt>This device’s open tabs<\/dt><dd id="syncStatusTabs">/);
  assert.match(html, /<div id="syncStatusErrorRow" hidden><dt>Last error<\/dt><dd id="syncStatusError">/);
  const js = read('src/renderer/pages/settings.js');
  // The wording itself is covered behaviourally by relativeSyncTime's tests;
  // this only pins the wiring, including that no absolute timestamp is used.
  assert.match(js, /const lastSynced = relativeSyncTime\(status\.lastSyncedAt\);/);
  assert.match(js, /syncStatusData\.textContent = lastSynced \? t\('settings\.sync\.lastSynced', \{ when: lastSynced \}\) : t\('settings\.sync\.notSynced'\);/);
  assert.doesNotMatch(js, /toLocaleString\(\)[\s\S]{0,80}syncStatusData/);
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
  assert.match(html, /<button id="syncDisable" class="danger">Turn off sync<\/button>/);
  assert.match(html, /<input id="syncWipe" type="checkbox" \/> <span>also delete synced data<\/span>/);
  assert.match(html, /<input id="syncTabsShare" type="checkbox" \/> <span>share this device’s open tabs with your other devices<\/span>/);

  assert.match(js, /nowBtn\.addEventListener\('click',[\s\S]*?settings\.syncNow\(\)/);
  assert.match(js, /disableBtn\.addEventListener\('click',[\s\S]*?settings\.syncDisable\(\{ wipeRemote: wipeEl\.checked \}\)/);
  assert.match(js, /wipeEl\.checked = res\.ok \? false : wipeEl\.checked/,
    'a failed remote wipe stays selected for a safe retry');
  assert.match(js, /tabsShareEl\.addEventListener\('change',[\s\S]*?settings\.syncTabsSet\(tabsShareEl\.checked\)/);
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
  assert.doesNotMatch(js, /model\.path === 'join'/);
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
