'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const {
  READY_CHANNEL,
  REQUEST_CHANNEL,
  createLazyDisplayCaptureBroker,
} = require('../../src/main/display-capture-lazy');

function fakeIpc() {
  const ipc = new EventEmitter();
  ipc.handlers = new Map();
  ipc.handle = (channel, fn) => {
    if (ipc.handlers.has(channel)) throw new Error(`second handler for ${channel}`);
    ipc.handlers.set(channel, fn);
  };
  ipc.removeHandler = (channel) => ipc.handlers.delete(channel);
  ipc.invoke = (channel, event, payload) => ipc.handlers.get(channel)(event, payload);
  return ipc;
}

function fakeHelper() {
  const webContents = new EventEmitter();
  let destroyed = false;
  const window = {
    webContents,
    isDestroyed: () => destroyed,
    destroy: () => { destroyed = true; },
  };
  return { window, webContents, session: { id: 'helper-session' } };
}

function setup(options = {}) {
  const ipcMain = fakeIpc();
  const helpers = [];
  const installs = [];
  const timers = [];
  const lazy = createLazyDisplayCaptureBroker({
    ipcMain,
    createHelper: () => {
      const helper = fakeHelper();
      helpers.push(helper);
      return helper;
    },
    isHelperSender: (event, helperWc) => event.sender === helperWc,
    installBroker: ({ ipcMain: brokerIpc, helperWc, helperSession }) => {
      installs.push({ helperWc, helperSession });
      brokerIpc.handle(REQUEST_CHANNEL, async (_event, payload) => ({ ok: true, handledBy: 'broker', payload }));
      brokerIpc.on('display-capture:signal', (_event, payload) => installs.at(-1).signal = payload);
      return { resolvePicker() {}, cancelAcquisition() {} };
    },
    setTimer: (fn) => { timers.push(fn); return timers.length; },
    clearTimer: () => {},
    warn: () => {},
    ...options,
  });
  const ready = (helper) => ipcMain.emit(READY_CHANNEL, { sender: helper.webContents });
  const tick = () => new Promise((resolve) => setImmediate(resolve));
  return { ipcMain, helpers, installs, timers, lazy, ready, tick };
}

test('nothing is created at startup', () => {
  const { ipcMain, helpers, installs, lazy } = setup();
  assert.equal(helpers.length, 0);
  assert.equal(installs.length, 0);
  assert.equal(lazy.broker, null);
  assert.equal(typeof ipcMain.handlers.get(REQUEST_CHANNEL), 'function');
});

test('the first request creates the helper and reaches the broker once it is ready', async () => {
  const { ipcMain, helpers, installs, lazy, ready, tick } = setup();
  const pending = ipcMain.invoke(REQUEST_CHANNEL, { sender: 'page' }, { options: 1 });
  await tick();
  assert.equal(helpers.length, 1);
  assert.equal(installs.length, 0, 'the broker waits for the helper page');
  ready(helpers[0]);
  assert.deepEqual(await pending, { ok: true, handledBy: 'broker', payload: { options: 1 } });
  assert.equal(installs[0].helperWc, helpers[0].webContents);
  assert.equal(installs[0].helperSession, helpers[0].session);
  assert.ok(lazy.broker);
});

test('requests during startup share one helper, and later ones go straight to the broker', async () => {
  const { ipcMain, helpers, installs, ready, tick } = setup();
  const first = ipcMain.invoke(REQUEST_CHANNEL, {}, 'a');
  const second = ipcMain.invoke(REQUEST_CHANNEL, {}, 'b');
  await tick();
  ready(helpers[0]);
  assert.deepEqual((await Promise.all([first, second])).map((r) => r.payload), ['a', 'b']);
  assert.equal((await ipcMain.invoke(REQUEST_CHANNEL, {}, 'c')).payload, 'c');
  assert.equal(helpers.length, 1);
  assert.equal(installs.length, 1);
});

test('a ready message from anything but the helper is ignored', async () => {
  const { ipcMain, helpers, installs, ready, tick } = setup();
  const pending = ipcMain.invoke(REQUEST_CHANNEL, {}, 'x');
  await tick();
  ipcMain.emit(READY_CHANNEL, { sender: new EventEmitter() });
  await tick();
  assert.equal(installs.length, 0);
  ready(helpers[0]);
  assert.equal((await pending).payload, 'x');
});

for (const [name, fail] of [
  ['fails to load', (h) => h.webContents.emit('did-fail-load', {}, -105, 'NAME_NOT_RESOLVED', 'x', true)],
  ['crashes', (h) => h.webContents.emit('render-process-gone', {}, { reason: 'crashed' })],
  ['is destroyed', (h) => h.webContents.emit('destroyed')],
  ['is not ready in time', (_h, timers) => timers.at(-1)()],
]) {
  test(`a helper that ${name} fails the request, and the next request starts over`, async () => {
    const { ipcMain, helpers, installs, timers, ready, tick } = setup();
    const pending = ipcMain.invoke(REQUEST_CHANNEL, {}, 'x');
    await tick();
    fail(helpers[0], timers);
    assert.deepEqual(await pending, { ok: false, errorName: 'AbortError', reason: 'helper-unavailable' });
    assert.equal(helpers[0].window.isDestroyed(), true);
    assert.equal(installs.length, 0);

    const retry = ipcMain.invoke(REQUEST_CHANNEL, {}, 'y');
    await tick();
    assert.equal(helpers.length, 2);
    ready(helpers[1]);
    assert.equal((await retry).payload, 'y');
  });
}

test('a subframe load failure does not fail the helper', async () => {
  const { ipcMain, helpers, ready, tick } = setup();
  const pending = ipcMain.invoke(REQUEST_CHANNEL, {}, 'x');
  await tick();
  helpers[0].webContents.emit('did-fail-load', {}, -3, 'ABORTED', 'x', false);
  ready(helpers[0]);
  assert.equal((await pending).payload, 'x');
});

test('the broker registers on the real ipcMain', async () => {
  const { ipcMain, helpers, installs, ready, tick } = setup();
  const pending = ipcMain.invoke(REQUEST_CHANNEL, {}, 'x');
  await tick();
  ready(helpers[0]);
  await pending;
  ipcMain.emit('display-capture:signal', {}, { shareId: 's1' });
  assert.deepEqual(installs[0].signal, { shareId: 's1' });
  assert.equal(ipcMain.listenerCount(READY_CHANNEL), 0, 'the ready listener is removed');
});

test('main creates the helper only through the lazy broker', () => {
  const main = fs.readFileSync(path.join(__dirname, '../../src/main/main.js'), 'utf8');
  assert.equal(main.match(/attachHelperWindow\(\{/g)?.length, 1);
  const factory = main.slice(main.indexOf('const createDisplayCaptureHelper = () => {'));
  assert.ok(factory.indexOf('attachHelperWindow({') < factory.indexOf('};\n'), 'attachHelperWindow is called inside the factory');
  assert.match(main, /createLazyDisplayCaptureBroker\(\{\s*ipcMain,\s*createHelper: createDisplayCaptureHelper,/);
  assert.match(main, /installBroker: \(\{ ipcMain: brokerIpc, helperWc, helperSession \}\) => \{\s*displayCaptureBroker = installDisplayCaptureBroker\(\{\s*ipcMain: brokerIpc,/);
});
