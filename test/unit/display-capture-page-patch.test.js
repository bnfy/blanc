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
  audioPlay = () => Promise.resolve(),
} = {}) {
  const events = [];
  const listeners = new Map();
  const pcs = [];
  class FakeTrack {
    constructor(kind, { muted = false } = {}) {
      this.kind = kind;
      this.id = `track-${kind}-${Math.random().toString(16).slice(2, 8)}`;
      this.readyState = 'live';
      this.muted = muted;
      this.__probeAmp = kind === 'audio' ? 0.25 : 0;
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
      copy.__probeAmp = this.__probeAmp;
      return copy;
    }
    getSettings() { return { width: this._width, height: this._height }; }
    getConstraints() { return {}; }
    getCapabilities() { return {}; }
    addEventListener(name, fn) {
      const prior = this.handlers.get(name);
      this.handlers.set(name, (...args) => { prior?.(...args); fn(...args); });
    }
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
      this.connectionState = 'new';
      this.localDescription = { sdp: 'v=0' };
      this._audio = null;
      this._senders = [];
      this._listeners = new Map();
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
    getSenders() { return this._senders; }
    addTrack(track, { mic = false } = {}) {
      let calls = 0;
      const baseBytes = mic ? 5000 : 1000;
      const sender = {
        track,
        mic: mic === true,
        async getStats() {
          calls += 1;
          return new Map([
            [mic ? 'out-mic' : 'out-share', {
              type: 'outbound-rtp',
              kind: 'audio',
              id: mic ? 'mic-rtp' : 'share-rtp',
              ssrc: mic ? 99 : 1,
              bytesSent: baseBytes + calls * 100,
              packetsSent: calls * 10,
            }],
          ]);
        },
      };
      this._senders.push(sender);
      return sender;
    }
    async getStats() {
      // PC-level stats intentionally include mic + share; probes must not use this
      // for Meet outbound attribution (would overclaim mic traffic).
      const rows = [];
      for (const sender of this._senders) {
        const stats = await sender.getStats();
        for (const report of stats.values()) rows.push([report.id, report]);
      }
      return new Map(rows);
    }
    async setRemoteDescription() {
      queueMicrotask(() => {
        if (emitVideoImmediately) this.emitVideo();
        if (emitAudioImmediately) this.emitAudio();
      });
    }
    async createAnswer() { return { type: 'answer', sdp: 'v=0' }; }
    async setLocalDescription() {}
    addEventListener(name, fn) {
      this._listeners.set(name, [...(this._listeners.get(name) || []), fn]);
    }
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
    Date,
  };
  const audioSampleLog = [];
  class FakeAudioContext {
    constructor() {
      this.state = 'running';
    }
    createMediaStreamSource(stream) {
      const track = stream.getTracks()[0];
      return {
        connect: (analyser) => {
          analyser.__track = track;
        },
      };
    }
    createAnalyser() {
      return {
        fftSize: 2048,
        __track: null,
        getFloatTimeDomainData(buf) {
          audioSampleLog.push({
            t: Date.now(),
            trackId: this.__track?.id || null,
            amp: this.__track?.__probeAmp ?? 0,
          });
          buf.fill(0);
          buf[0] = this.__track?.__probeAmp ?? 0;
        },
      };
    }
    async close() {
      this.state = 'closed';
    }
  }
  world.AudioContext = FakeAudioContext;
  const audioElements = [];
  const allAudioElements = [];
  world.document = {
    createElement(kind) {
      assert.equal(kind, 'audio');
      const element = {
        srcObject: null,
        paused: true,
        removed: false,
        setAttribute() {},
        play() {
          assert.equal(this.muted, true, 'sink must be muted before play');
          assert.equal(this.volume, 0, 'sink must never play on local speakers');
          assert.ok(audioElements.includes(this), 'match the attached-element intervention');
          this.playedTrack = this.srcObject.getTracks()[0];
          this.paused = false;
          return audioPlay(this);
        },
        pause() { this.paused = true; },
        remove() {
          this.removed = true;
          const i = audioElements.indexOf(this);
          if (i !== -1) audioElements.splice(i, 1);
        },
      };
      allAudioElements.push(element);
      return element;
    },
    documentElement: { appendChild(element) { audioElements.push(element); } },
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
    RTCPeerConnection: FakePC,
    AudioContext: FakeAudioContext,
  };
  vm.createContext(world);
  vm.runInContext(CAPTURE_MAINWORLD_SOURCE, world);
  world.window.addEventListener('blanc:display-capture-request', (event) => {
    const req = JSON.parse(event.detail);
    world.window.dispatchEvent(new world.CustomEvent('blanc:display-capture-result', {
      detail: JSON.stringify({
        id: req.id,
        ok: true,
        shareId: 'share-' + req.id,
        offer: 'v=0',
        computerAudio,
        displaySurface,
      }),
    }));
  });
  return {
    events,
    world,
    audioSampleLog,
    audioElements,
    allAudioElements,
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
  const lateVideo = w.emitVideo();
  await new Promise((resolve) => setImmediate(resolve));
  const readyAfter = w.events
    .filter((item) => item.type === 'blanc:display-capture-track-ready')
    .map((item) => JSON.parse(item.detail).kind);
  assert.equal(readyAfter.includes('video'), false, 'failed shares must not announce a late track as ready');
  assert.equal(lateVideo.readyState, 'ended');
  await expectAbort;
  assert.ok(w.events.some((event) => event.type === 'blanc:display-capture-signal'
    && JSON.parse(event.detail).type === 'failed'), 'main receives failure instead of a late ready');
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

test('page audio handoff emits Meet-boundary page-diag', async () => {
  const w = makeWorld({ computerAudio: true });
  await w.gdm({ video: true, audio: true });
  const handoffs = w.events
    .filter((item) => item.type === 'blanc:display-capture-page-diag')
    .map((item) => JSON.parse(item.detail))
    .filter((item) => item.event === 'audio-handoff');
  assert.equal(handoffs.length, 1);
  assert.equal(handoffs[0].shareId, 'share-1');
  assert.equal(handoffs[0].computerAudio, true);
  assert.equal(handoffs[0].displaySurface, 'monitor');
  assert.equal(handoffs[0].readyState, 'live');
});

test('energy probe samples page and outbound input in parallel with timestamps', async () => {
  const w = makeWorld({ computerAudio: true });
  const stream = await w.gdm({ video: true, audio: true });
  const audio = stream.getTracks().find((track) => track.kind === 'audio');
  assert.ok(audio);
  audio.__probeAmp = 0.4;
  const meetPc = new w.world.window.RTCPeerConnection();
  // Meet often clones; clone stays brokered via wrapTrack and is a distinct analyser.
  const outboundTrack = audio.clone();
  outboundTrack.__probeAmp = 0.35;
  meetPc.addTrack(outboundTrack);
  // Mic sender on the same PC must not pollute brokered RTP attribution.
  const mic = new w.world.MediaStreamTrack('audio');
  mic.__probeAmp = 0.99;
  meetPc.addTrack(mic, { mic: true });

  w.audioSampleLog.length = 0;
  const probe = await w.world.window.__blancCaptureEnergyProbe(80);

  assert.equal(probe.outboundAttribution, 'brokered-sender-matched');
  assert.equal(typeof probe.page.peak, 'number');
  assert.equal(typeof probe.page.sampleStartedAt, 'number');
  assert.equal(typeof probe.page.sampleEndedAt, 'number');
  assert.equal(probe.page.sampleStartedAt, probe.sampleStartedAt);
  assert.equal(probe.page.sampleEndedAt, probe.sampleEndedAt);
  assert.equal(probe.meetOutboundBrokered.length, 1);
  const out = probe.meetOutboundBrokered[0];
  assert.equal(out.senderInput.sampleStartedAt, probe.page.sampleStartedAt);
  assert.equal(out.senderInput.sampleEndedAt, probe.page.sampleEndedAt);
  assert.equal(out.rtpBound, true);
  assert.equal(out.rtpDelta.ssrc, 1);
  assert.ok(out.rtpDelta.bytesSent > 0);
  assert.ok(out.rtpDelta.packetsSent > 0);
  assert.equal(out.rtpDelta.audibleEnergy, 'unknown');
  assert.equal(out.rtpDelta.totalAudioEnergy, undefined);
  assert.equal(probe.audibleEndToEnd, 'receiver-listening');
  // PC-level stats would see mic ssrc 99; brokered binding must not.
  assert.notEqual(out.rtpDelta.ssrc, 99);

  const trackIds = new Set(w.audioSampleLog.map((row) => row.trackId));
  assert.ok(trackIds.has(audio.id));
  // Parallel: first samples for page vs outbound must overlap in time (not
  // end(page) then start(outbound)).
  const byTrack = new Map();
  for (const row of w.audioSampleLog) {
    if (!byTrack.has(row.trackId)) byTrack.set(row.trackId, []);
    byTrack.get(row.trackId).push(row.t);
  }
  const times = [...byTrack.values()];
  assert.ok(times.length >= 2, 'expected ≥2 analyser tracks sampled');
  const firstA = Math.min(...times[0]);
  const lastA = Math.max(...times[0]);
  const firstB = Math.min(...times[1]);
  const lastB = Math.max(...times[1]);
  assert.ok(firstA <= lastB && firstB <= lastA, 'analyser windows must overlap');

  const logged = w.events
    .filter((item) => item.type === 'blanc:display-capture-page-diag')
    .map((item) => JSON.parse(item.detail))
    .filter((item) => item.event === 'energy-probe');
  assert.equal(logged.length, 1);
  assert.equal(logged[0].outboundAttribution, 'brokered-sender-matched');
  assert.equal(logged[0].meetOutboundCount, 1);
  assert.equal(probe.senderAttachment.audioSenderCount, 2);
  assert.equal(probe.senderAttachment.brokeredSenderCount, 1);
  assert.equal(probe.senderAttachment.otherAudioSenderCount, 1);
  assert.equal(probe.senderAttachment.brokeredExactMatchCount, 0);
});

test('energy probe is inconclusive when Meet uses a non-brokered transformed track', async () => {
  const w = makeWorld({ computerAudio: true });
  await w.gdm({ video: true, audio: true });
  const meetPc = new w.world.window.RTCPeerConnection();
  const transformed = new w.world.MediaStreamTrack('audio');
  meetPc.addTrack(transformed);
  const probe = await w.world.window.__blancCaptureEnergyProbe(50);
  assert.equal(probe.outboundAttribution, 'inconclusive-no-brokered-sender');
  assert.equal(probe.meetOutboundBrokered.length, 0);
  assert.equal(typeof probe.page.peak, 'number');
  assert.equal(probe.senderAttachment.audioSenderCount, 1);
  assert.equal(probe.senderAttachment.brokeredSenderCount, 0);
  assert.equal(probe.senderAttachment.otherAudioSenderCount, 1);
  assert.equal(probe.senderAttachment.attached, undefined);
  assert.equal(probe.senderAttachment.meetAttached, undefined);
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

test('computer audio starts muted receiver playout before resolving, without adding a page consumer', async () => {
  let finishPlay;
  const w = makeWorld({ computerAudio: true, audioPlay: () => new Promise((r) => { finishPlay = r; }) });
  let resolved = false;
  const pending = w.gdm({ video: true, audio: true }).then((stream) => { resolved = true; return stream; });
  await new Promise((r) => setImmediate(r));
  assert.equal(w.audioElements.length, 1);
  assert.equal(resolved, false, 'getDisplayMedia must wait for successful play');
  const sink = w.audioElements[0];
  assert.equal(sink.hidden, true);
  assert.equal(sink.defaultMuted, true);
  assert.notEqual(sink.playedTrack, w.pcs[0]._audio, 'sink owns an independent clone');
  assert.equal(w.events.filter((e) => e.type === 'blanc:display-capture-track-added').length, 2);
  finishPlay();
  const stream = await pending;
  assert.equal(stream.getTracks().includes(sink.playedTrack), false);
  for (const track of stream.getTracks()) track.stop();
  assert.equal(sink.paused, true);
  assert.equal(sink.srcObject, null);
  assert.equal(sink.playedTrack.readyState, 'ended');
  assert.equal(w.audioElements.length, 0);
});

test('video-only share does not create a receiver audio sink', async () => {
  const w = makeWorld({ emitAudioImmediately: false });
  const stream = await w.gdm({ video: true });
  assert.equal(w.allAudioElements.length, 0);
  stream.getTracks()[0].stop();
});

test('receiver sink survives original audio stop until the last audio clone stops', async () => {
  const w = makeWorld({ computerAudio: true });
  const stream = await w.gdm({ video: true, audio: true });
  const audio = stream.getTracks().find((t) => t.kind === 'audio');
  const video = stream.getTracks().find((t) => t.kind === 'video');
  const clone = audio.clone();
  const sink = w.audioElements[0];
  audio.stop();
  assert.equal(w.audioElements.length, 1);
  assert.equal(sink.playedTrack.readyState, 'live');
  clone.stop();
  assert.equal(w.audioElements.length, 0);
  assert.equal(sink.playedTrack.readyState, 'ended');
  assert.equal(video.readyState, 'live');
  video.stop();
});

test('trusted Stop removes only the named share sink and leaves independent capture live', async () => {
  const w = makeWorld({ computerAudio: true });
  const mic = new w.world.MediaStreamTrack('audio');
  const camera = new w.world.MediaStreamTrack('video');
  const first = await w.gdm({ video: true, audio: true });
  const second = await w.gdm({ video: true, audio: true });
  const [firstSink, secondSink] = w.audioElements;
  w.world.window.dispatchEvent(new w.world.CustomEvent('blanc:display-capture-abort', {
    detail: JSON.stringify({ shareId: 'share-1', reason: 'stop' }),
  }));
  assert.equal(firstSink.removed, true);
  assert.equal(firstSink.playedTrack.readyState, 'ended');
  assert.equal(secondSink.removed, false);
  assert.equal(secondSink.playedTrack.readyState, 'live');
  assert.ok(first.getTracks().every((t) => t.readyState === 'ended'));
  assert.ok(second.getTracks().every((t) => t.readyState === 'live'));
  assert.equal(mic.readyState, 'live');
  assert.equal(camera.readyState, 'live');
  for (const track of second.getTracks()) track.stop();
});

test('cancel during receiver play startup rejects and disposes a late play completion', async () => {
  let finishPlay;
  const w = makeWorld({ computerAudio: true, audioPlay: () => new Promise((r) => { finishPlay = r; }) });
  const pending = w.gdm({ video: true, audio: true });
  const rejected = assert.rejects(pending, { name: 'AbortError' });
  await new Promise((r) => setImmediate(r));
  const sink = w.audioElements[0];
  w.world.window.dispatchEvent(new w.world.CustomEvent('blanc:display-capture-abort', {
    detail: JSON.stringify({ shareId: 'share-1', reason: 'navigation' }),
  }));
  await rejected;
  finishPlay();
  await new Promise((r) => setImmediate(r));
  assert.equal(w.audioElements.length, 0);
  assert.equal(sink.srcObject, null);
  assert.equal(sink.playedTrack.readyState, 'ended');
  assert.equal(w.pcs[0].connectionState, 'closed');
  const lateAudio = w.emitAudio();
  assert.equal(lateAudio.readyState, 'ended', 'queued ontrack after abort must be discarded');
  assert.equal(w.allAudioElements.length, 1, 'late ontrack must not recreate the sink');
});

test('receiver play rejection rejects the share and releases its native clone', async () => {
  const w = makeWorld({ computerAudio: true, audioPlay: () => Promise.reject(new Error('play failed')) });
  await assert.rejects(w.gdm({ video: true, audio: true }), { name: 'NotReadableError' });
  assert.equal(w.audioElements.length, 0);
  assert.equal(w.allAudioElements[0].playedTrack.readyState, 'ended');
  assert.equal(w.pcs[0].connectionState, 'closed');
});

test('receiver play startup has a bounded timeout even after track-ready', async () => {
  const w = makeWorld({ computerAudio: true, audioPlay: () => new Promise(() => {}) });
  let expire;
  w.world.setTimeout = (fn, ms) => {
    if (ms === 5000) { expire = fn; return setTimeout(() => {}, 5000); }
    return setTimeout(fn, ms);
  };
  const pending = w.gdm({ video: true, audio: true });
  const rejected = assert.rejects(pending, { name: 'AbortError' });
  await new Promise((r) => setImmediate(r));
  assert.equal(typeof expire, 'function');
  expire();
  await rejected;
  assert.equal(w.audioElements.length, 0);
  assert.equal(w.pcs[0].connectionState, 'closed');
});

test('natural audio end releases receiver sink without stopping video', async () => {
  const w = makeWorld({ computerAudio: true });
  const stream = await w.gdm({ video: true, audio: true });
  const sink = w.audioElements[0];
  w.endAudio();
  assert.equal(w.audioElements.length, 0);
  assert.equal(sink.playedTrack.readyState, 'ended');
  const video = stream.getTracks().find((t) => t.kind === 'video');
  assert.equal(video.readyState, 'live');
  video.stop();
});
