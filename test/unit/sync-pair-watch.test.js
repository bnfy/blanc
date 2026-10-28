'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { createPairWatch, PAIR_WATCH_MS, PAIR_WATCH_MAX_READS } = require('../../src/main/sync-pair-watch');

// While the sheet shows a live code, the desktop reads `session` to learn the
// new device arrived (design 2026-10-28 §6.3): every 20 s, at most 30 reads,
// so it never takes more than 3 of the desktop's 10 GETs a minute.

function fakeClock() {
  let now = 0;
  const timers = new Map();
  let nextId = 1;
  return {
    now: () => now,
    setInterval: (fn, ms) => { const id = nextId++; timers.set(id, { fn, ms, at: now + ms }); return id; },
    clearInterval: (id) => { timers.delete(id); },
    async advance(ms) {
      const end = now + ms;
      for (;;) {
        const due = [...timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        const [, t] = due;
        now = t.at; t.at += t.ms;
        await t.fn();
      }
      now = end;
    },
    pending: () => timers.size,
  };
}

function setup({ devices = () => [{ id: 'A' }] } = {}) {
  const clock = fakeClock();
  const reads = [];
  const joined = [];
  let list = devices;
  const watch = createPairWatch({
    read: async () => { reads.push(clock.now()); },
    devices: () => list(),
    onJoined: (device) => joined.push(device),
    now: clock.now, setInterval: clock.setInterval, clearInterval: clock.clearInterval,
  });
  return { clock, reads, joined, watch, setDevices: (fn) => { list = fn; } };
}

test('the limits are 20 s and 30 reads', () => {
  assert.equal(PAIR_WATCH_MS, 20_000);
  assert.equal(PAIR_WATCH_MAX_READS, 30);
});

test('a new device is joined, a known one is not', async () => {
  const s = setup();
  s.watch.start({ expiresAt: 600_000 });
  s.watch.setActive(true);
  await s.clock.advance(20_000);
  assert.deepEqual(s.joined, []);
  s.setDevices(() => [{ id: 'A' }, { id: 'B', name: 'iPhone', platform: 'ios' }]);
  await s.clock.advance(20_000);
  assert.deepEqual(s.joined, [{ id: 'B', name: 'iPhone', platform: 'ios' }]);
  assert.equal(s.clock.pending(), 0);
});

test('check() sees a device the ordinary schedule brought in', () => {
  const s = setup();
  s.watch.start({ expiresAt: 600_000 });
  s.setDevices(() => [{ id: 'A' }, { id: 'C', name: 'MacBook Air', platform: 'darwin' }]);
  s.watch.check();
  assert.equal(s.joined.length, 1);
  s.watch.check();
  assert.equal(s.joined.length, 1);
});

test('reads every 20 s, at most 30, and never more than 3 in a minute', async () => {
  const s = setup();
  s.watch.start({ expiresAt: 3_600_000 });
  s.watch.setActive(true);
  await s.clock.advance(20 * 60_000);
  assert.equal(s.reads.length, 30);
  for (let i = 1; i < s.reads.length; i += 1) assert.equal(s.reads[i] - s.reads[i - 1], 20_000);
  for (const at of s.reads) assert.ok(s.reads.filter((t) => t > at - 60_000 && t <= at).length <= 3);
});

test('the watch stops at expiry', async () => {
  const s = setup();
  s.watch.start({ expiresAt: 50_000 });
  s.watch.setActive(true);
  await s.clock.advance(120_000);
  assert.deepEqual(s.reads, [20_000, 40_000]);
  assert.equal(s.clock.pending(), 0);
});

test('inactive reads nothing, and stop() ends it', async () => {
  const s = setup();
  s.watch.start({ expiresAt: 600_000 });
  await s.clock.advance(60_000);
  assert.equal(s.reads.length, 0);
  s.watch.setActive(true);
  await s.clock.advance(20_000);
  s.watch.setActive(false);
  await s.clock.advance(60_000);
  assert.equal(s.reads.length, 1);
  s.watch.setActive(true);
  s.watch.stop();
  await s.clock.advance(60_000);
  assert.equal(s.reads.length, 1);
  assert.equal(s.clock.pending(), 0);
});

test('without start(), setActive does nothing', async () => {
  const s = setup();
  s.watch.setActive(true);
  await s.clock.advance(60_000);
  assert.equal(s.reads.length, 0);
});
