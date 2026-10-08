const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

// bridges.mjs is ESM; it is imported, never run, so nothing is written.
let api;
test.before(async () => {
  api = await import('../../browser-api/bridges.mjs');
});

const read = (rel) => fs.readFileSync(path.join(__dirname, '../..', rel), 'utf8');
const TAB_PRELOAD = read('src/main/tab-preload.js');
const FILL_PRELOAD = read('src/main/fill-status-preload.js');
const PAGES = read('src/main/pages.js');
const SURFACE = read('src/main/fill-status-surface.js');
const FILL_RENDERER = read('src/renderer/fill-status.js');

function mutate(source, from, to) {
  assert.ok(source.includes(from), `fixture text missing: ${from}`);
  return source.replace(from, to);
}

const expectProblem = (problems, ...needles) =>
  assert.ok(problems.some((p) => needles.every((n) => p.includes(n))), problems.join('\n') || '(no problems reported)');

test('the shipped page bridges match bridges.json', () => {
  for (const [section, problems] of api.checkBridges()) assert.deepEqual(problems, [], section);
});

test('bridges.json validates and lists each member once', () => {
  const contract = api.loadBridges();
  assert.deepEqual(api.validateBridges(contract), []);
  for (const bridge of [contract.bowserPages, contract.blancFillStatus]) {
    assert.equal(new Set(bridge.members.map((m) => m.name)).size, bridge.members.length);
  }
});

test('a renamed bowserPages channel is reported', () => {
  const problems = api.checkPagesPreload(api.loadBridges(),
    mutate(TAB_PRELOAD, "invoke('pages:history:clear')", "invoke('pages:history:wipe')"));
  expectProblem(problems, 'blanc://history/ history.clear', "'pages:history:wipe'");
});

test('a member exposed on a host the contract does not list is reported', () => {
  const problems = api.checkPagesPreload(api.loadBridges(),
    mutate(TAB_PRELOAD, "mahjong: { played: () => invoke('pages:mahjong:played') },",
      "mahjong: { played: () => invoke('pages:mahjong:played') },\n      history: { clear: () => invoke('pages:history:clear') },"));
  expectProblem(problems, 'blanc://mahjong/', '"history.clear"', 'limits to history');
});

test('a bridge exposed to a web page is reported', () => {
  const anyScheme = mutate(TAB_PRELOAD, "if (window.location.protocol === 'blanc:') {", 'if (true) {');
  const problems = api.checkPagesPreload(api.loadBridges(),
    mutate(anyScheme, "} else if (host === 'mahjong') {", "} else if (host === 'mahjong' || host === 'example.com') {"));
  expectProblem(problems, 'untrusted document https://example.com/');
});

test('a dropped boolean coercion and a changed default are reported', () => {
  const contract = api.loadBridges();
  expectProblem(api.checkPagesPreload(contract,
    mutate(TAB_PRELOAD, "invoke('pages:surface:escape-arm', !!armed)", "invoke('pages:surface:escape-arm', armed)")), 'surface.armEscape');
  expectProblem(api.checkPagesPreload(contract,
    mutate(TAB_PRELOAD, 'openMahjong: (background = false)', 'openMahjong: (background = true)')), 'start.openMahjong (defaults)');
});

test('an event that stops returning its unsubscribe, or forwards ipcRenderer.on, is reported', () => {
  const contract = api.loadBridges();
  expectProblem(api.checkPagesPreload(contract,
    mutate(TAB_PRELOAD, "return () => ipcRenderer.removeListener('pages:surface:escape', listener);", '')),
  'surface.onEscape', 'unsubscribe');
  expectProblem(api.checkPagesPreload(contract,
    mutate(TAB_PRELOAD, "onStatus: (callback) => {\n          ipcRenderer.on(", "onStatus: (callback) => {\n          return ipcRenderer.on(")),
  'start.onStatus', 'returns a value');
});

test('the page-tint signal leaking to another internal page is reported', () => {
  const problems = api.checkPagesPreload(api.loadBridges(),
    mutate(TAB_PRELOAD, "window.location.host === 'newtab'", "window.location.host !== ''"));
  expectProblem(problems, 'blanc://settings/', "'page-tint:changed'");
});

test('pages.js allowing an extra host, or denying a listed one, is reported', () => {
  const contract = api.loadBridges();
  expectProblem(api.checkPagesMain(contract, {
    pagesSource: mutate(PAGES, "handle('pages:history:clear', 'history',", "handle('pages:history:clear', ['history', 'newtab'],"),
  }), "'pages:history:clear'", 'also allows newtab');
  expectProblem(api.checkPagesMain(contract, {
    pagesSource: mutate(PAGES, "handle('pages:bookmarks:list', ['bookmarks', 'newtab'],", "handle('pages:bookmarks:list', 'bookmarks',"),
  }), "'pages:bookmarks:list'", 'denies that host');
});

test('a missing or orphaned pages.js handler is reported', () => {
  const contract = api.loadBridges();
  expectProblem(api.checkPagesMain(contract, {
    pagesSource: mutate(PAGES, "handle('pages:downloads:clear-finished'", "handle('pages:downloads:clear-all'"),
  }), "'pages:downloads:clear-finished'", 'no handle()');
  expectProblem(api.checkPagesMain(contract, {
    pagesSource: mutate(PAGES, "handle('pages:downloads:clear-finished'", "handle('pages:downloads:clear-all'"),
  }), "'pages:downloads:clear-all'", 'no bowserPages member');
});

test('a page script using a member its host does not get is reported', () => {
  const contract = api.loadBridges();
  const scripts = new Map([['newtab', ['newtab.js']], ['tab-import', ['tab-import-open-tabs.js']]]);
  const sources = {
    'newtab.js': 'window.bowserPages?.history.clear(); window.bowserPages?.start.data();',
    'tab-import-open-tabs.js': 'const api = window.bowserPages?.tabImport;\napi.sources(); api?.deleteEverything();',
  };
  const problems = api.checkPagesRenderers(contract, { scripts, read: (f) => sources[f] });
  expectProblem(problems, 'newtab.js', 'bowserPages.history.clear');
  expectProblem(problems, 'tab-import-open-tabs.js', 'bowserPages.tabImport.deleteEverything');
  assert.equal(problems.length, 2, problems.join('\n'));
});

test('fill-status drift is reported: kinds, send sites, replies and returns', () => {
  const contract = api.loadBridges();
  const narrowed = structuredClone(contract);
  narrowed.blancFillStatus.types.FillKind.ts = narrowed.blancFillStatus.types.FillKind.ts.replace(" | 'filled'", '');
  expectProblem(api.checkFillPayloads(narrowed), 'FillKind', 'FILL_KINDS');
  expectProblem(api.checkFillPayloads(contract, {
    surfaceSource: mutate(SURFACE, "send('fill:show', { kind, mode, requestId });", "send('fill:show', { kind, mode, requestId, title });"),
  }), 'onShow', 'title');
  expectProblem(api.checkFillPayloads(contract, {
    rendererSource: mutate(FILL_RENDERER, 'window.blancFillStatus.reply({ requestId, verb });', 'window.blancFillStatus.reply({ requestId, verb, url });'),
  }), 'reply', 'url');
  expectProblem(api.checkFillPreload(contract,
    mutate(FILL_PRELOAD, "onShow: (fn) => { ipcRenderer.on('fill:show', (_e, payload) => fn(payload)); },",
      "onShow: (fn) => ipcRenderer.on('fill:show', (_e, payload) => fn(payload)),")), 'onShow', 'returns a value');
});
