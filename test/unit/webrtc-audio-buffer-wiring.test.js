const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const audioBuffer = require('../../src/main/webrtc-audio-buffer');

const root = path.join(__dirname, '../..');
const preloadSource = fs.readFileSync(
  path.join(root, 'src/main/webrtc-audio-buffer-preload.js'),
  'utf8'
);
const mainSource = fs.readFileSync(path.join(root, 'src/main/main.js'), 'utf8');
const tabViewSource = fs.readFileSync(path.join(root, 'src/main/tab-view.js'), 'utf8');

function runPreload(initialMode, protocol = 'https:') {
  const executions = [];
  const listeners = new Map();
  const syncChannels = [];
  const required = [];
  const ipcRenderer = {
    sendSync(channel) {
      syncChannels.push(channel);
      return initialMode;
    },
    on(channel, listener) {
      listeners.set(channel, listener);
    },
  };
  const webFrame = {
    executeJavaScript(source) {
      executions.push(source);
      return Promise.resolve(true);
    },
  };
  vm.runInNewContext(preloadSource, {
    window: { location: { protocol } },
    require(id) {
      required.push(id);
      if (id === 'electron') return { ipcRenderer, webFrame };
      throw new Error(`unexpected require: ${id}`);
    },
  });
  return { executions, listeners, syncChannels, required };
}

test('session preload installs explicit buffering before page use and serializes updates', async () => {
  const harness = runPreload('resilient');
  assert.deepEqual(harness.required, ['electron']);
  assert.deepEqual(harness.syncChannels, [audioBuffer.WEBRTC_AUDIO_BUFFER_GET_CHANNEL]);
  assert.equal(harness.executions.length, 1);
  assert.match(harness.executions[0], /\(1000, globalThis\)$/);

  harness.listeners.get(audioBuffer.WEBRTC_AUDIO_BUFFER_UPDATE_CHANNEL)(null, 'automatic');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(harness.executions.length, 2);
  assert.match(harness.executions[1], /\(null, globalThis\)$/);
});

test('Automatic and non-web documents leave page WebRTC globals untouched at startup', () => {
  assert.equal(runPreload('automatic').executions.length, 0);
  assert.equal(runPreload('resilient', 'blanc:').executions.length, 0);
});

test('production wiring uses the session preload and no longer waits for tab dom-ready', () => {
  assert.match(
    mainSource,
    /registerPreloadScript\(\{[\s\S]*?webrtc-audio-buffer-preload\.js[\s\S]*?\}\)/
  );
  const reply = mainSource.indexOf('ipcMain.on(WEBRTC_AUDIO_BUFFER_GET_CHANNEL');
  const install = mainSource.indexOf('installSessionPreloads(browsingSessions)');
  assert.ok(reply >= 0 && install > reply, 'sync settings reply must exist before preload installation');
  assert.match(mainSource, /webContents\.getAllWebContents\(\)/);
  assert.match(mainSource, /sendWebrtcAudioBufferMode/);
  assert.doesNotMatch(tabViewSource, /applyWebrtcAudioBufferToWebContents/);
});
