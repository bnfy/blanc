'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { shouldShowSyncNudge, syncNudgeForTab } = require('../../src/main/sync-nudge');

const root = path.resolve(__dirname, '../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('shouldShowSyncNudge: every clause gates', () => {
  const base = { firstRunComplete: true, syncEnabled: false, dismissed: false };
  assert.equal(shouldShowSyncNudge(base), true);
  assert.equal(shouldShowSyncNudge({ ...base, firstRunComplete: false }), false);
  assert.equal(shouldShowSyncNudge({ ...base, syncEnabled: true }), false);
  assert.equal(shouldShowSyncNudge({ ...base, dismissed: true }), false);
  assert.equal(shouldShowSyncNudge({}), false, 'missing fields never show');
});

test('syncNudgeForTab: Personal, non-private tabs only', () => {
  const personal = { profileId: 'personal', private: false };
  assert.equal(syncNudgeForTab(true, personal, 'personal'), true);
  assert.equal(syncNudgeForTab(true, { profileId: 'work-1', private: false }, 'personal'), false);
  assert.equal(syncNudgeForTab(true, { profileId: 'personal', private: true }, 'personal'), false);
  assert.equal(syncNudgeForTab(false, personal, 'personal'), false);
  assert.equal(syncNudgeForTab(true, undefined, 'personal'), false);
});

test('main projects syncNudge on the shared status and guards it per tab at both send sites', () => {
  const main = read('src/main/main.js');
  assert.match(main, /syncNudge: shouldShowSyncNudge\(\{\s*firstRunComplete: settings\.isFirstRunComplete\(\),\s*syncEnabled: sync\.status\(\)\.enabled,\s*dismissed: current\.syncNudgeDismissed,?\s*\}\)/);
  assert.match(main, /send\('pages:start:status', \{ \.\.\.status, syncNudge: syncNudgeForTab\(status\.syncNudge, tab, DEFAULT_PROFILE_ID\) \}\)/);
  assert.match(main, /syncNudgeFor: \(wc\) => syncNudgeForTab\(startPageStatus\(\)\.syncNudge, tabs\.get\(tabIdByWebContentsId\.get\(wc\.id\)\), DEFAULT_PROFILE_ID\)/);
  assert.match(main, /dismissSyncNudge: \(\) => \{\s*settings\.setSettings\(\{ syncNudgeDismissed: true \}\);\s*return true;\s*\}/);
  assert.match(main, /openSettingsSection: \(section\) => openSettingsSection\(String\(section \?\? ''\)\)/);
  // Startup setter for profiles that enabled sync before this release. It
  // must run before any window exists and before sync.init() registers its
  // settings listener — i.e. before the settings fan-out block, not after.
  const setter = main.indexOf('// Retire the start-page sync card for profiles that already sync.');
  const fanout = main.indexOf('settings.onSettingsChanged((s) => {');
  const syncInit = main.indexOf('sync.init();');
  assert.ok(setter > 0 && fanout > 0 && syncInit > 0);
  assert.ok(setter < fanout && setter < syncInit, 'startup setter runs before fan-out and sync.init()');
  assert.match(main, /\/\/ Retire the start-page sync card for profiles that already sync\.[\s\S]{0,600}?if \(sync\.status\(\)\.enabled && !settings\.getSettings\(\)\.syncNudgeDismissed\) \{\s*settings\.setSettings\(\{ syncNudgeDismissed: true \}\);\s*\}/);
});

test('pages.js wires the data field, the enable-side flag, and the two start handlers', () => {
  const pages = read('src/main/pages.js');
  assert.match(pages, /syncNudge: hooks\.startPage\?\.syncNudgeFor\?\.\(event\.sender\) \?\? false,/);
  // Comment lines may sit between the call and the flag write. Strip them and
  // match the code alone: consuming them inline needs a nested quantifier,
  // which backtracks exponentially on adversarial input (CodeQL js/redos).
  const code = pages.replace(/^[ \t]*\/\/[^\n]*$/gm, '');
  assert.match(code, /const result = await sync\.enable\(payload \?\? \{\}\);\s*if \(result\?\.status\?\.enabled === true\) settings\.setSettings\(\{ syncNudgeDismissed: true \}\);\s*return result;/);
  assert.match(pages, /handle\('pages:start:open-settings', 'newtab', \(section\) => hooks\.startPage\?\.openSettingsSection\?\.\(section\)\)/);
  assert.match(pages, /handle\('pages:start:sync-nudge-dismiss', 'newtab', \(\) => hooks\.startPage\?\.dismissSyncNudge\?\.\(\) === true\)/);
  const preload = read('src/main/tab-preload.js');
  assert.match(preload, /openSettings: \(section\) => invoke\('pages:start:open-settings', section\)/);
  assert.match(preload, /dismissSyncNudge: \(\) => invoke\('pages:start:sync-nudge-dismiss'\)/);
});
