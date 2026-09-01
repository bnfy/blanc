const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const {
  WEBRTC_AUDIO_BUFFER_TARGET_MS,
  WEBRTC_AUDIO_BUFFER_UPDATE_CHANNEL,
  webrtcAudioBufferTargetFor,
  sendWebrtcAudioBufferMode,
} = require('../../src/main/webrtc-audio-buffer');

const preloadSource = fs.readFileSync(
  path.join(__dirname, '../../src/main/webrtc-audio-buffer-preload.js'),
  'utf8'
);
const mainWorldMatch = preloadSource.match(
  /\/\/ >>> mainworld\n([\s\S]*?)\n\/\/ <<< mainworld/
);
if (!mainWorldMatch) throw new Error('WebRTC audio-buffer main-world markers are missing');
const installWebrtcAudioBuffer = vm.runInNewContext(`(${mainWorldMatch[1]})`);

function fakePageRealm() {
  class FakeRTCPeerConnection {
    constructor() {
      this.connectionState = 'new';
      this.receivers = [];
      this.listeners = new Map();
    }

    addEventListener(name, listener) {
      const listeners = this.listeners.get(name) || [];
      listeners.push(listener);
      this.listeners.set(name, listeners);
    }

    removeEventListener(name, listener) {
      this.listeners.set(
        name,
        (this.listeners.get(name) || []).filter((candidate) => candidate !== listener)
      );
    }

    getReceivers() {
      return this.receivers;
    }

    async setRemoteDescription() {}

    addTransceiver(kind) {
      const receiver = { track: { kind }, jitterBufferTarget: null };
      this.receivers.push(receiver);
      return { receiver };
    }

    emit(name) {
      for (const listener of this.listeners.get(name) || []) listener();
    }
  }

  return { RTCPeerConnection: FakeRTCPeerConnection };
}

function runInjection(scope, mode) {
  return installWebrtcAudioBuffer(webrtcAudioBufferTargetFor(mode), scope);
}

test('call-audio modes map to automatic, stable, and high-resilience targets', () => {
  assert.deepEqual(WEBRTC_AUDIO_BUFFER_TARGET_MS, {
    automatic: null,
    stable: 400,
    resilient: 1000,
  });
  assert.equal(webrtcAudioBufferTargetFor('automatic'), null);
  assert.equal(webrtcAudioBufferTargetFor('stable'), 400);
  assert.equal(webrtcAudioBufferTargetFor('resilient'), 1000);
  assert.equal(webrtcAudioBufferTargetFor('unknown'), null);
});

test('Automatic does not patch RTCPeerConnection in a fresh page realm', () => {
  const scope = fakePageRealm();
  const original = scope.RTCPeerConnection.prototype.setRemoteDescription;

  assert.equal(runInjection(scope, 'automatic'), false);
  assert.equal(scope.RTCPeerConnection.prototype.setRemoteDescription, original);
});

test('explicit modes target audio receivers only and Automatic fully removes the hook', async () => {
  const scope = fakePageRealm();
  const originalSetRemoteDescription = scope.RTCPeerConnection.prototype.setRemoteDescription;
  const originalAddTransceiver = scope.RTCPeerConnection.prototype.addTransceiver;
  assert.equal(runInjection(scope, 'stable'), true);

  const peer = new scope.RTCPeerConnection();
  const audio = { track: { kind: 'audio' }, jitterBufferTarget: null };
  const video = { track: { kind: 'video' }, jitterBufferTarget: null };
  peer.receivers.push(audio, video);
  await peer.setRemoteDescription({ type: 'answer' });

  assert.equal(audio.jitterBufferTarget, 400);
  assert.equal(video.jitterBufferTarget, null);

  const nextAudio = peer.addTransceiver('audio').receiver;
  assert.equal(nextAudio.jitterBufferTarget, 400);

  assert.equal(runInjection(scope, 'resilient'), true);
  assert.equal(audio.jitterBufferTarget, 1000);
  assert.equal(nextAudio.jitterBufferTarget, 1000);
  assert.equal(video.jitterBufferTarget, null);

  assert.equal(runInjection(scope, 'automatic'), true);
  assert.equal(scope.RTCPeerConnection.prototype.setRemoteDescription, originalSetRemoteDescription);
  assert.equal(scope.RTCPeerConnection.prototype.addTransceiver, originalAddTransceiver);
  assert.equal(scope[Symbol.for('blanc.webrtcAudioBuffer.v2')], undefined);
  assert.equal(audio.jitterBufferTarget, null);
  assert.equal(nextAudio.jitterBufferTarget, null);
  assert.equal(video.jitterBufferTarget, null);
  assert.equal(peer.listeners.get('track')?.length ?? 0, 0);
  assert.equal(peer.listeners.get('connectionstatechange')?.length ?? 0, 0);

  // Re-enabling after a clean uninstall installs exactly one new hook.
  assert.equal(runInjection(scope, 'resilient'), true);
  const onceWrapped = scope.RTCPeerConnection.prototype.setRemoteDescription;
  assert.equal(runInjection(scope, 'resilient'), true);
  assert.equal(scope.RTCPeerConnection.prototype.setRemoteDescription, onceWrapped);
});

test('mode broadcasts cover browsing tabs, held views, and popups but not chrome surfaces', () => {
  const browsingSession = {};
  const chromeSession = {};
  const sent = [];
  const contents = [
    { session: browsingSession, isDestroyed: () => false, send: (...args) => sent.push(['tab', ...args]) },
    { session: browsingSession, isDestroyed: () => false, send: (...args) => sent.push(['held', ...args]) },
    { session: browsingSession, isDestroyed: () => false, send: (...args) => sent.push(['popup', ...args]) },
    { session: chromeSession, isDestroyed: () => false, send: (...args) => sent.push(['chrome', ...args]) },
    { session: browsingSession, isDestroyed: () => true, send: (...args) => sent.push(['dead', ...args]) },
  ];

  assert.equal(sendWebrtcAudioBufferMode({
    contents,
    sessions: [browsingSession],
    mode: 'stable',
  }), 3);
  assert.deepEqual(sent, [
    ['tab', WEBRTC_AUDIO_BUFFER_UPDATE_CHANNEL, 'stable'],
    ['held', WEBRTC_AUDIO_BUFFER_UPDATE_CHANNEL, 'stable'],
    ['popup', WEBRTC_AUDIO_BUFFER_UPDATE_CHANNEL, 'stable'],
  ]);
});
