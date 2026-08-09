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

const liveContentsSource = viewSource.match(/const liveContents = \(tab\) => \{[\s\S]*?\n\};/)?.[0];
const createTabViewSource = viewSource.match(/function createTabView\(tab\) \{[\s\S]*?\n\}/)?.[0];

test('tab-view.js still exports the two functions these tests lift', () => {
  assert.ok(liveContentsSource, 'liveContents not found in tab-view.js — update this test with it');
  assert.ok(createTabViewSource, 'createTabView not found in tab-view.js — update this test with it');
});

function loadLiveContents() {
  const sandbox = {};
  vm.runInNewContext(`${liveContentsSource}\nthis.__fn = liveContents;`, sandbox);
  return sandbox.__fn;
}

test('liveContents refuses every not-live shape', () => {
  const liveContents = loadLiveContents();
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
  const liveContents = loadLiveContents();
  const wc = { isDestroyed: () => false, marker: 'live' };
  assert.equal(liveContents({ view: { webContents: wc } }), wc);
});

function loadCreateTabView() {
  const calls = [];
  const sandbox = {
    WebContentsView: class { constructor(opts) { calls.push(opts); this.opts = opts; } },
    TAB_WEB_PREFERENCES: { preload: '/tab-preload.js', sandbox: true },
    getPrivateBrowsingSession: () => ({ partition: 'private-browsing' }),
  };
  vm.runInNewContext(`${createTabViewSource}\nthis.__fn = createTabView;`, sandbox);
  return { createTabView: sandbox.__fn, calls, prefs: sandbox.TAB_WEB_PREFERENCES };
}

test('createTabView gives an ordinary tab the shared preferences object', () => {
  const { createTabView, calls, prefs } = loadCreateTabView();
  const view = createTabView({ private: false });
  assert.ok(view, 'must return a view');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].webPreferences, prefs, 'no clone: the shared object itself');
});

test('createTabView puts a private tab on the private session', () => {
  const { createTabView, calls } = loadCreateTabView();
  createTabView({ private: true });
  assert.equal(calls[0].webPreferences.preload, '/tab-preload.js', 'base prefs still spread in');
  assert.deepEqual(calls[0].webPreferences.session, { partition: 'private-browsing' });
});

test('createTabView tolerates being called before the tab record exists', () => {
  const { createTabView, calls, prefs } = loadCreateTabView();
  createTabView(undefined);
  assert.equal(calls[0].webPreferences, prefs);
});

test('the private-session ternary lives in tab-view.js and nowhere else', () => {
  // main.js must import getPrivateBrowsingSession rather than keep its own —
  // test-hook.js compares tab sessions against it by identity, so a second
  // definition would silently report every private tab as "default".
  assert.ok(
    !/session\.fromPartition\(/.test(mainSource),
    'main.js still calls session.fromPartition — the private session must be a tab-view.js singleton'
  );
  assert.ok(
    !/webPreferences: isPrivate/.test(mainSource),
    'main.js still constructs a tab view inline — createTab must call createTabView'
  );
});
