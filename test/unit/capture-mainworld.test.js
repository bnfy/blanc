const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');
const { CAPTURE_MAINWORLD_SOURCE } = require('../../src/main/capture-mainworld');

// Minimal DOM/media doubles for the injected patch.
function makeWorld() {
  const events = [];
  const listeners = new Map();
  class FakeTrack {
    constructor(kind) { this.kind = kind; this.readyState = 'live'; this.handlers = new Map(); }
    stop() { this.readyState = 'ended'; }
    clone() { return new FakeTrack(this.kind); }
    addEventListener(name, fn) { this.handlers.set(name, fn); }
    fireEnded() { this.readyState = 'ended'; this.handlers.get('ended')?.(); }
  }
  class FakeStream {
    constructor(tracks) { this.tracks = tracks; }
    getTracks() { return this.tracks; }
    clone() { return new FakeStream(this.tracks.map((t) => t.clone())); }
  }
  let nextStream = null;
  const world = {
    window: null,
    CustomEvent: class { constructor(name, opts) { this.type = name; this.detail = opts?.detail; } },
    MediaStreamTrack: FakeTrack,
    MediaStream: FakeStream,
    navigator: {
      mediaDevices: {
        getUserMedia: () => (nextStream instanceof Error
          ? Promise.reject(nextStream)
          : Promise.resolve(nextStream)),
      },
    },
    JSON,
  };
  world.window = {
    addEventListener: (name, fn) => listeners.set(name, fn),
    dispatchEvent: (ev) => { events.push({ type: ev.type, detail: JSON.parse(ev.detail) }); },
  };
  vm.createContext(world);
  vm.runInContext(CAPTURE_MAINWORLD_SOURCE, world);
  return {
    events, world, FakeTrack, FakeStream,
    setNext: (v) => { nextStream = v; },
    gum: (constraints) => world.navigator.mediaDevices.getUserMedia(constraints),
    stopRequest: () => listeners.get('blanc:capture-stop-request')({}),
  };
}

const last = (arr) => arr[arr.length - 1];

test('resolved gUM emits the live snapshot BEFORE its settlement (no off-flicker)', async () => {
  // Order matters: main confirms the anchor on settlement, after which counts
  // carry the truth. Counts must already be there or the chip blinks off
  // between the two IPC messages.
  const w = makeWorld();
  w.setNext(new w.FakeStream([new w.FakeTrack('audio')]));
  await w.gum({ audio: true });
  assert.deepEqual(w.events[w.events.length - 2].detail,
    { type: 'snapshot', audioLive: 1, videoLive: 0 });
  assert.deepEqual(last(w.events).detail,
    { type: 'settlement', outcome: 'resolved', scopes: ['audio'] });
});

test('rejected gUM emits a rejected settlement', async () => {
  const w = makeWorld();
  w.setNext(new Error('NotFoundError'));
  await w.gum({ audio: true, video: true }).catch(() => {});
  assert.deepEqual(last(w.events).detail,
    { type: 'settlement', outcome: 'rejected', scopes: ['audio', 'video'] });
});

test('track.stop() is observed even though it fires no ended event', async () => {
  const w = makeWorld();
  const track = new w.FakeTrack('audio');
  w.setNext(new w.FakeStream([track]));
  const stream = await w.gum({ audio: true });
  stream.getTracks()[0].stop();
  assert.deepEqual(last(w.events).detail, { type: 'snapshot', audioLive: 0, videoLive: 0 });
});

test('cloned tracks stay counted; stopping the original is not enough', async () => {
  const w = makeWorld();
  const track = new w.FakeTrack('audio');
  w.setNext(new w.FakeStream([track]));
  const stream = await w.gum({ audio: true });
  const clone = stream.getTracks()[0].clone();
  stream.getTracks()[0].stop();
  assert.deepEqual(last(w.events).detail, { type: 'snapshot', audioLive: 1, videoLive: 0 });
  clone.stop();
  assert.deepEqual(last(w.events).detail, { type: 'snapshot', audioLive: 0, videoLive: 0 });
});

test('stop-request stops every registered track and reports zero', async () => {
  const w = makeWorld();
  w.setNext(new w.FakeStream([new w.FakeTrack('audio'), new w.FakeTrack('video')]));
  await w.gum({ audio: true, video: true });
  w.stopRequest();
  assert.deepEqual(last(w.events).detail, { type: 'snapshot', audioLive: 0, videoLive: 0 });
});
