'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('Sync is the second Settings group in nav and content order', () => {
  const html = read('src/renderer/pages/settings.html');
  const navOrder = [...html.matchAll(/data-group="([a-z]+)"/g)].map((m) => m[1]);
  assert.deepEqual(navOrder.slice(0, 2), ['general', 'sync']);
  const sectionOrder = [...html.matchAll(/<section class="settings-group" id="group-([a-z]+)"/g)].map((m) => m[1]);
  assert.deepEqual(sectionOrder.slice(0, 2), ['general', 'sync']);
});

test('the off state offers two explicit paths and a not-found choice', () => {
  const html = read('src/renderer/pages/settings.html');
  assert.match(html, /<button id="syncPathStart" type="button">Start syncing from this device<\/button>/);
  assert.match(html, /<button id="syncPathJoin" type="button" class="quiet">I already sync on another device<\/button>/);
  assert.match(html, /<button id="syncTryAgain" type="button">Try again<\/button>/);
  assert.match(html, /<button id="syncStartNew" type="button" class="quiet">Start a new sync with these<\/button>/);
  assert.match(html, /Nothing was found under that name and passphrase\. Check for typos, including capital letters, then try again\./);
  assert.match(html, /Sync your favorites and settings across your devices, and, if you choose, open tabs\.\s+End-to-end encrypted\./);
  assert.match(html, /Blanc can’t read it/);
  assert.doesNotMatch(html, /can recover|tamper|never lose/i);
});

test('the on state lists categories and keeps the error in one conditional row', () => {
  const html = read('src/renderer/pages/settings.html');
  assert.match(html, /<dt>Sync name<\/dt><dd id="syncStatusHandle">/);
  assert.match(html, /<dt>Favorites and settings<\/dt><dd id="syncStatusData">/);
  assert.match(html, /<dt>This device’s open tabs<\/dt><dd id="syncStatusTabs">/);
  assert.match(html, /<div id="syncStatusErrorRow" hidden><dt>Last error<\/dt><dd id="syncStatusError">/);
  const js = read('src/renderer/pages/settings.js');
  assert.match(js, /syncStatusData\.textContent = status\.lastSyncedAt \? `Last synced \$\{when\(status\.lastSyncedAt\)\}` : 'Not synced yet'/);
  assert.match(js, /syncStatusErrorRow\.hidden = !status\.lastError/);
});

test('settings.js drives the flow through the reducer and performs effects once', () => {
  const html = read('src/renderer/pages/settings.html');
  assert.match(html, /<script src="settings-sync-setup-model\.js"><\/script>\s*<script src="settings\.js"><\/script>/);
  const js = read('src/renderer/pages/settings.js');
  assert.match(js, /const \{ createSyncSetupModel, transition, view \} = window\.blancSyncSetupModel/);
  assert.match(js, /function dispatch\(event\) \{[\s\S]*?const \{ state: next, effect \} = transition\(model, event\)/);
  assert.match(js, /if \(effect\?\.type === 'preflight'\)/);
  assert.match(js, /if \(effect\?\.type === 'enable'\)/);
  assert.match(js, /effect\.path === 'join'/, 'result copy derives from the effect, not live state');
  assert.doesNotMatch(js, /model\.path === 'join'/);
  assert.match(js, /type: 'enable-reply', token: effect\.token/);
  // enable is only ever reached through a dispatched effect.
  assert.equal((js.match(/settings\.syncEnable\(/g) ?? []).length, 1);
  assert.doesNotMatch(js, /Profile Sync/);
});

test('user-facing settings copy no longer says Profile Sync', () => {
  assert.doesNotMatch(read('src/renderer/pages/settings.html'), /Profile Sync/);
});
