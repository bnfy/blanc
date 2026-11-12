'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { resolveTabRename } = require('../../src/main/tab-name');
const { connectionFor, committedUrlOf, shieldChipState } = require('../../src/main/shield-model');

// main.js cannot be required under node --test; lift the shipped functions.
const mainSource = fs.readFileSync(path.join(__dirname, '../../src/main/main.js'), 'utf8');
const renameSource = mainSource.match(/function renameTab\(tabId, rawName\) \{[\s\S]*?\n\}/)?.[0];
const serializeSource = mainSource.match(/function serializeTabs\(\) \{[\s\S]*?\n\}/)?.[0];

test('renameTab and serializeTabs could be lifted from main.js', () => {
  assert.ok(renameSource, 'renameTab not found in main.js — update this test with it');
  assert.ok(serializeSource, 'serializeTabs not found in main.js — update this test with it');
});

function renameHarness(tabList, runtimeId = 'w1') {
  const calls = [];
  const sandbox = {
    tabs: new Map(tabList.map((t) => [t.id, t])),
    rt: () => ({ id: runtimeId }),
    resolveTabRename,
    broadcastTabs: () => calls.push('broadcast'),
    scheduleMenuRebuild: () => calls.push('menu'),
  };
  vm.runInNewContext(`${renameSource}\nthis.__fn = renameTab;`, sandbox);
  return { rename: sandbox.__fn, tabs: sandbox.tabs, calls };
}

test('a name is stored and broadcast; an empty name hands back the page title', () => {
  const h = renameHarness([{ id: 't1', runtimeId: 'w1', title: 'Page', customTitle: null }]);
  h.rename('t1', '  Budget ');
  assert.equal(h.tabs.get('t1').customTitle, 'Budget');
  assert.deepEqual(h.calls, ['broadcast', 'menu']);
  h.rename('t1', '');
  assert.equal(h.tabs.get('t1').customTitle, null);
});

test('a closed tab, another window\'s tab, or an unchanged name changes nothing', () => {
  const h = renameHarness([
    { id: 't1', runtimeId: 'w1', title: 'Page', customTitle: null },
    { id: 't2', runtimeId: 'w2', title: 'Other', customTitle: null },
  ]);
  h.rename('closed-meanwhile', 'Budget');
  h.rename('t2', 'Budget');
  h.rename('t1', 'Page'); // Enter on the untouched prefill
  assert.equal(h.tabs.get('t1').customTitle, null);
  assert.equal(h.tabs.get('t2').customTitle, null);
  assert.deepEqual(h.calls, []);
});

function serialize(tab) {
  const sandbox = {
    blockingProviders: null,
    settings: { getSettings: () => ({ adblockEnabled: true, adblockExceptions: [], islandSiteColors: true }) },
    rt: () => ({ tabOrder: [tab.id] }),
    tabs: new Map([[tab.id, tab]]),
    isHostnameExcepted: () => false,
    shieldChipState, connectionFor, committedUrlOf,
    mainI18n: { t: require('../support/english-t').englishT },
    buildSiteInfo: () => ({ state: 'secure' }),
    liveContents: () => null,
    certificateObserver: { get: () => null },
  };
  vm.runInNewContext(`${serializeSource}\nthis.__fn = serializeTabs;`, sandbox);
  return sandbox.__fn()[0];
}

const PAGE = {
  id: 'p', url: 'https://example.com/', isLoading: false, blockedCount: 0,
  asleep: false, view: null, title: 'DNS | Records',
};

test('an un-renamed tab projects its page title and no pageTitle', () => {
  const row = serialize({ ...PAGE, customTitle: null });
  assert.equal(row.title, 'DNS | Records');
  assert.equal(row.pageTitle, null);
});

test('a renamed tab projects its name, with the live page title alongside', () => {
  const row = serialize({ ...PAGE, customTitle: 'Cloudflare DNS' });
  assert.equal(row.title, 'Cloudflare DNS');
  assert.equal(row.pageTitle, 'DNS | Records');
  const retitled = serialize({ ...PAGE, title: '(3) DNS | Records', customTitle: 'Cloudflare DNS' });
  assert.equal(retitled.title, 'Cloudflare DNS', 'a page retitling itself never moves the name');
  assert.equal(retitled.pageTitle, '(3) DNS | Records');
});

test('every restore and reopen path hands the saved name back to createTab', () => {
  assert.match(mainSource, /customTitle: saved\.meta\?\.\[index\]\?\.customTitle \?\? null,/, 'launch restore');
  assert.match(mainSource, /customTitle: cleaned\.meta\?\.\[index\]\?\.customTitle \?\? null,/, 'opening a space');
  assert.equal((mainSource.match(/asleep: true, title: member\.title, favicon: member\.favicon, customTitle: member\.customTitle,/g) || []).length, 3, 'group, batch and split reopen');
  assert.match(mainSource, /pinned: entry\.pinned, muted: entry\.muted, groupId: resolvedGroupId, customTitle: entry\.customTitle,/, 'single-tab reopen, every tier');
  const member = mainSource.match(/function closedMemberRecord\(id\) \{[\s\S]*?\n\}/)?.[0];
  assert.match(member, /customTitle: tab\.customTitle \?\? null,/, 'group/batch close records the name');
  const create = mainSource.match(/function createTab\(url = newTabUrl\(\), \{[\s\S]*?\n\}/)?.[0];
  assert.match(create, /customTitle: normalizeTabName\(customTitle\),/, 'createTab cleans names from files');
});

test('duplicating a tab does not copy its name', () => {
  const duplicate = mainSource.match(/function duplicateTab\(id\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(duplicate, 'duplicateTab not found');
  assert.doesNotMatch(duplicate, /customTitle/);
});
