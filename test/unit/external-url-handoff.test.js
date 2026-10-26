'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
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
  const created = [], createdOptions = [], activated = [], revealed = [], rebuilt = [];
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
    createTab(url, options) {
      const entry = { id: created.length + 1, url, profileId: state.current.profileId };
      created.push(entry);
      createdOptions.push(options);
      return url === 'https://refused.test/' ? null : entry.id;
    },
    activateTab(id) { activated.push(id); },
    revealWindow(window) { revealed.push(window); },
  });
  const noListeners = () => {
    assert.deepEqual(application.eventNames(), []);
    for (const runtime of runtimes) assert.deepEqual(runtime.window?.eventNames() ?? [], []);
  };
  return { handler, application, primary, work, runtimes, state, created, createdOptions, activated, revealed, rebuilt, noListeners };
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

test('explicit macOS HTML documents use the narrow local-file capability', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-local-html-'));
  const html = path.join(root, 'picked page.html');
  const text = path.join(root, 'ignored.txt');
  fs.writeFileSync(html, '<!doctype html><title>Picked</title>');
  fs.writeFileSync(text, 'not html');
  try {
    const f = harness();
    f.handler.openLocalFiles([text, html, '/tmp/missing.xhtml']);
    assert.deepEqual(f.created.map((tab) => tab.url), [pathToFileURL(fs.realpathSync.native(html)).href]);
    assert.deepEqual(f.createdOptions, [{ allowLocalFile: true }]);
    assert.deepEqual(f.activated, [1]);
    assert.deepEqual(f.revealed, [f.primary.window]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
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

test('routed links go to their destination window; others keep the window used last', () => {
  const { matchLinkRoute, resolveRoutedRuntime } = require('../../src/main/link-routes');
  const f = harness();
  const routes = [
    { id: 'a', match: { kind: 'domain', value: 'jira.example.com' }, destination: { profileId: 'work', spaceId: null, private: false } },
    { id: 'b', match: { kind: 'domain', value: 'gone.example' }, destination: { profileId: 'deleted', spaceId: null, private: false } },
    { id: 'c', match: { kind: 'contains', value: '/private/' }, destination: { profileId: 'work', spaceId: null, private: true } },
  ];
  const fresh = [];
  const routed = createExternalUrlHandoff({
    application: f.application,
    isReady: () => true,
    isQuitting: () => false,
    routeFor: (url) => matchLinkRoute(routes, url, { isLiveProfile: (id) => id !== 'deleted' })?.destination ?? null,
    getRuntime: (preferred, destination) => destination
      ? resolveRoutedRuntime(destination, preferred, {
        runtimes: f.runtimes.filter((runtime) => runtime.window),
        focusOrder: () => 0,
        openSpace: () => null,
        openProfileWindow: (profileId) => {
          const runtime = { profileId, chromeReady: true, window: null };
          fresh.push(runtime);
          f.runtimes.push(runtime);
          return runtime;
        },
      })
      : externalWindowRuntime(f.runtimes, preferred ?? f.state.focused, f.primary, f.state.focused),
    ensureWindow(runtime) {
      if (!runtime.window) runtime.window = Object.assign(new EventEmitter(), { isDestroyed: () => false });
    },
    isWindowReady: (runtime) => runtime.chromeReady,
    withRuntime(runtime, fn) { f.state.current = runtime; try { fn(); } finally { f.state.current = null; } },
    createTab(url, options) {
      f.created.push({ id: f.created.length + 1, url, runtime: f.state.current, private: options?.destination?.private === true });
      f.createdOptions.push(options);
      return f.created.length;
    },
    activateTab(id) { f.activated.push(id); },
    revealWindow(window) { f.revealed.push(window); },
  });

  routed.open(['https://jira.example.com/browse/X-1']);
  assert.equal(f.created[0].runtime, f.work, 'a matched link goes to its profile');
  assert.deepEqual(f.revealed, [f.work.window]);

  routed.open(['https://gone.example/']);
  assert.equal(f.created[1].runtime, f.primary, 'a deleted profile falls through to the window used last');
  assert.equal(f.createdOptions[1], undefined, 'an unmatched link is created exactly as before');

  routed.open(['https://other.test/private/x']);
  assert.equal(f.created[2].runtime, f.work);
  assert.equal(f.created[2].private, true);
  assert.deepEqual(fresh, []);
});

test('a multi-URL handoff routes each URL, keeps order per window and reveals only the last', () => {
  const { matchLinkRoute, resolveRoutedRuntime } = require('../../src/main/link-routes');
  const f = harness();
  const routes = [{ id: 'w', match: { kind: 'domain', value: 'work.test' }, destination: { profileId: 'work', spaceId: null, private: false } }];
  const handler = createExternalUrlHandoff({
    application: f.application,
    isReady: () => true,
    isQuitting: () => false,
    routeFor: (url) => matchLinkRoute(routes, url)?.destination ?? null,
    getRuntime: (preferred, destination) => destination
      ? resolveRoutedRuntime(destination, preferred, { runtimes: f.runtimes, focusOrder: () => 0, openSpace: () => null, openProfileWindow: () => null })
      : externalWindowRuntime(f.runtimes, preferred ?? f.state.focused, f.primary, f.state.focused),
    ensureWindow() {},
    isWindowReady: (runtime) => runtime.chromeReady,
    withRuntime(runtime, fn) { f.state.current = runtime; try { fn(); } finally { f.state.current = null; } },
    createTab(url) { f.created.push({ id: f.created.length + 1, url, profileId: f.state.current.profileId }); return f.created.length; },
    activateTab(id) { f.activated.push(id); },
    revealWindow(window) { f.revealed.push(window); },
  });
  f.work.chromeReady = false;
  f.primary.chromeReady = false;
  handler.open(['https://work.test/1', 'https://home.test/', 'https://work.test/2', 'https://home.test/last']);
  // The earlier URLs' window taking focus by itself doesn't cancel the reveal.
  f.application.emit('browser-window-focus', {}, f.work.window);
  f.work.chromeReady = true;
  f.primary.chromeReady = true;
  handler.flush();
  assert.deepEqual(f.created.map((tab) => [tab.url, tab.profileId]), [
    ['https://work.test/1', 'work'], ['https://home.test/', 'personal'],
    ['https://work.test/2', 'work'], ['https://home.test/last', 'personal'],
  ]);
  assert.deepEqual(f.activated, [4]);
  assert.deepEqual(f.revealed, [f.primary.window]);
  f.noListeners();
});
