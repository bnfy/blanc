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

const NOW = Date.UTC(2026, 6, 30);
const chromiumTime = (unixMs) =>
  String(BigInt(unixMs + 11_644_473_600_000) * 1000n);

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
