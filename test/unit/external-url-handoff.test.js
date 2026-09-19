'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const vm = require('node:vm');
const { createExternalUrlHandoff } = require('../../src/main/external-url-handoff');
const { externalWindowRuntime } = require('../../src/main/window-activation');

function harness({ ready = true, chromeReady = true } = {}) {
  const makeWindow = () => Object.assign(new EventEmitter(), { isDestroyed: () => false });
  const primary = { profileId: 'personal', chromeReady, window: makeWindow() };
  const work = { profileId: 'work', chromeReady, window: makeWindow() };
  const runtimes = [primary, work];
  const state = { ready, quitting: false, hidden: false, focused: primary, current: null };
  const application = Object.assign(new EventEmitter(), { isHidden: () => state.hidden });
  const created = [], activated = [], revealed = [], rebuilt = [];
  const handler = createExternalUrlHandoff({
    application,
    isReady: () => state.ready,
    isQuitting: () => state.quitting,
    getRuntime: (preferred) => externalWindowRuntime(runtimes, preferred ?? state.focused, primary, state.focused),
    ensureWindow(runtime) {
      if (runtime.window) return;
      rebuilt.push(runtime);
      runtime.chromeReady = false;
      runtime.window = makeWindow();
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
  const noListeners = () => {
    assert.deepEqual(application.eventNames(), []);
    for (const runtime of runtimes) assert.deepEqual(runtime.window?.eventNames() ?? [], []);
  };
  return { handler, application, primary, work, runtimes, state, created, activated, revealed, rebuilt, noListeners };
}

for (const event of ['hide', 'minimize']) {
  test(`${event} during chrome initialization preserves every URL without reactivation`, () => {
    const f = harness();
    f.runtimes.splice(1);
    f.primary.window = null;
    f.handler.open(['https://one.test/', 'https://two.test/']);
    f.primary.window.emit(event);
    // Cancellation stays effective even if native state changes again.
    f.primary.window.emit('restore');
    f.primary.chromeReady = true;
    f.handler.flush();
    f.handler.flush();
    assert.deepEqual(f.created.map((tab) => tab.url), ['https://one.test/', 'https://two.test/']);
    assert.deepEqual(f.activated, []);
    assert.deepEqual(f.revealed, []);
    f.noListeners();
  });
}

test('hiding an already inactive app while chrome loads cancels reveal without a resign event', () => {
  const f = harness({ chromeReady: false });
  f.handler.open(['https://example.test/']);
  f.state.hidden = true;
  f.primary.chromeReady = true;
  f.handler.flush();
  assert.equal(f.created.length, 1);
  assert.deepEqual(f.revealed, []);
  assert.deepEqual(f.activated, []);
  f.noListeners();
});

test('a handoff received while already hidden still reveals after readiness', () => {
  const f = harness({ chromeReady: false });
  f.state.hidden = true;
  f.handler.open(['https://example.test/']);
  f.primary.chromeReady = true;
  f.handler.flush();
  assert.deepEqual(f.activated, [1]);
  assert.deepEqual(f.revealed, [f.primary.window]);
  f.noListeners();
});

test('another explicit handoff renews activation after an earlier minimize', () => {
  const f = harness({ chromeReady: false });
  f.handler.open(['https://old.test/']);
  f.primary.window.emit('minimize');
  f.handler.open(['https://new.test/']);
  f.primary.chromeReady = true;
  f.handler.flush();
  assert.equal(f.created.length, 2);
  assert.deepEqual(f.activated, [2]);
  assert.equal(f.revealed.length, 1);
  f.noListeners();
});

for (const event of ['did-resign-active', 'before-quit', 'will-quit']) {
  test(`${event} removes queued activation listeners immediately`, () => {
    const f = harness({ chromeReady: false });
    f.handler.open(['https://example.test/']);
    assert.equal(f.primary.window.listenerCount('minimize'), 1);
    f.application.emit(event);
    f.noListeners();
    if (event.includes('quit')) f.state.quitting = true;
    f.primary.chromeReady = true;
    f.handler.flush();
    assert.equal(f.created.length, f.state.quitting ? 0 : 1);
    assert.deepEqual(f.revealed, []);
  });
}

test('closing the queued target removes its listeners and keeps fallback delivery in the background', () => {
  const f = harness({ chromeReady: false });
  f.state.focused = f.work;
  f.handler.open(['https://example.test/']);
  f.work.window.emit('closed');
  f.noListeners();
  f.runtimes.splice(1);
  f.state.focused = f.primary;
  f.primary.chromeReady = true;
  f.handler.flush();
  assert.equal(f.created[0].profileId, 'personal');
  assert.deepEqual(f.revealed, []);
});

test('superseding a queued target removes its listeners without canceling the new request', () => {
  const f = harness({ chromeReady: false });
  f.handler.open(['https://old.test/']);
  f.state.focused = f.work;
  f.handler.open(['https://new.test/']);
  assert.deepEqual(f.primary.window.eventNames(), []);
  assert.equal(f.work.window.listenerCount('minimize'), 1);
  f.primary.window.emit('minimize');
  f.work.chromeReady = true;
  f.handler.flush();
  assert.deepEqual(f.created.map((tab) => tab.url), ['https://new.test/']);
  assert.deepEqual(f.revealed, [f.work.window]);
  f.noListeners();
});

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
