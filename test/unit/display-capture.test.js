'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createDisplayCaptureController, trustedDisplayOrigin } = require('../../src/main/display-capture');
const details = { captureApi: 'get-display-media', videoRequested: true, audioRequested: true };
function harness(overrides = {}) {
  const wc = new EventEmitter();
  const frame = { processId: 11, routingId: 7 };
  wc.mainFrame = frame;
  const events = [];
  let valid = true;
  const context = { wc, frame, origin: 'https://meet.example', ownerKey: 'window1', valid: () => valid };
  const audio = { source: 'loopback', dispose: () => events.push('dispose'), start: () => events.push('start') };
  const controller = createDisplayCaptureController({
    resolveContext: () => context,
    choose: async () => ({ video: { id: 'screen:1' }, audio: true }),
    acquireAudio: async () => audio,
    onGrant: (_context, scopes) => events.push(scopes),
    onPending: (_context, pending) => events.push(pending),
    ...overrides,
  });
  return { wc, frame, context, controller, events, audio,
    invalidate: () => { valid = false; },
    request: (data = details) => controller.requestPermission(wc, data),
    select: (extra = {}) => new Promise((resolve) => controller.select({ frame, securityOrigin: context.origin, userGesture: true, ...extra }, resolve)),
  };
}

test('only secure or loopback origins may request display sharing', () => {
  for (const url of ['file:///tmp/test', 'http://meeting.example', 'blanc://newtab/', 'data:text/html,hi', 'null']) assert.equal(trustedDisplayOrigin(url), null);
  assert.equal(trustedDisplayOrigin('https://meeting.example/room'), 'https://meeting.example');
  assert.equal(trustedDisplayOrigin('http://127.0.0.1:8200/test'), 'http://127.0.0.1:8200');
});

test('stock metadata and legacy/mixed requests never invoke consent', async () => {
  let prompts = 0;
  const h = harness({ choose: async () => { prompts++; } });
  for (const data of [{}, { ...details, captureApi: 'legacy-display' }, { ...details, videoRequested: false }]) assert.equal(await h.request(data), false);
  assert.equal(prompts, 0);
});

test('source-bound grant starts audio only after native selection; single use', async () => {
  const h = harness();
  assert.equal(await h.request(), true);
  assert.equal(h.events.includes('start'), false);
  assert.deepEqual(await h.select(), { video: { id: 'screen:1' }, audio: 'loopback', enableLocalEcho: false });
  assert.equal(h.events.includes('start'), true);
  assert.deepEqual(await h.select(), {});
  assert.equal(h.events.includes('dispose'), true);
  h.controller.dispose();
});

test('display selection cannot be replayed from another frame, origin, or missing gesture', async () => {
  for (const kind of ['frame', 'origin', 'gesture', 'stale']) {
    const h = harness();
    assert.equal(await h.request(), true);
    if (kind === 'stale') h.invalidate();
    const extra = kind === 'frame' ? { frame: { ...h.frame } }
      : kind === 'origin' ? { securityOrigin: 'https://other.example' }
      : kind === 'gesture' ? { userGesture: false } : {};
    assert.deepEqual(await h.select(extra), {});
    assert.equal(h.events.includes('start'), false);
    h.controller.dispose();
  }
});

test('pending consent is exclusive per owner and cancels promptly on navigation', async () => {
  const h = harness({ choose: () => new Promise(() => {}) });
  const first = h.request();
  assert.equal(await h.request(), false);
  h.wc.emit('did-start-navigation', {}, 'https://other.example', false, true);
  assert.equal(await first, false);
  assert.equal(h.wc.listenerCount('destroyed'), 0);
  assert.equal(h.events.at(-1), false);
});

test('cancellation while audio acquisition is pending disposes late audio without a grant', async () => {
  let resolveAudio;
  const h = harness({ acquireAudio: () => new Promise((resolve) => { resolveAudio = resolve; }) });
  const pending = h.request();
  await new Promise(setImmediate);
  h.wc.emit('destroyed');
  assert.equal(await pending, false);
  resolveAudio(h.audio);
  await new Promise(setImmediate);
  assert.equal(h.events.filter((event) => event === 'dispose').length, 1);
  assert.equal(h.events.some(Array.isArray), false);
});

test('computer audio is opt-in and not acquired for silent sharing', async () => {
  const h = harness({ choose: async () => ({ video: { id: 'window:2' }, audio: false }), acquireAudio: () => { throw new Error('Unexpected audio'); } });
  assert.equal(await h.request(), true);
  assert.deepEqual(await h.select(), { video: { id: 'window:2' } });
  h.controller.settle(h.wc, h.frame, 'resolved');
  h.controller.stopped(h.wc, h.frame);
  assert.equal(await h.request(), true);
  h.controller.dispose();
});

test('native picker consent grants no custom source and cleanup follows rejection', async () => {
  const h = harness({ nativePicker: true, choose: async () => ({ native: true }), acquireAudio: () => { throw new Error('Native picker owns audio'); } });
  assert.equal(await h.request(), true);
  assert.equal(h.events.some((event) => Array.isArray(event) && event.includes('systemAudio')), true);
  h.controller.settle(h.wc, h.frame, 'rejected');
  assert.deepEqual(await h.select(), {});
  assert.equal(h.wc.listenerCount('destroyed'), 0);
});

test('consent timeout returns denial and removes requester listeners', async () => {
  const h = harness({ timeoutMs: 5, choose: () => new Promise(() => {}) });
  const keepAlive = setTimeout(() => {}, 100);
  try { assert.equal(await h.request(), false); } finally { clearTimeout(keepAlive); }
  assert.equal(h.wc.listenerCount('destroyed'), 0);
});

test('rejected retries cannot dispose active sharing or pending consent', async () => {
  const h = harness();
  await h.request(); await h.select();
  h.controller.settle(h.wc, h.frame, 'resolved');
  assert.equal(await h.request(), false);
  h.controller.settle(h.wc, h.frame, 'rejected');
  assert.equal(h.events.includes('dispose'), false);
  assert.equal(await h.request(), false);
  h.controller.dispose();
  const pending = harness({ choose: () => new Promise(() => {}) });
  const request = pending.request();
  assert.equal(await pending.request(), false);
  pending.controller.settle(pending.wc, pending.frame, 'rejected');
  assert.equal(pending.wc.listenerCount('destroyed'), 1);
  pending.controller.dispose();
  assert.equal(await request, false);
});

test('unobservable iframe requests do not reserve their owner window', async () => {
  const h = harness();
  h.wc.mainFrame = { processId: 11, routingId: 8 };
  assert.equal(await h.request(), false);
  assert.deepEqual(h.events, []);
  h.wc.mainFrame = h.frame;
  assert.equal(await h.request(), true);
  h.controller.dispose();
});

test('audio ends independently while screen video and its controller remain active', async () => {
  const h = harness();
  await h.request(); await h.select();
  h.controller.report(h.wc, h.frame, { displayLive: 1, systemAudioLive: 1 });
  h.controller.settle(h.wc, h.frame, 'resolved');
  h.controller.report(h.wc, h.frame, { displayLive: 1, systemAudioLive: 0 });
  assert.equal(h.events.filter((event) => event === 'dispose').length, 1);
  assert.equal(await h.request(), false, 'screen still owns its frame');
  h.controller.report(h.wc, h.frame, { displayLive: 0, systemAudioLive: 0 });
  assert.equal(h.events.filter((event) => event === 'dispose').length, 1);
  assert.equal(await h.request(), true);
  h.controller.dispose();
});
