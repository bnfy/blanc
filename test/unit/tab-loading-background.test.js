'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const {
  PAGE_BACKGROUND,
  FIRST_CONTENT_WORLD_ID,
  FIRST_CONTENT_SCRIPT,
  FIRST_CONTENT_FALLBACK_MS,
  loadingBackground,
  primeLoadingBackground,
} = require('../../src/main/tab-loading-background');

const tokens = JSON.parse(fs.readFileSync(path.join(__dirname, '../../tokens/tokens.json'), 'utf8'));
const bgToken = tokens.tokens.find((t) => t.name === 'bg');
const DARK = bgToken.values.dark;
const PRIVATE = bgToken.values.private;

/** A view whose first-content waits the test settles by hand. */
function fakeView() {
  const wc = new EventEmitter();
  wc.destroyed = false;
  wc.isDestroyed = () => wc.destroyed;
  wc.waits = [];
  wc.executeJavaScriptInIsolatedWorld = (worldId, scripts) => new Promise((resolve, reject) => {
    wc.waits.push({ worldId, scripts, resolve, reject });
  });
  const colors = [];
  return { webContents: wc, colors, setBackgroundColor: (c) => colors.push(c) };
}

const commit = (view) => view.webContents.emit('did-navigate', {}, 'https://example.test/', 200, 'OK');
const flush = () => new Promise((resolve) => setImmediate(resolve));

test('dark and private tabs load on the bg token; light tabs keep the page white', () => {
  assert.equal(loadingBackground({ dark: true, private: false }), DARK);
  assert.equal(loadingBackground({ dark: false, private: true }), PRIVATE);
  assert.equal(loadingBackground({ dark: true, private: true }), PRIVATE);
  assert.equal(loadingBackground({ dark: false, private: false }), null);
  assert.equal(PAGE_BACKGROUND, '#ffffff');
});

test('a dark tab stays dark until its first document paints content, then returns to white', async () => {
  const view = fakeView();
  assert.equal(primeLoadingBackground(view, { dark: true }), true);
  assert.deepEqual(view.colors, [DARK]);
  commit(view);
  await flush();
  assert.equal(view.webContents.waits.length, 1);
  assert.equal(view.webContents.waits[0].worldId, FIRST_CONTENT_WORLD_ID);
  assert.deepEqual(view.webContents.waits[0].scripts, [{ code: FIRST_CONTENT_SCRIPT }]);
  // DOM ready and the end of loading are not enough: an app shell paints an
  // empty white page long before its theme arrives.
  view.webContents.emit('dom-ready');
  view.webContents.emit('did-stop-loading');
  await flush();
  assert.deepEqual(view.colors, [DARK]);
  view.webContents.waits[0].resolve(true);
  await flush();
  assert.deepEqual(view.colors, [DARK, '#ffffff']);
  // Later documents keep white: an unstyled page must never draw on dark.
  commit(view);
  await flush();
  assert.equal(view.webContents.waits.length, 1, 'no further waits after the first document');
  assert.equal(view.webContents.listenerCount('did-navigate'), 0);
  assert.equal(view.webContents.listenerCount('did-fail-load'), 0);
});

test('only the newest document\'s wait counts', async () => {
  const view = fakeView();
  primeLoadingBackground(view, { dark: true });
  commit(view);
  await flush();
  commit(view);
  await flush();
  const [first, second] = view.webContents.waits;
  first.reject(new Error('Script failed to execute')); // its document is gone
  await flush();
  assert.deepEqual(view.colors, [DARK]);
  second.resolve(true);
  await flush();
  assert.deepEqual(view.colors, [DARK, '#ffffff']);
});

test('a wait that cannot run fails open to white', async () => {
  const view = fakeView();
  primeLoadingBackground(view, { dark: true });
  commit(view);
  await flush();
  view.webContents.waits[0].reject(new Error('Render frame was disposed'));
  await flush();
  assert.deepEqual(view.colors, [DARK, '#ffffff']);
});

test('a main-frame load failure returns to white; an abort or a subframe failure does not', () => {
  const view = fakeView();
  primeLoadingBackground(view, { private: true });
  view.webContents.emit('did-fail-load', {}, -3, 'ERR_ABORTED', 'https://example.test/file.zip', true);
  view.webContents.emit('did-fail-load', {}, -105, 'ERR_NAME_NOT_RESOLVED', 'https://ads.example/', false);
  assert.deepEqual(view.colors, [PRIVATE]);
  view.webContents.emit('did-fail-load', {}, -105, 'ERR_NAME_NOT_RESOLVED', 'https://nope.example/', true);
  assert.deepEqual(view.colors, [PRIVATE, '#ffffff']);
  assert.equal(view.webContents.listenerCount('did-navigate'), 0);
});

test('a light tab is left alone', () => {
  const view = fakeView();
  assert.equal(primeLoadingBackground(view, { dark: false, private: false }), false);
  commit(view);
  assert.deepEqual(view.colors, []);
  assert.equal(view.webContents.waits.length, 0);
  assert.equal(view.webContents.listenerCount('did-navigate'), 0);
});

test('priming again (a woken tab reloading) replaces the earlier wait', async () => {
  const view = fakeView();
  primeLoadingBackground(view, { dark: true });
  commit(view);
  await flush();
  primeLoadingBackground(view, { dark: true });
  assert.equal(view.webContents.listenerCount('did-navigate'), 1);
  view.webContents.waits[0].resolve(true); // the earlier document's wait
  await flush();
  assert.deepEqual(view.colors, [DARK, DARK]);
  commit(view);
  await flush();
  view.webContents.waits[1].resolve(true);
  await flush();
  assert.deepEqual(view.colors, [DARK, DARK, '#ffffff']);
});

test('dead or missing contents are never touched', () => {
  assert.equal(primeLoadingBackground(null, { dark: true }), false);
  assert.equal(primeLoadingBackground({}, { dark: true }), false, 'post-close: webContents is undefined');
  const view = fakeView();
  view.webContents.destroyed = true;
  assert.equal(primeLoadingBackground(view, { dark: true }), false);
  assert.deepEqual(view.colors, []);
});

test('a view destroyed before its first content is not repainted', async () => {
  const view = fakeView();
  primeLoadingBackground(view, { dark: true });
  commit(view);
  await flush();
  view.webContents.destroyed = true;
  view.webContents.waits[0].resolve(true);
  await flush();
  assert.deepEqual(view.colors, [DARK]);
});

/** Run the page-side script against a fake document and performance timeline. */
function runFirstContentScript({ painted = false, visible = true } = {}) {
  const observers = [];
  const listeners = new Map();
  const timers = [];
  const document = {
    visibilityState: visible ? 'visible' : 'hidden',
    addEventListener: (type, fn) => listeners.set(type, fn),
    removeEventListener: (type) => listeners.delete(type),
  };
  const entries = painted ? [{ name: 'first-contentful-paint' }] : [];
  const sandbox = {
    document,
    performance: { getEntriesByName: (name) => entries.filter((e) => e.name === name) },
    PerformanceObserver: class {
      constructor(callback) { this.callback = callback; this.disconnected = false; observers.push(this); }
      observe(options) { this.options = options; }
      disconnect() { this.disconnected = true; }
    },
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
  };
  const promise = vm.runInNewContext(FIRST_CONTENT_SCRIPT, sandbox);
  return { promise, observers, listeners, timers, document };
}

async function settled(promise) {
  let state = 'pending';
  promise.then((v) => { state = v; });
  await flush();
  return state;
}

test('the page script resolves at the first contentful paint, including one already reported', async () => {
  const already = runFirstContentScript({ painted: true });
  assert.equal(await settled(already.promise), true);

  const later = runFirstContentScript();
  assert.equal(await settled(later.promise), 'pending');
  assert.equal(later.observers[0].options.type, 'paint');
  assert.equal(later.observers[0].options.buffered, true);
  later.observers[0].callback({ getEntriesByName: () => [] }, later.observers[0]);
  assert.equal(await settled(later.promise), 'pending', 'first-paint alone is not content');
  later.observers[0].callback({ getEntriesByName: () => [{}] }, later.observers[0]);
  assert.equal(await settled(later.promise), true);
  assert.equal(later.observers[0].disconnected, true);
});

test('the page script gives up only after the page has been visible for a while', async () => {
  const hidden = runFirstContentScript({ visible: false });
  assert.equal(hidden.timers.length, 0, 'a background tab waits until it is shown');
  hidden.document.visibilityState = 'visible';
  hidden.listeners.get('visibilitychange')();
  assert.equal(hidden.listeners.has('visibilitychange'), false);
  assert.equal(hidden.timers.length, 1);
  assert.equal(hidden.timers[0].ms, FIRST_CONTENT_FALLBACK_MS);
  hidden.timers[0].fn();
  assert.equal(await settled(hidden.promise), false);
});

test('the module stays free of Electron', () => {
  const source = fs.readFileSync(path.join(__dirname, '../../src/main/tab-loading-background.js'), 'utf8');
  assert.doesNotMatch(source, /^(?!\s*\/\/).*require\(['"]electron['"]\)/m);
});

test('its isolated world is its own', () => {
  const main = path.join(__dirname, '../../src/main');
  for (const file of fs.readdirSync(main).filter((f) => f.endsWith('.js'))) {
    if (file === 'tab-loading-background.js') continue;
    const source = fs.readFileSync(path.join(main, file), 'utf8');
    assert.doesNotMatch(source, new RegExp(`\\b${FIRST_CONTENT_WORLD_ID}\\b`), `${file} uses world ${FIRST_CONTENT_WORLD_ID}`);
  }
});

const viewSource = fs.readFileSync(path.join(__dirname, '../../src/main/tab-view.js'), 'utf8');
const mainSource = fs.readFileSync(path.join(__dirname, '../../src/main/main.js'), 'utf8');

test('every new tab view and adopted link child is primed', () => {
  const create = viewSource.match(/function createTabView\(tab\) \{[\s\S]*?\n\}/)?.[0] ?? '';
  assert.match(create, /primeTabLoadingBackground\(view, tab\)/);
  assert.match(viewSource, /new WebContentsView\(\{ webContents: options\.webContents \}\)[\s\S]{0,200}primeTabLoadingBackground\(childView, tab\)/);
});

test('a retained quiet tab is primed before it reloads', () => {
  const wake = mainSource.match(/async function wakeTab\([\s\S]*?\n\}/)?.[0] ?? '';
  assert.match(wake, /if \(retained\) primeTabLoadingBackground\(view, tab\);/);
});
