'use strict';

// Spaces across profiles (spec 2026-11-19 §5.2): the part of the Spaces
// payload that crosses into another profile's window, and only its
// allowlisted fields.
const test = require('node:test');
const assert = require('node:assert/strict');
const { otherProfileSpaces, UNREADABLE_STATUSES } = require('../../src/main/spaces-across-profiles');

const PROFILES = [{ id: 'default', name: 'Personal' }, { id: 'w', name: 'Work' }, { id: 's', name: 'Studio' }];
const record = (id, extra = {}) => ({
  id, name: `Space ${id}`, profileId: 'w', color: '#426c4c', symbol: 'briefcase',
  urls: ['https://private.example/inbox', 'https://private.example/doc'],
  meta: [{ title: 'Inbox — secret', favicon: 'data:x' }, { title: 'Doc', favicon: '' }],
  groups: [{ id: 'g', name: 'Payroll' }], groupIds: ['g', null], pinned: [], activeIndex: 0, ...extra,
});
const reader = (byProfile) => (id) => byProfile[id] ?? { status: 'saved', spaces: [], shownIds: new Set() };
const run = (overrides = {}) => otherProfileSpaces({
  profiles: PROFILES, currentProfileId: 'default', isLive: () => true, readProfile: reader({}), ...overrides,
});

test('returns nothing with one live profile', () => {
  assert.deepEqual(run({ profiles: [PROFILES[0]] }), []);
  assert.deepEqual(run({ profiles: PROFILES.slice(0, 2), isLive: (id) => id !== 'w' }), []);
});

test('lists other live profiles in Settings order, never the current one', () => {
  assert.deepEqual(run().map((p) => p.id), ['w', 's']);
  assert.deepEqual(run({ currentProfileId: 'w' }).map((p) => p.id), ['default', 's']);
  assert.deepEqual(run({ isLive: (id) => id !== 's' }).map((p) => p.name), ['Work']);
});

test('an item carries only the allowlisted fields', () => {
  const spaces = [record('a', { sharedId: 'f'.repeat(32), sharedLink: 'active' })];
  const [work] = run({ readProfile: reader({ w: { status: 'saved', spaces, shownIds: new Set() } }) });
  assert.deepEqual(Object.keys(work.items[0]).sort(), ['color', 'id', 'name', 'openElsewhere', 'symbol', 'tabCount']);
  assert.equal(work.items[0].tabCount, 2);
  const text = JSON.stringify(run({ readProfile: reader({ w: { status: 'saved', spaces, shownIds: new Set() } }) }));
  for (const leak of ['private.example', 'secret', 'Payroll', 'data:x', 'f'.repeat(32)]) assert.ok(!text.includes(leak), `${leak} crossed profiles`);
});

test('openElsewhere follows shownIds', () => {
  const spaces = [record('a'), record('b')];
  const [work] = run({ readProfile: reader({ w: { status: 'saved', spaces, shownIds: new Set(['b']) } }) });
  assert.deepEqual(work.items.map((i) => [i.id, i.openElsewhere]), [['a', false], ['b', true]]);
});

test('an unreadable profile keeps its heading with no items', () => {
  assert.deepEqual(UNREADABLE_STATUSES, ['read-failed', 'future-format', 'repair-failed']);
  for (const status of UNREADABLE_STATUSES) {
    const [work] = run({ readProfile: reader({ w: { status, spaces: [record('a')], shownIds: new Set() } }) });
    assert.deepEqual({ status: work.status, items: work.items }, { status, items: [] });
  }
});

test('full matches the store: 25 Spaces of any kind', () => {
  const many = (n, extra = {}) => Array.from({ length: n }, (_, i) => record(`r${i}`, extra));
  const full = (spaces) => run({ readProfile: reader({ w: { status: 'saved', spaces, shownIds: new Set() } }) })[0].full;
  assert.equal(full(many(25)), true);
  assert.equal(full(many(24)), false);
  assert.equal(full([...many(22), ...many(3, { sharedId: 'a'.repeat(32) }).map((r, i) => ({ ...r, id: `s${i}` }))]), true,
    'createWorkspace refuses at 25 records, shared ones included');
});

test('keeps empty profiles, for the editor\'s Profile choice', () => {
  const work = run().find((p) => p.id === 'w');
  assert.deepEqual(work, { id: 'w', name: 'Work', status: 'saved', full: false, items: [] });
});
