'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  TAB_SWITCH_ORDERS, normalizeTabSwitchOrder, recentOrderAvailable,
  switcherOrder, startSwitch, stepSwitch, createTabSwitcher,
} = require('../../src/main/tab-switcher');

test('the setting has two orders and defaults to most recent', () => {
  assert.deepEqual([...TAB_SWITCH_ORDERS], ['recent', 'list']);
  assert.equal(normalizeTabSwitchOrder('list'), 'list');
  for (const bad of [undefined, null, '', 'mru', 1]) assert.equal(normalizeTabSwitchOrder(bad), 'recent');
});

test('recent order ships only where the Ctrl release is proven (D5)', () => {
  assert.equal(recentOrderAvailable('linux'), true);
  assert.equal(recentOrderAvailable('win32'), false);
  assert.equal(recentOrderAvailable('darwin'), false);
});

test('order: current first, then history newest-first, then never-activated tabs in list order', () => {
  assert.deepEqual(switcherOrder({
    activeTabId: 'c',
    history: ['a', 'b', 'c'],
    tabOrder: ['a', 'b', 'c', 'd', 'e'],
  }), ['c', 'b', 'a', 'd', 'e']);
});

test('order: ids no longer in the window are skipped, duplicates once', () => {
  assert.deepEqual(switcherOrder({
    activeTabId: 'b',
    history: ['gone', 'a', 'b', 'a'],
    tabOrder: ['a', 'b'],
  }), ['b', 'a']);
  assert.deepEqual(switcherOrder({ activeTabId: null, history: [], tabOrder: [] }), []);
});

test('order: a split is one entry, at its most recently active pane', () => {
  const splitOf = (id) => ({ p1: 's', p2: 's' })[id] ?? null;
  assert.deepEqual(switcherOrder({
    activeTabId: 'x',
    history: ['p2', 'y', 'p1', 'x'],
    tabOrder: ['x', 'y', 'p1', 'p2'],
    splitOf,
  }), ['x', 'p1', 'y']);
  // The current tab is a pane: its split leads, the other pane is not repeated.
  assert.deepEqual(switcherOrder({
    activeTabId: 'p2',
    history: ['p1', 'x', 'p2'],
    tabOrder: ['x', 'p1', 'p2'],
    splitOf,
  }), ['p2', 'x']);
});

test('start: Ctrl+Tab picks the previous tab, Ctrl+Shift+Tab the oldest; nothing with one tab', () => {
  assert.deepEqual(startSwitch(['c', 'b', 'a'], 1), { order: ['c', 'b', 'a'], pick: 1 });
  assert.deepEqual(startSwitch(['c', 'b', 'a'], -1), { order: ['c', 'b', 'a'], pick: 2 });
  assert.equal(startSwitch(['c'], 1), null);
  assert.equal(startSwitch([], -1), null);
});

test('step: wraps through the current tab in both directions', () => {
  const s = { order: ['c', 'b', 'a'], pick: 2 };
  assert.equal(stepSwitch(s, 1).pick, 0);
  assert.equal(stepSwitch({ ...s, pick: 0 }, -1).pick, 2);
  assert.equal(stepSwitch({ ...s, pick: 1 }, 1).pick, 2);
});

function harness(orders = { w: ['c', 'b', 'a'] }) {
  const landed = [];
  const live = new Set(['a', 'b', 'c', 'd']);
  const runtimes = Object.fromEntries(Object.keys(orders).map((k) => [k, { id: k }]));
  const switcher = createTabSwitcher({
    orderFor: (runtime) => orders[runtime.id],
    land: (runtime, id) => landed.push([runtime.id, id]),
    isLive: (_runtime, id) => live.has(id),
  });
  return { switcher, landed, live, runtimes };
}

test('a tap goes to the previous tab; a second tap would start afresh', () => {
  const { switcher, landed, runtimes: { w } } = harness();
  assert.equal(switcher.step(w, 1), true);
  assert.equal(switcher.pick(w), 'b');
  assert.equal(switcher.release(w), true);
  assert.deepEqual(landed, [['w', 'b']]);
  assert.equal(switcher.isSwitching(w), false);
  assert.equal(switcher.release(w), false, 'a release with no switch does nothing');
});

test('held Ctrl with Tab twice lands two back; Shift+Tab steps back toward newer', () => {
  const { switcher, landed, runtimes: { w } } = harness();
  switcher.step(w, 1);
  switcher.step(w, 1);
  assert.equal(switcher.pick(w), 'a');
  switcher.step(w, -1);
  assert.equal(switcher.pick(w), 'b');
  switcher.step(w, 1);
  switcher.release(w);
  assert.deepEqual(landed, [['w', 'a']]);
});

test('cancel, wrapping onto the current tab, or a closed pick changes nothing', () => {
  const { switcher, landed, live, runtimes: { w } } = harness();
  switcher.step(w, 1);
  assert.equal(switcher.cancel(w), true);
  assert.equal(switcher.release(w), false);
  switcher.step(w, 1); switcher.step(w, 1); switcher.step(w, 1); // wraps to the current tab
  assert.equal(switcher.pick(w), 'c');
  assert.equal(switcher.release(w), false);
  switcher.step(w, 1);
  live.delete('b');
  assert.equal(switcher.release(w), false);
  assert.deepEqual(landed, []);
});

test('nothing to switch to: no session starts', () => {
  const { switcher, runtimes: { w } } = harness({ w: ['c'] });
  assert.equal(switcher.step(w, 1), false);
  assert.equal(switcher.isSwitching(w), false);
});

test('sessions are per window', () => {
  const { switcher, landed, runtimes: { w, v } } = harness({ w: ['c', 'b'], v: ['d', 'a'] });
  switcher.step(w, 1);
  assert.equal(switcher.isSwitching(v), false);
  switcher.step(v, 1);
  switcher.release(v);
  switcher.release(w);
  assert.deepEqual(landed, [['v', 'a'], ['w', 'b']]);
});
