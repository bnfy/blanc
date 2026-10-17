'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  migrationChecklistState,
  migrationChecklistForTab,
  spaceTaskIntroduction,
  defaultTaskIntroduction,
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
  const without = { taskCount: 3, defaultAvailable: false, defaultComplete: false };
  assert.deepEqual(project({}), { visible: true, completedCount: 0, ...without, syncComplete: false, tabsComplete: false, spaceComplete: false });
  assert.deepEqual(project({ syncComplete: true }), { visible: true, completedCount: 1, ...without, syncComplete: true, tabsComplete: false, spaceComplete: false });
  assert.deepEqual(project({ syncComplete: true, tabsComplete: true }), { visible: true, completedCount: 2, ...without, syncComplete: true, tabsComplete: true, spaceComplete: false });
  assert.deepEqual(project({ syncComplete: true, tabsComplete: true, spaceComplete: true }), { visible: false, completedCount: 3, ...without, syncComplete: true, tabsComplete: true, spaceComplete: true });
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

test('someone who already has a space finds the new task already done', () => {
  const intro = (s, ctx) => spaceTaskIntroduction({ spaceChecklistIntroduced: false, migrationChecklistDismissed: false, syncMigrationCompleted: false, tabImportCompleted: false, ...s }, ctx);
  assert.deepEqual(intro({}, { hasSpaces: true }), { spaceChecklistIntroduced: true, spaceMigrationCompleted: true });
  assert.deepEqual(intro({}, { hasSpaces: false }), { spaceChecklistIntroduced: true });
});

test('the default-browser task counts only where Blanc can ask the OS', () => {
  const base = { firstRunComplete: true, dismissed: false, syncComplete: true, tabsComplete: true, spaceComplete: true };
  const withTask = migrationChecklistState({ ...base, defaultAvailable: true, defaultComplete: false });
  assert.equal(withTask.taskCount, 4);
  assert.equal(withTask.completedCount, 3);
  assert.equal(withTask.visible, true, 'three of four done keeps the checklist up');
  const done = migrationChecklistState({ ...base, defaultAvailable: true, defaultComplete: true });
  assert.deepEqual([done.completedCount, done.taskCount, done.visible, done.defaultComplete], [4, 4, false, true]);
  const unavailable = migrationChecklistState({ ...base, defaultAvailable: false, defaultComplete: true });
  assert.deepEqual([unavailable.completedCount, unavailable.taskCount, unavailable.defaultComplete], [3, 3, false],
    'a stored completion never counts where the task is not shown');
});

test('the default-browser task never reopens a checklist that already retired', () => {
  const intro = (s) => defaultTaskIntroduction({ defaultChecklistIntroduced: false, migrationChecklistDismissed: false, syncMigrationCompleted: false, tabImportCompleted: false, spaceMigrationCompleted: false, ...s });
  assert.deepEqual(intro({}), { defaultChecklistIntroduced: true }, 'a checklist still showing gains the task');
  assert.deepEqual(intro({ syncMigrationCompleted: true, tabImportCompleted: true }), { defaultChecklistIntroduced: true },
    'two of three done is still a checklist in progress');
  assert.deepEqual(intro({ syncMigrationCompleted: true, tabImportCompleted: true, spaceMigrationCompleted: true }),
    { defaultChecklistIntroduced: true, migrationChecklistDismissed: true }, 'a finished checklist stays retired');
  assert.equal(intro({ defaultChecklistIntroduced: true }), null, 'it runs once');
});
