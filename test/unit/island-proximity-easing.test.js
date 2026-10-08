'use strict';

// Behaviour of the resting pill's proximity easing in renderer.js: main sends a
// target closeness, and the chrome document eases --island-k toward it once per
// display frame. The block is lifted from the shipped source and run against
// a fake pill, matchMedia and requestAnimationFrame.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const renderer = fs.readFileSync(path.join(__dirname, '..', '..', 'src/renderer/renderer.js'), 'utf8');
const START = '  const ISLAND_EASE_MS = ';
const END = '\n  });\n})();';
const from = renderer.indexOf(START);
const to = renderer.indexOf(END, from);

function harness({ reduced = false } = {}) {
  assert.ok(from > 0 && to > from, 'proximity easing block not found in renderer.js');
  const props = new Map();
  const classes = new Set();
  const frames = [];
  let handler = null;
  let nextId = 1;
  let now = 1000;
  const sandbox = {
    islandPill: {
      style: { setProperty: (name, value) => props.set(name, value), getPropertyValue: (name) => props.get(name) ?? '' },
      classList: { toggle: (name, on) => (on ? classes.add(name) : classes.delete(name)), contains: (name) => classes.has(name) },
    },
    window: {
      matchMedia: () => ({ matches: reduced }),
      browserAPI: { onIslandProximity: (fn) => { handler = fn; } },
    },
    requestAnimationFrame: (fn) => { const id = nextId++; frames.push({ id, fn }); return id; },
    cancelAnimationFrame: (id) => { const i = frames.findIndex((f) => f.id === id); if (i >= 0) frames.splice(i, 1); },
    performance: { now: () => now },
    Math,
    Number,
    String,
  };
  vm.runInNewContext(`${renderer.slice(from, to)}\n  });`, sandbox);
  assert.equal(typeof handler, 'function', 'lifted block did not register onIslandProximity');
  return {
    send: (k) => handler({ k }),
    // Run pending animation frames at a fixed refresh interval.
    run(intervalMs, maxFrames = 1000) {
      let ran = 0;
      while (frames.length && ran < maxFrames) {
        now += intervalMs;
        frames.shift().fn(now);
        ran++;
      }
      return ran;
    },
    k: () => Number(props.get('--island-k') ?? 0),
    active: () => classes.has('proximity-active'),
    pending: () => frames.length,
  };
}

test('proximity eases toward the target over several frames, then stops', () => {
  const h = harness();
  h.send(1);
  assert.equal(h.k(), 0, 'nothing paints before the next frame');
  h.run(8, 1);
  const first = h.k();
  assert.ok(first > 0 && first < 0.3, `first frame moves part of the way (got ${first})`);
  assert.ok(h.active());
  const frames = h.run(8);
  assert.equal(h.k(), 1, 'settles exactly on the target');
  assert.equal(h.pending(), 0, 'the frame loop stops once settled');
  assert.ok(frames > 10 && frames < 60, `settles in a bounded number of 120 Hz frames (took ${frames + 1})`);
});

test('easing speed follows elapsed time, not frame count', () => {
  const at120 = harness();
  at120.send(1);
  at120.run(1000 / 120, 12); // 100 ms
  const at60 = harness();
  at60.send(1);
  at60.run(1000 / 60, 6); // 100 ms
  assert.ok(Math.abs(at120.k() - at60.k()) < 0.02, `same progress after 100 ms (${at120.k()} vs ${at60.k()})`);
});

test('a new target mid-ease retargets without restarting from rest', () => {
  const h = harness();
  h.send(1);
  h.run(8, 10);
  const mid = h.k();
  h.send(0.5);
  assert.equal(h.pending(), 1, 'reuses the running frame loop');
  h.run(8, 1);
  assert.ok(Math.abs(h.k() - mid) < 0.15, 'continues from where it was');
  h.run(8);
  assert.equal(h.k(), 0.5);
});

test('returning to zero clears the active class so the resting layer stays sharp', () => {
  const h = harness();
  h.send(1);
  h.run(8);
  h.send(0);
  h.run(8);
  assert.equal(h.k(), 0);
  assert.equal(h.active(), false);
  assert.equal(h.pending(), 0);
});

test('reduced motion paints zero immediately and runs no frames', () => {
  const h = harness({ reduced: true });
  h.send(0.8);
  assert.equal(h.k(), 0, 'the effect is off, so the reported scale must be too');
  assert.equal(h.active(), false);
  assert.equal(h.pending(), 0);
});
