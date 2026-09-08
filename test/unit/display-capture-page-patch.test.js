'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');
const { CAPTURE_MAINWORLD_SOURCE } = require('../../src/main/capture-mainworld');

function makeWorld({ computerAudio = false, emitAudioImmediately = true, mutedVideo = false } = {}) {
  const events = [];
  const listeners = new Map();
  const pcs = [];
  class FakeTrack {
    constructor(kind, { muted = false } = {}) {
      this.kind = kind;
      this.readyState = 'live';
      this.muted = muted;
      this.handlers = new Map();
    }
    stop() { this.readyState = 'ended'; }
    clone() { return new FakeTrack(this.kind); }
    addEventListener(name, fn) { this.handlers.set(name, fn); }
    dispatchEvent(event) { this.handlers.get(event.type)?.(event); }
  }
  class FakeStream {
    constructor(tracks) { this.tracks = tracks; }
    getTracks() { return this.tracks; }
  }
  class FakePC {
    constructor() {
      this.ontrack = null;
      this.iceGatheringState = 'complete';
      this.localDescription = { sdp: 'v=0' };
      this._audio = null;
      pcs.push(this);
    }
    emitAudio() {
      const track = new FakeTrack('audio');
      this._audio = track;
      this.ontrack?.({ track });
      return track;
    }
    unmuteVideo() {
      const video = this._video;
      if (!video) return;
      video.muted = false;
      video.handlers.get('unmute')?.();
    }
    async setRemoteDescription() {
      queueMicrotask(() => {
        this._video = new FakeTrack('video', { muted: mutedVideo });
        this.ontrack?.({ track: this._video });
        if (emitAudioImmediately) this.emitAudio();
      });
    }
    async createAnswer() { return { type: 'answer', sdp: 'v=0' }; }
    async setLocalDescription() {}
    addEventListener() {}
    close() { this.connectionState = 'closed'; }
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
    Event,
  };
  world.window = {
    addEventListener: (name, fn) => {
      listeners.set(name, [...(listeners.get(name) || []), fn]);
    },
    removeEventListener: (name, fn) => {
      listeners.set(name, (listeners.get(name) || []).filter((item) => item !== fn));
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
        computerAudio,
      }),
    }));
  });
  return {
    events,
    world,
    gdm: (options) => world.navigator.mediaDevices.getDisplayMedia(options),
    emitAudio: () => pcs[pcs.length - 1]?.emitAudio(),
    pcs,
    unmuteVideo: () => pcs[pcs.length - 1]?.unmuteVideo(),
    stopped: () => events.filter((item) => item.type === 'blanc:display-capture-track-stopped')
      .map((item) => JSON.parse(item.detail)),
  };
}

test('trusted abort after readiness ends the original and its clones and closes relay', async () => {
  const w = makeWorld();
  const stream = await w.gdm({ video: true });
  const track = stream.getTracks()[0];
  const clone = track.clone();
  let ended = 0;
  clone.addEventListener('ended', () => { ended++; });
  w.world.window.dispatchEvent(new w.world.CustomEvent('blanc:display-capture-abort', {
    detail: JSON.stringify({ shareId: 'share-1', reason: 'stop' }),
  }));
  assert.equal(track.readyState, 'ended');
  assert.equal(clone.readyState, 'ended');
  assert.equal(ended, 1);
  assert.equal(w.pcs[0].connectionState, 'closed');
});

test('video false is TypeError before any broker request', async () => {
  const w = makeWorld();
  await assert.rejects(() => w.gdm({ video: false }), (err) => err && err.name === 'TypeError');
  assert.equal(w.events.some((item) => item.type === 'blanc:display-capture-request'), false);
});

test('muted live ontrack still emits track-ready so startup can clear', async () => {
  const w = makeWorld({ computerAudio: true, emitAudioImmediately: false, mutedVideo: true });
  const pending = w.gdm({ video: true, audio: true });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  const added = w.events.filter((item) => item.type === 'blanc:display-capture-track-added');
  const ready = w.events.filter((item) => item.type === 'blanc:display-capture-track-ready');
  assert.ok(added.some((item) => JSON.parse(item.detail).kind === 'video'));
  assert.ok(ready.some((item) => JSON.parse(item.detail).kind === 'video'));
  w.emitAudio();
  const stream = await pending;
  assert.ok(stream.getTracks().some((track) => track.kind === 'video'));
  assert.ok(stream.getTracks().some((track) => track.kind === 'audio'));
});

test('approved computer audio waits for a live audio track', async () => {
  const w = makeWorld({ computerAudio: true, emitAudioImmediately: false });
  let settled = false;
  const pending = w.gdm({ video: true, audio: true }).then((stream) => {
    settled = true;
    return stream;
  });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(settled, false);
  w.emitAudio();
  const stream = await pending;
  assert.equal(settled, true);
  assert.ok(stream.getTracks().some((track) => track.kind === 'audio'));
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
