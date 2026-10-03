'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../../src/main/main.js'), 'utf8');
const { blockableHostname } = require('../../src/main/adblock-exceptions');
function allowFixture({ url = 'https://site.test/', phase = 'ready', privateTab = false, active = 'ublock-origin', rejected = false, missing = false } = {}) {
  const tab = { id: 'a', url, private: privateTab };
  const changes = [], recoveries = [], calls = [], reloads = [];
  const provider = { status: () => ({ phase }), registry: { idForTab: () => 1 },
    async setSite(...args) { calls.push(args); if (rejected) throw new Error('ubo-not-ready'); } };
  const settings = { getSettings: () => ({ adblockExceptions: [] }), setSettings: value => changes.push(value) };
  const context = { tabs: new Map([['a', tab]]), rt: () => ({ activeTabId: 'a' }), blockableHostname, settings,
    blockingProviders: { active, forTab: () => privateTab || missing || active === 'blanc' ? null : provider },
    openSettingsSection: section => recoveries.push(section), reloadTabAfterSettingsFanout: value => reloads.push(value), broadcastTabs() {} };
  vm.runInNewContext(source.match(/async function runAllowAdsCommand\(\) \{[\s\S]*?\n\}/)[0] + '\nthis.run = runAllowAdsCommand;', context);
  return { run: context.run, changes, recoveries, calls, reloads };
}
test('/allow-ads rejects internal documents before creating any provider exception', async () => {
  for (const url of ['blanc://newtab/', 'chrome-extension://owned/dashboard.html', 'file:///local.html', 'about:blank']) {
    const f = allowFixture({ url }); assert.equal(await f.run(), null);
    assert.deepEqual(f.calls, []); assert.deepEqual(f.changes, []); assert.deepEqual(f.recoveries, []);
  }
});
test('/allow-ads opens recovery for failed, initializing, unsupported, or rejected uBO writes', async () => {
  for (const options of [{ phase: 'failed' }, { phase: 'initializing' }, { missing: true }, { phase: 'failed', url: 'blanc://error?code=-20' }, { rejected: true }]) {
    const f = allowFixture(options); assert.match((await f.run()).error, /^blocking-/);
    assert.deepEqual(f.recoveries, ['blocking']); assert.deepEqual(f.changes, []); assert.deepEqual(f.reloads, []);
    if (!options.rejected) assert.deepEqual(f.calls, []);
  }
});
test('/allow-ads preserves provider-owned exceptions and private Blanc exceptions', async () => {
  const f = allowFixture(); assert.equal(await f.run(), 'site.test');
  assert.deepEqual(f.calls, [[1, 'https://site.test/', false]]); assert.equal(f.reloads.length, 1); assert.deepEqual(f.changes, []);
  for (const options of [{ privateTab: true }, { active: 'blanc' }]) {
    const b = allowFixture(options); assert.equal(await b.run(), 'site.test');
    assert.deepEqual(b.calls, []); assert.deepEqual(JSON.parse(JSON.stringify(b.changes)), [{ adblockExceptions: ['site.test'] }]);
  }
});
test('Duplicate Tab admits verified tools without admitting private or unrelated extension documents', () => {
  for (const allowed of [true, false]) for (const privateTab of [true, false]) {
    let received;
    const sourceTab = { id: 'a', url: 'chrome-extension://owned/dashboard.html#settings', profileId: 'personal', private: privateTab, asleep: true };
    const context = { tabs: new Map([['a', sourceTab]]), rt: () => ({ tabOrder: ['a'] }), sleepSnapshots: new Map(),
      restorableUblockTool: () => allowed, liveContents: () => null,
      createTab: (_url, options) => { received = options; return 'duplicate'; }, reorderTab() {} };
    vm.runInNewContext(source.match(/function duplicateTab\(id\) \{[\s\S]*?\n\}/)[0] + '\nthis.run = duplicateTab;', context);
    assert.equal(context.run('a'), 'duplicate');
    assert.equal(received.managedExtension, allowed && !privateTab);
    assert.equal(received.private, privateTab);
  }
});


const providerSource = fs.readFileSync(path.join(__dirname, '../../src/main/ublock-provider.js'), 'utf8');
const { createUblockRegistry } = require('../../src/main/ublock-registry');
const { ublockTool } = require('../../src/main/ublock-tool-url');
function toolsFixture() {
  const tab = { id: 'quiet', runtimeId: 'runtime', url: 'chrome-extension://owned/dashboard.html#settings', profileId: 'personal', asleep: true };
  const tabs = [tab, { id: 'private', profileId: 'personal', private: true }, { id: 'foreign', profileId: 'named' }];
  const updates = [], tools = [], windows = [];
  const registry = createUblockRegistry({ profileId: 'personal', listTabs: () => tabs, listWindows: () => [{ id: 'runtime', window: { id: 8 } }], liveContents: () => null });
  const hooks = { liveContents: () => null, isHeld: wc => { assert(wc); return false; },
    updateTab: async (value, options) => { updates.push([value.id, options.active]); },
    openTool: async (profile, url) => { tools.push([profile, url]); return tab; },
    createWindow: async () => { windows.push('created'); return { window: { id: 9 } }; }, createTab() {} };
  const context = { phase: 'ready', disposed: false, registry, hooks, profileId: 'personal', extension: { id: 'owned' }, ublockTool,
    refresh: () => registry.refresh(), validateUrl: url => { if (!url.startsWith('chrome-extension://owned/') && !url.startsWith('https://')) throw new Error('ubo-url-invalid'); return url; } };
  vm.runInNewContext(providerSource.match(/async function call\(method, args\) \{[\s\S]*?\n  \}/)[0] + '\nthis.call = call;', context);
  return { call: context.call, tab, updates, tools, windows };
}
test('original tabs.update can select an owned quiet tool without a live renderer', async () => {
  const f = toolsFixture(); const result = await f.call('tabs.update', [1, { active: true }]);
  assert.equal(result.id, 1); assert.deepEqual(f.updates, [['quiet', true]]);
  for (const id of [2, 3, 999]) await assert.rejects(f.call('tabs.update', [id, { active: true }]), /ubo-tab-unavailable/);
  assert.equal(f.updates.length, 1);
});
test('original detached Logger requests reuse a tool in the owning profile and reject foreign identities', async () => {
  const f = toolsFixture();
  f.tab.url = 'chrome-extension://owned/logger-ui.html';
  const result = await f.call('windows.create', [{ url: 'chrome-extension://owned/logger-ui.html?popup=1#_+1', type: 'popup' }]);
  assert.equal(result.id, 8); assert.equal(result.tabs[0].id, 1);
  assert.deepEqual(f.tools, [['personal', 'chrome-extension://owned/logger-ui.html?popup=1#_+1']]);
  assert.deepEqual(f.windows, []);
  await assert.rejects(f.call('windows.create', [{ url: 'chrome-extension://foreign/logger-ui.html' }]), /ubo-url-invalid/);
  assert.deepEqual(f.windows, []);
});
