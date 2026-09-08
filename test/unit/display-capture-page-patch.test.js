'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');
const { CAPTURE_MAINWORLD_SOURCE } = require('../../src/main/capture-mainworld');

function makeWorld({
  computerAudio = false,
  emitAudioImmediately = true,
  emitVideoImmediately = true,
  mutedVideo = false,
  displaySurface = 'monitor',
  unmuteWidth = 1280,
  unmuteHeight = 720,
} = {}) {
  const events = [];
  const listeners = new Map();
  const pcs = [];
  class FakeTrack {
    constructor(kind, { muted = false } = {}) {
      this.kind = kind;
      this.readyState = 'live';
      this.muted = muted;
      this._width = muted ? 0 : 1280;
      this._height = muted ? 0 : 720;
      this.handlers = new Map();
    }
    stop() {
      this.readyState = 'ended';
    }
    clone() {
      const copy = new FakeTrack(this.kind, { muted: this.muted });
      copy._width = this._width;
      copy._height = this._height;
      return copy;
    }
    getSettings() { return { width: this._width, height: this._height }; }
    getConstraints() { return {}; }
    getCapabilities() { return {}; }
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
    emitVideo() {
      this._video = new FakeTrack('video', { muted: mutedVideo });
      this.ontrack?.({ track: this._video });
      return this._video;
    }
    unmuteVideo() {
      const video = this._video;
      if (!video) return;
      video.muted = false;
      video._width = unmuteWidth;
      video._height = unmuteHeight;
      video.handlers.get('unmute')?.();
    }
    setVideoDimensions(width, height) {
      const video = this._video;
      if (!video) return;
      video._width = width;
      video._height = height;
    }
    endVideo() {
      const video = this._video;
      if (!video) return;
      // Remote end: readyState flips without going through the wrapped stop().
      video.readyState = 'ended';
      video.handlers.get('ended')?.();
    }
    endAudio() {
      const audio = this._audio;
      if (!audio) return;
      audio.readyState = 'ended';
      audio.handlers.get('ended')?.();
    }
    async setRemoteDescription() {
      queueMicrotask(() => {
        if (emitVideoImmediately) this.emitVideo();
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
    setTimeout,
    clearTimeout,
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
        displaySurface,
      }),
    }));
  });
  return {
    events,
    world,
    gdm: (options) => world.navigator.mediaDevices.getDisplayMedia(options),
    emitAudio: () => pcs[pcs.length - 1]?.emitAudio(),
    emitVideo: () => pcs[pcs.length - 1]?.emitVideo(),
    pcs,
    unmuteVideo: () => pcs[pcs.length - 1]?.unmuteVideo(),
    setVideoDimensions: (width, height) => pcs[pcs.length - 1]?.setVideoDimensions(width, height),
    endVideo: () => pcs[pcs.length - 1]?.endVideo(),
    endAudio: () => pcs[pcs.length - 1]?.endAudio(),
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
  w.unmuteVideo();
  const stream = await pending;
  assert.ok(stream.getTracks().some((track) => track.kind === 'video'));
  assert.ok(stream.getTracks().some((track) => track.kind === 'audio'));
});

test('relayed video getSettings reports displaySurface from picker enum', async () => {
  const w = makeWorld({ displaySurface: 'window' });
  const stream = await w.gdm({ video: true });
  const video = stream.getTracks().find((track) => track.kind === 'video');
  assert.equal(video.getSettings().displaySurface, 'window');
  assert.equal(video.getConstraints().displaySurface, 'window');
  assert.equal(video.getCapabilities().displaySurface, 'window');
  assert.equal(video.clone().getSettings().displaySurface, 'window');
});

test('muted live video still resolves after publish wait deadline', async () => {
  const w = makeWorld({ computerAudio: false, mutedVideo: true });
  const started = Date.now();
  const stream = await w.gdm({ video: true });
  const elapsed = Date.now() - started;
  assert.ok(stream.getTracks().some((track) => track.kind === 'video'));
  assert.ok(elapsed >= 1900, `expected ~2s publish wait, got ${elapsed}ms`);
  assert.ok(elapsed < 4000, `publish wait should not hang unboundedly (${elapsed}ms)`);
});

test('unmute plus dimensions can resolve before the publish deadline', async () => {
  const w = makeWorld({ computerAudio: false, mutedVideo: true });
  const pending = w.gdm({ video: true });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  const started = Date.now();
  await new Promise((resolve) => setTimeout(resolve, 100));
  w.unmuteVideo();
  const stream = await pending;
  const elapsed = Date.now() - started;
  assert.ok(stream.getTracks().some((track) => track.kind === 'video'));
  assert.equal(stream.getTracks().find((t) => t.kind === 'video').getSettings().displaySurface, 'monitor');
  assert.ok(elapsed < 1500, `expected early resolve after unmute, got ${elapsed}ms`);
});

test('video ending during publish wait rejects instead of hanging', async () => {
  const w = makeWorld({ computerAudio: false, mutedVideo: true });
  const pending = w.gdm({ video: true });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(w.pcs[0]?._video, 'expected muted live video while waiting');
  const started = Date.now();
  w.endVideo();
  await assert.rejects(
    Promise.race([
      pending,
      new Promise((_, reject) => setTimeout(() => reject(new Error('still pending after hang window')), 2200)),
    ]),
    (err) => err && err.name === 'AbortError',
  );
  const elapsed = Date.now() - started;
  assert.ok(elapsed < 500, `expected immediate reject after ended, got ${elapsed}ms`);
});

test('required audio ending before video arrives rejects instead of hanging', async () => {
  const w = makeWorld({
    computerAudio: true,
    emitAudioImmediately: false,
    emitVideoImmediately: false,
  });
  const pending = w.gdm({ video: true, audio: true });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  w.emitAudio();
  await new Promise((resolve) => setImmediate(resolve));
  const readyKinds = w.events
    .filter((item) => item.type === 'blanc:display-capture-track-ready')
    .map((item) => JSON.parse(item.detail).kind);
  assert.deepEqual(readyKinds, ['audio']);
  // Attach before ending audio — rejection is synchronous with the ended handler.
  const expectAbort = assert.rejects(pending, (err) => err && err.name === 'AbortError');
  const started = Date.now();
  w.endAudio();
  w.emitVideo();
  await new Promise((resolve) => setImmediate(resolve));
  const readyAfter = w.events
    .filter((item) => item.type === 'blanc:display-capture-track-ready')
    .map((item) => JSON.parse(item.detail).kind);
  assert.ok(readyAfter.includes('video'), 'video track-ready still emits so main can clear startup');
  await expectAbort;
  const elapsed = Date.now() - started;
  assert.ok(elapsed < 500, `expected immediate reject after required audio lost, got ${elapsed}ms`);
});

test('unmuted video with zero height is not publishable until height is non-zero', async () => {
  const w = makeWorld({
    computerAudio: false,
    mutedVideo: true,
    unmuteWidth: 1280,
    unmuteHeight: 0,
  });
  const pending = w.gdm({ video: true });
  let settled = false;
  const tracked = pending.then((stream) => {
    settled = true;
    return stream;
  }, (err) => {
    settled = true;
    throw err;
  });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  w.unmuteVideo();
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.equal(settled, false, '1280×0 must not resolve as publishable');
  w.setVideoDimensions(1280, 720);
  // Poll notices dimension changes without a dedicated event.
  const stream = await tracked;
  assert.ok(stream.getTracks().some((track) => track.kind === 'video'));
  assert.equal(stream.getTracks().find((t) => t.kind === 'video').getSettings().height, 720);
});

test('unmuted video with zero width is not publishable', async () => {
  const w = makeWorld({
    computerAudio: false,
    mutedVideo: true,
    unmuteWidth: 0,
    unmuteHeight: 720,
  });
  const pending = w.gdm({ video: true });
  let settled = false;
  pending.then(() => { settled = true; }, () => { settled = true; });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  w.unmuteVideo();
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.equal(settled, false, '0×720 must not resolve as publishable');
  // Let the live-only deadline resolve so the suite does not leak a pending gdm.
  const stream = await pending;
  assert.equal(settled, true);
  assert.ok(stream.getTracks().some((track) => track.kind === 'video'));
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
