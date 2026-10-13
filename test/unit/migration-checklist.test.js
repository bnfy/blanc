'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  migrationChecklistState,
  migrationChecklistForTab,
  spaceTaskIntroduction,
} = require('../../src/main/migration-checklist');

test('migration checklist projects progress and every visibility gate', () => {
  const base = {
    firstRunComplete: true,
    dismissed: false,
    syncComplete: false,
    tabsComplete: false,
    spaceComplete: false,
  };

  const project = (extra) => migrationChecklistState({ ...base, ...extra });
  assert.deepEqual(project({}), { visible: true, completedCount: 0, syncComplete: false, tabsComplete: false, spaceComplete: false });
  assert.deepEqual(project({ syncComplete: true }), { visible: true, completedCount: 1, syncComplete: true, tabsComplete: false, spaceComplete: false });
  assert.deepEqual(project({ syncComplete: true, tabsComplete: true }), { visible: true, completedCount: 2, syncComplete: true, tabsComplete: true, spaceComplete: false });
  assert.deepEqual(project({ syncComplete: true, tabsComplete: true, spaceComplete: true }), { visible: false, completedCount: 3, syncComplete: true, tabsComplete: true, spaceComplete: true });
  assert.equal(migrationChecklistState({ ...base, firstRunComplete: false }).visible, false);
  assert.equal(migrationChecklistState({ ...base, dismissed: true }).visible, false);
  assert.equal(migrationChecklistState({}).visible, false, 'missing fields never show');
});

test('migration checklist is projected only to Personal non-private tabs', () => {
  const checklist = migrationChecklistState({
    firstRunComplete: true,
    dismissed: false,
    syncComplete: false,
    tabsComplete: false,
  });
  const personal = { profileId: 'personal', private: false };

  assert.deepEqual(migrationChecklistForTab(checklist, personal, 'personal'), checklist);
  assert.equal(migrationChecklistForTab(checklist, { profileId: 'work', private: false }, 'personal'), null);
  assert.equal(migrationChecklistForTab(checklist, { profileId: 'personal', private: true }, 'personal'), null);
  assert.equal(migrationChecklistForTab(checklist, undefined, 'personal'), null);
});

test('the third task never reopens a checklist that already retired', () => {
  const intro = (s) => spaceTaskIntroduction({ spaceChecklistIntroduced: false, migrationChecklistDismissed: false, syncMigrationCompleted: false, tabImportCompleted: false, ...s });
  assert.deepEqual(intro({}), { spaceChecklistIntroduced: true }, 'a checklist still showing gains the task');
  assert.deepEqual(intro({ syncMigrationCompleted: true, tabImportCompleted: true }), { spaceChecklistIntroduced: true, migrationChecklistDismissed: true }, 'a finished checklist stays retired');
  assert.deepEqual(intro({ migrationChecklistDismissed: true }), { spaceChecklistIntroduced: true });
  assert.equal(intro({ spaceChecklistIntroduced: true }), null, 'it runs once');
});
