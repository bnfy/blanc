'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { selectionState } = require('../../src/main/tab-selection');
const { planTabEdits, runPerTab } = require('../../src/main/tabs-batch');
const { buildBatchEntry } = require('../../src/main/closed-tabs');
const source = fs.readFileSync(require.resolve('../../src/main/main.js'), 'utf8');
const fn = name => source.match(new RegExp(`(?:async )?function ${name}\\([\\s\\S]*?\\n\\}`))[0];
function setup({ refusedClose = null, pinFault = false, quiet = null } = {}) {
  const tabs = new Map(['a', 'b', 'c'].map(id => [id, { id, url: `https://${id}.test/`, runtimeId: 'source', groupId: null }]));
  const runtime = { id: 'source', tabOrder: ['a', 'b', 'c'], activeTabId: 'c', groups: [], splits: [], selectedTabIds: ['a', 'b', 'c'] };
  const entries = []; let broadcasts = 0;
  const sandbox = { rt: () => runtime, tabs, selectionState, planTabEdits, runPerTab, buildBatchEntry,
    tabLayoutList: () => runtime.tabOrder.map(id => tabs.get(id)).filter(Boolean),
    windowRuntimes: { runtimeForTab: () => runtime },
    broadcastTabs: () => { broadcasts++; }, scheduleMenuRebuild() {}, canMoveTabToSpace: () => true,
    tabStateBroadcastSuppressionDepth: 0, structuredClone, newTabUrl: () => 'blanc://newtab/',
    closedMemberRecord: id => ({ ...tabs.get(id), id }),
    createTab: () => { tabs.set('floor', { id: 'floor', runtimeId: 'source' }); runtime.tabOrder.push('floor'); return 'floor'; },
    setActiveTab: id => { runtime.activeTabId = id; },
    closeTab: id => { if (id === refusedClose) return; tabs.delete(id); runtime.tabOrder = runtime.tabOrder.filter(t => t !== id); },
    pushClosedEntry: entry => entries.push(entry),
    announceSplit() {}, mainI18n: { t: key => key },
    explicitSleepEligible: tab => tab.id !== 'c', sleepTab: quiet ? id => quiet(id, tabs) : async () => false,
    shownMuted: tab => tab.muted, pinnedHomeFor: () => { if (pinFault) throw new Error('failed while planning'); return null; },
    pruneEmptyGroups() {}, liveContents: () => null,
  };
  vm.runInNewContext(`${fn('batchMembers')}\n${fn('runTabsAction')}\nthis.run = runTabsAction`, sandbox);
  return { runtime, tabs, entries, run: action => sandbox.run(action), get broadcasts() { return broadcasts; } };
}
test('a simulated refusal on the second close records only actual closes and keeps the refused tab selected', async () => {
  const h = setup({ refusedClose: 'b' });
  assert.equal(await h.run('batch-close'), false);
  assert.deepEqual(h.entries[0].tabs.map(tab => tab.url), ['https://a.test/', 'https://c.test/']);
  assert.deepEqual([...h.runtime.selectedTabIds], ['b']); assert.ok(h.tabs.has('b'));
});
test('a completed close leaves one start page and clears the selection', async () => {
  const h = setup(); assert.equal(await h.run('batch-close'), true);
  assert.deepEqual([...h.runtime.tabOrder], ['floor']); assert.deepEqual([...h.runtime.selectedTabIds], []);
  assert.equal(h.entries.length, 1); assert.equal(h.entries[0].tabs.length, 3);
});
test('pin plans apply in one publication; failure during planning mutates no tab', async () => {
  const h = setup(); assert.equal(await h.run('batch-pin'), true);
  assert.equal(h.broadcasts, 1); assert.ok(['a', 'b', 'c'].every(id => h.tabs.get(id).pinned));
  const fault = setup({ pinFault: true }); assert.equal(await fault.run('batch-pin'), false);
  assert.ok(['a', 'b', 'c'].every(id => !fault.tabs.get(id).pinned)); assert.equal(fault.broadcasts, 0);
});

test('a new window that fails after adopting one member restores every tab, split and group', () => {
  const sourceRuntime = { id: 'source', profileId: 'p', tabOrder: ['a', 'b', 'c'], activeTabId: 'a', groups: [{ id: 'g', name: 'Group', color: '#426c4c' }], splits: [{ id: 's', tabIds: ['a', 'b'], layout: { kind: 'columns', widths: [0.4, 0.6] } }] };
  const tabs = new Map(['a', 'b', 'c'].map(id => [id, { id, runtimeId: 'source', groupId: 'g', splitId: id === 'c' ? null : 's' }]));
  const runtimes = [sourceRuntime];
  const sandbox = {
    rt: () => sourceRuntime, tabs, structuredClone, crypto: { randomUUID: () => 'moved-group' },
    windowRuntimes: { all: () => runtimes, discardRuntime: r => runtimes.splice(runtimes.indexOf(r), 1) },
    tabStateBroadcastSuppressionDepth: 0, sessionPersistenceSuspended: false,
    createTab: () => { tabs.set('floor', { id: 'floor' }); sourceRuntime.tabOrder.push('floor'); return 'floor'; }, newTabUrl: () => 'blank',
    setActiveTab: id => { sourceRuntime.activeTabId = id; },
    detachTabForMove: (_r, id) => { sourceRuntime.tabOrder = sourceRuntime.tabOrder.filter(t => t !== id); tabs.get(id).groupId = null; },
    takeSpaceMoveFault: () => null,
    openNewWindow: () => {
      runtimes.push({ id: 'failed', tabOrder: ['a'], window: { destroy() {} } });
      tabs.get('a').runtimeId = 'failed'; throw new Error('window initialization failed');
    },
    rehomeTab: (tab, r) => { tab.runtimeId = r.id; },
    closeTab: id => { tabs.delete(id); sourceRuntime.tabOrder = sourceRuntime.tabOrder.filter(t => t !== id); },
    broadcastTabs() {},
  };
  vm.runInNewContext(`${fn('moveTabsToNewWindow')}\nthis.move = moveTabsToNewWindow`, sandbox);
  assert.equal(sandbox.move(['a', 'b', 'c']), false);
  assert.deepEqual([...sourceRuntime.tabOrder], ['a', 'b', 'c']); assert.equal(sourceRuntime.activeTabId, 'a');
  assert.equal(runtimes.length, 1); assert.equal(sourceRuntime.splits[0].tabIds.length, 2);
  for (const tab of tabs.values()) { assert.equal(tab.runtimeId, 'source'); assert.equal(tab.groupId, 'g'); }
});

test('an asynchronous batch never overwrites a newer user selection', async () => {
  let release;
  const wait = new Promise(resolve => { release = resolve; });
  const h = setup({ quiet: async (id, tabs) => { await wait; tabs.get(id).asleep = true; } });
  const pending = h.run('batch-quiet');
  h.runtime.selectedTabIds = ['b']; h.runtime.selectionRevision = 1;
  release(); await pending;
  assert.deepEqual(h.runtime.selectedTabIds, ['b']);
});

test('right-clicking an unselected row replaces selection and opens the ordinary menu', () => {
  const { pruneSelection } = require('../../src/main/tab-selection');
  const list = ['a', 'b', 'c', 'd'].map(id => ({ id, runtimeId: 'source' }));
  const runtime = { id: 'source', activeTabId: 'c', ...selectionState(['a', 'b', 'c'], 'a', list) };
  const sandbox = { selectionState, pruneSelection, tabs: new Map(list.map(tab => [tab.id, tab])),
    tabContextData: tab => ({ tab, groups: [], spaces: [], canCreateSpace: true }),
    tabLayoutList: () => list, broadcastTabs() {}, explicitSleepEligible: () => false,
    liveContents: () => null, canMoveTabToSpace: () => true };
  vm.runInNewContext(`${fn('tabRowContextData')}\nthis.context = tabRowContextData`, sandbox);
  assert.equal(sandbox.context(list[1], runtime).batch.ids.length, 3);
  assert.equal(sandbox.context(list[3], runtime).batch, undefined);
  assert.deepEqual([...runtime.selectedTabIds], ['d']); assert.equal(runtime.activeTabId, 'c');
});
