'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  migrationChecklistState,
  migrationChecklistForTab,
} = require('../../src/main/migration-checklist');

test('migration checklist projects progress and every visibility gate', () => {
  const base = {
    firstRunComplete: true,
    dismissed: false,
    syncComplete: false,
    tabsComplete: false,
  };

  assert.deepEqual(migrationChecklistState(base), {
    visible: true,
    completedCount: 0,
    syncComplete: false,
    tabsComplete: false,
  });
  assert.deepEqual(migrationChecklistState({ ...base, syncComplete: true }), {
    visible: true,
    completedCount: 1,
    syncComplete: true,
    tabsComplete: false,
  });
  assert.deepEqual(migrationChecklistState({ ...base, tabsComplete: true }), {
    visible: true,
    completedCount: 1,
    syncComplete: false,
    tabsComplete: true,
  });
  assert.deepEqual(migrationChecklistState({ ...base, syncComplete: true, tabsComplete: true }), {
    visible: false,
    completedCount: 2,
    syncComplete: true,
    tabsComplete: true,
  });
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
