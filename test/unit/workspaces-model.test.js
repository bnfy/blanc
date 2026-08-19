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
