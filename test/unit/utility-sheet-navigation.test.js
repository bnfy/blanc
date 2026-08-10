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

function loadQueue() {
  const sandbox = {
    liveViewContents: (view) => {
      const wc = view?.webContents;
      return wc && !wc.isDestroyed() ? wc : null;
    },
    sameUtilityPage: (a, b) => a === b,
  };
  vm.runInNewContext(
    `${queueSource}\nthis.__schedule = scheduleUtilitySheetNavigation; this.__cancel = cancelUtilitySheetNavigation;`,
    sandbox
  );
  return { schedule: sandbox.__schedule, cancel: sandbox.__cancel };
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
