'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { createPageTintController } = require('../../src/main/page-tint-controller');
function clock() {
  let time = 0, id = 0;
  const tasks = new Map();
  return {
    now: () => time,
    schedule(fn, delay) { tasks.set(++id, { fn, at: time + delay }); return id; },
    cancel: key => tasks.delete(key),
    get pending() { return tasks.size; },
    async advance(ms) {
      for (let n = 0; n < 8; n++) await Promise.resolve();
      const end = time + ms;
      let turns = 0;
      while (true) {
        const next = [...tasks].sort((a, b) => a[1].at - b[1].at)[0];
        if (!next || next[1].at > end) break;
        assert.ok(++turns < 10000, 'no zero-delay spin');
        time = next[1].at; tasks.delete(next[0]); next[1].fn();
        for (let n = 0; n < 4; n++) await Promise.resolve();
      }
      time = end;
      for (let n = 0; n < 4; n++) await Promise.resolve();
    },
  };
}
test('coalesces a mutation flood into bounded samples, then backs off when stable', async () => {
  const c = clock(); let count = 0;
  const controller = createPageTintController({ ...c, getTarget: () => 'active', sample: async () => { count++; return false; } });
  for (let n = 0; n < 50; n++) controller.request();
  assert.equal(c.pending, 1);
  await c.advance(250);
  assert.equal(count, 4);
  await c.advance(6000);
  assert.ok(count < 40, `stable pages back off (${count})`);
  controller.pause(); const paused = count;
  await c.advance(10000); assert.equal(count, paused); assert.equal(c.pending, 0);
});
test('keeps one capture in flight and invalidates it across pause/resume', async () => {
  const c = clock(); let target = 'first', finish, validity, calls = [];
  const controller = createPageTintController({ ...c, getTarget: () => target, sample: async (tab, valid) => {
    calls.push(tab);
    if (tab === 'first') { validity = valid; return new Promise(resolve => { finish = resolve; }); }
    return false;
  } });
  controller.request(); await c.advance(0);
  for (let n = 0; n < 50; n++) controller.request();
  await c.advance(1000); assert.deepEqual(calls, ['first']);
  controller.pause(); assert.equal(validity(), false);
  target = 'second'; controller.request();
  finish(true); await c.advance(0);
  assert.deepEqual(calls, ['first', 'second']);
  controller.dispose(); await c.advance(10000); assert.equal(calls.length, 2);
});
test('does not sample an ineligible or hidden target and restarts on activation', async () => {
  const c = clock(); let target = null, calls = 0;
  const controller = createPageTintController({ ...c, getTarget: () => target, sample: async () => { calls++; return false; } });
  controller.request(); await c.advance(10000); assert.equal(calls, 0);
  target = 'visible'; controller.request(); await c.advance(0); assert.equal(calls, 1);
  target = null; await c.advance(1000); const stopped = calls;
  await c.advance(10000); assert.equal(calls, stopped); assert.equal(c.pending, 0);
});
test('keeps refreshing while rendered colors are changing and handles capture failure', async () => {
  const c = clock(); let calls = 0;
  const controller = createPageTintController({ ...c, getTarget: () => 'active', sample: async () => {
    calls++; if (calls === 2) throw new Error('view changed'); return true;
  } });
  controller.request(); await c.advance(5000);
  assert.ok(calls > 55 && calls < 65, `a continuous fade stays responsive (${calls})`);
  controller.dispose(); const stopped = calls;
  controller.request(); await c.advance(10000); assert.equal(calls, stopped);
});
