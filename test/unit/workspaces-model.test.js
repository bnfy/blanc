// test/unit/workspaces-model.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const {
  WORKSPACES_VERSION,
  MAX_WORKSPACES,
  MAX_NAME_LENGTH,
  EMPTY_FILE,
  sanitizeName,
  normalizeWorkspace,
  normalizeFile,
  createWorkspace,
  renameWorkspace,
  deleteWorkspace,
  updateCapture,
  listForProfile,
} = require('../../src/main/workspaces-model');

const VALID = () => ({
  id: 'ws_1',
  name: 'Work',
  profileId: 'default',
  createdAt: 100,
  updatedAt: 200,
  urls: ['https://a.test/', 'https://b.test/'],
  activeIndex: 1,
  groups: [{ id: 'g1', name: 'research', collapsed: false }],
  groupIds: ['g1', null],
  pinned: [true, false],
  meta: [{ title: 'A', favicon: null }, { title: 'B', favicon: null }],
});

test('EMPTY_FILE is a versioned, empty, non-shared shape', () => {
  const a = EMPTY_FILE();
  assert.deepEqual(a, { version: WORKSPACES_VERSION, workspaces: [] });
  assert.equal(WORKSPACES_VERSION, 1);
  // A fresh object each call — a shared default would let one profile's
  // store mutate another's.
  const b = EMPTY_FILE();
  a.workspaces.push('x');
  assert.deepEqual(b.workspaces, []);
});

test('sanitizeName trims, collapses whitespace, caps length, rejects empty', () => {
  assert.equal(sanitizeName('  Work  '), 'Work');
  assert.equal(sanitizeName('Deep   Work\tnow'), 'Deep Work now');
  assert.equal(sanitizeName('x'.repeat(MAX_NAME_LENGTH + 20)).length, MAX_NAME_LENGTH);
  assert.equal(sanitizeName(''), null);
  assert.equal(sanitizeName('   '), null);
  assert.equal(sanitizeName(null), null);
  assert.equal(sanitizeName(42), null);
});

test('normalizeWorkspace round-trips a fully valid record', () => {
  assert.deepEqual(normalizeWorkspace(VALID()), VALID());
});

test('normalizeWorkspace rejects bad id, name, and profileId', () => {
  assert.equal(normalizeWorkspace({ ...VALID(), id: '' }), null);
  assert.equal(normalizeWorkspace({ ...VALID(), id: 42 }), null);
  assert.equal(normalizeWorkspace({ ...VALID(), name: '   ' }), null);
  assert.equal(normalizeWorkspace({ ...VALID(), name: null }), null);
  assert.equal(normalizeWorkspace({ ...VALID(), profileId: 'not a valid id!' }), null);
  assert.equal(normalizeWorkspace({ ...VALID(), urls: 'nope' }), null);
  assert.equal(normalizeWorkspace(null), null);
  assert.equal(normalizeWorkspace('nope'), null);
});

test('normalizeWorkspace sanitizes the stored name', () => {
  assert.equal(normalizeWorkspace({ ...VALID(), name: '  Deep   Work  ' }).name, 'Deep Work');
});

test('normalizeWorkspace coerces parallel columns and drops mismatched meta', () => {
  // meta must zip onto urls; a mismatch means a writer moved the URL column,
  // so the record survives but its meta is dropped (same rule session
  // restore enforces).
  const mismatched = normalizeWorkspace({ ...VALID(), meta: [{ title: 'only one', favicon: null }] });
  assert.notEqual(mismatched, null);
  assert.deepEqual(mismatched.meta, []);
  // non-array columns become arrays rather than rejecting the record
  const coerced = normalizeWorkspace({ ...VALID(), groups: 'x', groupIds: null, pinned: 7, meta: 'x' });
  assert.deepEqual(coerced.groups, []);
  assert.deepEqual(coerced.groupIds, []);
  assert.deepEqual(coerced.pinned, []);
  assert.deepEqual(coerced.meta, []);
  // a non-integer activeIndex falls back to 0
  assert.equal(normalizeWorkspace({ ...VALID(), activeIndex: 'x' }).activeIndex, 0);
});

test('normalizeWorkspace does not mutate its input', () => {
  const raw = { ...VALID(), name: '  Work  ' };
  const snapshot = JSON.parse(JSON.stringify(raw));
  normalizeWorkspace(raw);
  assert.deepEqual(raw, snapshot);
});

test('normalizeFile drops invalid records, dedupes by id (first wins), and caps', () => {
  const good = VALID();
  const dupe = { ...VALID(), name: 'Later duplicate' };
  const file = normalizeFile({
    version: WORKSPACES_VERSION,
    workspaces: [good, { ...VALID(), id: '' }, dupe, null],
  });
  assert.equal(file.version, WORKSPACES_VERSION);
  assert.equal(file.workspaces.length, 1, 'invalid dropped, duplicate id collapsed');
  assert.equal(file.workspaces[0].name, 'Work', 'first record wins the id');

  const many = Array.from({ length: MAX_WORKSPACES + 5 }, (_, i) => ({ ...VALID(), id: `ws_${i}` }));
  const capped = normalizeFile({ version: WORKSPACES_VERSION, workspaces: many });
  assert.equal(capped.workspaces.length, MAX_WORKSPACES);
  assert.equal(capped.workspaces[0].id, 'ws_0', 'excess dropped from the end');
});

test('normalizeFile repairs a missing, malformed, or foreign-shaped file', () => {
  assert.deepEqual(normalizeFile(null), EMPTY_FILE());
  assert.deepEqual(normalizeFile('nope'), EMPTY_FILE());
  assert.deepEqual(normalizeFile({}), EMPTY_FILE());
  assert.deepEqual(normalizeFile({ workspaces: 'nope' }), EMPTY_FILE());
  // an unknown/newer version still normalizes to this build's version rather
  // than being trusted verbatim
  assert.equal(normalizeFile({ version: 99, workspaces: [] }).version, WORKSPACES_VERSION);
});

// ---------------------------------------------------------------------------
// Task 2 — mutations, plus two isolation/id rules folded in from plan review.
// ---------------------------------------------------------------------------

const CAPTURE = () => ({
  urls: ['https://x.test/'],
  activeIndex: 0,
  groups: [],
  groupIds: [null],
  pinned: [false],
  meta: [{ title: 'X', favicon: null }],
});

test('normalizeWorkspace COPIES its arrays (no aliasing back to the caller)', () => {
  const raw = VALID();
  const record = normalizeWorkspace(raw);
  // Same contents, different identity — otherwise a later updateCapture or a
  // store write would reach back and mutate the caller's object.
  assert.deepEqual(record.urls, raw.urls);
  assert.notStrictEqual(record.urls, raw.urls);
  assert.notStrictEqual(record.groups, raw.groups);
  assert.notStrictEqual(record.groupIds, raw.groupIds);
  assert.notStrictEqual(record.pinned, raw.pinned);
  assert.notStrictEqual(record.meta, raw.meta);
  record.urls.push('https://mutated.test/');
  assert.equal(raw.urls.length, 2, "mutating the record must not touch the input");
});

test('normalizeWorkspace rejects ids that cannot round-trip into session.json', () => {
  // Task 6 persists the binding as `workspaceId` in session.json, validated by
  // validWindowId (^[a-zA-Z0-9_-]{1,64}$). An id that fails that rule would
  // silently lose its binding on restore, so reject it at the source.
  assert.equal(normalizeWorkspace({ ...VALID(), id: 'hello world' }), null);
  assert.equal(normalizeWorkspace({ ...VALID(), id: '__proto__' }), null);
  assert.equal(normalizeWorkspace({ ...VALID(), id: 'a'.repeat(65) }), null);
  assert.equal(normalizeWorkspace({ ...VALID(), id: 'ok_id-123' }).id, 'ok_id-123');
});

test('createWorkspace stamps a record, binds it to the profile, and copies the capture', () => {
  const { file, workspace, error } = createWorkspace(EMPTY_FILE(), {
    name: '  Deep   Work ', profileId: 'default', capture: CAPTURE(), now: 500, id: 'ws_new',
  });
  assert.equal(error, undefined);
  assert.equal(file.workspaces.length, 1);
  assert.equal(workspace.name, 'Deep Work');
  assert.equal(workspace.profileId, 'default');
  assert.equal(workspace.createdAt, 500);
  assert.equal(workspace.updatedAt, 500);
  assert.deepEqual(workspace.urls, ['https://x.test/']);
});

test('createWorkspace rejects invalid name, duplicate name in-profile, and the cap', () => {
  const base = createWorkspace(EMPTY_FILE(), {
    name: 'Work', profileId: 'default', capture: CAPTURE(), now: 1, id: 'ws_1',
  }).file;

  assert.equal(createWorkspace(base, {
    name: '   ', profileId: 'default', capture: CAPTURE(), now: 2, id: 'ws_2',
  }).error, 'invalid-name');

  // Names are the user's handle for switching, so a collision is confusing.
  assert.equal(createWorkspace(base, {
    name: 'work', profileId: 'default', capture: CAPTURE(), now: 2, id: 'ws_2',
  }).error, 'duplicate-name', 'duplicate check is case-insensitive');

  // ...but the same name in a DIFFERENT profile is fine (model-level rule;
  // in practice each profile has its own file).
  assert.equal(createWorkspace(base, {
    name: 'Work', profileId: 'other', capture: CAPTURE(), now: 2, id: 'ws_2',
  }).error, undefined);

  let full = EMPTY_FILE();
  for (let i = 0; i < MAX_WORKSPACES; i++) {
    full = createWorkspace(full, {
      name: `W${i}`, profileId: 'default', capture: CAPTURE(), now: i, id: `ws_${i}`,
    }).file;
  }
  assert.equal(full.workspaces.length, MAX_WORKSPACES);
  assert.equal(createWorkspace(full, {
    name: 'One more', profileId: 'default', capture: CAPTURE(), now: 99, id: 'ws_over',
  }).error, 'limit');
});

test('renameWorkspace applies name rules and bumps updatedAt', () => {
  const start = createWorkspace(EMPTY_FILE(), {
    name: 'Work', profileId: 'default', capture: CAPTURE(), now: 1, id: 'ws_1',
  }).file;
  const withSecond = createWorkspace(start, {
    name: 'Personal', profileId: 'default', capture: CAPTURE(), now: 2, id: 'ws_2',
  }).file;

  const ok = renameWorkspace(withSecond, 'ws_1', '  Focus  ', 700);
  assert.equal(ok.error, undefined);
  assert.equal(ok.file.workspaces.find((w) => w.id === 'ws_1').name, 'Focus');
  assert.equal(ok.file.workspaces.find((w) => w.id === 'ws_1').updatedAt, 700);
  assert.equal(ok.file.workspaces.find((w) => w.id === 'ws_1').createdAt, 1, 'createdAt is preserved');

  assert.equal(renameWorkspace(withSecond, 'ws_1', '  ', 3).error, 'invalid-name');
  assert.equal(renameWorkspace(withSecond, 'ws_1', 'personal', 3).error, 'duplicate-name');
  // Renaming a workspace to its own current name is not a duplicate.
  assert.equal(renameWorkspace(withSecond, 'ws_1', 'Work', 3).error, undefined);
  assert.equal(renameWorkspace(withSecond, 'nope', 'Anything', 3).error, 'not-found');
});

test('deleteWorkspace removes only the target and reports whether it did', () => {
  const two = createWorkspace(createWorkspace(EMPTY_FILE(), {
    name: 'A', profileId: 'default', capture: CAPTURE(), now: 1, id: 'ws_1',
  }).file, { name: 'B', profileId: 'default', capture: CAPTURE(), now: 2, id: 'ws_2' }).file;

  const hit = deleteWorkspace(two, 'ws_1');
  assert.equal(hit.removed, true);
  assert.deepEqual(hit.file.workspaces.map((w) => w.id), ['ws_2']);

  const miss = deleteWorkspace(two, 'nope');
  assert.equal(miss.removed, false);
  assert.equal(miss.file.workspaces.length, 2);
});

test('updateCapture replaces the tab columns, bumps updatedAt, no-ops on unknown id', () => {
  const start = createWorkspace(EMPTY_FILE(), {
    name: 'Work', profileId: 'default', capture: CAPTURE(), now: 1, id: 'ws_1',
  }).file;

  const next = updateCapture(start, 'ws_1', {
    urls: ['https://a.test/', 'https://b.test/'],
    activeIndex: 1,
    groups: [{ id: 'g1', name: 'g', collapsed: false }],
    groupIds: ['g1', null],
    pinned: [true, false],
    meta: [{ title: 'A', favicon: null }, { title: 'B', favicon: null }],
  }, 900).file;
  const updated = next.workspaces[0];
  assert.deepEqual(updated.urls, ['https://a.test/', 'https://b.test/']);
  assert.equal(updated.activeIndex, 1);
  assert.equal(updated.updatedAt, 900);
  assert.equal(updated.name, 'Work', 'identity fields survive a capture');
  assert.equal(updated.createdAt, 1);

  assert.deepEqual(updateCapture(start, 'nope', CAPTURE(), 900).file, start);
});

test('listForProfile filters by profile and orders newest-updated first', () => {
  let file = EMPTY_FILE();
  file = createWorkspace(file, { name: 'Old', profileId: 'default', capture: CAPTURE(), now: 10, id: 'ws_old' }).file;
  file = createWorkspace(file, { name: 'New', profileId: 'default', capture: CAPTURE(), now: 30, id: 'ws_new' }).file;
  file = createWorkspace(file, { name: 'Other', profileId: 'other', capture: CAPTURE(), now: 20, id: 'ws_other' }).file;

  assert.deepEqual(listForProfile(file, 'default').map((w) => w.id), ['ws_new', 'ws_old']);
  assert.deepEqual(listForProfile(file, 'other').map((w) => w.id), ['ws_other']);
  assert.deepEqual(listForProfile(file, 'missing'), []);
});

test('every mutation leaves its input file untouched', () => {
  const start = createWorkspace(EMPTY_FILE(), {
    name: 'Work', profileId: 'default', capture: CAPTURE(), now: 1, id: 'ws_1',
  }).file;
  const snapshot = JSON.parse(JSON.stringify(start));

  createWorkspace(start, { name: 'Two', profileId: 'default', capture: CAPTURE(), now: 2, id: 'ws_2' });
  renameWorkspace(start, 'ws_1', 'Renamed', 3);
  deleteWorkspace(start, 'ws_1');
  updateCapture(start, 'ws_1', CAPTURE(), 4);
  listForProfile(start, 'default');

  assert.deepEqual(start, snapshot);
});
