'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');

test('Linux bridge stays muted and bounds delivery until its own worklet acknowledges', async () => {
  const ipcMain = new EventEmitter();
  const wc = new EventEmitter();
  const frame = {};
  const sent = [];
  let dead = false; let captured = false; let interval; let spawned = 0; let killed = 0; let resumed = 0;
  Object.assign(wc, { mainFrame: frame, setAudioMuted: (muted) => { wc.muted = muted; },
    setWindowOpenHandler() {}, isDestroyed: () => dead,
    close() { dead = true; this.emit('destroyed'); },
    loadURL: async () => {}, executeJavaScript: async () => {},
    getURL: () => 'blanc-chrome://display-audio/', isBeingCaptured: () => captured,
    send: (...args) => sent.push(args) });
  const child = new EventEmitter();
  child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
  child.stdout.pause = () => {}; child.stdout.resume = () => { resumed++; };
  child.kill = () => { killed++; };
  const filename = path.resolve(__dirname, '../../src/main/display-audio.js');
  const sandbox = { module: { exports: {} }, __dirname: path.dirname(filename),
    process: { platform: 'linux' }, setTimeout: () => 1, clearTimeout() {},
    setInterval: (fn) => { interval = fn; return 1; }, clearInterval() {},
    require: (name) => name === 'node:fs' ? { accessSync() {}, constants: { X_OK: 1 } }
      : name === 'node:child_process' ? { spawn: () => { spawned++; return child; } } : require(name),
  };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), sandbox, { filename });
  const abort = new AbortController();
  const acquire = sandbox.module.exports.createDisplayAudio({ app: { isPackaged: false },
    WebContentsView: class { constructor() { this.webContents = wc; } }, ipcMain, partition: 'test' });
  const audio = await acquire({ signal: abort.signal });
  assert.equal(audio.source, frame); assert.equal(wc.muted, true); assert.equal(spawned, 0);
  audio.start(); interval(); assert.equal(spawned, 0);
  captured = true; interval(); assert.equal(spawned, 1);
  child.stdout.emit('data', Buffer.alloc(3840));
  assert.equal(sent.length, 1);
  const id = sent[0][1].id;
  ipcMain.emit('display-audio:ack', { sender: new EventEmitter(), senderFrame: frame }, id);
  ipcMain.emit('display-audio:ack', { sender: wc, senderFrame: {} }, id);
  ipcMain.emit('display-audio:ack', { sender: wc, senderFrame: frame }, id + 1);
  assert.equal(resumed, 0);
  ipcMain.emit('display-audio:ack', { sender: wc, senderFrame: frame }, id);
  assert.equal(resumed, 1);
  captured = false;
  interval();
  assert.equal(killed, 1, 'loss of the native audio consumer stops the helper without a page report');
  assert.equal(dead, true);
  abort.abort();
  assert.equal(killed, 1); assert.equal(dead, true); assert.equal(ipcMain.listenerCount('display-audio:ack'), 0);
  audio.dispose(); assert.equal(killed, 1);
});
