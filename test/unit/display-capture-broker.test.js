'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { CHROME_DISPLAY_CAPTURE_HELPER_URL } = require('../../src/main/chrome-protocol');
const { evaluateAdmission } = require('../../src/main/display-capture-admission');
const { parseDisplayMediaOptions } = require('../../src/main/display-capture-constraints');
const { filterSignaling } = require('../../src/main/display-capture-ice');
const { createBrokerRegistry } = require('../../src/main/display-capture-state');
const {
  createHelperAuthority,
  installDisplayCaptureBroker,
} = require('../../src/main/display-capture-broker');

function fakeIpc() {
  const handles = new Map();
  const listeners = new Map();
  return {
    handle(channel, fn) { handles.set(channel, fn); },
    on(channel, fn) { listeners.set(channel, [...(listeners.get(channel) || []), fn]); },
    invoke(channel, event, payload) { return handles.get(channel)(event, payload); },
    emit(channel, event, payload) {
      for (const fn of listeners.get(channel) || []) fn(event, payload);
    },
  };
}

function fakeHelper() {
  const sends = [];
  const listeners = new Map();
  const wc = {
    sends,
    isDestroyed: () => false,
    getURL: () => CHROME_DISPLAY_CAPTURE_HELPER_URL,
    send(channel, payload) { sends.push({ channel, payload }); },
    on(event, fn) { listeners.set(event, [...(listeners.get(event) || []), fn]); },
    emit(event, ...args) {
      for (const fn of listeners.get(event) || []) fn(...args);
    },
  };
  return wc;
}

function pageEvent() {
  return {
    sender: { id: 7, getURL: () => 'https://meet.example/', on() {} },
    senderFrame: { frameTreeNodeId: 1, on() {} },
  };
}

function overlayEvent() {
  return { sender: { getURL: () => 'blanc-chrome://overlay/' } };
}

function install(t, extras = {}) {
  const ipcMain = fakeIpc();
  const registry = createBrokerRegistry();
  const authority = createHelperAuthority();
  const helperWc = extras.helperWc || fakeHelper();
  authority.authorize(helperWc);
  const pickers = [];
  const broker = installDisplayCaptureBroker({
    ipcMain,
    registry,
    evaluateAdmission,
    parseDisplayMediaOptions,
    filterSignaling,
    collectLocalAddresses: () => new Set(['127.0.0.1', '::1', '192.168.1.20']),
    helperWc,
    helperSession: extras.helperSession,
    desktopCapturer: extras.desktopCapturer,
    showPicker: (id, model) => pickers.push({ id, model }),
    hidePicker: () => {},
    authority,
    isPackaged: true,
    stubPicker: false,
    timeoutMs: extras.timeoutMs || 30_000,
    isOverlaySender: (event) => {
      try { return event.sender.getURL() === 'blanc-chrome://overlay/'; } catch { return false; }
    },
    readTrustedFacts: () => ({
      documentFocused: true,
      documentVisible: true,
      frameAlive: true,
      tabId: 1,
      webContentsId: 7,
      frameId: 1,
      origin: 'https://meet.example',
      documentGeneration: 1,
      sources: [{ id: 'screen:1:0', name: 'Entire screen' }],
    }),
    ...extras,
  });
  t.after(() => {
    for (const row of registry.listShares()) broker.noteHelperGone();
  });
  return { ipcMain, registry, helperWc, pickers, broker, authority };
}

const goodFacts = {
  userActivationActive: true,
  displayCaptureAllowed: true,
  options: { video: true, audio: true },
};

test('forged sender identity is ignored; admission uses trusted facts', async (t) => {
  const { ipcMain } = install(t, {
    readTrustedFacts: () => ({
      documentFocused: false,
      documentVisible: true,
      frameAlive: true,
      tabId: 1,
      webContentsId: 7,
      frameId: 1,
      origin: 'https://meet.example',
      documentGeneration: 1,
    }),
  });
  const result = await ipcMain.invoke('display-capture:request', pageEvent(), {
    ...goodFacts,
    userActivated: true,
    webContentsId: 999,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'focus');
});

test('public ICE never reaches the helper', async (t) => {
  const { ipcMain, helperWc, broker } = install(t);
  const event = pageEvent();
  const pending = ipcMain.invoke('display-capture:request', event, goodFacts);
  await Promise.resolve();
  await broker.resolvePicker(overlayEvent(), {
    requestId: 'req-1',
    sourceId: 'screen:1:0',
    computerAudioApproved: true,
    surfaceLabel: 'Entire screen',
    surfaceKind: 'screen',
  });
  helperWc.sends.length = 0;
  ipcMain.emit('display-capture:signal', event, {
    shareId: 'share-2',
    type: 'candidate',
    candidate: 'a=candidate:1 1 UDP 2122260223 8.8.8.8 59999 typ host',
  });
  assert.equal(helperWc.sends.length, 0);
  pending.then(() => {});
});

test('computerAudioApproved is ignored when audio was not requested', async (t) => {
  const { ipcMain, registry, broker } = install(t);
  const pending = ipcMain.invoke('display-capture:request', pageEvent(), {
    userActivationActive: true,
    displayCaptureAllowed: true,
    options: { video: true },
  });
  await Promise.resolve();
  await broker.resolvePicker(overlayEvent(), {
    requestId: 'req-1',
    sourceId: 'screen:1:0',
    computerAudioApproved: true,
    surfaceLabel: 'Entire screen',
    surfaceKind: 'screen',
  });
  assert.equal(registry.listShares()[0].computerAudio, false);
  pending.then(() => {});
});

async function startApproved(t, extras) {
  const ctx = install(t, extras);
  const event = pageEvent();
  const pending = ctx.ipcMain.invoke('display-capture:request', event, goodFacts);
  await Promise.resolve();
  await ctx.broker.resolvePicker(overlayEvent(), {
    requestId: 'req-1',
    sourceId: 'screen:1:0',
    computerAudioApproved: true,
    surfaceLabel: 'Entire screen',
    surfaceKind: 'screen',
  });
  return { ...ctx, event, pending };
}

test('navigation ends the share and stops helper tracks', async (t) => {
  const { helperWc, broker, registry, pending } = await startApproved(t);
  broker.noteNavigation('share-2');
  assert.equal(registry.tabHasBlockingShare(1), false);
  assert.ok(helperWc.sends.some((item) => item.payload?.type === 'stop'));
  assert.equal((await pending).errorName, 'AbortError');
});

test('frame destruction ends the share', async (t) => {
  const { broker, registry, pending } = await startApproved(t);
  broker.noteFrameGone('share-2');
  assert.equal(registry.tabHasBlockingShare(1), false);
  assert.equal((await pending).reason, 'frame-gone');
});

test('requesting renderer crash ends the share', async (t) => {
  const { broker, registry, pending } = await startApproved(t);
  broker.noteRendererGone('share-2');
  assert.equal(registry.tabHasBlockingShare(1), false);
  assert.equal((await pending).reason, 'page-gone');
});

test('helper crash invalidates every share', async (t) => {
  const { broker, registry, pending } = await startApproved(t);
  broker.noteHelperGone();
  assert.equal(registry.listShares().length, 0);
  assert.equal((await pending).reason, 'helper-gone');
});

test('native source ending stops the share', async (t) => {
  const { broker, registry, pending } = await startApproved(t);
  broker.noteSourceEnded('share-2');
  assert.equal(registry.listShares().length, 0);
  assert.equal((await pending).reason, 'source-ended');
});

test('relay timeout without tracks rejects', async (t) => {
  const { broker, pending } = await startApproved(t);
  broker.expire('req-1');
  assert.equal((await pending).reason, 'timeout');
});

test('cancel during acquisition stops a late helper offer', async (t) => {
  const { ipcMain, helperWc, broker, authority, pending } = await startApproved(t);
  broker.cancelAcquisition('req-1');
  helperWc.sends.length = 0;
  ipcMain.emit('display-capture-helper:signal', { sender: helperWc }, {
    type: 'offer',
    shareId: 'share-2',
    sdp: 'v=0\r\na=candidate:1 1 UDP 2122260223 192.168.1.20 59999 typ host\r\n',
    tracks: { video: true, audio: true },
  });
  assert.ok(helperWc.sends.some((item) => item.payload?.type === 'stop'));
  assert.equal((await pending).reason, 'cancel');
  assert.equal(authority.isAuthorizedHelperSender(helperWc, CHROME_DISPLAY_CAPTURE_HELPER_URL), true);
});
