const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  arcSidebarCandidates,
  detectArcSidebar,
  readArcSidebarFile,
  readDetectedArcSidebar,
} = require('../../src/main/arc-import-source');

const SIDEBAR = JSON.stringify({
  sidebar: {
    containers: [
      { global: {} },
      {
        spaces: ['s', { id: 's', title: 'Work', newContainerIDs: [{ pinned: {} }, 'p', { unpinned: {} }, 't'] }],
        items: [
          'p', { id: 'p', parentID: null, childrenIds: ['a'], data: { itemContainer: { containerType: { spaceItems: { _0: 's' } } } } },
          'a', { id: 'a', parentID: 'p', childrenIds: [], title: null, data: { tab: { savedURL: 'https://a.example.com/', savedTitle: 'A' } } },
          't', { id: 't', parentID: null, childrenIds: [], data: { itemContainer: { containerType: { spaceItems: { _0: 's' } } } } },
        ],
      },
    ],
  },
});

function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-arc-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('macOS looks in Application Support/Arc', async (t) => {
  const home = tempDir(t);
  const [candidate] = await arcSidebarCandidates({ platform: 'darwin', homeDir: home });
  assert.equal(candidate, path.join(home, 'Library', 'Application Support', 'Arc', 'StorableSidebar.json'));
  assert.deepEqual(await detectArcSidebar({ platform: 'darwin', homeDir: home }), { state: 'missing' });

  fs.mkdirSync(path.dirname(candidate), { recursive: true });
  fs.writeFileSync(candidate, SIDEBAR);
  assert.deepEqual(await detectArcSidebar({ platform: 'darwin', homeDir: home }), { state: 'found' });
  const read = await readDetectedArcSidebar({ platform: 'darwin', homeDir: home });
  assert.equal(read.ok, true);
  assert.equal(read.spaces[0].name, 'Work');
});

test('Windows finds exactly one Arc package by prefix', async (t) => {
  const local = tempDir(t);
  const env = { LOCALAPPDATA: local };
  assert.deepEqual(await arcSidebarCandidates({ platform: 'win32', env }), []);

  const arcDir = path.join(local, 'Packages', 'TheBrowserCompany.Arc_ttt1ap7aakyb4', 'LocalCache', 'Local', 'Arc');
  fs.mkdirSync(arcDir, { recursive: true });
  fs.writeFileSync(path.join(arcDir, 'StorableSidebar.json'), SIDEBAR);
  fs.mkdirSync(path.join(local, 'Packages', 'SomethingElse'), { recursive: true });
  assert.deepEqual(await arcSidebarCandidates({ platform: 'win32', env }), [path.join(arcDir, 'StorableSidebar.json')]);
  assert.deepEqual(await detectArcSidebar({ platform: 'win32', env }), { state: 'found' });

  // Two Arc packages are ambiguous: fall back to Choose file….
  fs.mkdirSync(path.join(local, 'Packages', 'TheBrowserCompany.Arc_other'), { recursive: true });
  assert.deepEqual(await arcSidebarCandidates({ platform: 'win32', env }), []);
});

test('Linux has no Arc install to find', async () => {
  assert.deepEqual(await arcSidebarCandidates({ platform: 'linux', homeDir: '/home/x' }), []);
  assert.deepEqual(await detectArcSidebar({ platform: 'linux', homeDir: '/home/x' }), { state: 'unsupported' });
});

test('a chosen file is read and parsed', async (t) => {
  const dir = tempDir(t);
  const file = path.join(dir, 'StorableSidebar.json');
  fs.writeFileSync(file, SIDEBAR);
  const read = await readArcSidebarFile(file);
  assert.equal(read.ok, true);
  assert.deepEqual(read.spaces[0].tabs.map((tab) => tab.url), ['https://a.example.com/']);
});

test('reading refuses missing, non-Arc, oversized and changing files', async (t) => {
  const dir = tempDir(t);
  assert.deepEqual(await readArcSidebarFile(path.join(dir, 'nope.json')), { error: 'missing' });

  const other = path.join(dir, 'other.json');
  fs.writeFileSync(other, '{"roots":{}}');
  assert.deepEqual(await readArcSidebarFile(other), { error: 'not-arc' });

  assert.deepEqual(await readArcSidebarFile(dir), { error: 'unreadable' });

  const big = path.join(dir, 'big.json');
  fs.writeFileSync(big, '');
  const fakeStat = (size, mtimeMs = 1) => ({ isFile: () => true, size, mtimeMs });
  const fakeFs = (stats, bytes = Buffer.from(SIDEBAR)) => ({
    open: async () => {
      let call = 0;
      return { stat: async () => stats[Math.min(call++, stats.length - 1)], readFile: async () => bytes, close: async () => {} };
    },
  });
  assert.deepEqual(await readArcSidebarFile(big, { fsPromises: fakeFs([fakeStat(33 * 1024 * 1024)]) }), { error: 'too-large' });
  assert.deepEqual(await readArcSidebarFile(big, { fsPromises: fakeFs([fakeStat(10, 1), fakeStat(12, 2)]) }), { error: 'source-saving' });
  const denied = { open: async () => { const e = new Error('denied'); e.code = 'EPERM'; throw e; } };
  assert.deepEqual(await readArcSidebarFile(big, { fsPromises: denied }), { error: 'permission' });
});
