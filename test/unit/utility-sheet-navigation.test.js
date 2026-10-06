'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

// Lift the shipped queue rather than testing a mirror. The boundary ends at
// utilitySheetNavigationReady so changes to the production sequencing logic
// must keep these concurrency properties true.
const mainSource = fs.readFileSync(path.join(__dirname, '../../src/main/main.js'), 'utf8');
const queueSource = mainSource.match(
  /const utilitySheetNavigations = new WeakMap\(\);[\s\S]*?\nfunction utilitySheetNavigationReady\(runtime, sheet\) \{[\s\S]*?\n\}/
)?.[0];

test('the utility-sheet navigation queue is still liftable from main.js', () => {
  assert.ok(queueSource, 'utility-sheet queue not found — update this test with it');
});

function loadQueue(onFailure = () => {}) {
  const sandbox = {
    discardFailedUtilitySheet: onFailure,
    liveViewContents: (view) => {
      const wc = view?.webContents;
      return wc && !wc.isDestroyed() ? wc : null;
    },
    sameUtilityPage: (a, b) => a === b,
    // Resolve the globals at call time so node:test mock timers apply.
    setTimeout: (...args) => setTimeout(...args),
    clearTimeout: (id) => clearTimeout(id),
  };
  vm.runInNewContext(
    `${queueSource}\nthis.__schedule = scheduleUtilitySheetNavigation; this.__cancel = cancelUtilitySheetNavigation; this.__deadline = UTILITY_SHEET_LOAD_DEADLINE_MS;`,
    sandbox
  );
  return { schedule: sandbox.__schedule, cancel: sandbox.__cancel, deadline: sandbox.__deadline };
}

function controlledSheet() {
  const calls = [];
  const pending = [];
  let active = 0;
  let maximumActive = 0;
  const wc = {
    isDestroyed: () => false,
    loadURL(url) {
      calls.push(url);
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      return new Promise((resolve) => pending.push(() => {
        active -= 1;
        resolve();
      }));
    },
  };
  const view = { webContents: wc };
  return {
    sheet: { view, wc },
    calls,
    pending,
    maximumActive: () => maximumActive,
  };
}

test('only the newest utility destination starts when requests queue in one turn', async () => {
  const { schedule } = loadQueue();
  const h = controlledSheet();
  const runtime = { utilitySheetView: h.sheet.view, utilitySheetUrl: 'blanc://bookmarks/' };
  const first = schedule(runtime, h.sheet, runtime.utilitySheetUrl);
  runtime.utilitySheetUrl = 'blanc://downloads/';
  const second = schedule(runtime, h.sheet, runtime.utilitySheetUrl);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(h.calls, ['blanc://downloads/']);
  h.pending.shift()();
  await Promise.all([first, second]);
});

test('a later utility load waits for the active native load to settle', async () => {
  const { schedule } = loadQueue();
  const h = controlledSheet();
  const runtime = { utilitySheetView: h.sheet.view, utilitySheetUrl: 'blanc://bookmarks/' };
  const first = schedule(runtime, h.sheet, runtime.utilitySheetUrl);
  await Promise.resolve();
  assert.deepEqual(h.calls, ['blanc://bookmarks/']);

  runtime.utilitySheetUrl = 'blanc://downloads/';
  const second = schedule(runtime, h.sheet, runtime.utilitySheetUrl);
  await Promise.resolve();
  assert.deepEqual(h.calls, ['blanc://bookmarks/'], 'loadURL calls must never overlap');
  h.pending.shift()();
  await first;
  await Promise.resolve();
  assert.deepEqual(h.calls, ['blanc://bookmarks/', 'blanc://downloads/']);
  assert.equal(h.maximumActive(), 1);
  h.pending.shift()();
  await second;
});

test('hiding the sheet cancels a queued destination', async () => {
  const { schedule, cancel } = loadQueue();
  const h = controlledSheet();
  const runtime = { utilitySheetView: h.sheet.view, utilitySheetUrl: 'blanc://bookmarks/' };
  const first = schedule(runtime, h.sheet, runtime.utilitySheetUrl);
  await Promise.resolve();

  runtime.utilitySheetUrl = 'blanc://downloads/';
  const second = schedule(runtime, h.sheet, runtime.utilitySheetUrl);
  runtime.utilitySheetUrl = null;
  cancel(h.sheet.view);
  h.pending.shift()();
  await Promise.all([first, second]);
  assert.deepEqual(h.calls, ['blanc://bookmarks/']);
});


test('a failed current utility load discards stale sheet state', async () => {
  const failed = [];
  const { schedule } = loadQueue((runtime, sheet) => failed.push([runtime, sheet]));
  const h = controlledSheet();
  h.sheet.wc.loadURL = () => Promise.reject(new Error('renderer exited'));
  const runtime = { utilitySheetView: h.sheet.view, utilitySheetUrl: 'blanc://settings/' };
  await schedule(runtime, h.sheet, runtime.utilitySheetUrl);
  assert.equal(failed.length, 1);
  assert.equal(failed[0][0], runtime);
  assert.equal(failed[0][1], h.sheet);
});

test('a superseded failed navigation cannot discard a replacement sheet', async () => {
  const failed = [];
  const { schedule } = loadQueue(() => failed.push(true));
  const h = controlledSheet();
  let reject;
  h.sheet.wc.loadURL = () => new Promise((_resolve, fail) => { reject = fail; });
  const runtime = { utilitySheetView: h.sheet.view, utilitySheetUrl: 'blanc://settings/' };
  const pending = schedule(runtime, h.sheet, runtime.utilitySheetUrl);
  await Promise.resolve();
  runtime.utilitySheetView = {};
  reject(new Error('old renderer exited'));
  await pending;
  assert.equal(failed.length, 0);
});


test('a superseded failure on the same view leaves the newest request queued', async () => {
  const failed = [];
  const { schedule } = loadQueue(() => failed.push(true));
  const h = controlledSheet();
  let reject;
  h.sheet.wc.loadURL = url => {
    h.calls.push(url);
    return url.includes('history') ? new Promise((_resolve, fail) => { reject = fail; }) : Promise.resolve();
  };
  const runtime = { utilitySheetView: h.sheet.view, utilitySheetUrl: 'blanc://history/' };
  const first = schedule(runtime, h.sheet, runtime.utilitySheetUrl);
  await Promise.resolve();
  runtime.utilitySheetUrl = 'blanc://settings/';
  const second = schedule(runtime, h.sheet, runtime.utilitySheetUrl);
  reject(new Error('old load failed'));
  await Promise.all([first, second]);
  assert.deepEqual(h.calls, ['blanc://history/', 'blanc://settings/']);
  assert.equal(failed.length, 0);
});


// #548: the sheet is attached, transparent and focused before its document
// commits. A load that never settles must not leave it swallowing clicks.
test('a utility load that never settles is discarded at the deadline', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const failed = [];
  const { schedule, deadline } = loadQueue((runtime, sheet) => failed.push([runtime, sheet]));
  assert.ok(deadline >= 5000 && deadline <= 15000, `deadline ${deadline} ms`);
  const h = controlledSheet();
  const runtime = { utilitySheetView: h.sheet.view, utilitySheetUrl: 'blanc://settings/' };
  schedule(runtime, h.sheet, runtime.utilitySheetUrl);
  await Promise.resolve();
  t.mock.timers.tick(deadline - 1);
  assert.equal(failed.length, 0);
  t.mock.timers.tick(1);
  assert.equal(failed.length, 1);
  assert.equal(failed[0][1], h.sheet);
});

test('a utility load that settles in time disarms the deadline', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const failed = [];
  const { schedule, deadline } = loadQueue(() => failed.push(true));
  const h = controlledSheet();
  const runtime = { utilitySheetView: h.sheet.view, utilitySheetUrl: 'blanc://settings/' };
  const pending = schedule(runtime, h.sheet, runtime.utilitySheetUrl);
  await Promise.resolve();
  h.pending.shift()();
  await pending;
  t.mock.timers.tick(deadline * 2);
  assert.equal(failed.length, 0);
});

test('hiding or redirecting the sheet disarms the old deadline', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const failed = [];
  const { schedule, cancel, deadline } = loadQueue(() => failed.push(true));
  const hidden = controlledSheet();
  const hiddenRuntime = { utilitySheetView: hidden.sheet.view, utilitySheetUrl: 'blanc://settings/' };
  schedule(hiddenRuntime, hidden.sheet, hiddenRuntime.utilitySheetUrl);
  hiddenRuntime.utilitySheetUrl = null;
  cancel(hidden.sheet.view);

  const moved = controlledSheet();
  const movedRuntime = { utilitySheetView: moved.sheet.view, utilitySheetUrl: 'blanc://settings/' };
  schedule(movedRuntime, moved.sheet, movedRuntime.utilitySheetUrl);
  movedRuntime.utilitySheetUrl = 'blanc://history/';
  t.mock.timers.tick(deadline);
  assert.equal(failed.length, 0);
});
