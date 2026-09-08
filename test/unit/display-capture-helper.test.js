'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadHelper({ deferGum = false, rejectGum = false } = {}) {
  const signals = [];
  let authorize;
  let onSignal;
  const peers = [];
  const shareQueue = [];
  const streams = [];
  let releaseGum;
  class FakeTrack {
    constructor(kind, shareId) {
      this.kind = kind;
      this.readyState = 'live';
      this.shareId = shareId;
      this.endedHandlers = [];
    }
    stop() { this.readyState = 'ended'; }
    addEventListener(name, fn) {
      if (name === 'ended') this.endedHandlers.push(fn);
    }
  }
  class FakeStream {
    constructor(shareId) {
      this.shareId = shareId;
      this.tracks = [new FakeTrack('video', shareId), new FakeTrack('audio', shareId)];
    }
    getTracks() { return this.tracks; }
    getVideoTracks() { return this.tracks.filter((track) => track.kind === 'video'); }
    getAudioTracks() { return this.tracks.filter((track) => track.kind === 'audio'); }
  }
  class FakePC {
    constructor() {
      this.iceGatheringState = 'complete';
      this.connectionState = 'new';
      this.iceConnectionState = 'new';
      this.localDescription = { sdp: 'v=0' };
      this.tracks = [];
      this.closed = false;
      this.remote = null;
      this.listeners = new Map();
      peers.push(this);
    }
    addTrack(track) { this.tracks.push(track); }
    async createOffer() { return { type: 'offer', sdp: 'v=0' }; }
    async setLocalDescription() {}
    async setRemoteDescription(desc) { this.remote = desc; }
    async addIceCandidate() {}
    close() { this.closed = true; }
    addEventListener(name, fn) {
      this.listeners.set(name, [...(this.listeners.get(name) || []), fn]);
    }
    emit(name) {
      for (const fn of this.listeners.get(name) || []) fn();
    }
    failTransport() {
      this.connectionState = 'failed';
      this.iceConnectionState = 'failed';
      this.emit('connectionstatechange');
      this.emit('iceconnectionstatechange');
    }
  }
  const world = {
    window: {
      blancDisplayCaptureHelper: {
        ready() {},
        onAuthorize(fn) { authorize = fn; },
        onSignal(fn) { onSignal = fn; },
        signal(payload) { signals.push(payload); },
        stopped(payload) { signals.push({ type: 'stopped', ...payload }); },
      },
    },
    navigator: {
      mediaDevices: {
        async getDisplayMedia() {
          if (deferGum) {
            await new Promise((resolve, reject) => {
              releaseGum = rejectGum
                ? () => reject(Object.assign(new Error('denied'), { name: 'NotAllowedError' }))
                : resolve;
            });
          } else if (rejectGum) {
            throw Object.assign(new Error('denied'), { name: 'NotAllowedError' });
          }
          const stream = new FakeStream(shareQueue.shift());
          streams.push(stream);
          return stream;
        },
      },
    },
    RTCPeerConnection: FakePC,
  };
  world.window.blancDisplayCaptureHelper.onAuthorize = (fn) => { authorize = fn; };
  const source = fs.readFileSync(
    path.join(__dirname, '../../src/renderer/display-capture-helper.js'),
    'utf8'
  );
  vm.createContext(world);
  vm.runInContext(source, world);
  return {
    authorize: (job) => {
      shareQueue.push(job.shareId);
      authorize(job);
    },
    async waitForOffer(shareId) {
      for (let i = 0; i < 30; i += 1) {
        if (signals.some((item) => item.type === 'offer' && item.shareId === shareId)) return;
        await new Promise((resolve) => setImmediate(resolve));
      }
      throw new Error(`helper offer missing for ${shareId}`);
    },
    signal: (msg) => onSignal(msg),
    releaseGum: () => releaseGum?.(),
    signals,
    streams,
    peers,
    streamsOf(shareId) {
      return peers.filter((peer) => peer.tracks.some((track) => track.shareId === shareId));
    },
  };
}

test('second acquisition keeps the first share live', async () => {
  const helper = loadHelper();
  helper.authorize({ shareId: 'share-a', computerAudio: true });
  await helper.waitForOffer('share-a');
  helper.authorize({ shareId: 'share-b', computerAudio: true });
  await helper.waitForOffer('share-b');
  const a = helper.peers.find((peer) => peer.tracks.some((track) => track.shareId === 'share-a'));
  const b = helper.peers.find((peer) => peer.tracks.some((track) => track.shareId === 'share-b'));
  assert.ok(a, 'first share peer missing');
  assert.ok(b, 'second share peer missing');
  assert.equal(a.closed, false);
  assert.equal(b.closed, false);
  assert.equal(a.tracks.every((track) => track.readyState === 'live'), true);
  assert.equal(b.tracks.every((track) => track.readyState === 'live'), true);
});

test('stop and audio release are keyed by shareId', async () => {
  const helper = loadHelper();
  helper.authorize({ shareId: 'share-a', computerAudio: true });
  await helper.waitForOffer('share-a');
  helper.authorize({ shareId: 'share-b', computerAudio: true });
  await helper.waitForOffer('share-b');
  await helper.signal({ type: 'release', shareId: 'share-a', kind: 'audio' });
  const a = helper.peers.find((peer) => peer.tracks.some((track) => track.shareId === 'share-a'));
  const b = helper.peers.find((peer) => peer.tracks.some((track) => track.shareId === 'share-b'));
  assert.equal(a.tracks.find((track) => track.kind === 'audio').readyState, 'ended');
  assert.equal(b.tracks.find((track) => track.kind === 'audio').readyState, 'live');
  await helper.signal({ type: 'stop', shareId: 'share-a' });
  assert.equal(a.closed, true);
  assert.equal(b.closed, false);
  assert.equal(b.tracks.every((track) => track.readyState === 'live'), true);
});

test('stop during getDisplayMedia cancels late tracks and does not offer', async () => {
  const helper = loadHelper({ deferGum: true });
  helper.authorize({ shareId: 'share-a', computerAudio: true });
  await helper.signal({ type: 'stop', shareId: 'share-a' });
  helper.releaseGum();
  for (let i = 0; i < 20; i += 1) {
    if (helper.streams.length > 0) break;
    await new Promise((resolve) => setImmediate(resolve));
  }
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(helper.signals.some((item) => item.type === 'offer'), false);
  assert.ok(helper.signals.some((item) => item.type === 'stopped' && item.shareId === 'share-a'));
  assert.ok(helper.streams[0]);
  assert.equal(helper.streams[0].getTracks().every((track) => track.readyState === 'ended'), true);
});

test('stop during pending getDisplayMedia does not send settled stopped', async () => {
  const helper = loadHelper({ deferGum: true });
  helper.authorize({ shareId: 'share-a', computerAudio: true });
  await helper.signal({ type: 'stop', shareId: 'share-a' });
  assert.equal(
    helper.signals.some((item) => item.type === 'stopped' && item.shareId === 'share-a'),
    false,
    'Stop must not settle while getDisplayMedia is pending'
  );
  assert.equal(helper.signals.some((item) => item.type === 'offer'), false);
  helper.releaseGum();
  for (let i = 0; i < 20; i += 1) {
    if (helper.signals.some((item) => item.type === 'stopped' && item.nativeSettled === true)) break;
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.ok(helper.signals.some((item) => (
    item.type === 'stopped' && item.shareId === 'share-a' && item.nativeSettled === true
  )));
  assert.ok(helper.streams[0]);
  assert.equal(helper.streams[0].getTracks().every((track) => track.readyState === 'ended'), true);
});

test('cancelled getDisplayMedia rejection reports native settlement', async () => {
  const helper = loadHelper({ deferGum: true, rejectGum: true });
  helper.authorize({ shareId: 'share-a', computerAudio: true });
  await helper.signal({ type: 'stop', shareId: 'share-a' });
  assert.equal(
    helper.signals.some((item) => item.type === 'stopped' && item.nativeSettled === true),
    false
  );
  helper.releaseGum();
  for (let i = 0; i < 20; i += 1) {
    if (helper.signals.some((item) => item.type === 'stopped' && item.nativeSettled === true)) break;
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.ok(helper.signals.some((item) => item.type === 'error' && item.shareId === 'share-a'));
  assert.ok(helper.signals.some((item) => (
    item.type === 'stopped' && item.shareId === 'share-a' && item.nativeSettled === true
  )));
  assert.equal(helper.signals.some((item) => item.type === 'offer'), false);
});

test('video release stops only that share video track', async () => {
  const helper = loadHelper();
  helper.authorize({ shareId: 'share-a', computerAudio: true });
  await helper.waitForOffer('share-a');
  helper.authorize({ shareId: 'share-b', computerAudio: true });
  await helper.waitForOffer('share-b');
  await helper.signal({ type: 'release', shareId: 'share-a', kind: 'video' });
  const a = helper.peers.find((peer) => peer.tracks.some((track) => track.shareId === 'share-a'));
  const b = helper.peers.find((peer) => peer.tracks.some((track) => track.shareId === 'share-b'));
  assert.equal(a.tracks.find((track) => track.kind === 'video').readyState, 'ended');
  assert.equal(a.tracks.find((track) => track.kind === 'audio').readyState, 'live');
  assert.equal(b.tracks.every((track) => track.readyState === 'live'), true);
});

test('helper tears down capture on transport failure without page notification', async () => {
  const helper = loadHelper();
  helper.authorize({ shareId: 'share-a', computerAudio: true });
  await helper.waitForOffer('share-a');
  const peer = helper.peers.find((item) => item.tracks.some((track) => track.shareId === 'share-a'));
  assert.ok(peer);
  // No page-side `failed` signal — the trusted helper must observe this itself.
  peer.failTransport();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(peer.closed, true);
  assert.equal(peer.tracks.every((track) => track.readyState === 'ended'), true);
  assert.ok(helper.signals.some((item) => (
    item.type === 'error'
    && item.shareId === 'share-a'
    && (item.reason === 'relay-failed' || item.name === 'AbortError')
  )));
  assert.ok(helper.signals.some((item) => (
    item.type === 'stopped' && item.shareId === 'share-a' && item.nativeSettled === true
  )));
});
