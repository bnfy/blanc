'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const main = fs.readFileSync(require.resolve('../../src/main/main'), 'utf8');
const pages = fs.readFileSync(require.resolve('../../src/main/pages'), 'utf8');
const lift = (start, end) => main.slice(main.indexOf(start), main.indexOf(end, main.indexOf(start)));

function harness() {
  const runtime = { id: 'window', surfaceGeneration: 1, utilitySheetUrl: 'blanc://tab-import/', window: { isDestroyed: () => false } };
  const reads = [];
  const opened = [];
  const forgotten = [];
  const requests = new Map();
  const context = {
    rt: () => runtime, tabImportSourceRequests: requests,
    sameUtilityPage: (a, b) => a === b,
    pendingTabHandoff: null,
    forgetTabImportForRuntime: (id) => { requests.delete(id); forgotten.push(id); },
  };
  vm.createContext(context);
  vm.runInContext(lift('function beginTabImportSourceRead()', '\nfunction tabImportOwner()'), context);
  vm.runInContext(lift('function discardUtilityImportState(', '\nfunction hideUtilitySheet('), context);
  context.hooks = { tabImport: {
    beginSourceRead: context.beginTabImportSourceRead,
    openSource: (source) => { opened.push(source); return { sessionId: 'session' }; },
    loadCandidates: async () => ({ candidates: [] }),
  } };
  context.browserImport = {
    readOpenTabs: (id) => new Promise((resolve) => reads.push({ id, resolve })),
  };
  context.handle = (_channel, _host, handler) => { context.openSource = handler; };
  const start = pages.indexOf("  handle('pages:tab-import:open-source'");
  const end = pages.indexOf("  handle('pages:tab-import:set-selection'", start);
  vm.runInContext(pages.slice(start, end), context);
  const finish = (index) => reads[index].resolve({ source: { label: reads[index].id }, candidates: [] });
  return { context, runtime, opened, forgotten, finish };
}

test('a source read settling after replacement cannot recreate the canceled local session', async () => {
  const { context: c, runtime, opened, finish } = harness();
  const pending = c.openSource('old');
  c.discardUtilityImportState(runtime);
  runtime.utilitySheetUrl = 'blanc://tab-handoff/';
  finish(0);
  assert.equal((await pending).error, 'session-unavailable');
  assert.equal(opened.length, 0);
});

test('cancel and reopen of the same route invalidates the old read identity', async () => {
  const { context: c, runtime, opened, finish } = harness();
  const old = c.openSource('old');
  c.discardUtilityImportState(runtime);
  runtime.surfaceGeneration += 1;
  const current = c.openSource('current');
  finish(1);
  assert.equal((await current).sessionId, 'session');
  finish(0);
  assert.equal((await old).error, 'session-unavailable');
  assert.deepEqual(opened.map((source) => source.sourceLabel), ['current']);
});

test('overlapping source selection keeps only the latest read', async () => {
  const { context: c, opened, finish } = harness();
  const old = c.openSource('old');
  const current = c.openSource('current');
  finish(0);
  assert.equal((await old).error, 'session-unavailable');
  finish(1);
  assert.equal((await current).sessionId, 'session');
  assert.deepEqual(opened.map((source) => source.sourceLabel), ['current']);
});

test('closing a native window or changing its surface generation invalidates a source read', async () => {
  for (const change of [
    (runtime) => { runtime.window = null; },
    (runtime) => { runtime.window.isDestroyed = () => true; },
    (runtime) => { runtime.surfaceGeneration += 1; },
  ]) {
    const { context: c, runtime, opened, finish } = harness();
    const pending = c.openSource('old');
    change(runtime);
    finish(0);
    assert.equal((await pending).error, 'session-unavailable');
    assert.equal(opened.length, 0);
  }
});

test('sheet cleanup is owner-specific and preserves an explicitly refreshed handoff', () => {
  const { context: c, runtime, forgotten } = harness();
  c.pendingTabHandoff = { runtimeId: runtime.id };
  c.discardUtilityImportState(runtime);
  assert.deepEqual(forgotten, ['window']);
  assert.ok(c.pendingTabHandoff, 'replacing a local sheet must not discard the incoming handoff');
  runtime.utilitySheetUrl = 'blanc://tab-handoff/';
  c.discardUtilityImportState(runtime, { discardTabHandoff: false });
  assert.ok(c.pendingTabHandoff, 'loading-to-review refresh keeps the pending claim');
  c.pendingTabHandoff = { runtimeId: 'another-window' };
  c.discardUtilityImportState(runtime);
  assert.ok(c.pendingTabHandoff, 'another window owns the handoff');
  c.pendingTabHandoff = { runtimeId: runtime.id };
  c.discardUtilityImportState(runtime);
  assert.equal(c.pendingTabHandoff, null);
});
