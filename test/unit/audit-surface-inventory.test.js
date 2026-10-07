const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const inventoryText = fs.readFileSync(path.join(root, 'security/audit-surface-inventory.json'), 'utf8');
const checker = import('../../scripts/audit-surface-inventory.mjs');

test('every boundary entry matches its file hash and literal channels', async () => {
  const { inventoryDrift } = await checker;
  const data = JSON.parse(inventoryText);
  assert.ok(data.boundaries.length >= 46);
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
    // Not literal channel registrations.
    "wc.once('destroyed', () => {});",
    'ipcMain.on(`tabs:${name}`, () => {});',
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
