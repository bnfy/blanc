'use strict';

/**
 * Unpackaged Electron proof for shipped per-consumer display-share adapters.
 * Uses CAPTURE_MAINWORLD_SOURCE (not a copied pipeline), hides the producer
 * BrowserWindow while a separate visible receiver measures decoded frames, and
 * requires relay-end to end the adapter output.
 *
 * Matches Blanc tab defaults: producer backgroundThrottling stays enabled.
 *
 *   env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron \\
 *     experiments/display-capture-broker/adapter-probe/main.cjs
 *
 * Optional clone-rate mode (15 → clone → exact 30, native settings + cadence):
 *   BLANC_ADAPTER_PROBE=clone-rate env -u ELECTRON_RUN_AS_NODE \\
 *     ./node_modules/.bin/electron experiments/display-capture-broker/adapter-probe/main.cjs
 */

delete process.env.ELECTRON_RUN_AS_NODE;

const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { captureMainworldSourceForPlatform } = require('../../../src/main/capture-mainworld');
// Exercise the Linux adapter bytes on the local engine. This is mechanism
// coverage, never a Linux native or macOS conference gate.
const CAPTURE_MAINWORLD_SOURCE = captureMainworldSourceForPlatform('linux');

const RESULT = path.join(__dirname, 'result.json');
const PROFILE = path.join(__dirname, '.probe-profile');
const CLONE_RATE = process.env.BLANC_ADAPTER_PROBE === 'clone-rate';

async function run() {
  fs.rmSync(PROFILE, { recursive: true, force: true });
  app.setPath('userData', PROFILE);
  await app.whenReady();

  // Product tab prefs leave backgroundThrottling at Electron's default (true).
  // The shipped adapter must keep delivering under that setting.
  const producer = new BrowserWindow({
    width: 640,
    height: 480,
    show: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: true,
    },
  });
  const receiver = new BrowserWindow({
    width: 640,
    height: 480,
    show: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });

  await producer.loadURL(pathToFileURL(path.join(__dirname, 'producer.html')).href);
  await receiver.loadURL(pathToFileURL(path.join(__dirname, 'receiver.html')).href);
  await producer.webContents.executeJavaScript(`(${function wrapAudioContext() {
    window.__audioContexts = [];
    const Native = window.AudioContext;
    window.AudioContext = class ProbeAC extends Native {
      constructor(...args) {
        super(...args);
        window.__audioContexts.push(this);
      }
    };
    if (window.webkitAudioContext) window.webkitAudioContext = window.AudioContext;
  }.toString()})()`, true);
  await producer.webContents.executeJavaScript(CAPTURE_MAINWORLD_SOURCE, true);

  await producer.webContents.executeJavaScript(`(${function saveNativePc() {
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    document.documentElement.appendChild(iframe);
    window.__NativeRTCPeerConnection = iframe.contentWindow.RTCPeerConnection;
  }.toString()})()`, true);

  // Broker stub: local canvas relay. Source paint uses a silent AudioContext
  // clock so the probe source itself is not the rAF-throttle confounder.
  await producer.webContents.executeJavaScript(`(${function installBrokerStub() {
    window.addEventListener('blanc:display-capture-request', (event) => {
      const req = JSON.parse(event.detail);
      window.dispatchEvent(new CustomEvent('blanc:display-capture-result', {
        detail: JSON.stringify({
          id: req.id,
          ok: true,
          shareId: 'share-probe',
          offer: 'v=0',
          computerAudio: false,
          displaySurface: 'monitor',
          videoAdapter: {
            settings: { width: 640, height: 480, frameRate: 30 },
            capabilities: {
              width: { min: 1, max: 640 },
              height: { min: 1, max: 480 },
              frameRate: { min: 0, max: 30 },
            },
          },
        }),
      }));
    });

    window.RTCPeerConnection = class ProbePC {
      constructor() {
        this.ontrack = null;
        this.connectionState = 'new';
        this.iceGatheringState = 'complete';
        this.localDescription = null;
      }
      addEventListener() {}
      async setRemoteDescription() {
        const canvas = document.createElement('canvas');
        canvas.width = 640;
        canvas.height = 480;
        const ctx = canvas.getContext('2d', { alpha: false });
        let frame = 0;
        let alive = true;
        const ac = new AudioContext();
        const gain = ac.createGain();
        gain.gain.value = 0;
        gain.connect(ac.destination);
        const node = ac.createScriptProcessor(512, 1, 1);
        node.onaudioprocess = () => {
          if (!alive) return;
          frame += 1;
          ctx.fillStyle = `rgb(${frame % 255}, 20, 90)`;
          ctx.fillRect(0, 0, 640, 480);
          ctx.fillStyle = '#fff';
          ctx.font = '40px monospace';
          ctx.fillText(String(frame), 20, 56);
        };
        const silent = ac.createBufferSource();
        silent.buffer = ac.createBuffer(1, 512, ac.sampleRate);
        silent.loop = true;
        silent.connect(node);
        node.connect(gain);
        silent.start();
        try { ac.resume?.(); } catch {}
        const stream = canvas.captureStream(30);
        const track = stream.getVideoTracks()[0];
        window.__probeStopSource = () => {
          alive = false;
          try { silent.stop(); } catch {}
          try { node.disconnect(); } catch {}
          try { ac.close(); } catch {}
          try { track.stop(); } catch {}
        };
        queueMicrotask(() => {
          if (typeof this.ontrack === 'function') {
            this.ontrack({ track, streams: [stream] });
          }
        });
      }
      async createAnswer() { return { type: 'answer', sdp: 'v=0' }; }
      async setLocalDescription(desc) {
        this.localDescription = desc || { type: 'answer', sdp: 'v=0' };
      }
      close() { this.connectionState = 'closed'; }
    };
  }.toString()})()`, true);

  let streamInfo;
  try {
    streamInfo = await producer.webContents.executeJavaScript(`(async () => {
    try {
      const cloneRate = ${CLONE_RATE ? 'true' : 'false'};
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      let track = stream.getVideoTracks()[0];
      await track.applyConstraints({
        width: { exact: 320 },
        height: { exact: 240 },
        frameRate: { exact: 15 },
      });
      if (cloneRate) {
        const copy = track.clone();
        await copy.applyConstraints({ frameRate: { exact: 30 } });
        try { stream.removeTrack(track); } catch {}
        try { stream.addTrack(copy); } catch {}
        try { track.stop(); } catch {}
        track = copy;
      }
      window.__probeTrack = track;
      window.__probeStream = stream;
      return {
        settings: track.getSettings(),
        nativeSettings: MediaStreamTrack.prototype.getSettings.call(track),
        constraints: track.getConstraints(),
        hasPipeline: !!track.__blancAdapterConsumer?.pipeline,
        captureRate: track.__blancAdapterConsumer?.pipeline?.getCaptureRate?.() ?? null,
        readyState: track.readyState,
      };
    } catch (err) {
      return {
        error: String(err && err.message || err),
        name: err && err.name,
        constraint: err && err.constraint,
      };
    }
  })()`, true);
  } catch (err) {
    streamInfo = {
      error: String(err && err.message || err),
      name: err && err.name,
      stack: err && err.stack,
    };
  }

  if (streamInfo?.error || streamInfo?.hasPipeline !== true) {
    const result = {
      mode: CLONE_RATE ? 'clone-rate' : 'product-prefs',
      ok: false,
      streamInfo,
    };
    fs.writeFileSync(RESULT, `${JSON.stringify(result, null, 2)}\n`);
    console.log('FAIL', result.mode, RESULT);
    console.error(result);
    await producer.close();
    await receiver.close();
    app.exit(1);
    return;
  }

  const offer = await producer.webContents.executeJavaScript(`(async () => {
    const NativePC = window.__NativeRTCPeerConnection;
    const pc = new NativePC({ iceServers: [] });
    window.__probeBridgePc = pc;
    pc.addTrack(window.__probeTrack, window.__probeStream);
    const local = await pc.createOffer();
    await pc.setLocalDescription(local);
    await new Promise((resolve) => {
      if (pc.iceGatheringState === 'complete') return resolve();
      pc.addEventListener('icegatheringstatechange', () => {
        if (pc.iceGatheringState === 'complete') resolve();
      });
      setTimeout(resolve, 2000);
    });
    return { type: pc.localDescription.type, sdp: pc.localDescription.sdp };
  })()`, true);

  await receiver.webContents.executeJavaScript(
    `window.__acceptOffer(${JSON.stringify(offer)})`,
    true,
  );
  const answer = await receiver.webContents.executeJavaScript(
    'window.__waitAnswer()',
    true,
  );
  await producer.webContents.executeJavaScript(
    `window.__probeBridgePc.setRemoteDescription(${JSON.stringify(answer)})`,
    true,
  );
  await receiver.webContents.executeJavaScript('window.__waitRemoteTrack()', true);

  const beforeHide = await receiver.webContents.executeJavaScript(
    'window.__sampleRemote(700)',
    true,
  );

  producer.hide();
  await new Promise((r) => setTimeout(r, 150));
  const hidden = !producer.isVisible();
  const duringHide = await receiver.webContents.executeJavaScript(
    'window.__sampleRemote(900)',
    true,
  );
  const receiverNote = await receiver.webContents.executeJavaScript(`({
    visibilityState: document.visibilityState,
    producerHidden: ${hidden === true},
  })`, true);

  await producer.webContents.executeJavaScript('window.__probeStopSource()', true);
  await new Promise((r) => setTimeout(r, 250));
  const afterSourceEnd = await producer.webContents.executeJavaScript(
    `({
      readyState: window.__probeTrack.readyState,
      audioContexts: (window.__audioContexts || []).map((ctx) => ctx.state),
    })`,
    true,
  );

  producer.show();
  const expectRate = CLONE_RATE ? 30 : 15;
  const cadenceLo = CLONE_RATE ? 20 : 50;
  const cadenceHi = CLONE_RATE ? 50 : 120;
  const result = {
    mode: CLONE_RATE ? 'clone-rate' : 'product-prefs',
    ok: streamInfo?.hasPipeline === true
      && streamInfo.settings?.width === 320
      && streamInfo.settings?.height === 240
      && streamInfo.settings?.frameRate === expectRate
      && streamInfo.captureRate === expectRate
      && streamInfo.nativeSettings?.frameRate === expectRate
      && beforeHide?.frames >= 5
      && beforeHide?.width === 320
      && beforeHide?.height === 240
      && hidden === true
      && duringHide?.frames >= 5
      && duringHide?.width === 320
      && duringHide?.height === 240
      && duringHide?.medianIntervalMs != null
      && duringHide.medianIntervalMs > cadenceLo
      && duringHide.medianIntervalMs < cadenceHi
      && afterSourceEnd?.readyState === 'ended'
      && Array.isArray(afterSourceEnd.audioContexts)
      && afterSourceEnd.audioContexts.length > 0
      && afterSourceEnd.audioContexts.every((state) => state === 'closed')
      && receiverNote?.producerHidden === true
      && receiverNote?.visibilityState === 'visible',
    streamInfo,
    beforeHide,
    duringHide,
    afterSourceEnd,
    producerHidden: hidden,
    receiverNote,
  };

  fs.writeFileSync(RESULT, `${JSON.stringify(result, null, 2)}\n`);
  console.log(result.ok ? 'PASS' : 'FAIL', result.mode, RESULT);
  if (!result.ok) console.error(result);
  await producer.close();
  await receiver.close();
  app.exit(result.ok ? 0 : 1);
}

run().catch((err) => {
  const message = err && (err.stack || err.message || err.name) ? String(err.stack || err.message || err.name) : JSON.stringify(err);
  console.error('probe-failed', message);
  try {
    fs.writeFileSync(RESULT, `${JSON.stringify({ ok: false, error: message }, null, 2)}\n`);
  } catch {}
  app.exit(1);
});
