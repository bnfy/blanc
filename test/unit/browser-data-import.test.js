const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const importModule = require('../../src/main/browser-data-import');
const { englishT: t } = require('../support/english-t');
const { MAX_BROWSER_BOOKMARK_BYTES, browserDataRoot, chromiumTimestampMs } = importModule;
// Imported folder names and the macOS guidance come from the interface
// catalog (F44); these tests read English.
const parseChromiumBookmarks = (input, options = {}) => importModule.parseChromiumBookmarks(input, { ...options, t });
const createBrowserDataImportService = (options = {}) => importModule.createBrowserDataImportService({ ...options, t });
const BROWSER_PERMISSION_GUIDANCE = t('import.permissionGuidance');
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

function accountFixture() {
  return {
    roots: {
      bookmark_bar: {
        type: 'folder',
        name: 'Bookmarks bar',
        children: [
          { type: 'url', name: 'Account', url: 'https://account.example/' },
          { type: 'url', name: 'Top again', url: 'https://top.example/' },
        ],
      },
      synced: {
        type: 'folder',
        name: 'Mobile bookmarks',
        children: [{ type: 'url', name: 'Phone', url: 'https://phone.example/' }],
      },
    },
  };
}

test('a signed-in Chrome profile with only AccountBookmarks is discovered and read', async (t) => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-browser-import-account-'));
  t.after(() => fs.rmSync(homeDir, { recursive: true, force: true }));
  const root = browserDataRoot('chrome', { platform: 'win32', homeDir, env: { LOCALAPPDATA: homeDir } });
  fs.mkdirSync(path.join(root, 'Default'), { recursive: true });
  fs.writeFileSync(path.join(root, 'Default', 'AccountBookmarks'), JSON.stringify(accountFixture()));

  const service = createBrowserDataImportService({
    platform: 'win32',
    homeDir,
    env: { LOCALAPPDATA: homeDir },
  });
  const [source] = (await service.listSources()).sources;
  assert.equal(source?.label, 'Google Chrome');
  const read = await service.readSource(source.id);
  assert.deepEqual(read.entries.map(({ url, folder }) => ({ url, folder })), [
    { url: 'https://account.example/', folder: 'Bookmarks bar' },
    { url: 'https://top.example/', folder: 'Bookmarks bar' },
    { url: 'https://phone.example/', folder: 'Mobile bookmarks' },
  ]);
  const tree = await service.readFolderTree(source.id);
  assert.deepEqual(tree.rootFolderIds, [
    folderIdFromPath(['Bookmarks bar']),
    folderIdFromPath(['Mobile bookmarks']),
  ]);
});

function chromeProfile(t, platform, prefix) {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(homeDir, { recursive: true, force: true }));
  const env = platform === 'win32' ? { LOCALAPPDATA: homeDir } : {};
  const profile = path.join(browserDataRoot('chrome', { platform, homeDir, env }), 'Default');
  fs.mkdirSync(profile, { recursive: true });
  return {
    homeDir,
    env,
    local: path.join(profile, 'Bookmarks'),
    account: path.join(profile, 'AccountBookmarks'),
  };
}

// fs.promises with chosen bookmark-file operations failing with `code`.
function failingFs(failures) {
  const fail = (op, filePath) => {
    const code = failures[`${op}:${path.basename(filePath)}`];
    if (code) throw Object.assign(new Error(code), { code });
  };
  return {
    ...fs.promises,
    async stat(filePath, ...rest) {
      fail('stat', filePath);
      return fs.promises.stat(filePath, ...rest);
    },
    async open(filePath, ...rest) {
      fail('open', filePath);
      return fs.promises.open(filePath, ...rest);
    },
  };
}

test('a profile with Bookmarks and AccountBookmarks imports both, local first, once per URL', async (t) => {
  const p = chromeProfile(t, 'linux', 'blanc-browser-import-both-');
  fs.writeFileSync(p.local, JSON.stringify(fixture()));
  fs.writeFileSync(p.account, JSON.stringify(accountFixture()));

  const service = createBrowserDataImportService({ platform: 'linux', homeDir: p.homeDir, env: p.env });
  const result = await service.listSources();
  assert.equal(result.sources.length, 1, 'one profile is one source, whatever its files');
  const read = await service.readSource(result.sources[0].id);
  assert.deepEqual(read.entries.map(({ url }) => url), [
    'https://top.example/',
    'https://article.example/',
    'https://other.example/',
    'https://account.example/',
    'https://phone.example/',
  ], 'an account bookmark the local file already has is not imported twice');

  const subtree = await service.readSubtreeCandidates(
    result.sources[0].id,
    folderIdFromPath(['Bookmarks bar']),
  );
  assert.deepEqual(subtree.candidates.map(({ url }) => url).sort(), [
    'https://account.example/',
    'https://article.example/',
    'https://top.example/',
  ]);
  assert.equal(subtree.duplicateCount, 1);
});

test('an empty local Bookmarks file does not hide the account bookmarks', async (t) => {
  const p = chromeProfile(t, 'darwin', 'blanc-browser-import-empty-local-');
  fs.writeFileSync(p.local, JSON.stringify({
    roots: {
      bookmark_bar: { type: 'folder', name: 'Bookmarks bar', children: [] },
      other: { type: 'folder', name: 'Other bookmarks', children: [] },
    },
  }));
  fs.writeFileSync(p.account, JSON.stringify(accountFixture()));

  const service = createBrowserDataImportService({ platform: 'darwin', homeDir: p.homeDir, env: p.env });
  const [source] = (await service.listSources()).sources;
  assert.equal((await service.readSource(source.id)).entries.length, 3);
});

test('the node cap applies to each bookmark file, not to the two together', async (t) => {
  const p = chromeProfile(t, 'linux', 'blanc-browser-import-node-cap-');
  const many = (host, count) => ({
    roots: {
      bookmark_bar: {
        type: 'folder',
        name: 'Bookmarks bar',
        children: Array.from({ length: count }, (_, i) => ({
          type: 'url',
          name: `${host} ${i}`,
          url: `https://${host}.example/${i}`,
        })),
      },
    },
  });
  fs.writeFileSync(p.local, JSON.stringify(many('local', 60_000)));
  fs.writeFileSync(p.account, JSON.stringify(many('account', 60_000)));

  const service = createBrowserDataImportService({ platform: 'linux', homeDir: p.homeDir, env: p.env });
  const [source] = (await service.listSources()).sources;
  assert.equal((await service.readSource(source.id)).entries.length, 120_000);
  const tree = await service.readFolderTree(source.id);
  assert.equal(tree.folders.find((folder) => folder.pathLabels.length === 1).subtreeHttpCount, 120_000);

  fs.writeFileSync(p.account, JSON.stringify(many('account', 100_001)));
  assert.equal(
    (await service.readSource(source.id)).entries.length,
    60_000,
    'an account file over the cap is left out beside a readable local file',
  );
});

test('a root without children reads the same whether the profile has one file or two', async (t) => {
  const p = chromeProfile(t, 'linux', 'blanc-browser-import-childless-');
  const childless = {
    roots: {
      bookmark_bar: {
        type: 'folder',
        name: 'Bookmarks bar',
        children: [{ type: 'url', name: 'Top', url: 'https://top.example/' }],
      },
      other: { type: 'folder', name: 'Other bookmarks' },
    },
  };
  fs.writeFileSync(p.local, JSON.stringify(childless));
  const service = createBrowserDataImportService({ platform: 'linux', homeDir: p.homeDir, env: p.env });
  const [source] = (await service.listSources()).sources;
  const alone = await service.readFolderTree(source.id);

  fs.writeFileSync(p.account, JSON.stringify({
    roots: { other: { type: 'folder', name: 'Other bookmarks' } },
  }));
  const together = await service.readFolderTree(source.id);
  assert.deepEqual(together.rootFolderIds, alone.rootFolderIds);
  assert.deepEqual(together.rootFolderIds, [
    folderIdFromPath(['Bookmarks bar']),
    folderIdFromPath(['Other bookmarks']),
  ]);
});

test('a broken AccountBookmarks beside a readable Bookmarks imports the local file as before', async (t) => {
  const p = chromeProfile(t, 'linux', 'blanc-browser-import-bad-account-');
  fs.writeFileSync(p.local, JSON.stringify(fixture()));
  const service = createBrowserDataImportService({ platform: 'linux', homeDir: p.homeDir, env: p.env });
  const localOnly = ['https://top.example/', 'https://article.example/', 'https://other.example/'];

  for (const write of [
    () => fs.writeFileSync(p.account, '{"roots":'),
    () => fs.writeFileSync(p.account, '{}'),
    () => fs.writeFileSync(p.account, JSON.stringify({ roots: 'nope' })),
    () => {
      fs.writeFileSync(p.account, '');
      fs.truncateSync(p.account, MAX_BROWSER_BOOKMARK_BYTES + 1);
    },
  ]) {
    write();
    const [source] = (await service.listSources()).sources;
    assert.deepEqual((await service.readSource(source.id)).entries.map(({ url }) => url), localOnly);
    assert.equal((await service.readFolderTree(source.id)).error, undefined);
  }
});

test('a broken Bookmarks file still rejects the profile, whatever AccountBookmarks holds', async (t) => {
  const p = chromeProfile(t, 'linux', 'blanc-browser-import-bad-local-');
  fs.writeFileSync(p.account, JSON.stringify(accountFixture()));
  fs.writeFileSync(p.local, '{"roots":');
  const service = createBrowserDataImportService({ platform: 'linux', homeDir: p.homeDir, env: p.env });
  const [source] = (await service.listSources()).sources;
  assert.deepEqual(await service.readSource(source.id), { error: 'unreadable' });
  assert.deepEqual(await service.readFolderTree(source.id), { error: 'unreadable' });

  fs.writeFileSync(p.local, '');
  fs.truncateSync(p.local, MAX_BROWSER_BOOKMARK_BYTES + 1);
  assert.deepEqual(await service.readSource(source.id), { error: 'too-large' });
});

test('an AccountBookmarks file on its own fails the way Bookmarks would', async (t) => {
  const p = chromeProfile(t, 'linux', 'blanc-browser-import-bad-account-only-');
  fs.writeFileSync(p.account, '{"roots":');
  const service = createBrowserDataImportService({ platform: 'linux', homeDir: p.homeDir, env: p.env });
  const [source] = (await service.listSources()).sources;
  assert.deepEqual(await service.readSource(source.id), { error: 'unreadable' });

  fs.writeFileSync(p.account, '');
  fs.truncateSync(p.account, MAX_BROWSER_BOOKMARK_BYTES + 1);
  assert.deepEqual(await service.readSource(source.id), { error: 'too-large' });
});

test('a bookmark file that vanishes after discovery is skipped only if it is AccountBookmarks', async (t) => {
  const p = chromeProfile(t, 'linux', 'blanc-browser-import-vanished-');
  fs.writeFileSync(p.local, JSON.stringify(fixture()));
  fs.writeFileSync(p.account, JSON.stringify(accountFixture()));
  const serviceWith = (failures) => createBrowserDataImportService({
    platform: 'linux',
    homeDir: p.homeDir,
    env: p.env,
    fsPromises: failingFs(failures),
  });

  const accountGone = serviceWith({ 'open:AccountBookmarks': 'ENOENT' });
  const [source] = (await accountGone.listSources()).sources;
  assert.equal((await accountGone.readSource(source.id)).entries.length, 3);

  const localGone = serviceWith({ 'open:Bookmarks': 'ENOENT' });
  assert.deepEqual(await localGone.readSource(source.id), { error: 'unreadable' });
  assert.deepEqual(await localGone.readFolderTree(source.id), { error: 'unreadable' });
});

test('a blocked AccountBookmarks hides the profile only when it is the only bookmarks', async (t) => {
  const p = chromeProfile(t, 'darwin', 'blanc-browser-import-blocked-account-');
  fs.writeFileSync(p.account, JSON.stringify(accountFixture()));
  const blocked = (failures) => createBrowserDataImportService({
    platform: 'darwin',
    homeDir: p.homeDir,
    env: p.env,
    fsPromises: failingFs(failures),
  });

  const alone = await blocked({ 'stat:AccountBookmarks': 'EPERM' }).listSources();
  assert.deepEqual(alone.sources, []);
  assert.deepEqual(alone.unavailable.map(({ browserId, reason }) => ({ browserId, reason })), [
    { browserId: 'chrome', reason: 'permission' },
  ]);

  fs.writeFileSync(p.local, JSON.stringify(fixture()));
  const beside = blocked({ 'stat:AccountBookmarks': 'EPERM' });
  const result = await beside.listSources();
  assert.deepEqual(result.unavailable, []);
  assert.equal((await beside.readSource(result.sources[0].id)).entries.length, 3);

  const localBlocked = await blocked({ 'stat:Bookmarks': 'EACCES' }).listSources();
  assert.deepEqual(localBlocked.sources, [], 'a blocked local file still blocks the profile');
  assert.equal(localBlocked.unavailable.length, 1);
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

test('listSources reports permission-blocked browsers instead of omitting them', { skip: process.platform === 'win32' && 'POSIX directory permission fixture; Windows chmod does not deny directory access' }, async (t) => {
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
