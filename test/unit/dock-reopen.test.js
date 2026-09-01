'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  createDockReopenLifecycle,
  preservePrimaryTabViews,
  reusableDockTabId,
} = require('../../src/main/dock-reopen');

function view(id, { live = true } = {}) {
  return {
    id,
    live,
    visible: true,
    setVisible(value) { this.visible = value; },
  };
}

test('primary macOS close detaches the active and Glance page views exactly once', () => {
  const activeView = view('active');
  const glanceView = view('glance');
  const tabs = new Map([
    ['active', { view: activeView }],
    ['glance', { view: glanceView }],
  ]);
  const removed = [];
  const runtime = {
    activeTabId: 'active',
    glanceTabId: 'glance',
  };
  const preserved = preservePrimaryTabViews({
    platform: 'darwin',
    runtime,
    primaryRuntime: runtime,
    window: {
      isDestroyed: () => false,
      contentView: { removeChildView: (candidate) => removed.push(candidate.id) },
    },
    tabs,
    liveContents: (tab) => tab.view.live ? {} : null,
    isQuitting: false,
  });

  assert.deepEqual(preserved, ['active', 'glance']);
  assert.deepEqual(removed, ['active', 'glance']);
  assert.equal(activeView.visible, false);
  assert.equal(glanceView.visible, false);
});

test('quit and secondary-window closes do not preserve attached page views', () => {
  const primaryRuntime = {};
  const runtime = { activeTabId: 'active', glanceTabId: null };
  let removed = 0;
  const args = {
    platform: 'darwin',
    runtime,
    primaryRuntime,
    window: {
      isDestroyed: () => false,
      contentView: { removeChildView: () => { removed += 1; } },
    },
    tabs: new Map([['active', { view: view('active') }]]),
    liveContents: () => ({}),
  };

  assert.deepEqual(preservePrimaryTabViews({ ...args, isQuitting: false }), []);
  assert.deepEqual(preservePrimaryTabViews({
    ...args,
    runtime: primaryRuntime,
    isQuitting: true,
  }), []);
  assert.equal(removed, 0);
});

test('Windows and Linux closes keep the normal window-owned destruction path', () => {
  for (const platform of ['win32', 'linux']) {
    const primaryRuntime = { activeTabId: 'active', glanceTabId: null };
    const activeView = view('active');
    let removed = 0;
    const preserved = preservePrimaryTabViews({
      platform,
      runtime: primaryRuntime,
      primaryRuntime,
      window: {
        isDestroyed: () => false,
        contentView: { removeChildView: () => { removed += 1; } },
      },
      tabs: new Map([['active', { view: activeView }]]),
      liveContents: () => ({}),
      isQuitting: false,
    });

    assert.deepEqual(preserved, [], platform);
    assert.equal(removed, 0, platform);
    assert.equal(activeView.visible, true, platform);
  }
});

test('Dock reopen reuses only a live or quiet active tab', () => {
  const live = { view: view('live') };
  const dead = { view: view('dead', { live: false }) };
  const quiet = { view: null, asleep: true };
  const tabs = new Map([['live', live], ['dead', dead], ['quiet', quiet]]);
  const liveContents = (tab) => tab.view?.live ? {} : null;

  assert.equal(reusableDockTabId({ activeTabId: 'live', tabs, liveContents }), 'live');
  assert.equal(reusableDockTabId({ activeTabId: 'quiet', tabs, liveContents }), 'quiet');
  assert.equal(reusableDockTabId({ activeTabId: 'dead', tabs, liveContents }), null);
  assert.equal(reusableDockTabId({ activeTabId: 'missing', tabs, liveContents }), null);
  assert.equal(reusableDockTabId({ activeTabId: null, tabs, liveContents }), null);
});

test('macOS lifecycle detaches before native teardown and reattaches the same document', () => {
  const activeView = view('active');
  const tab = { view: activeView };
  const tabs = new Map([['active', tab]]);
  const runtime = { activeTabId: 'active', glanceTabId: null, closing: false };
  const attached = new Set([activeView]);
  let fallbackCount = 0;
  let flushCount = 0;
  const lifecycle = createDockReopenLifecycle({
    platform: 'darwin',
    runtime,
    primaryRuntime: runtime,
    window: {
      isDestroyed: () => false,
      contentView: { removeChildView: (candidate) => attached.delete(candidate) },
    },
    tabs,
    liveContents: (candidate) => candidate.view?.live ? {} : null,
    getIsQuitting: () => false,
    ensureStartTab: true,
    createStartTab: () => { fallbackCount += 1; return 'start'; },
    activateTab: (id) => {
      runtime.activeTabId = id;
      activeView.setVisible(true);
      attached.add(tabs.get(id).view);
    },
    flushExternalUrls: () => { flushCount += 1; },
  });

  assert.deepEqual(lifecycle.onWindowClose(), ['active']);
  assert.equal(runtime.closing, true);
  assert.equal(attached.has(activeView), false);
  assert.equal(activeView.visible, false);

  // BrowserWindow teardown destroys only child views. The page survived
  // because the close handler detached it first.
  for (const candidate of attached) candidate.live = false;

  assert.equal(lifecycle.onChromeReady(), 'active');
  assert.equal(runtime.activeTabId, 'active');
  assert.equal(attached.has(activeView), true);
  assert.equal(activeView.visible, true);
  assert.equal(fallbackCount, 0);
  assert.equal(flushCount, 1);
});

test('Dock reopen creates and activates a start tab when no document is reusable', () => {
  const runtime = { activeTabId: null, glanceTabId: null, closing: true };
  const tabs = new Map();
  const activated = [];
  const lifecycle = createDockReopenLifecycle({
    platform: 'darwin',
    runtime,
    primaryRuntime: runtime,
    window: { isDestroyed: () => false, contentView: { removeChildView() {} } },
    tabs,
    liveContents: () => null,
    getIsQuitting: () => false,
    ensureStartTab: true,
    createStartTab: () => {
      tabs.set('start', { view: view('start') });
      return 'start';
    },
    activateTab: (id) => { runtime.activeTabId = id; activated.push(id); },
    flushExternalUrls() {},
  });

  assert.equal(lifecycle.onChromeReady(), 'start');
  assert.equal(runtime.activeTabId, 'start');
  assert.deepEqual(activated, ['start']);
});

test('main installs both handlers from the tested Dock-reopen lifecycle', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const main = fs.readFileSync(path.join(__dirname, '../../src/main/main.js'), 'utf8');

  assert.match(main, /const dockReopenLifecycle = createDockReopenLifecycle\(\{/);
  assert.match(main, /\.on\('close', bindWindowRuntime\(runtime, dockReopenLifecycle\.onWindowClose\)\)/);
  assert.match(main, /dockReopenLifecycle\.onChromeReady/);
});
