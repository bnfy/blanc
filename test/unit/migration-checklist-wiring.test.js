'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '../..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('main projects and guards the checklist at both start-page send sites', () => {
  const main = read('src/main/main.js');

  assert.match(main, /migrationChecklist: migrationChecklistState\(\{\s*firstRunComplete: settings\.isFirstRunComplete\(\),\s*dismissed: current\.migrationChecklistDismissed,\s*syncComplete: current\.syncMigrationCompleted,\s*tabsComplete: current\.tabImportCompleted,/);
  assert.match(main, /migrationChecklist: migrationChecklistForTab\(\s*status\.migrationChecklist,\s*tab,\s*DEFAULT_PROFILE_ID,/);
  assert.match(main, /migrationChecklistFor: \(wc\) => migrationChecklistForTab\(\s*startPageStatus\(\)\.migrationChecklist,\s*tabs\.get\(tabIdByWebContentsId\.get\(wc\.id\)\),\s*DEFAULT_PROFILE_ID,/);
  assert.match(main, /dismissMigrationChecklist: \(\) => \{\s*settings\.setSettings\(\{ migrationChecklistDismissed: true \}\);\s*return true;/);
});

test('successful migration actions persist completion without a disable reset', () => {
  const main = read('src/main/main.js');
  const pages = read('src/main/pages.js');

  assert.match(main, /function completeTabImportSuccess\(sessionId\) \{[\s\S]{0,300}?settings\.setSettings\(\{ tabImportCompleted: true \}\);/);
  assert.match(pages, /const result = await sync\.enable\(payload \?\? \{\}\);[\s\S]{0,300}?if \(result\?\.status\?\.enabled === true\) settings\.setSettings\(\{ syncMigrationCompleted: true \}\);/);
  assert.doesNotMatch(pages, /sync-disable[\s\S]{0,240}?syncMigrationCompleted: false/);

  const startup = main.indexOf('// Mark the Sync migration task complete for profiles that already sync.');
  const fanout = main.indexOf('settings.onSettingsChanged((s) => {');
  const syncInit = main.indexOf('sync.init();');
  assert.ok(startup > 0 && fanout > 0 && syncInit > 0);
  assert.ok(startup < fanout && startup < syncInit, 'startup migration precedes windows/listeners');
  assert.match(main, /if \(sync\.status\(\)\.enabled && !settings\.getSettings\(\)\.syncMigrationCompleted\) \{\s*settings\.setSettings\(\{ syncMigrationCompleted: true \}\);/);
});

test('pages IPC and preload expose the checklist projection and dismissal only', () => {
  const main = read('src/main/main.js');
  const pages = read('src/main/pages.js');
  const preload = read('src/main/tab-preload.js');

  assert.match(pages, /migrationChecklist: hooks\.startPage\?\.migrationChecklistFor\?\.\(event\.sender\) \?\? null,/);
  assert.match(pages, /handle\('pages:start:migration-checklist-dismiss', 'newtab', \(\) => hooks\.startPage\?\.dismissMigrationChecklist\?\.\(\) === true\)/);
  assert.match(preload, /dismissMigrationChecklist: \(\) => invoke\('pages:start:migration-checklist-dismiss'\)/);
  assert.match(preload, /onUtilitySheetVisibility: \(callback\) =>/);
  assert.match(pages, /utilitySheetVisible: hooks\.startPage\?\.utilitySheetVisibleFor\?\.\(event\.sender\) === true/);
  assert.match(main, /pages:start:utility-sheet-visibility/);
  assert.doesNotMatch(pages, /syncNudge/);
  assert.doesNotMatch(preload, /syncNudge/);
});
