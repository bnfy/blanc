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

function pageEvent(id = 7, frameId = 1) {
  return {
    sender: { id, getURL: () => `https://tab-${id}.example/`, on() {} },
    senderFrame: { frameTreeNodeId: frameId, on() {} },
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

function localCandidate() {
  return 'a=candidate:1 1 UDP 2122260223 192.168.1.20 59999 typ host';
}

function helperOffer(shareId) {
  return {
    type: 'offer',
    shareId,
    sdp: `v=0\r\n${localCandidate()}\r\n`,
    tracks: { video: true, audio: true },
  };
}

test('unrelated sender cannot forward ICE or release another share audio', async (t) => {
  const ctx = install(t, {
    readTrustedFacts: (event) => ({
      documentFocused: true,
      documentVisible: true,
      frameAlive: true,
      tabId: event.sender.id,
      webContentsId: event.sender.id,
      frameId: event.senderFrame.frameTreeNodeId,
      origin: `https://tab-${event.sender.id}.example`,
      documentGeneration: 1,
    }),
  });
  const owner = pageEvent(7);
  const other = pageEvent(99);
  const pending = ctx.ipcMain.invoke('display-capture:request', owner, goodFacts);
  await Promise.resolve();
  const share = ctx.registry.listShares()[0];
  await ctx.broker.resolvePicker(overlayEvent(), {
    requestId: share.requestId,
    sourceId: 'screen:1:0',
    computerAudioApproved: true,
    surfaceLabel: 'A',
    surfaceKind: 'screen',
  });
  ctx.helperWc.sends.length = 0;
  ctx.ipcMain.emit('display-capture:signal', other, {
    shareId: share.shareId,
    type: 'candidate',
    candidate: localCandidate(),
  });
  assert.equal(ctx.helperWc.sends.length, 0);

  ctx.registry.addConsumer(share.shareId, { kind: 'video', trackKey: 'v1' });
  ctx.registry.addConsumer(share.shareId, { kind: 'audio', trackKey: 'a1' });
  ctx.ipcMain.emit('display-capture:track-stopped', other, {
    shareId: share.shareId,
    kind: 'audio',
    trackKey: 'a1',
  });
  assert.equal(ctx.registry.getShare(share.shareId).computerAudio, true);
  assert.equal(ctx.helperWc.sends.some((item) => item.payload?.type === 'release'), false);

  ctx.ipcMain.emit('display-capture:track-added', other, {
    shareId: share.shareId,
    kind: 'audio',
    trackKey: 'forged',
  });
  ctx.ipcMain.emit('display-capture:track-stopped', other, {
    shareId: share.shareId,
    kind: 'audio',
    trackKey: 'forged',
  });
  assert.equal(ctx.registry.getShare(share.shareId).computerAudio, true);
  pending.then(() => {});
});

test('missing selected source is rejected instead of sharing the first source', async (t) => {
  let lastHandler = null;
  const ctx = install(t, {
    helperSession: {
      setDisplayMediaRequestHandler(fn) { lastHandler = fn; },
    },
    desktopCapturer: {
      async getSources() {
        return [{ id: 'screen:first', name: 'First' }, { id: 'screen:second', name: 'Second' }];
      },
    },
  });
  const pending = ctx.ipcMain.invoke('display-capture:request', pageEvent(), goodFacts);
  await Promise.resolve();
  await ctx.broker.resolvePicker(overlayEvent(), {
    requestId: 'req-1',
    sourceId: 'screen:missing',
    computerAudioApproved: true,
    surfaceLabel: 'Missing',
    surfaceKind: 'screen',
  });
  assert.equal(
    ctx.helperWc.sends.some((item) => item.channel === 'display-capture-helper:authorize'),
    false
  );
  if (lastHandler) {
    let granted = null;
    lastHandler({}, (payload) => { granted = payload; });
    assert.ok(!granted?.video);
  }
  assert.equal((await pending).reason, 'no-source');
});

test('startup timeout stays armed until usable page tracks arrive', async (t) => {
  const ctx = await startApproved(t, { timeoutMs: 40 });
  const shareId = ctx.registry.listShares()[0].shareId;
  ctx.ipcMain.emit('display-capture-helper:signal', { sender: ctx.helperWc }, helperOffer(shareId));
  assert.equal((await ctx.pending).ok, true);
  await new Promise((resolve) => setTimeout(resolve, 70));
  assert.equal(ctx.registry.listShares().length, 0);
});

test('video-only page tracks do not satisfy an approved-audio share', async (t) => {
  const ctx = await startApproved(t, { timeoutMs: 40 });
  const shareId = ctx.registry.listShares()[0].shareId;
  ctx.ipcMain.emit('display-capture-helper:signal', { sender: ctx.helperWc }, helperOffer(shareId));
  await ctx.pending;
  ctx.ipcMain.emit('display-capture:track-added', ctx.event, {
    shareId, kind: 'video', trackKey: 'v1',
  });
  await new Promise((resolve) => setTimeout(resolve, 70));
  assert.equal(ctx.registry.listShares().length, 0);
});

test('muted track-added does not clear the startup timeout', async (t) => {
  const ctx = await startApproved(t, { timeoutMs: 40 });
  const shareId = ctx.registry.listShares()[0].shareId;
  ctx.ipcMain.emit('display-capture-helper:signal', { sender: ctx.helperWc }, helperOffer(shareId));
  await ctx.pending;
  ctx.ipcMain.emit('display-capture:track-added', ctx.event, {
    shareId, kind: 'video', trackKey: 'v1', muted: true,
  });
  ctx.ipcMain.emit('display-capture:track-added', ctx.event, {
    shareId, kind: 'audio', trackKey: 'a1', muted: true,
  });
  await new Promise((resolve) => setTimeout(resolve, 70));
  assert.equal(ctx.registry.listShares().length, 0);
});

test('required page tracks from the owner clear the startup timeout', async (t) => {
  const ctx = await startApproved(t, { timeoutMs: 40 });
  const shareId = ctx.registry.listShares()[0].shareId;
  ctx.ipcMain.emit('display-capture-helper:signal', { sender: ctx.helperWc }, helperOffer(shareId));
  await ctx.pending;
  ctx.ipcMain.emit('display-capture:track-added', ctx.event, {
    shareId, kind: 'video', trackKey: 'v1',
  });
  ctx.ipcMain.emit('display-capture:track-added', ctx.event, {
    shareId, kind: 'audio', trackKey: 'a1',
  });
  ctx.ipcMain.emit('display-capture:track-ready', ctx.event, {
    shareId, kind: 'video', trackKey: 'v1',
  });
  ctx.ipcMain.emit('display-capture:track-ready', ctx.event, {
    shareId, kind: 'audio', trackKey: 'a1',
  });
  await new Promise((resolve) => setTimeout(resolve, 70));
  assert.equal(ctx.registry.listShares().length, 1);
});

test('second capture cannot replace an in-flight display-media handler', async (t) => {
  let releaseFirstSources;
  let sourceCalls = 0;
  let currentHandler = null;
  const factsFor = (event) => ({
    documentFocused: true,
    documentVisible: true,
    frameAlive: true,
    tabId: event.sender.id,
    webContentsId: event.sender.id,
    frameId: event.senderFrame.frameTreeNodeId,
    origin: `https://tab-${event.sender.id}.example`,
    documentGeneration: 1,
  });
  const ctx = install(t, {
    readTrustedFacts: factsFor,
    helperSession: {
      setDisplayMediaRequestHandler(fn) { currentHandler = fn; },
    },
    desktopCapturer: {
      async getSources() {
        sourceCalls += 1;
        if (sourceCalls === 1) {
          await new Promise((resolve) => { releaseFirstSources = resolve; });
        }
        return [
          { id: 'screen:a', name: 'A' },
          { id: 'screen:b', name: 'B' },
        ];
      },
    },
  });
  const pendingA = ctx.ipcMain.invoke('display-capture:request', pageEvent(7), goodFacts);
  await Promise.resolve();
  const shareA = ctx.registry.listShares().find((row) => row.origin === 'https://tab-7.example');
  const pickerA = ctx.broker.resolvePicker(overlayEvent(), {
    requestId: shareA.requestId,
    sourceId: 'screen:a',
    computerAudioApproved: true,
    surfaceLabel: 'A',
    surfaceKind: 'screen',
  });
  const pendingB = ctx.ipcMain.invoke('display-capture:request', pageEvent(8), goodFacts);
  await Promise.resolve();
  const shareB = ctx.registry.listShares().find((row) => row.origin === 'https://tab-8.example');
  const pickerB = ctx.broker.resolvePicker(overlayEvent(), {
    requestId: shareB.requestId,
    sourceId: 'screen:b',
    computerAudioApproved: true,
    surfaceLabel: 'B',
    surfaceKind: 'screen',
  });
  releaseFirstSources();
  await pickerA;
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  const authorizes = () => ctx.helperWc.sends.filter((item) => item.channel === 'display-capture-helper:authorize');
  assert.equal(sourceCalls, 1);
  assert.equal(authorizes().length, 1);
  assert.equal(authorizes()[0].payload.sourceId, 'screen:a');
  let granted = null;
  currentHandler({}, (payload) => { granted = payload; });
  assert.equal(granted.video.id, 'screen:a');
  ctx.ipcMain.emit('display-capture-helper:signal', { sender: ctx.helperWc }, helperOffer(shareA.shareId));
  await pickerB;
  assert.equal(authorizes().length, 2);
  assert.equal(authorizes()[1].payload.sourceId, 'screen:b');
  granted = null;
  currentHandler({}, (payload) => { granted = payload; });
  assert.equal(granted.video.id, 'screen:b');
  pendingA.then(() => {});
  pendingB.then(() => {});
});

test('cancel after authorization revokes the handler and holds the next share', async (t) => {
  let currentHandler = null;
  let sourceCalls = 0;
  const factsFor = (event) => ({
    documentFocused: true,
    documentVisible: true,
    frameAlive: true,
    tabId: event.sender.id,
    webContentsId: event.sender.id,
    frameId: event.senderFrame.frameTreeNodeId,
    origin: `https://tab-${event.sender.id}.example`,
    documentGeneration: 1,
  });
  const ctx = install(t, {
    readTrustedFacts: factsFor,
    helperSession: {
      setDisplayMediaRequestHandler(fn) { currentHandler = fn; },
    },
    desktopCapturer: {
      async getSources() {
        sourceCalls += 1;
        return [
          { id: 'screen:a', name: 'A' },
          { id: 'screen:b', name: 'B' },
        ];
      },
    },
  });
  const pendingA = ctx.ipcMain.invoke('display-capture:request', pageEvent(7), goodFacts);
  await Promise.resolve();
  const shareA = ctx.registry.listShares().find((row) => row.origin === 'https://tab-7.example');
  await ctx.broker.resolvePicker(overlayEvent(), {
    requestId: shareA.requestId,
    sourceId: 'screen:a',
    computerAudioApproved: true,
    surfaceLabel: 'A',
    surfaceKind: 'screen',
  });
  const leftoverHandler = currentHandler;
  const pendingB = ctx.ipcMain.invoke('display-capture:request', pageEvent(8), goodFacts);
  await Promise.resolve();
  const shareB = ctx.registry.listShares().find((row) => row.origin === 'https://tab-8.example');
  const pickerB = ctx.broker.resolvePicker(overlayEvent(), {
    requestId: shareB.requestId,
    sourceId: 'screen:b',
    computerAudioApproved: true,
    surfaceLabel: 'B',
    surfaceKind: 'screen',
  });
  const authorizes = () => ctx.helperWc.sends.filter((item) => item.channel === 'display-capture-helper:authorize');
  assert.equal(authorizes().length, 1);
  ctx.broker.cancelAcquisition(shareA.requestId);
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal((await pendingA).reason, 'cancel');
  assert.equal(authorizes().length, 1);
  assert.equal(sourceCalls, 1);
  let granted = { video: 'unset' };
  leftoverHandler({}, (payload) => { granted = payload; });
  assert.ok(!granted?.video, 'cancelled handler must not grant its source');
  if (currentHandler && currentHandler !== leftoverHandler) {
    granted = { video: 'unset' };
    currentHandler({}, (payload) => { granted = payload; });
    assert.ok(!granted?.video, 'revoked handler must not grant a source');
  }
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  await pickerB;
  assert.equal(authorizes().length, 2);
  assert.equal(authorizes()[1].payload.sourceId, 'screen:b');
  granted = null;
  currentHandler({}, (payload) => { granted = payload; });
  assert.equal(granted.video.id, 'screen:b');
  pendingB.then(() => {});
});

test('early helper stopped keeps the queue while A capture is still pending', async (t) => {
  let currentHandler = null;
  let sourceCalls = 0;
  const factsFor = (event) => ({
    documentFocused: true,
    documentVisible: true,
    frameAlive: true,
    tabId: event.sender.id,
    webContentsId: event.sender.id,
    frameId: event.senderFrame.frameTreeNodeId,
    origin: `https://tab-${event.sender.id}.example`,
    documentGeneration: 1,
  });
  const ctx = install(t, {
    readTrustedFacts: factsFor,
    helperSession: {
      setDisplayMediaRequestHandler(fn) { currentHandler = fn; },
    },
    desktopCapturer: {
      async getSources() {
        sourceCalls += 1;
        return [
          { id: 'screen:a', name: 'A' },
          { id: 'screen:b', name: 'B' },
        ];
      },
    },
  });
  const pendingA = ctx.ipcMain.invoke('display-capture:request', pageEvent(7), goodFacts);
  await Promise.resolve();
  const shareA = ctx.registry.listShares().find((row) => row.origin === 'https://tab-7.example');
  await ctx.broker.resolvePicker(overlayEvent(), {
    requestId: shareA.requestId,
    sourceId: 'screen:a',
    computerAudioApproved: true,
    surfaceLabel: 'A',
    surfaceKind: 'screen',
  });
  const pendingB = ctx.ipcMain.invoke('display-capture:request', pageEvent(8), goodFacts);
  await Promise.resolve();
  const shareB = ctx.registry.listShares().find((row) => row.origin === 'https://tab-8.example');
  const pickerB = ctx.broker.resolvePicker(overlayEvent(), {
    requestId: shareB.requestId,
    sourceId: 'screen:b',
    computerAudioApproved: true,
    surfaceLabel: 'B',
    surfaceKind: 'screen',
  });
  const authorizes = () => ctx.helperWc.sends.filter((item) => item.channel === 'display-capture-helper:authorize');
  ctx.broker.cancelAcquisition(shareA.requestId);
  ctx.ipcMain.emit('display-capture-helper:stopped', { sender: ctx.helperWc }, {
    shareId: shareA.shareId,
  });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal((await pendingA).reason, 'cancel');
  assert.equal(authorizes().length, 1, 'early stopped must not authorize the queued share');
  assert.equal(sourceCalls, 1);
  ctx.ipcMain.emit('display-capture-helper:stopped', { sender: ctx.helperWc }, {
    shareId: shareA.shareId,
    nativeSettled: true,
  });
  await pickerB;
  assert.equal(authorizes().length, 2);
  assert.equal(authorizes()[1].payload.sourceId, 'screen:b');
  let granted = null;
  currentHandler({}, (payload) => { granted = payload; });
  assert.equal(granted.video.id, 'screen:b');
  pendingB.then(() => {});
});

test('cancelled capture rejection releases the queue for the next share', async (t) => {
  let currentHandler = null;
  let sourceCalls = 0;
  const factsFor = (event) => ({
    documentFocused: true,
    documentVisible: true,
    frameAlive: true,
    tabId: event.sender.id,
    webContentsId: event.sender.id,
    frameId: event.senderFrame.frameTreeNodeId,
    origin: `https://tab-${event.sender.id}.example`,
    documentGeneration: 1,
  });
  const ctx = install(t, {
    readTrustedFacts: factsFor,
    helperSession: {
      setDisplayMediaRequestHandler(fn) { currentHandler = fn; },
    },
    desktopCapturer: {
      async getSources() {
        sourceCalls += 1;
        return [
          { id: 'screen:a', name: 'A' },
          { id: 'screen:b', name: 'B' },
        ];
      },
    },
  });
  const pendingA = ctx.ipcMain.invoke('display-capture:request', pageEvent(7), goodFacts);
  await Promise.resolve();
  const shareA = ctx.registry.listShares().find((row) => row.origin === 'https://tab-7.example');
  await ctx.broker.resolvePicker(overlayEvent(), {
    requestId: shareA.requestId,
    sourceId: 'screen:a',
    computerAudioApproved: true,
    surfaceLabel: 'A',
    surfaceKind: 'screen',
  });
  const pendingB = ctx.ipcMain.invoke('display-capture:request', pageEvent(8), goodFacts);
  await Promise.resolve();
  const shareB = ctx.registry.listShares().find((row) => row.origin === 'https://tab-8.example');
  const pickerB = ctx.broker.resolvePicker(overlayEvent(), {
    requestId: shareB.requestId,
    sourceId: 'screen:b',
    computerAudioApproved: true,
    surfaceLabel: 'B',
    surfaceKind: 'screen',
  });
  const authorizes = () => ctx.helperWc.sends.filter((item) => item.channel === 'display-capture-helper:authorize');
  ctx.broker.cancelAcquisition(shareA.requestId);
  ctx.ipcMain.emit('display-capture-helper:signal', { sender: ctx.helperWc }, {
    type: 'error',
    shareId: shareA.shareId,
    name: 'NotAllowedError',
    message: 'denied',
  });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal((await pendingA).reason, 'cancel');
  for (let i = 0; i < 20; i += 1) {
    if (authorizes().length === 2) break;
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.equal(authorizes().length, 2, 'helper error must settle the cancelled acquire');
  await pickerB;
  assert.equal(authorizes()[1].payload.sourceId, 'screen:b');
  assert.equal(sourceCalls, 2);
  let granted = null;
  currentHandler({}, (payload) => { granted = payload; });
  assert.equal(granted.video.id, 'screen:b');
  pendingB.then(() => {});
});

test('cancelled selection is revalidated after getSources', async (t) => {
  let releaseSources;
  const ctx = install(t, {
    helperSession: {
      setDisplayMediaRequestHandler() {},
    },
    desktopCapturer: {
      async getSources() {
        await new Promise((resolve) => { releaseSources = resolve; });
        return [{ id: 'screen:1:0', name: 'Screen' }];
      },
    },
  });
  const pending = ctx.ipcMain.invoke('display-capture:request', pageEvent(), goodFacts);
  await Promise.resolve();
  const picking = ctx.broker.resolvePicker(overlayEvent(), {
    requestId: 'req-1',
    sourceId: 'screen:1:0',
    computerAudioApproved: true,
    surfaceLabel: 'Screen',
    surfaceKind: 'screen',
  });
  for (let i = 0; i < 20 && typeof releaseSources !== 'function'; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  ctx.broker.cancelAcquisition('req-1');
  releaseSources();
  await picking;
  assert.equal(
    ctx.helperWc.sends.some((item) => item.channel === 'display-capture-helper:authorize'),
    false
  );
  assert.equal((await pending).reason, 'cancel');
});

test('strip or overlay Stop ends only the named share; other chrome cannot', (t) => {
  const { ipcMain, registry } = install(t);
  registry.beginRequest({
    tabId: 1, webContentsId: 1, frameId: 1,
    origin: 'https://a.example', documentGeneration: 1, audioRequested: false,
  });
  registry.beginRequest({
    tabId: 2, webContentsId: 2, frameId: 1,
    origin: 'https://b.example', documentGeneration: 1, audioRequested: false,
  });
  const idA = registry.listShares().find((row) => row.origin === 'https://a.example').shareId;
  const idB = registry.listShares().find((row) => row.origin === 'https://b.example').shareId;
  ipcMain.emit('display-capture:stop', {
    sender: { getURL: () => 'blanc-chrome://permission/' },
  }, { shareId: idA });
  assert.equal(registry.listShares().length, 2);
  ipcMain.emit('display-capture:stop', {
    sender: { getURL: () => 'blanc-chrome://index/' },
  }, { shareId: idA });
  const afterStrip = registry.listShares();
  assert.equal(afterStrip.length, 1);
  assert.equal(afterStrip[0].shareId, idB);
  ipcMain.emit('display-capture:stop', overlayEvent(), { shareId: idB });
  assert.equal(registry.listShares().length, 0);
});
