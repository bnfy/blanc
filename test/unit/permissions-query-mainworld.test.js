'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');
const { CAPTURE_MAINWORLD_SOURCE } = require('../../src/main/capture-mainworld');

// vm harness for the permissions.query patch that ships inside the capture
// main-world source. The bridge is simulated: the isolated-world side is a
// window listener for 'blanc:permission-query' that answers (or doesn't) with
// 'blanc:permission-state'.
function makeWorld({ answer } = {}) {
  const queries = [];
  const listeners = new Map();
  const world = {
    window: null,
    CustomEvent: class { constructor(name, opts) { this.type = name; this.detail = opts?.detail; } },
    MediaStreamTrack: class { addEventListener() {} },
    MediaStream: class { getTracks() { return []; } },
    setTimeout,
    clearTimeout,
    navigator: {
      mediaDevices: { getUserMedia: () => Promise.resolve({ getTracks: () => [] }) },
      permissions: {
        query: (descriptor) => Promise.resolve({ state: 'denied', name: `real:${descriptor?.name}` }),
      },
    },
    JSON,
  };
  world.window = {
    addEventListener: (name, fn) => listeners.set(name, fn),
    dispatchEvent: (ev) => {
      if (ev.type !== 'blanc:permission-query') return;
      const payload = JSON.parse(ev.detail);
      queries.push(payload);
      if (!answer) return;
      const state = answer(payload);
      if (state === undefined) return; // simulate a bridge that never replies
      listeners.get('blanc:permission-state')?.({
        detail: JSON.stringify({ id: payload.id, state }),
      });
    },
  };
  vm.createContext(world);
  vm.runInContext(CAPTURE_MAINWORLD_SOURCE, world);
  return { world, queries, listeners };
}

test('microphone and camera queries bridge to Blanc truth with the right media types', async () => {
  const { world, queries } = makeWorld({ answer: (q) => (q.mediaType === 'audio' ? 'prompt' : 'granted') });
  const mic = await world.navigator.permissions.query({ name: 'microphone' });
  assert.equal(mic.state, 'prompt');
  assert.equal(mic.name, 'microphone');
  const cam = await world.navigator.permissions.query({ name: 'camera' });
  assert.equal(cam.state, 'granted');
  assert.equal(cam.name, 'camera');
  assert.deepEqual(queries.map((q) => q.mediaType), ['audio', 'video']);
  assert.equal(typeof mic.addEventListener, 'function',
    'the status object must be listener-compatible for sites that subscribe to change');
});

test('non-media descriptors pass through to the real query untouched', async () => {
  const { world, queries } = makeWorld({ answer: () => 'granted' });
  const geo = await world.navigator.permissions.query({ name: 'geolocation' });
  assert.equal(geo.name, 'real:geolocation');
  assert.equal(queries.length, 0, 'the bridge must not even be consulted');
});

test('an invalid or missing bridge answer falls back to the real (strict) query', async () => {
  // null state (main declined to answer — e.g. unregistered session).
  const withNull = makeWorld({ answer: () => null });
  const viaNull = await withNull.world.navigator.permissions.query({ name: 'microphone' });
  assert.equal(viaNull.name, 'real:microphone', 'null must fail closed to today\'s behavior');

  // Bridge never replies at all: the timeout must resolve to the real query,
  // never hang the page's promise.
  const silent = makeWorld({ answer: () => undefined });
  const viaTimeout = await silent.world.navigator.permissions.query({ name: 'camera' });
  assert.equal(viaTimeout.name, 'real:camera');
});

test('concurrent queries resolve by id even when answers arrive out of order', async () => {
  const pendingAnswers = [];
  const { world, listeners } = makeWorld({
    answer: (q) => { pendingAnswers.push(q); return undefined; },
  });
  const first = world.navigator.permissions.query({ name: 'microphone' });
  const second = world.navigator.permissions.query({ name: 'camera' });
  assert.equal(pendingAnswers.length, 2);
  // Answer the SECOND query first.
  listeners.get('blanc:permission-state')({
    detail: JSON.stringify({ id: pendingAnswers[1].id, state: 'denied' }),
  });
  listeners.get('blanc:permission-state')({
    detail: JSON.stringify({ id: pendingAnswers[0].id, state: 'granted' }),
  });
  assert.equal((await second).state, 'denied');
  assert.equal((await first).state, 'granted');
});
