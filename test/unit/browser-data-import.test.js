const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  MAX_BROWSER_BOOKMARK_BYTES,
  BROWSER_PERMISSION_GUIDANCE,
  browserDataRoot,
  chromiumTimestampMs,
  parseChromiumBookmarks,
  createBrowserDataImportService,
} = require('../../src/main/browser-data-import');
const { folderIdFromPath } = require('../../src/main/bookmark-tree');
const { COMMAND, INITIAL_STATE_MARKER } = require('../../src/main/chromium-session');

const NOW = Date.UTC(2026, 6, 30);
const chromiumTime = (unixMs) =>
  String(BigInt(unixMs + 11_644_473_600_000) * 1000n);

function align4(value) {
  return (value + 3) & ~3;
}

function pickleField(chunks, bytes) {
  chunks.push(bytes);
  const padding = align4(bytes.length) - bytes.length;
  if (padding) chunks.push(Buffer.alloc(padding));
}

function navigationPayload(tabId, url, title) {
  const chunks = [];
  const int = (value) => {
    const bytes = Buffer.alloc(4);
    bytes.writeInt32LE(value);
    pickleField(chunks, bytes);
  };
  const string = (value, encoding = 'utf8') => {
    const bytes = Buffer.from(value, encoding);
    int(encoding === 'utf16le' ? bytes.length / 2 : bytes.length);
    pickleField(chunks, bytes);
  };
  int(tabId);
  int(0);
  string(url);
  string(title, 'utf16le');
  string('');
  int(1);
  const body = Buffer.concat(chunks);
  const header = Buffer.alloc(4);
  header.writeUInt32LE(body.length);
  return Buffer.concat([header, body]);
}

function commandFrame(id, payload = Buffer.alloc(0)) {
  const frame = Buffer.alloc(3 + payload.length);
  frame.writeUInt16LE(payload.length + 1, 0);
  frame[2] = id;
  payload.copy(frame, 3);
  return frame;
}

function intPayload(...values) {
  const payload = Buffer.alloc(values.length * 4);
  values.forEach((value, index) => payload.writeInt32LE(value, index * 4));
  return payload;
}

function openTabSession(tabs, { marker = true, version = 3 } = {}) {
  const header = Buffer.alloc(8);
  header.write('SNSS');
  header.writeInt32LE(version, 4);
  const commands = [{ id: COMMAND.SET_WINDOW_TYPE, payload: intPayload(1, 0) }];
  tabs.forEach((tab, index) => {
    commands.push(
      { id: COMMAND.SET_TAB_WINDOW, payload: intPayload(1, tab.id) },
      { id: COMMAND.SET_TAB_INDEX, payload: intPayload(tab.id, index) },
      { id: COMMAND.UPDATE_NAVIGATION, payload: navigationPayload(tab.id, tab.url, tab.title) },
      { id: COMMAND.SET_SELECTED_NAVIGATION, payload: intPayload(tab.id, 0) },
    );
  });
  return Buffer.concat([
    header,
    ...commands.map(({ id, payload }) => commandFrame(id, payload)),
    ...(marker ? [commandFrame(INITIAL_STATE_MARKER)] : []),
  ]);
}

function fixture() {
  return {
    roots: {
      bookmark_bar: {
        type: 'folder',
        name: 'Bookmarks bar',
        children: [
          {
            type: 'url',
            name: 'Top',
            url: 'https://top.example/',
            date_added: chromiumTime(NOW - 10_000),
          },
          {
            type: 'folder',
            name: 'Reading',
            children: [
              {
                type: 'url',
                name: 'Article',
                url: 'https://article.example/',
                date_added: chromiumTime(NOW - 5_000),
              },
              { type: 'url', name: 'Internal', url: 'chrome://settings/' },
            ],
          },
        ],
      },
      other: {
        type: 'folder',
        name: 'Other bookmarks',
        children: [{ type: 'url', name: '', url: 'https://other.example/' }],
      },
    },
  };
}

test('parseChromiumBookmarks preserves immediate folders, dates, and http(s)-only URLs', () => {
  const entries = parseChromiumBookmarks(fixture(), { now: NOW });
  const byUrl = new Map(entries.map((entry) => [entry.url, entry]));
  assert.equal(entries.length, 3);
  assert.equal(byUrl.get('https://top.example/').folder, 'Bookmarks bar');
  assert.equal(byUrl.get('https://top.example/').addedAt, NOW - 10_000);
  assert.equal(byUrl.get('https://article.example/').folder, 'Reading');
  assert.equal(byUrl.get('https://other.example/').title, 'https://other.example/');
  assert.equal([...byUrl].some(([url]) => url.startsWith('chrome:')), false);
});

test('Chromium timestamps reject malformed and future values', () => {
  assert.equal(chromiumTimestampMs('nope', NOW), NOW);
  assert.equal(chromiumTimestampMs(chromiumTime(NOW + 1), NOW), NOW);
  assert.equal(chromiumTimestampMs(chromiumTime(NOW - 1), NOW), NOW - 1);
});

test('browserDataRoot maps supported platforms without guessing missing Windows state', () => {
  assert.equal(
    browserDataRoot('chrome', { platform: 'darwin', homeDir: '/Users/test', env: {} }),
    path.join('/Users/test', 'Library', 'Application Support', 'Google', 'Chrome')
  );
  assert.equal(
    browserDataRoot('brave', {
      platform: 'win32',
      homeDir: 'ignored',
      env: { LOCALAPPDATA: 'C:\\Local' },
    }),
    path.join('C:\\Local', 'BraveSoftware', 'Brave-Browser', 'User Data')
  );
  assert.equal(
    browserDataRoot('edge', { platform: 'win32', homeDir: 'ignored', env: {} }),
    null
  );
});

test('service discovers opaque sources and reads only a rediscovered source id', async (t) => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-browser-import-'));
  t.after(() => fs.rmSync(homeDir, { recursive: true, force: true }));
  const root = browserDataRoot('chrome', { platform: 'darwin', homeDir, env: {} });
  fs.mkdirSync(path.join(root, 'Default'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'Local State'),
    JSON.stringify({ profile: { info_cache: { Default: { name: 'Person 1' } } } })
  );
  fs.writeFileSync(path.join(root, 'Default', 'Bookmarks'), JSON.stringify(fixture()));

  const service = createBrowserDataImportService({
    platform: 'darwin',
    homeDir,
    env: {},
  });
  const result = await service.listSources();
  const sources = result.sources;
  assert.deepEqual(sources.map(({ browser, profile, label }) => ({ browser, profile, label })), [{
    browser: 'Google Chrome',
    profile: 'Person 1',
    label: 'Google Chrome — Person 1',
  }]);
  assert.match(sources[0].id, /^[A-Za-z0-9_-]{24}$/);
  assert.equal(JSON.stringify(sources).includes(homeDir), false, 'renderer projection must omit paths');

  const read = await service.readSource(sources[0].id);
  assert.equal(read.source.label, 'Google Chrome — Person 1');
  assert.equal(read.entries.length, 3);
  assert.deepEqual(await service.readSource('forged-id'), { error: 'source-unavailable' });
});

test('open-tab sources require a verified newest snapshot and use older state only as quit preflight', async (t) => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-open-tab-import-'));
  t.after(() => fs.rmSync(homeDir, { recursive: true, force: true }));
  const root = browserDataRoot('chrome', { platform: 'darwin', homeDir, env: {} });
  const profile = path.join(root, 'Default');
  const sessions = path.join(profile, 'Sessions');
  fs.mkdirSync(sessions, { recursive: true });
  fs.writeFileSync(
    path.join(root, 'Local State'),
    JSON.stringify({ profile: { info_cache: { Default: { name: 'Open tabs only' } } } }),
  );
  fs.writeFileSync(path.join(sessions, 'Session_100'), openTabSession([
    { id: 10, url: 'https://one.example/', title: 'One' },
    { id: 11, url: 'https://one.example/', title: 'Duplicate' },
  ]));
  fs.writeFileSync(path.join(sessions, 'Session_101'), openTabSession([
    { id: 12, url: 'https://incomplete.example/', title: 'Incomplete' },
  ], { marker: false }));

  const service = createBrowserDataImportService({ platform: 'darwin', homeDir, env: {} });
  assert.deepEqual(await service.listSources(), { sources: [], unavailable: [] });
  const listed = await service.listOpenTabSources();
  assert.equal(listed.sources.length, 1);
  assert.equal(listed.sources[0].label, 'Google Chrome — Open tabs only');
  assert.equal(JSON.stringify(listed).includes(homeDir), false);

  const preflight = await service.readOpenTabs(listed.sources[0].id);
  assert.equal(preflight.error, 'source-locked');
  assert.equal(preflight.recoverable, true);
  assert.equal(preflight.recoverableTabCount, 2);
  assert.equal(preflight.source.label, 'Google Chrome — Open tabs only');

  const refused = await service.readOpenTabs(listed.sources[0].id, { afterQuit: true });
  assert.equal(refused.error, 'missing-session-marker');
  assert.equal(refused.source.label, 'Google Chrome — Open tabs only');

  fs.writeFileSync(path.join(sessions, 'Session_101'), openTabSession([
    { id: 12, url: 'https://one.example/', title: 'One' },
    { id: 13, url: 'https://one.example/', title: 'Duplicate' },
  ]));
  const read = await service.readOpenTabs(listed.sources[0].id, { afterQuit: true });
  assert.equal(read.windowCount, 1);
  assert.equal(read.candidates.length, 2);
  assert.equal(read.candidates[0].url, read.candidates[1].url, 'open duplicates stay separate');
  assert.deepEqual(await service.readOpenTabs('forged'), { error: 'source-unavailable' });
});

test('open-tab source never asks for a quit without restorable preflight evidence', async (t) => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-open-tab-no-preflight-'));
  t.after(() => fs.rmSync(homeDir, { recursive: true, force: true }));
  const root = browserDataRoot('chrome', { platform: 'darwin', homeDir, env: {} });
  const sessions = path.join(root, 'Default', 'Sessions');
  fs.mkdirSync(sessions, { recursive: true });
  fs.writeFileSync(path.join(sessions, 'Session_100'), openTabSession([
    { id: 10, url: 'https://unfinished.example/', title: 'Unfinished' },
  ], { marker: false }));

  const service = createBrowserDataImportService({ platform: 'darwin', homeDir, env: {} });
  const [source] = (await service.listOpenTabSources()).sources;
  const result = await service.readOpenTabs(source.id);
  assert.equal(result.error, 'missing-session-marker');
  assert.equal(result.recoverable, false);
  assert.equal(result.recoverableTabCount, undefined);
});

test('open-tab read reports encrypted sessions without requesting browser credentials', async (t) => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-open-tab-encrypted-'));
  t.after(() => fs.rmSync(homeDir, { recursive: true, force: true }));
  const root = browserDataRoot('chrome', { platform: 'linux', homeDir, env: {} });
  const sessions = path.join(root, 'Default', 'Sessions');
  fs.mkdirSync(sessions, { recursive: true });
  fs.writeFileSync(path.join(sessions, 'Session_100'), openTabSession([], { version: 5 }));

  const service = createBrowserDataImportService({ platform: 'linux', homeDir, env: {} });
  const [source] = (await service.listOpenTabSources()).sources;
  const result = await service.readOpenTabs(source.id);
  assert.equal(result.error, 'encrypted-session');
  assert.equal(result.version, 5);
  assert.equal(result.source.label, 'Google Chrome');
});

test('service rejects an oversized Bookmarks file before reading it', async (t) => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-browser-import-large-'));
  t.after(() => fs.rmSync(homeDir, { recursive: true, force: true }));
  const root = browserDataRoot('chrome', { platform: 'linux', homeDir, env: {} });
  fs.mkdirSync(path.join(root, 'Default'), { recursive: true });
  const file = path.join(root, 'Default', 'Bookmarks');
  fs.writeFileSync(file, '');
  fs.truncateSync(file, MAX_BROWSER_BOOKMARK_BYTES + 1);

  const service = createBrowserDataImportService({
    platform: 'linux',
    homeDir,
    env: {},
  });
  const [source] = (await service.listSources()).sources;
  assert.equal((await service.readSource(source.id)).error, 'too-large');
});

test('parser bounds hostile nesting and node counts', () => {
  const data = fixture();
  assert.throws(
    () => parseChromiumBookmarks(data, { now: NOW, maxNodes: 1 }),
    /bookmarks-too-complex/
  );
  assert.throws(() => parseChromiumBookmarks('{}'), /invalid-bookmarks/);
});

test('readFolderTree and readSubtreeCandidates preserve F30 flat readSource output', async (t) => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-browser-import-tree-'));
  t.after(() => fs.rmSync(homeDir, { recursive: true, force: true }));
  const root = browserDataRoot('chrome', { platform: 'darwin', homeDir, env: {} });
  fs.mkdirSync(path.join(root, 'Default'), { recursive: true });
  fs.writeFileSync(path.join(root, 'Default', 'Bookmarks'), JSON.stringify(fixture()));

  const service = createBrowserDataImportService({
    platform: 'darwin',
    homeDir,
    env: {},
  });
  const [source] = (await service.listSources()).sources;
  const flatBefore = await service.readSource(source.id);
  assert.equal(flatBefore.entries.length, 3);
  assert.deepEqual(Object.keys(flatBefore).sort(), ['entries', 'source']);

  const tree = await service.readFolderTree(source.id);
  assert.equal(tree.source.label, 'Google Chrome');
  assert.ok(tree.folders.some((folder) => folder.name === 'Reading'));
  const readingId = folderIdFromPath(['Bookmarks bar', 'Reading']);
  assert.ok(tree.folders.some((folder) => folder.folderId === readingId));
  assert.deepEqual(Object.keys(tree).sort(), ['folders', 'rootFolderIds', 'source']);
  for (const folder of tree.folders) {
    assert.deepEqual(Object.keys(folder).sort(), [
      'childFolderIds', 'folderId', 'httpCount', 'name', 'pathLabels', 'subtreeHttpCount',
    ]);
  }

  const subtree = await service.readSubtreeCandidates(source.id, readingId);
  assert.equal(subtree.candidates.length, 1);
  assert.equal(subtree.candidates[0].url, 'https://article.example/');
  assert.equal(subtree.candidates[0].favoriteFolder, null);
  assert.deepEqual(subtree.candidates[0].folderPath, []);

  const flatAfter = await service.readSource(source.id);
  const pick = (entries) => entries.map(({ url, title, folder, favicon }) => ({
    url, title, folder, favicon,
  }));
  assert.deepEqual(pick(flatAfter.entries), pick(flatBefore.entries));

  const expectedFlat = parseChromiumBookmarks(fixture(), { now: NOW });
  assert.deepEqual(pick(flatBefore.entries), pick(expectedFlat));
});

test('tree reads reject empty sources and enforce the candidate cap after dedup', async (t) => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-browser-import-tree-cap-'));
  t.after(() => fs.rmSync(homeDir, { recursive: true, force: true }));
  const root = browserDataRoot('chrome', { platform: 'darwin', homeDir, env: {} });
  const file = path.join(root, 'Default', 'Bookmarks');
  fs.mkdirSync(path.dirname(file), { recursive: true });

  const empty = {
    roots: {
      bookmark_bar: {
        type: 'folder',
        name: 'Bookmarks bar',
        children: [],
      },
    },
  };
  fs.writeFileSync(file, JSON.stringify(empty));
  const service = createBrowserDataImportService({ platform: 'darwin', homeDir, env: {} });
  const [source] = (await service.listSources()).sources;
  assert.deepEqual(await service.readFolderTree(source.id), { error: 'empty' });

  const children = Array.from({ length: 500 }, (_, index) => ({
    type: 'url',
    name: `Page ${index}`,
    url: `https://example.com/${index}`,
  }));
  children.push({ ...children[0], name: 'Duplicate page' });
  empty.roots.bookmark_bar.children = children;
  fs.writeFileSync(file, JSON.stringify(empty));
  const rootId = folderIdFromPath(['Bookmarks bar']);
  const atCap = await service.readSubtreeCandidates(source.id, rootId);
  assert.equal(atCap.candidates.length, 500);
  assert.equal(atCap.duplicateCount, 1);

  children.splice(children.length - 1, 1, {
    type: 'url',
    name: 'Page 500',
    url: 'https://example.com/500',
  });
  fs.writeFileSync(file, JSON.stringify(empty));
  assert.deepEqual(await service.readSubtreeCandidates(source.id, rootId), {
    error: 'too-many-candidates',
    count: 501,
  });
});

test('listSources reports permission-blocked browsers instead of omitting them', async (t) => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-browser-import-blocked-'));
  t.after(() => fs.rmSync(homeDir, { recursive: true, force: true }));
  const chromeRoot = browserDataRoot('chrome', { platform: 'darwin', homeDir, env: {} });
  fs.mkdirSync(chromeRoot, { recursive: true });
  fs.chmodSync(chromeRoot, 0);
  const service = createBrowserDataImportService({ platform: 'darwin', homeDir, env: {} });
  try {
    const result = await service.listSources();
    assert.equal(result.sources.length, 0);
    assert.deepEqual(result.unavailable, [{
      browserId: 'chrome',
      browser: 'Google Chrome',
      label: 'Google Chrome',
      reason: 'permission',
      guidance: BROWSER_PERMISSION_GUIDANCE,
    }]);
  } finally {
    fs.chmodSync(chromeRoot, 0o755);
  }
});
