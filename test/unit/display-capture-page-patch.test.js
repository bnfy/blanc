'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');
const { CAPTURE_MAINWORLD_SOURCE } = require('../../src/main/capture-mainworld');

function makeWorld() {
  const events = [];
  const listeners = new Map();
  class FakeTrack {
    constructor(kind) { this.kind = kind; this.readyState = 'live'; this.handlers = new Map(); }
    stop() { this.readyState = 'ended'; }
    clone() { return new FakeTrack(this.kind); }
    addEventListener(name, fn) { this.handlers.set(name, fn); }
  }
  class FakeStream {
    constructor(tracks) { this.tracks = tracks; }
    getTracks() { return this.tracks; }
  }
  class FakePC {
    constructor() { this.ontrack = null; this.iceGatheringState = 'complete'; this.localDescription = { sdp: 'v=0' }; }
    async setRemoteDescription() {
      queueMicrotask(() => {
        this.ontrack?.({ track: new FakeTrack('video') });
        this.ontrack?.({ track: new FakeTrack('audio') });
      });
    }
    async createAnswer() { return { type: 'answer', sdp: 'v=0' }; }
    async setLocalDescription() {}
    addEventListener() {}
  }
  const world = {
    window: null,
    CustomEvent: class { constructor(name, opts) { this.type = name; this.detail = opts?.detail; } },
    DOMException: class extends Error { constructor(message, name) { super(message); this.name = name; } },
    MediaStreamTrack: FakeTrack,
    MediaStream: FakeStream,
    RTCPeerConnection: FakePC,
    navigator: { mediaDevices: { getUserMedia: () => Promise.reject(new Error('unused')) } },
    JSON,
  };
  world.window = {
    addEventListener: (name, fn) => {
      listeners.set(name, [...(listeners.get(name) || []), fn]);
    },
    dispatchEvent: (ev) => {
      events.push({ type: ev.type, detail: ev.detail });
      for (const fn of listeners.get(ev.type) || []) fn(ev);
    },
  };
  vm.createContext(world);
  vm.runInContext(CAPTURE_MAINWORLD_SOURCE, world);
  world.window.addEventListener('blanc:display-capture-request', (event) => {
    const req = JSON.parse(event.detail);
    world.window.dispatchEvent(new world.CustomEvent('blanc:display-capture-result', {
      detail: JSON.stringify({
        id: req.id,
        ok: true,
        shareId: 'share-1',
        offer: 'v=0',
      }),
    }));
  });
  return {
    events,
    world,
    gdm: (options) => world.navigator.mediaDevices.getDisplayMedia(options),
    stopped: () => events.filter((item) => item.type === 'blanc:display-capture-track-stopped')
      .map((item) => JSON.parse(item.detail)),
  };
}

test('video false is TypeError before any broker request', async () => {
  const w = makeWorld();
  await assert.rejects(() => w.gdm({ video: false }), (err) => err && err.name === 'TypeError');
  assert.equal(w.events.some((item) => item.type === 'blanc:display-capture-request'), false);
});

test('clone increments consumers; stopping one clone does not emit the sibling key', async () => {
  const w = makeWorld();
  const stream = await w.gdm({ video: true, audio: true });
  const video = stream.getTracks().find((track) => track.kind === 'video');
  const clone = video.clone();
  video.stop();
  const stopped = w.stopped();
  assert.equal(stopped.length, 1);
  assert.notEqual(stopped[0].trackKey, undefined);
  clone.stop();
  const stoppedBoth = w.stopped();
  assert.equal(stoppedBoth.length, 2);
  assert.notEqual(stoppedBoth[0].trackKey, stoppedBoth[1].trackKey);
});
