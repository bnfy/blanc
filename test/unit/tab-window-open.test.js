'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../../src/main/tab-view.js'), 'utf8');
const policySource = source.match(/  const applyWindowOpenPolicy = \(targetWc\) => \{[\s\S]*?\n  \};/)?.[0];

function harness({ isPrivate = false } = {}) {
  assert.ok(policySource, 'window-open policy must be exercised from the shipped source');
  let handler;
  const tabs = new Map();
  const created = [];
  const activated = [];
  const scheduled = [];
  const adopted = [];
  const childWc = { isDestroyed: () => false };
  const owner = { resident: false };
  const tab = { id: 'opener', private: isPrivate, groupId: 'group' };
  const sandbox = {
    tab, tabs,
    getOwner: () => owner,
    boundToTab: (callback) => callback,
    installExternalNavigationHandlers: () => {},
    isForbiddenTopLevelUrl: require('../../src/main/top-level-url-policy').isForbiddenTopLevelUrl,
    isUtilityUrl: require('../../src/main/utility-pages').isUtilityUrl,
    handOffToOs: () => false,
    openInternalPage: () => {},
    WebContentsView: class {
      constructor(options) {
        if (!options.webContents) throw new TypeError('options.webContents must be a WebContents');
        adopted.push(options.webContents);
        this.webContents = options.webContents;
      }
    },
    createTab: (url, options) => {
      created.push({ url, options });
      tabs.set('child', { view: options.view ?? { webContents: childWc } });
      return 'child';
    },
    liveContents: (record) => record?.view?.webContents ?? null,
    setActiveTab: (id) => activated.push(id),
    setImmediate: (callback) => scheduled.push(callback),
  };
  vm.runInNewContext(`${policySource}\nthis.install = applyWindowOpenPolicy;`, sandbox);
  sandbox.install({
    getURL: () => 'https://example.test/source',
    setWindowOpenHandler: (callback) => { handler = callback; },
    on: () => {},
  });
  return { handler, tab, childWc, created, activated, scheduled, adopted };
}

for (const isPrivate of [false, true]) {
  test(`background click with no supplied WebContents creates a ${isPrivate ? 'private' : 'regular'} tab`, () => {
    const h = harness({ isPrivate });
    const response = h.handler({ url: 'https://example.test/target', disposition: 'background-tab' });
    assert.equal(response.action, 'allow');
    let returned;
    assert.doesNotThrow(() => { returned = response.createWindow({ webPreferences: { sandbox: true } }); });
    assert.equal(returned, h.childWc, 'Electron receives the newly created tab contents');
    assert.equal(h.created.length, 1);
    assert.equal(h.created[0].url, 'https://example.test/target');
    assert.equal(h.created[0].options.private, isPrivate);
    assert.equal(h.created[0].options.groupId, h.tab.groupId);
    assert.equal(h.created[0].options.view ?? null, null, 'normal createTab owns construction and navigation');
    assert.equal(h.created[0].options.openerTabId ?? null, null, 'deferred contents have no adopted opener family');
    assert.equal(h.adopted.length, 0);
    assert.equal(h.scheduled.length, 0, 'background clicks preserve the active tab');
    assert.equal(h.activated.length, 0);
  });
}

test('an existing window.open child is adopted and activated without losing its opener', () => {
  const h = harness();
  const response = h.handler({ url: 'https://example.test/login', disposition: 'foreground-tab' });
  const existing = { isDestroyed: () => false };
  assert.equal(response.createWindow({ webContents: existing }), existing);
  assert.deepEqual(h.adopted, [existing]);
  assert.equal(h.created[0].options.view.webContents, existing);
  assert.equal(h.created[0].options.openerTabId, h.tab.id);
  assert.equal(h.scheduled.length, 1);
  h.scheduled[0]();
  assert.deepEqual(h.activated, ['child']);
});

test('a foreground click with deferred contents also loads and activates a normal tab', () => {
  const h = harness();
  const response = h.handler({ url: 'https://example.test/target', disposition: 'foreground-tab' });
  assert.equal(response.createWindow({}), h.childWc);
  assert.equal(h.created[0].options.view ?? null, null);
  h.scheduled[0]();
  assert.deepEqual(h.activated, ['child']);
});

test('featureful new-window requests still use Electron popup creation', () => {
  const h = harness({ isPrivate: true });
  const response = h.handler({ url: 'https://example.test/login', disposition: 'new-window' });
  assert.equal(response.action, 'allow');
  assert.equal(response.createWindow, undefined);
  assert.equal(response.overrideBrowserWindowOptions.webPreferences.sandbox, true);
  assert.equal(h.created.length, 0);
});
