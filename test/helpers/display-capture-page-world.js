'use strict';
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { captureMainworldSourceForPlatform } = require('../../src/main/capture-mainworld');

function makeWorld({
  platform = 'linux',
  computerAudio = false,
  emitAudioImmediately = true,
  emitVideoImmediately = true,
  mutedVideo = false,
  displaySurface = 'monitor',
  unmuteWidth = 1280,
  unmuteHeight = 720,
  sourceWidth = 1280,
  sourceHeight = 720,
  sourceFrameRate = 30,
  canvasAdapter = false,
  audioPlay = () => Promise.resolve(),
} = {}) {
  const events = [];
  const listeners = new Map();
  const pcs = [];
  class OverconstrainedError extends Error {
    constructor(constraint, message) {
      super(message || constraint || 'OverconstrainedError');
      this.name = 'OverconstrainedError';
      this.constraint = constraint;
    }
  }
  class FakeTrack {
    constructor(kind, { muted = false } = {}) {
      this.kind = kind;
      this.id = `track-${kind}-${Math.random().toString(16).slice(2, 8)}`;
      this.readyState = 'live';
      this.muted = muted;
      this.__probeAmp = kind === 'audio' ? 0.25 : 0;
      this._width = muted ? 0 : unmuteWidth;
      this._height = muted ? 0 : unmuteHeight;
      this._frameRate = sourceFrameRate;
      this.handlers = new Map();
    }
    stop() {
      this.readyState = 'ended';
    }
    clone() {
      const copy = new FakeTrack(this.kind, { muted: this.muted });
      copy._width = this._width;
      copy._height = this._height;
      copy._frameRate = this._frameRate;
      copy.__probeAmp = this.__probeAmp;
      return copy;
    }
    // Native-like raw clone used by MediaStream.clone (does not call instance clone()).
    _rawClone() {
      const copy = new FakeTrack(this.kind, { muted: this.muted });
      copy._width = this._width;
      copy._height = this._height;
      copy._frameRate = this._frameRate;
      copy.__probeAmp = this.__probeAmp;
      return copy;
    }
    getSettings() {
      return { width: this._width, height: this._height, frameRate: this._frameRate };
    }
    getConstraints() { return {}; }
    getCapabilities() { return {}; }
    async applyConstraints() {
      throw new OverconstrainedError('width', 'width');
    }
    addEventListener(name, fn) {
      const prior = this.handlers.get(name);
      this.handlers.set(name, (...args) => { prior?.(...args); fn(...args); });
    }
    dispatchEvent(event) { this.handlers.get(event.type)?.(event); }
  }
  FakeTrack.prototype.getSettings = function getSettings() {
    return { width: this._width, height: this._height, frameRate: this._frameRate };
  };
  FakeTrack.prototype.applyConstraints = async function applyConstraints(constraints) {
    // CanvasCaptureMediaStreamTrack retimes via native applyConstraints on the
    // retained track (MediaStreamTrack.prototype.applyConstraints.call(...)).
    // Chromium can lower frameRate below the captureStream ceiling but cannot raise it.
    if (this._canvas && constraints && constraints.frameRate != null) {
      const fr = constraints.frameRate;
      const rate = typeof fr === 'object' && fr
        ? Number(fr.exact ?? fr.ideal ?? fr.max)
        : Number(fr);
      if (!(rate > 0)) throw new OverconstrainedError('frameRate');
      const ceiling = Number(this._rateCeiling ?? this._canvas._rateCeiling) || 0;
      if (ceiling > 0 && rate > ceiling) throw new OverconstrainedError('frameRate');
      this._frameRate = rate;
      this._canvas.captureRate = rate;
      return;
    }
    throw new OverconstrainedError('width', 'width');
  };
  class FakeStream {
    constructor(tracks) { this.tracks = tracks; }
    getTracks() { return this.tracks; }
    getVideoTracks() { return this.tracks.filter((track) => track.kind === 'video'); }
    getAudioTracks() { return this.tracks.filter((track) => track.kind === 'audio'); }
    // Mimic Chromium: stream.clone creates new track objects without calling track.clone().
    clone() {
      return new FakeStream(this.tracks.map((track) => track._rawClone()));
    }
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
    OverconstrainedError,
    MediaStreamTrack: FakeTrack,
    MediaStream: FakeStream,
    RTCPeerConnection: FakePC,
    navigator: { mediaDevices: { getUserMedia: () => Promise.reject(new Error('unused')) } },
    JSON,
    Event,
    setTimeout,
    clearTimeout,
    Date,
    Promise,
  };
  const audioSampleLog = [];
  class FakeAudioContext {
    constructor() {
      this.state = 'running';
      this.sampleRate = 48000;
      this.destination = {};
      this._processors = [];
      world.__audioProcessors.push(this);
    }
    createGain() {
      return { gain: { value: 0 }, connect() {} };
    }
    createBuffer() {
      return {};
    }
    createBufferSource() {
      return {
        buffer: null,
        loop: false,
        connect() {},
        start() {},
        stop() {},
      };
    }
    createScriptProcessor() {
      const node = {
        onaudioprocess: null,
        connect() {},
        disconnect() {},
      };
      this._processors.push(node);
      return node;
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
    async resume() {
      this.state = 'running';
    }
    async close() {
      this.state = 'closed';
    }
  }
  world.__audioProcessors = [];
  world.AudioContext = FakeAudioContext;
  const audioElements = [];
  const allAudioElements = [];
  const canvases = [];
  world.__canvases = canvases;
  // Queue rAF so tests can drain the canvas pump without a live event loop.
  world.__raf = [];
  let rafId = 0;
  world.requestAnimationFrame = (fn) => {
    world.__raf.push(fn);
    return ++rafId;
  };
  world.cancelAnimationFrame = () => {};
  world.tickRaf = () => {
    const queued = world.__raf.splice(0, world.__raf.length);
    for (const fn of queued) {
      try { fn(Date.now()); } catch {}
    }
  };
  world.tickAudio = () => {
    for (const ctx of world.__audioProcessors) {
      for (const node of ctx._processors) {
        try { node.onaudioprocess?.({}); } catch {}
      }
    }
  };
  world.document = {
    createElement(kind) {
      if (canvasAdapter && kind === 'video') {
        return {
          readyState: 2,
          muted: true,
          playsInline: true,
          srcObject: null,
          play() { return Promise.resolve(); },
          pause() {},
        };
      }
      if (canvasAdapter && kind === 'canvas') {
        const canvas = {
          width: 0,
          height: 0,
          captureRate: null,
          output: null,
          getContext() { return { drawImage() {} }; },
          captureStream(rate) {
            this.captureRate = rate;
            this._rateCeiling = rate;
            const track = new FakeTrack('video');
            track._width = this.width || sourceWidth;
            track._height = this.height || sourceHeight;
            track._frameRate = rate;
            track._rateCeiling = rate;
            track._canvas = this;
            this.output = track;
            return new FakeStream([track]);
          },
        };
        canvases.push(canvas);
        return canvas;
      }
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
  vm.runInContext(captureMainworldSourceForPlatform(platform), world);
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
        videoAdapter: {
          settings: {
            width: sourceWidth,
            height: sourceHeight,
            frameRate: sourceFrameRate,
            deviceId: 'helper-device',
            groupId: 'helper-group',
          },
          capabilities: {
            width: { min: 1, max: sourceWidth },
            height: { min: 1, max: sourceHeight },
            frameRate: { min: 0, max: sourceFrameRate },
            deviceId: 'helper-device',
            groupId: 'helper-group',
          },
        },
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

module.exports = { makeWorld };
