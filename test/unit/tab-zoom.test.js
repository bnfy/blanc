'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { createTabZoom } = require('../../src/main/tab-zoom');
const { percentToLevel, levelToPercent } = require('../../src/main/page-zoom');

const { DEFAULT_PROFILE_ID } = require('../../src/main/local-profile-model');

const NAMED = 'profile_named';

function fakeContents(url, { percent = 100, mode = 'isolated' } = {}) {
  return {
    url, mode, level: percentToLevel(percent), writes: 0,
    getURL() { return this.url; },
    getZoomMode() { return this.mode; },
    setZoomMode(next) { this.mode = next; },
    getZoomLevel() { return this.level; },
    setZoomLevel(level) { this.level = level; this.writes++; },
    get percent() { return levelToPercent(this.level); },
  };
}

function harness({ defaultPercent = 100, saved = {} } = {}) {
  const stores = new Map();
  let profile = DEFAULT_PROFILE_ID;
  const storeOf = (id) => stores.get(id) ?? stores.set(id, {}).get(id);
  Object.assign(storeOf(DEFAULT_PROFILE_ID), saved);
  const siteZoom = {
    writes: 0,
    migrations: [],
    sites: () => ({ ...storeOf(profile) }),
    setSite(key, percent) { this.writes++; storeOf(profile)[key] = percent; },
    removeSite(key) { this.writes++; delete storeOf(profile)[key]; },
    clearSites() { this.writes++; stores.set(profile, {}); },
    migrate(read, hosts) { this.migrations.push([profile, read(profile), hosts]); },
  };
  const tabs = new Map();
  const add = (id, url, { profileId = DEFAULT_PROFILE_ID, isPrivate = false, percent, mode, asleep = false } = {}) => {
    const wc = asleep ? null : fakeContents(url, { percent, mode });
    const tab = { id, url, profileId, private: isPrivate, wc };
    tabs.set(id, tab);
    return tab;
  };
  const state = { defaultPercent };
  const zoom = createTabZoom({
    tabs,
    liveContents: (tab) => tab?.wc ?? null,
    defaultPercent: () => state.defaultPercent,
    siteZoom,
    withLocalProfile: (id, work) => {
      const previous = profile;
      profile = id;
      try { return work(); } finally { profile = previous; }
    },
    activeProfileId: () => profile,
    readPreferences: (id) => `prefs:${id}`,
    internalHosts: ['newtab'],
  });
  return { zoom, tabs, add, siteZoom, state, storeOf };
}

test('prepare puts a view in isolated mode', () => {
  const { zoom } = harness();
  const wc = fakeContents('about:blank', { mode: 'default' });
  zoom.prepare(wc);
  assert.equal(wc.mode, 'isolated');
});

test('a commit applies the default, then the saved site', () => {
  const { zoom, add } = harness({ defaultPercent: 75, saved: { 'saved.com': 110 } });
  const tab = add('a', 'https://example.com/');
  zoom.applyToTab(tab, tab.wc, 'https://example.com/');
  assert.equal(tab.wc.percent, 75);
  tab.wc.url = 'https://saved.com/';
  zoom.applyToTab(tab, tab.wc, 'https://saved.com/');
  assert.equal(tab.wc.percent, 110);
});

test('a commit that needs no change writes nothing', () => {
  const { zoom, add } = harness({ defaultPercent: 75 });
  const tab = add('a', 'https://example.com/', { percent: 75 });
  zoom.applyToTab(tab, tab.wc, tab.url);
  assert.equal(tab.wc.writes, 0);
});

test('a commit leaves the PDF viewer\'s manual mode behind', () => {
  const { zoom, add } = harness({ defaultPercent: 75 });
  const tab = add('a', 'https://example.com/', { mode: 'manual' });
  zoom.applyToTab(tab, tab.wc, tab.url);
  assert.equal(tab.wc.mode, 'isolated');
  assert.equal(tab.wc.percent, 75);
});

test('each profile is migrated before it is read', () => {
  const { zoom, add, siteZoom } = harness();
  const tab = add('a', 'https://example.com/', { profileId: NAMED });
  zoom.applyToTab(tab, tab.wc, tab.url);
  assert.deepEqual(siteZoom.migrations[0], [NAMED, `prefs:${NAMED}`, ['newtab']]);
});

test('stepping saves the site and moves every tab on it, in that profile only', () => {
  const { zoom, add, storeOf } = harness();
  const a = add('a', 'https://example.com/one');
  const b = add('b', 'https://example.com/two');
  const other = add('c', 'https://other.com/');
  const named = add('d', 'https://example.com/', { profileId: NAMED });
  zoom.step(a, a.wc, -1);
  assert.equal(a.wc.percent, 90);
  assert.equal(b.wc.percent, 90);
  assert.equal(other.wc.percent, 100);
  assert.equal(named.wc.percent, 100);
  assert.equal(storeOf(DEFAULT_PROFILE_ID)['example.com'], 90);
  assert.equal(storeOf(NAMED)['example.com'], undefined);
});

test('a site can be held at 100 under another default', () => {
  const { zoom, add, storeOf } = harness({ defaultPercent: 75 });
  const tab = add('a', 'https://example.com/', { percent: 75 });
  for (let i = 0; i < 3; i++) zoom.step(tab, tab.wc, 1);
  assert.equal(tab.wc.percent, 100);
  assert.equal(storeOf(DEFAULT_PROFILE_ID)['example.com'], 100);
  zoom.applyToTab(tab, tab.wc, tab.url);
  assert.equal(tab.wc.percent, 100);
});

test('a zoom that lands on the default removes the entry', () => {
  const { zoom, add, storeOf } = harness({ defaultPercent: 75, saved: { 'example.com': 80 } });
  const tab = add('a', 'https://example.com/', { percent: 80 });
  zoom.step(tab, tab.wc, -1);
  assert.equal(tab.wc.percent, 75);
  assert.deepEqual(storeOf(DEFAULT_PROFILE_ID), {});
});

test('reset forgets the site and returns every tab on it to the default', () => {
  const { zoom, add, storeOf } = harness({ defaultPercent: 75, saved: { 'example.com': 150 } });
  const a = add('a', 'https://example.com/one', { percent: 150 });
  const b = add('b', 'https://example.com/two', { percent: 150 });
  zoom.reset(a, a.wc);
  assert.equal(a.wc.percent, 75);
  assert.equal(b.wc.percent, 75);
  assert.deepEqual(storeOf(DEFAULT_PROFILE_ID), {});
});

test('an internal page resets to 100 under any default', () => {
  const { zoom, add, storeOf } = harness({ defaultPercent: 75, saved: { 'blanc://newtab': 125 } });
  const tab = add('a', 'blanc://newtab/', { percent: 125 });
  zoom.reset(tab, tab.wc);
  assert.equal(tab.wc.percent, 100);
  assert.deepEqual(storeOf(DEFAULT_PROFILE_ID), {});
});

test('the PDF viewer keeps its own zoom: stepping moves it and saves nothing', () => {
  const { zoom, add, siteZoom } = harness();
  const tab = add('a', 'https://example.com/a.pdf', { mode: 'manual' });
  zoom.step(tab, tab.wc, 1);
  assert.equal(tab.wc.percent, 110);
  assert.equal(tab.wc.mode, 'manual');
  zoom.reset(tab, tab.wc);
  assert.equal(tab.wc.percent, 100);
  assert.equal(siteZoom.writes, 0);
});

test('a file page steps without saving, and goes back to the default on navigation', () => {
  const { zoom, add, siteZoom } = harness({ defaultPercent: 75 });
  const tab = add('a', 'file:///tmp/a.html', { percent: 75 });
  zoom.step(tab, tab.wc, 1);
  assert.equal(tab.wc.percent, 80);
  assert.equal(siteZoom.writes, 0);
  zoom.applyToTab(tab, tab.wc, tab.url);
  assert.equal(tab.wc.percent, 75);
});

test('a private tab reads saved sites and never writes them', () => {
  const { zoom, add, siteZoom } = harness({ defaultPercent: 75, saved: { 'example.com': 110 } });
  const normal = add('n', 'https://example.com/', { percent: 110 });
  const hidden = add('p', 'https://example.com/', { isPrivate: true });
  zoom.applyToTab(hidden, hidden.wc, hidden.url);
  assert.equal(hidden.wc.percent, 110);
  zoom.step(hidden, hidden.wc, 1);
  assert.equal(hidden.wc.percent, 125);
  assert.equal(normal.wc.percent, 110);
  zoom.reset(hidden, hidden.wc);
  assert.equal(hidden.wc.percent, 75);
  assert.equal(normal.wc.percent, 110);
  assert.equal(siteZoom.writes, 0);
});

test('private zoom is shared by private tabs of one profile only', () => {
  const { zoom, add } = harness();
  const a = add('a', 'https://example.com/', { isPrivate: true });
  const b = add('b', 'https://example.com/', { isPrivate: true });
  const named = add('c', 'https://example.com/', { isPrivate: true, profileId: NAMED });
  zoom.step(a, a.wc, 1);
  assert.equal(b.wc.percent, 110);
  assert.equal(named.wc.percent, 100);
});

test('a new default reaches open pages without their own zoom', () => {
  const { zoom, add, state } = harness({ saved: { 'saved.com': 110 } });
  const plain = add('a', 'https://example.com/');
  const saved = add('b', 'https://saved.com/', { percent: 110 });
  const internal = add('c', 'blanc://newtab/');
  const pdf = add('d', 'https://example.com/a.pdf', { mode: 'manual' });
  add('e', 'https://example.com/', { asleep: true });
  state.defaultPercent = 75;
  zoom.applyAll();
  assert.equal(plain.wc.percent, 75);
  assert.equal(saved.wc.percent, 110);
  assert.equal(internal.wc.percent, 100);
  assert.equal(pdf.wc.percent, 100);
});

test('refresh brings a reopened view up to date', () => {
  const { zoom, add } = harness({ defaultPercent: 75 });
  const tab = add('a', 'https://example.com/');
  zoom.refresh(tab, tab.wc);
  assert.equal(tab.wc.percent, 75);
});

test('Settings lists sites sorted, and removing one updates open tabs', () => {
  const { zoom, add, storeOf } = harness({ defaultPercent: 75, saved: { 'b.com': 110, 'a.com': 150 } });
  assert.deepEqual(zoom.list(), [{ site: 'a.com', percent: 150 }, { site: 'b.com', percent: 110 }]);
  const tab = add('a', 'https://a.com/', { percent: 150 });
  const hidden = add('p', 'https://a.com/', { percent: 150, isPrivate: true });
  zoom.remove('a.com');
  assert.equal(tab.wc.percent, 75);
  assert.equal(hidden.wc.percent, 75);
  assert.deepEqual(storeOf(DEFAULT_PROFILE_ID), { 'b.com': 110 });
});

test('Clear all updates open tabs in that profile only', () => {
  const { zoom, add, storeOf } = harness({ defaultPercent: 75, saved: { 'a.com': 150 } });
  storeOf(NAMED)['a.com'] = 200;
  const tab = add('a', 'https://a.com/', { percent: 150 });
  const named = add('b', 'https://a.com/', { percent: 200, profileId: NAMED });
  zoom.clear();
  assert.equal(tab.wc.percent, 75);
  assert.equal(named.wc.percent, 200);
});

test('stepDirect moves along the steps and touches nothing else', () => {
  const { zoom, siteZoom } = harness();
  const wc = fakeContents('blanc://settings/', { mode: 'default' });
  zoom.stepDirect(wc, 1);
  assert.equal(wc.percent, 110);
  assert.equal(wc.mode, 'default');
  assert.equal(siteZoom.writes, 0);
});
