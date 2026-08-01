const assert = require('node:assert/strict');
const test = require('node:test');

const {
  createDisplaySharePickerController,
  PICK_REASONS,
} = require('../../src/main/display-share-picker');

function harness() {
  let runtimeId = null;
  const modes = new Map();
  const shownByRuntime = new Map();
  let reply = null;
  let requestSequence = 0;
  const timers = new Set();

  const controller = createDisplaySharePickerController({
    showOverlay: (next, options) => {
      modes.set(runtimeId, next);
      shownByRuntime.set(runtimeId, options.prefill);
      return true;
    },
    hideOverlay: (ownerRuntimeId) => { modes.set(ownerRuntimeId, null); },
    getOverlayMode: (ownerRuntimeId) => modes.get(ownerRuntimeId) ?? null,
    getRuntimeId: () => runtimeId,
    isOverlaySender: (event) => event?.trusted === true,
    randomUUID: () => `request-${++requestSequence}`,
    setTimer: (fn) => {
      const timer = { fn };
      timers.add(timer);
      return timer;
    },
    clearTimer: (timer) => timers.delete(timer),
    timeoutMs: 60_000,
  });

  const begin = (options = {}) => {
    const sources = options.sources ?? [{ id: 'screen:1' }, { id: 'window:2' }];
    const rows = sources.map((source) => ({ id: source.id, name: source.id }));
    const promise = controller.requestPick({
      sources,
      rows,
      origin: 'https://meet.example',
      webContentsId: options.webContentsId ?? 41,
      canShareAudio: options.canShareAudio ?? false,
      runtimeId: options.runtimeId ?? null,
    });
    promise.then((value) => { reply = value; });
    return promise;
  };

  return {
    controller,
    begin,
    get mode() { return modes.get(runtimeId) ?? null; },
    get shown() { return shownByRuntime.get(runtimeId) ?? null; },
    get reply() { return reply; },
    getMode: (ownerRuntimeId) => modes.get(ownerRuntimeId) ?? null,
    getShown: (ownerRuntimeId) => shownByRuntime.get(ownerRuntimeId) ?? null,
    timers,
    setRuntimeId: (value) => { runtimeId = value; },
  };
}

test('display picker exposes inert rows and returns the exact selected source', async () => {
  const h = harness();
  const sources = [{ id: 'screen:1', secret: 1 }, { id: 'window:2', secret: 2 }];
  const resultPromise = h.begin({ sources });

  assert.equal(h.mode, 'display-share-picker');
  assert.equal(h.shown.origin, 'https://meet.example');
  assert.deepEqual(h.shown.rows, [
    { id: 'screen:1', name: 'screen:1' },
    { id: 'window:2', name: 'window:2' },
  ]);
  assert.equal(h.shown.rows[0].secret, undefined);

  h.controller.handleReply(
    { trusted: true },
    { requestId: 'request-1', index: 1, shareAudio: false }
  );
  assert.deepEqual(await resultPromise, {
    source: sources[1],
    shareAudio: false,
    reason: 'selected',
  });
  assert.equal(h.mode, null);
  assert.equal(h.timers.size, 0);
});

test('audio requires both platform support and an explicit checked choice', async () => {
  const unsupported = harness();
  const unsupportedResult = unsupported.begin({ canShareAudio: false });
  unsupported.controller.handleReply(
    { trusted: true },
    { requestId: 'request-1', index: 0, shareAudio: true }
  );
  assert.equal((await unsupportedResult).shareAudio, false);

  const supported = harness();
  const supportedResult = supported.begin({ canShareAudio: true });
  supported.controller.handleReply(
    { trusted: true },
    { requestId: 'request-1', index: 0, shareAudio: true }
  );
  assert.equal((await supportedResult).shareAudio, true);
});

test('untrusted, stale, and malformed replies cannot select a source', async () => {
  const h = harness();
  const resultPromise = h.begin();

  h.controller.handleReply(
    { trusted: false },
    { requestId: 'request-1', index: 0 }
  );
  h.controller.handleReply(
    { trusted: true },
    { requestId: 'stale', index: 0 }
  );
  assert.equal(h.controller.isPending(), true);

  h.controller.handleReply(
    { trusted: true },
    { requestId: 'request-1', index: 99 }
  );
  assert.deepEqual(await resultPromise, {
    source: null,
    shareAudio: false,
    reason: 'invalid-reply',
  });
});

test('navigation cancels only the request owned by that webContents', async () => {
  const h = harness();
  const resultPromise = h.begin({ webContentsId: 41 });

  assert.equal(h.controller.cancelForWebContents(99, 'navigation'), false);
  assert.equal(h.controller.isPending(), true);
  assert.equal(h.controller.cancelForWebContents(41, 'navigation'), true);
  assert.deepEqual(await resultPromise, {
    source: null,
    shareAudio: false,
    reason: 'navigation',
  });
});

test('another window cannot answer or cancel a runtime-owned display request', async () => {
  const h = harness();
  h.setRuntimeId('one');
  const resultPromise = h.begin({ runtimeId: 'one' });

  h.setRuntimeId('two');
  h.controller.handleReply({ trusted: true }, { requestId: 'request-1', index: 0 });
  assert.equal(h.controller.cancelForRuntime('two', 'window-closed'), false);
  assert.equal(h.controller.isPending(), true);

  h.setRuntimeId('one');
  h.controller.handleReply({ trusted: true }, { requestId: 'request-1', index: 0 });
  assert.equal((await resultPromise).reason, 'selected');
});

test('two windows can complete display picks independently', async () => {
  const h = harness();
  h.setRuntimeId('one');
  const first = h.begin({ runtimeId: 'one', webContentsId: 41 });
  const firstRequestId = h.getShown('one').requestId;

  h.setRuntimeId('two');
  const second = h.begin({ runtimeId: 'two', webContentsId: 42 });
  const secondRequestId = h.getShown('two').requestId;

  assert.equal(h.controller.isPendingForRuntime('one'), true);
  assert.equal(h.controller.isPendingForRuntime('two'), true);
  assert.equal(h.getMode('one'), 'display-share-picker');
  assert.equal(h.getMode('two'), 'display-share-picker');

  h.controller.handleReply(
    { trusted: true },
    { requestId: secondRequestId, index: 1, shareAudio: false }
  );
  assert.equal((await second).reason, 'selected');
  assert.equal(h.getMode('two'), null);
  assert.equal(h.getMode('one'), 'display-share-picker');
  assert.equal(h.controller.isPendingForRuntime('one'), true);

  h.setRuntimeId('one');
  h.controller.handleReply(
    { trusted: true },
    { requestId: firstRequestId, index: 0, shareAudio: false }
  );
  assert.equal((await first).reason, 'selected');
  assert.equal(h.getMode('one'), null);
  assert.equal(h.controller.isPending(), false);
});

test('a second request settles the first before becoming pending', async () => {
  const h = harness();
  const first = h.begin({ webContentsId: 41 });
  const second = h.begin({ webContentsId: 42 });

  assert.equal((await first).reason, 'mode-replaced');
  h.controller.settle(null, 'dismissed');
  assert.equal((await second).reason, 'dismissed');
});

test('all documented settlement reasons remain explicit', () => {
  assert.deepEqual(PICK_REASONS, [
    'selected',
    'dismissed',
    'escape',
    'invalid-reply',
    'mode-replaced',
    'hidden',
    'blur',
    'tab-changed',
    'navigation',
    'window-closed',
    'timeout',
    'no-sources',
  ]);
});
