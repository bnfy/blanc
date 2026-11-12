'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  TAB_SWITCH_ORDERS, normalizeTabSwitchOrder, recentOrderAvailable,
  switcherOrder, startSwitch, stepSwitch, removeFromSwitch, switcherBounds,
  SWITCHER_CARD_HEIGHT, createTabSwitcher,
} = require('../../src/main/tab-switcher');

test('the setting has two orders and defaults to most recent', () => {
  assert.deepEqual([...TAB_SWITCH_ORDERS], ['recent', 'list']);
  assert.equal(normalizeTabSwitchOrder('list'), 'list');
  for (const bad of [undefined, null, '', 'mru', 1]) assert.equal(normalizeTabSwitchOrder(bad), 'recent');
});

test('recent order ships only where the Ctrl release is proven (D5)', () => {
  assert.equal(recentOrderAvailable('linux'), true);
  assert.equal(recentOrderAvailable('win32'), true);
  assert.equal(recentOrderAvailable('darwin'), true);
  assert.equal(recentOrderAvailable('freebsd'), false);
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
  assert.deepEqual(startSwitch(['c', 'b', 'a'], 1), { order: ['c', 'b', 'a'], pick: 1, steps: 1 });
  assert.deepEqual(startSwitch(['c', 'b', 'a'], -1), { order: ['c', 'b', 'a'], pick: 2, steps: 1 });
  assert.equal(startSwitch(['c'], 1), null);
  assert.equal(startSwitch([], -1), null);
});

test('step: wraps through the current tab in both directions', () => {
  const s = { order: ['c', 'b', 'a'], pick: 2 };
  assert.equal(stepSwitch(s, 1).pick, 0);
  assert.equal(stepSwitch({ ...s, pick: 0 }, -1).pick, 2);
  assert.equal(stepSwitch({ ...s, pick: 1 }, 1).pick, 2);
  assert.equal(stepSwitch(stepSwitch({ ...s, steps: 1 }, 1), 1).steps, 3, 'steps count, so the card opens on the second');
});

test('closing the pick (Ctrl+W) moves it one step older, wrapping past the current tab', () => {
  assert.deepEqual(removeFromSwitch({ order: ['d', 'c', 'b', 'a'], pick: 1 }, 'c'), { order: ['d', 'b', 'a'], pick: 1 });
  assert.deepEqual(removeFromSwitch({ order: ['d', 'c', 'b', 'a'], pick: 3 }, 'a'), { order: ['d', 'c', 'b'], pick: 1 });
  // Another entry going keeps the same tab picked.
  assert.deepEqual(removeFromSwitch({ order: ['d', 'c', 'b', 'a'], pick: 3 }, 'c'), { order: ['d', 'b', 'a'], pick: 2 });
  assert.equal(removeFromSwitch({ order: ['d', 'c'], pick: 1 }, 'c'), null, 'only the current tab is left');
  const s = { order: ['d', 'c'], pick: 1 };
  assert.equal(removeFromSwitch(s, 'gone'), s);
});

test('the card is centred over the page pane, inside the window', () => {
  const b = switcherBounds({ pageX: 0, pageWidth: 1280, windowHeight: 800, top: 56 });
  assert.equal(b.x + b.width / 2, 640);
  assert.equal(b.y, 56);
  assert.ok(b.height > SWITCHER_CARD_HEIGHT);
  const rail = switcherBounds({ pageX: 248, pageWidth: 1032, windowHeight: 800, top: 56 });
  assert.equal(rail.x + rail.width / 2, 248 + 516);
  const narrow = switcherBounds({ pageX: 0, pageWidth: 400, windowHeight: 120, top: 56 });
  assert.equal(narrow.width, 400);
  assert.equal(narrow.y + narrow.height, 120);
});

function harness(orders = { w: ['c', 'b', 'a'] }) {
  const landed = [];
  const changes = [];
  const live = new Set(['a', 'b', 'c', 'd']);
  const runtimes = Object.fromEntries(Object.keys(orders).map((k) => [k, { id: k }]));
  const switcher = createTabSwitcher({
    orderFor: (runtime) => orders[runtime.id],
    land: (runtime, id) => landed.push([runtime.id, id]),
    isLive: (_runtime, id) => live.has(id),
    onChange: (runtime) => changes.push([runtime.id, switcher.session(runtime)?.pick ?? null]),
  });
  return { switcher, landed, live, runtimes, changes };
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

test('the card hears every step, removal and end', () => {
  const { switcher, changes, runtimes: { w } } = harness({ w: ['d', 'c', 'b', 'a'] });
  switcher.step(w, 1);
  switcher.step(w, 1);
  switcher.removed(w, 'b');
  switcher.cancel(w);
  switcher.cancel(w); // nothing to cancel: no change
  assert.deepEqual(changes, [['w', 1], ['w', 2], ['w', 2], ['w', null]]);
});

test('a click on a card entry lands on it at once', () => {
  const { switcher, landed, runtimes: { w } } = harness();
  switcher.step(w, 1);
  assert.equal(switcher.choose(w, 'a'), true);
  assert.deepEqual(landed, [['w', 'a']]);
  assert.equal(switcher.isSwitching(w), false);
  switcher.step(w, 1);
  assert.equal(switcher.choose(w, 'c'), false, 'choosing the current tab changes nothing');
  assert.equal(switcher.isSwitching(w), false);
  assert.equal(switcher.choose(w, 'b'), false, 'no switch, no landing');
  assert.deepEqual(landed, [['w', 'a']]);
});
