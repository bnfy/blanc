const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const inventoryText = fs.readFileSync(path.join(root, 'security/audit-surface-inventory.json'), 'utf8');
const checker = import('../../scripts/audit-surface-inventory.mjs');

test('every boundary entry matches its file hash and literal channels', async () => {
  const { inventoryDrift, preloadCoverageProblems } = await checker;
  const data = JSON.parse(inventoryText);
  assert.ok(data.boundaries.length >= 53);
  assert.ok(data.preloads.length >= 16);
  assert.deepEqual(preloadCoverageProblems(data), []);
  assert.deepEqual(inventoryDrift(data), [],
    'review the boundary change, then run npm run audit-inventory:write');
});

test('the committed inventory is exactly what --write renders', async () => {
  const { refreshInventory, render } = await checker;
  assert.equal(render(refreshInventory(JSON.parse(inventoryText))), inventoryText);
});

test('channel extraction keeps the inventory conventions', async () => {
  const { extractLiteralChannels } = await checker;
  const source = [
    "ipcMain.handle('tabs:create', () => {});",
    "ipcRenderer.invoke(\"pages:settings:get\");",
    'wc.send(`chrome:find-result`, {});',
    "ipcRenderer.sendSync('dark-websites:query');",
    "wc.on('did-navigate', () => {});",
    "autoUpdater.on?.('error', () => {});",
    "chromeHandle('chrome:history-list', () => []);",
    "chromeOn('chrome:layout', () => {});",
    "handle('pages:surface:close', [], () => {});",
    "handleEvent('pages:start:data', 'newtab', () => ({}));",
    "for (const [channel, fn] of [['chrome:workspaces-move', move]]) chromeHandle(channel, fn);",
    "const GET_CHANNEL = 'webrtc:audio-buffer:get';",
    'ipcRenderer.sendSync(GET_CHANNEL);',
    // Not literal channel registrations.
    "wc.once('destroyed', () => {});",
    'ipcMain.on(`tabs:${name}`, () => {});',
    'ipcMain.handle(IMPORTED_CHANNEL, () => {});',
    "session.fromPartition('persist:blanc');",
    "openSettingsSection('blocking');",
    "throw new DOMException('Share ended', 'AbortError');",
    // 'tabs:create' again, so the result is deduplicated.
    "ipcRenderer.invoke('tabs:create');",
  ].join('\n');
  assert.deepEqual(extractLiteralChannels(source), [
    'chrome:find-result',
    'chrome:history-list',
    'chrome:layout',
    'chrome:workspaces-move',
    'dark-websites:query',
    'did-navigate',
    'error',
    'pages:settings:get',
    'pages:start:data',
    'pages:surface:close',
    'tabs:create',
    'webrtc:audio-buffer:get',
  ]);
});

test('drift in a boundary file is reported', async (t) => {
  const { inventoryDrift, refreshInventory } = await checker;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-audit-inventory-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, 'src'));
  const file = path.join(dir, 'src/boundary.js');
  fs.writeFileSync(file, "ipcMain.handle('tabs:create', f);\nipcMain.on('tabs:close', g);\n");
  const data = refreshInventory({ boundaries: [{ file: 'src/boundary.js', sha256: '', literalChannels: [] }] }, dir);
  assert.deepEqual(data.boundaries[0].literalChannels, ['tabs:close', 'tabs:create']);
  assert.deepEqual(inventoryDrift(data, dir), []);

  fs.writeFileSync(file, "ipcMain.handle('tabs:create', f);\nipcMain.on('tabs:reopen', g);\n");
  assert.deepEqual(inventoryDrift(data, dir), [
    'src/boundary.js: sha256 does not match the file',
    'src/boundary.js: unlisted channels tabs:reopen',
    'src/boundary.js: listed channels no longer present tabs:close',
  ]);

  const unsorted = structuredClone(refreshInventory(data, dir));
  unsorted.boundaries[0].literalChannels.reverse();
  assert.deepEqual(inventoryDrift(unsorted, dir), ['src/boundary.js: literalChannels must be sorted and unique']);

  unsorted.boundaries[0].file = 'src/missing.js';
  assert.throws(() => inventoryDrift(unsorted, dir), /boundary file is missing: src\/missing\.js/);
  unsorted.boundaries[0].file = '../outside.js';
  assert.throws(() => inventoryDrift(unsorted, dir), /not a plain repository path/);
});

test('preload coverage gaps are reported', async (t) => {
  const { preloadCoverageProblems } = await checker;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-audit-preloads-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, 'src/main'), { recursive: true });
  for (const name of ['a-preload.js', 'b-preload.js', 'c-preload-helper.js', 'main.js']) {
    fs.writeFileSync(path.join(dir, 'src/main', name), '');
  }
  const data = {
    preloads: ['src/main/b-preload.js', 'src/main/a-preload.js'],
    boundaries: [
      { file: 'src/main/b-preload.js', role: 'preload' },
      { file: 'src/main/a-preload.js', role: 'privileged implementation or service' },
    ],
  };
  assert.deepEqual(preloadCoverageProblems(data, dir), [
    'src/main/c-preload-helper.js: preload-named file has no boundary entry',
    'src/main/a-preload.js: listed preload needs a boundary entry with role "preload"',
    'preloads must be sorted and unique',
    'boundaries must be sorted by file and unique',
  ]);
});
