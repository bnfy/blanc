'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const { createExternalUrlHandoff } = require('../../src/main/external-url-handoff');
const { externalWindowRuntime } = require('../../src/main/window-activation');

function harness({ ready = true, chromeReady = true } = {}) {
  const primary = { profileId: 'personal', chromeReady, window: { isDestroyed: () => false } };
  const work = { profileId: 'work', chromeReady, window: { isDestroyed: () => false } };
  const runtimes = [primary, work];
  const state = { ready, quitting: false, focused: primary, current: null };
  const created = [], activated = [], revealed = [], rebuilt = [];
  const handler = createExternalUrlHandoff({
    isReady: () => state.ready,
    isQuitting: () => state.quitting,
    getRuntime: (preferred) => externalWindowRuntime(runtimes, preferred ?? state.focused, primary, state.focused),
    ensureWindow(runtime) {
      if (runtime.window) return;
      rebuilt.push(runtime);
      runtime.chromeReady = false;
      runtime.window = { isDestroyed: () => false };
    },
    isWindowReady: (runtime) => runtime.chromeReady,
    withRuntime(runtime, fn) { state.current = runtime; try { fn(); } finally { state.current = null; } },
    createTab(url) {
      const entry = { id: created.length + 1, url, profileId: state.current.profileId };
      created.push(entry);
      return url === 'https://refused.test/' ? null : entry.id;
    },
    activateTab(id) { activated.push(id); },
    revealWindow(window) { revealed.push(window); },
  });
  return { handler, primary, work, runtimes, state, created, activated, revealed, rebuilt };
}

test('cold handoffs wait for startup release and target the restored profile', () => {
  const f = harness({ ready: false });
  f.handler.open(['https://one.test/']);
  f.handler.open(['https://two.test/']);
  f.handler.flush(); // chrome readiness must not bypass startup restore/blocker
  assert.deepEqual(f.created, []);
  f.state.focused = f.work;
  f.state.ready = true;
  f.handler.flush();
  assert.deepEqual(f.created.map((tab) => [tab.url, tab.profileId]), [
    ['https://one.test/', 'work'], ['https://two.test/', 'work'],
  ]);
  assert.deepEqual(f.activated, [2]);
  f.handler.flush();
  assert.equal(f.created.length, 2);
});

test('warm URL delivery stays pinned while its chrome loads and focus changes', () => {
  const f = harness({ chromeReady: false });
  f.state.focused = f.work;
  f.handler.open(['https://work.test/']);
  f.state.focused = f.primary;
  f.primary.chromeReady = true;
  f.handler.flush();
  assert.deepEqual(f.created, []);
  f.work.chromeReady = true;
  f.handler.flush();
  assert.equal(f.created[0].profileId, 'work');
  assert.deepEqual(f.revealed, [f.work.window]);
});

test('windowless handoff recreates primary and drains once without an app activate event', () => {
  const f = harness();
  f.runtimes.splice(1);
  f.primary.window = null;
  f.handler.open(['https://first.test/', 'https://second.test/']);
  assert.deepEqual(f.rebuilt, [f.primary]);
  assert.deepEqual(f.created, []);
  f.primary.chromeReady = true;
  f.handler.flush();
  f.handler.flush();
  assert.equal(f.created.length, 2);
  assert.deepEqual(f.activated, [2]);
  assert.equal(f.revealed.length, 1);
});

test('a later handoff supersedes foreground intent from an older loading window', () => {
  const f = harness();
  f.primary.chromeReady = false;
  f.handler.open(['https://old.test/']);
  f.state.focused = f.work;
  f.handler.open(['https://new.test/']);
  f.primary.chromeReady = true;
  f.handler.flush();
  assert.deepEqual(f.created.map((tab) => tab.url), ['https://new.test/', 'https://old.test/']);
  assert.deepEqual(f.activated, [1]);
  assert.deepEqual(f.revealed, [f.work.window]);
});

test('discarded receiving runtime falls back to the current live window', () => {
  const f = harness();
  f.work.chromeReady = false;
  f.state.focused = f.work;
  f.handler.open(['https://example.test/']);
  f.runtimes.splice(1);
  f.state.focused = f.primary;
  f.handler.flush();
  assert.equal(f.created[0].profileId, 'personal');
});

test('rejected/non-web URLs and quit never activate windows', () => {
  const f = harness();
  f.handler.open(['file:///tmp/local', 'blanc://settings/', '--flag']);
  assert.deepEqual(f.created, []);
  f.handler.open(['https://refused.test/']);
  assert.deepEqual(f.activated, []);
  f.state.quitting = true;
  f.handler.open(['https://late.test/']);
  f.handler.flush();
  assert.equal(f.created.length, 1);
  assert.deepEqual(f.revealed, []);
});

test('app activate preserves the chosen runtime/profile and flushes its pending work', () => {
  // Execute the production root to catch a future unconditional primary reset.
  const main = fs.readFileSync(require.resolve('../../src/main/main'), 'utf8');
  const source = main.slice(main.lastIndexOf("  app.on('activate',"), main.lastIndexOf("\n}));"));
  const primary = {}, secondary = { profileId: 'work' };
  const calls = [];
  const context = {
    app: { on(event, fn) { assert.equal(event, 'activate'); this.activate = fn; } },
    isQuitting: false, focusedRuntime: secondary, primaryRuntime: primary,
    resolveExternalRuntime: () => secondary,
    createMainWindow: (rt, options) => calls.push(['window', rt, options.ensureStartTab]),
    setFocusedLocalProfile: (id) => calls.push(['profile', id]),
    refreshDockMenu() {},
    withWindowRuntime: (rt, fn) => { assert.equal(rt, secondary); fn(); },
    refocusAddressBarIfWanted() {}, flushExternalUrls: () => calls.push(['flush']), flushTabHandoffs() {},
  };
  vm.runInNewContext(source, context);
  context.app.activate();
  assert.equal(context.focusedRuntime, secondary);
  assert.deepEqual(calls, [['window', secondary, true], ['profile', 'work'], ['flush']]);
  context.isQuitting = true;
  context.app.activate();
  assert.equal(calls.length, 3);
});
