'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const mainSource = fs.readFileSync(path.join(__dirname, '../../src/main/main.js'), 'utf8');
const fnSource = mainSource.match(/function forgetTabWebContentsIds\(tabId\) \{[\s\S]*?\n\}/)?.[0];

test('forgetTabWebContentsIds is still present in main.js', () => {
  assert.ok(fnSource, 'forgetTabWebContentsIds not found — update this test with it');
});

/** Run the real function against a Map we control. */
function load(entries) {
  const sandbox = { tabIdByWebContentsId: new Map(entries) };
  vm.runInNewContext(`${fnSource}\nthis.__fn = forgetTabWebContentsIds;`, sandbox);
  return { call: sandbox.__fn, map: sandbox.tabIdByWebContentsId };
}

test('closing a tab drops every index entry that pointed at it', () => {
  // A tab can be indexed under more than one webContents id over its life
  // (an adopted child, and later a rebuilt renderer), so deletion is by value.
  const { call, map } = load([[11, 'tab-a'], [12, 'tab-b'], [13, 'tab-a']]);
  call('tab-a');
  assert.deepEqual([...map.entries()], [[12, 'tab-b']]);
});

test('forgetting an unknown tab id is a no-op', () => {
  const { call, map } = load([[11, 'tab-a']]);
  call('tab-zzz');
  assert.deepEqual([...map.entries()], [[11, 'tab-a']]);
});

test('forgetting from an empty index is a no-op', () => {
  const { call, map } = load([]);
  call('tab-a');
  assert.equal(map.size, 0);
});

test('the blocked-request counter no longer walks the tabs Map', () => {
  // onRequestBlocked fires tens of times per second while pages load. A linear
  // scan there dereferences tab.view.webContents on every open tab per request.
  const handler = mainSource.match(/onRequestBlocked\(\(request\) => \{[\s\S]*?\n  \}\);/)?.[0];
  assert.ok(handler, 'onRequestBlocked registration not found — update this test with it');
  assert.ok(
    !/for \(const tab of tabs\.values\(\)\)/.test(handler),
    'onRequestBlocked still iterates tabs.values() — use tabIdByWebContentsId'
  );
  assert.ok(
    /tabIdByWebContentsId\.get\(/.test(handler),
    'onRequestBlocked must resolve the tab through the index'
  );
});

test('tabForWebContents no longer walks the tabs Map', () => {
  const fn = mainSource.match(/function tabForWebContents\(wc\) \{[\s\S]*?\n  \}/)?.[0];
  assert.ok(fn, 'tabForWebContents not found — update this test with it');
  assert.ok(
    !/for \(const tab of tabs\.values\(\)\)/.test(fn),
    'tabForWebContents still iterates tabs.values() — use tabIdByWebContentsId'
  );
});
