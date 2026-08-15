'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

// tab-view.js requires Electron and cannot be required here. Lift the real
// function sources and run them in a sandbox, so these assert the shipped
// code rather than a copy of it (same approach as settings-fanout-reload.test.js).
const viewSource = fs.readFileSync(path.join(__dirname, '../../src/main/tab-view.js'), 'utf8');
const mainSource = fs.readFileSync(path.join(__dirname, '../../src/main/main.js'), 'utf8');

const liveViewContentsSource = viewSource.match(/const liveViewContents = \(view\) => \{[\s\S]*?\n\};/)?.[0];
const liveContentsSource = viewSource.match(/const liveContents = \(tab\) => liveViewContents\(tab\?\.view\);/)?.[0];
const createTabViewSource = viewSource.match(/function createTabView\(tab\) \{[\s\S]*?\n\}/)?.[0];
const wireSource = viewSource.match(/function wireTabView\(tab, view, \{ owner, adopted \}\) \{[\s\S]*?\n\}/)?.[0];
const watchCursorForSource = mainSource.match(/function watchCursorFor\(wc, offset, bind\) \{[\s\S]*?\n\}/)?.[0];

test('tab-view.js still exports the functions these tests lift', () => {
  assert.ok(liveViewContentsSource, 'liveViewContents not found in tab-view.js — update this test with it');
  assert.ok(liveContentsSource, 'liveContents not found in tab-view.js — update this test with it');
  assert.ok(createTabViewSource, 'createTabView not found in tab-view.js — update this test with it');
});

function loadLiveContents() {
  const sandbox = {};
  vm.runInNewContext(`${liveViewContentsSource}\n${liveContentsSource}\nthis.__tab = liveContents; this.__view = liveViewContents;`, sandbox);
  return { liveContents: sandbox.__tab, liveViewContents: sandbox.__view };
}

test('liveContents refuses every not-live shape', () => {
  const { liveContents } = loadLiveContents();
  assert.equal(liveContents(undefined), null);
  assert.equal(liveContents(null), null);
  assert.equal(liveContents({}), null, 'a tab with no view');
  assert.equal(liveContents({ view: null }), null, 'a quiet tab: view nulled');
  // THE case this helper exists for: after wc.close(), WebContentsView.webContents
  // reads back undefined — not a destroyed object — so any `.isDestroyed()`
  // guard that dereferences first throws instead of guarding.
  assert.equal(liveContents({ view: {} }), null, 'post-close: webContents is undefined');
  assert.equal(
    liveContents({ view: { webContents: { isDestroyed: () => true } } }),
    null,
    'an explicitly destroyed webContents'
  );
});

test('liveContents returns the webContents itself when it is live', () => {
  const { liveContents } = loadLiveContents();
  const wc = { isDestroyed: () => false, marker: 'live' };
  assert.equal(liveContents({ view: { webContents: wc } }), wc);
});

test('liveViewContents applies the same two-step check to non-tab views', () => {
  const { liveViewContents } = loadLiveContents();
  const wc = { isDestroyed: () => false, marker: 'utility-sheet' };
  assert.equal(liveViewContents(undefined), null);
  assert.equal(liveViewContents({}), null, 'post-close: webContents is undefined');
  assert.equal(liveViewContents({ webContents: { isDestroyed: () => true } }), null);
  assert.equal(liveViewContents({ webContents: wc }), wc);
});

test('main.js never dereferences cached utility-sheet webContents directly', () => {
  assert.doesNotMatch(
    mainSource,
    /utilitySheetView(?:\.|\?\.)webContents/,
    'utility sheets must go through liveUtilitySheet/liveViewContents'
  );
});

function loadCreateTabView() {
  const calls = [];
  const sandbox = {
    WebContentsView: class { constructor(opts) { calls.push(opts); this.opts = opts; } },
    TAB_WEB_PREFERENCES: { preload: '/tab-preload.js', sandbox: true },
    getNormalBrowsingSession: (profileId) => ({ partition: `normal:${profileId}` }),
    getPrivateBrowsingSession: (profileId) => ({ partition: `private:${profileId}` }),
  };
  vm.runInNewContext(`${createTabViewSource}\nthis.__fn = createTabView;`, sandbox);
  return { createTabView: sandbox.__fn, calls, prefs: sandbox.TAB_WEB_PREFERENCES };
}

test('createTabView puts an ordinary tab on its profile session', () => {
  const { createTabView, calls, prefs } = loadCreateTabView();
  const view = createTabView({ private: false, profileId: 'profile_work' });
  assert.ok(view, 'must return a view');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].webPreferences.preload, prefs.preload);
  assert.deepEqual(calls[0].webPreferences.session, { partition: 'normal:profile_work' });
});

test('createTabView puts a private tab on the private session', () => {
  const { createTabView, calls } = loadCreateTabView();
  createTabView({ private: true });
  assert.equal(calls[0].webPreferences.preload, '/tab-preload.js', 'base prefs still spread in');
  assert.deepEqual(calls[0].webPreferences.session, { partition: 'private:default' });
});

test('createTabView tolerates being called before the tab record exists', () => {
  const { createTabView, calls, prefs } = loadCreateTabView();
  createTabView(undefined);
  assert.equal(calls[0].webPreferences.preload, prefs.preload);
  assert.deepEqual(calls[0].webPreferences.session, { partition: 'normal:default' });
});

test('the private-session ternary lives in tab-view.js and nowhere else', () => {
  // main.js must import getPrivateBrowsingSession rather than keep its own —
  // test-hook.js compares tab sessions against it by identity, so a second
  // definition would silently report every private tab as "default".
  assert.doesNotMatch(
    mainSource,
    /session\.fromPartition\((?:['"]private-browsing['"]|PRIVATE_PARTITION)\)/,
    'main.js still defines the private partition — it must remain a tab-view.js singleton'
  );
  assert.ok(
    !/webPreferences: isPrivate/.test(mainSource),
    'main.js still constructs a tab view inline — createTab must call createTabView'
  );
});

test('wireTabView is still present in tab-view.js', () => {
  assert.ok(wireSource, 'wireTabView not found in tab-view.js — update this test with it');
});

test('a queued mouse move does not calculate bounds after its window closes', () => {
  assert.ok(watchCursorForSource, 'watchCursorFor not found in main.js — update this test with it');
  let inputListener;
  let offsetCalls = 0;
  let proximityCalls = 0;
  const sandbox = {
    hasLiveWindow: () => false,
    toWindowPoint: () => { throw new Error('closed-window geometry must not run'); },
    updateIslandProximity: () => { proximityCalls += 1; },
  };
  vm.runInNewContext(`${watchCursorForSource}\nthis.__watch = watchCursorFor;`, sandbox);
  sandbox.__watch(
    { on: (_event, listener) => { inputListener = listener; } },
    () => { offsetCalls += 1; throw new Error('closed-window bounds must not run'); },
    (listener) => listener
  );

  assert.doesNotThrow(() => inputListener(null, { type: 'mouseMove', x: 4, y: 8 }));
  assert.equal(offsetCalls, 0);
  assert.equal(proximityCalls, 0);
});

test('document-ready has a favicon fallback when Chromium emits no favicon event', () => {
  assert.match(wireSource, /wc\.on\('dom-ready',[\s\S]*?updateFaviconAfterDomReady/);
});

test('a late Chromium favicon event is followed by the declared quality pass', () => {
  const start = wireSource.indexOf("wc.on('page-favicon-updated'");
  const end = wireSource.indexOf("wc.on('dom-ready'", start);
  const listener = wireSource.slice(start, end);
  assert.match(listener, /pending\.finally\([\s\S]*?refineDeclaredStaticFavicon/);
});

test('the settled static-source check owns late favicon event refinement', () => {
  const start = wireSource.indexOf("wc.on('page-favicon-updated'");
  const end = wireSource.indexOf("wc.on('dom-ready'", start);
  const listener = wireSource.slice(start, end);
  assert.match(listener, /refineDeclaredStaticFavicon\(tab, wc, \{ setTabFavicon \}\)/);
});

for (const required of [
  'installChromeShortcuts',
  'watchCursorFor',
  'setWebRTCIPHandlingPolicy',
  'setAudioMuted',
  'applyWindowOpenPolicy',
  'attachContextMenu',
]) {
  test(`wireTabView performs ${required}`, () => {
    assert.ok(wireSource.includes(required), `${required} must live inside wireTabView`);
  });
}

test('every listener wireTabView registers opens with the stale-webContents guard', () => {
  const guard = 'if (tab.sleeping || tab.view?.webContents !== wc) return;';
  const guards = wireSource.split(guard).length - 1;
  assert.ok(guards >= 16, `expected the guard on every listener, found ${guards}`);
});

test('main.js no longer registers tab listeners inline', () => {
  const createTab = mainSource.match(/function createTab\(url = newTabUrl\(\)[\s\S]*?\n\}/)?.[0];
  assert.ok(createTab, 'createTab not found in main.js — update this test with it');
  assert.ok(
    /wireTabView\(tab, view, \{ owner, adopted \}\)/.test(createTab),
    'createTab must delegate all webContents wiring to wireTabView'
  );
  assert.ok(
    !/wc\.on\('did-navigate'/.test(createTab),
    'createTab still registers listeners inline — they belong in wireTabView'
  );
});

test('main.js initialises tab-view exactly once, at module scope', () => {
  assert.equal(
    (mainSource.match(/^initTabView\(\{/gm) || []).length,
    1,
    'initTabView must be called exactly once, unindented (module scope)'
  );
});
