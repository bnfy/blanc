const assert = require('node:assert/strict');
const test = require('node:test');

const { createArcImportService } = require('../../src/main/arc-import');
const { parseArcSidebar } = require('../../src/main/arc-sidebar');

const flat = (records) => records.flatMap((record) => [record.id, record]);
const tab = (id, parentID, url) => ({ id, parentID, childrenIds: [], title: null, data: { tab: { savedURL: url, savedTitle: id } } });
const box = (id, children, containerType = { spaceItems: { _0: 'x' } }) => ({ id, parentID: null, childrenIds: children, data: { itemContainer: { containerType } } });
const space = (id, title, p, t, extra = {}) => ({ id, title, newContainerIDs: [{ pinned: {} }, p, { unpinned: {} }, t], ...extra });

const PARSED = parseArcSidebar({
  sidebar: {
    containers: [{ global: {} }, {
      spaces: flat([
        space('arc-uuid-work', 'Work', 'pw', 'tw'),
        space('arc-uuid-untitled', null, 'pu', 'tu', { profile: { custom: { _0: { directoryBasename: 'Profile 3' } } } }),
        space('arc-uuid-empty', 'Empty', 'pe', 'te'),
      ]),
      items: flat([
        box('pw', ['w1']), tab('w1', 'pw', 'https://work.example.com/'), box('tw', ['w2']), tab('w2', 'tw', 'https://today.example.com/'),
        box('pu', ['u1']), tab('u1', 'pu', 'https://untitled.example.com/'), box('tu', []),
        box('pe', []), box('te', []),
        box('fav', ['f1'], { topApps: { _0: { default: {} } } }), tab('f1', 'fav', 'https://mail.example.com/'),
      ]),
    }],
  },
});

function harness({ room = { remainingSlots: 25, existingNames: [] }, parsed = PARSED } = {}) {
  const calls = { spaces: [], favorites: [] };
  let n = 0;
  const service = createArcImportService({
    readDetected: async () => parsed,
    chooseAndRead: async () => parsed,
    spaceRoom: () => room,
    createSpaces: async (entries) => { calls.spaces.push(entries); return { ok: true }; },
    importFavorites: async (entries) => { calls.favorites.push(entries); return { added: entries.length, skipped: 0 }; },
    untitledName: (i) => `Untitled ${i}`,
    randomId: () => `id-${n += 1}`,
  });
  return { service, calls };
}

test('the preview is a projection: names and counts, never URLs, paths or Arc ids', async () => {
  const { service } = harness();
  const preview = await service.read('arc');
  assert.equal(preview.source, 'arc');
  assert.equal('mode' in preview, false, 'there is only one kind of import');
  assert.equal(preview.remainingSlots, 25);
  assert.deepEqual(preview.spaces.map((s) => [s.id, s.name, s.tabCount, s.separateProfile]), [
    ['space-1', 'Work', 2, false],
    ['space-2', 'Untitled 1', 1, true],
    ['space-3', 'Empty', 0, false],
  ]);
  assert.equal(preview.favoritesCount, 1);
  const text = JSON.stringify(preview);
  for (const secret of ['https://', 'arc-uuid', 'Profile 3']) assert.equal(text.includes(secret), false, secret);
});

test('each selected Arc Space becomes one space, plus Favorites', async () => {
  const { service, calls } = harness();
  const { sessionId } = await service.read('arc');
  const result = await service.apply(sessionId, { spaceIds: ['space-1', 'space-2', 'space-3'], favorites: true });
  assert.equal(result.ok, true);
  assert.equal('mode' in result, false);
  assert.deepEqual(result.created, ['Work', 'Untitled 1']);
  assert.equal(result.emptyCount, 1);
  assert.equal(calls.spaces.length, 1, 'one durable batch');
  assert.deepEqual(calls.spaces[0][0].capture.urls, ['https://work.example.com/', 'https://today.example.com/']);
  assert.deepEqual(calls.favorites[0], [{ url: 'https://mail.example.com/', title: 'f1', folder: 'Arc' }]);
  assert.equal(result.favoritesAdded, 1);
  assert.equal(service.hasSession(), false, 'a finished import drops the parsed sidebar');
});

test('a request that still asks for windows creates spaces', async () => {
  const { service, calls } = harness();
  const { sessionId } = await service.read('file');
  const result = await service.apply(sessionId, { mode: 'windows', spaceIds: ['space-1'] });
  assert.equal(result.ok, true);
  assert.equal(calls.spaces.length, 1);
  assert.deepEqual(result.created, ['Work']);
});

test('Spaces that do not fit are refused before anything is written', async () => {
  const { service, calls } = harness({ room: { remainingSlots: 1, existingNames: [] } });
  const { sessionId } = await service.read('arc');
  const result = await service.apply(sessionId, { spaceIds: ['space-1', 'space-2'] });
  assert.deepEqual(result, { error: 'no-room', remainingSlots: 1, selectedCount: 2 });
  assert.equal(calls.spaces.length, 0);
});

test('names avoid existing spaces in this profile', async () => {
  const { service, calls } = harness({ room: { remainingSlots: 25, existingNames: ['Work'] } });
  const { sessionId } = await service.read('arc');
  await service.apply(sessionId, { spaceIds: ['space-1'] });
  assert.equal(calls.spaces[0][0].name, 'Work (Arc)');
});

test('stale sessions, unknown ids and empty selections are refused', async () => {
  const { service } = harness();
  const { sessionId } = await service.read('arc');
  assert.deepEqual(await service.apply('other', { spaceIds: ['space-1'] }), { error: 'session-unavailable' });
  assert.deepEqual(await service.apply(sessionId, { spaceIds: ['arc-uuid-work'] }), { error: 'invalid-selection' });
  assert.deepEqual(await service.apply(sessionId, { spaceIds: [] }), { error: 'nothing-selected' });
  service.cancel(sessionId);
  assert.deepEqual(await service.apply(sessionId, { spaceIds: ['space-1'] }), { error: 'session-unavailable' });
});

test('read errors and cancelled file choices pass through', async () => {
  const service = createArcImportService({
    readDetected: async () => ({ error: 'permission' }),
    chooseAndRead: async () => ({ cancelled: true }),
    spaceRoom: () => ({ remainingSlots: 25, existingNames: [] }),
  });
  assert.deepEqual(await service.read('arc'), { error: 'permission' });
  assert.deepEqual(await service.read('file'), { cancelled: true });
  const empty = createArcImportService({
    readDetected: async () => ({ ok: true, spaces: [], favorites: [], skippedCount: 0 }),
    spaceRoom: () => ({ remainingSlots: 25, existingNames: [] }),
  });
  assert.deepEqual(await empty.read('arc'), { error: 'empty' });
});

test('closing the sheet discards the parsed sidebar whatever its session', async () => {
  const { service } = harness();
  const { sessionId } = await service.read('arc');
  assert.equal(service.hasSession(), true);
  service.discard();
  assert.equal(service.hasSession(), false);
  assert.deepEqual(await service.apply(sessionId, { spaceIds: ['space-1'] }), { error: 'session-unavailable' });
});
