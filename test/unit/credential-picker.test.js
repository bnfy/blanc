'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createPickerController } = require('../../src/main/credential-picker');

/** A controller wired to fakes, with handles to inspect what it did. */
function harness({ overlayAvailable = true, overlayThrows = false } = {}) {
  const calls = { shown: [], hidden: 0, timers: 0, cleared: 0 };
  let mode = null;
  let timerFn = null;
  const ctl = createPickerController({
    showOverlay: (m, opts) => {
      // Mirror the REAL failure shape: the live showOverlay sets overlayMode and
      // overlayPrefill before addChildView/send/focus, so a throw can leave that
      // state behind. Setting mode first is what lets the test catch a partial
      // failure rather than a tidy no-op.
      if (overlayThrows) { mode = m; throw new Error('overlay is gone'); }
      if (!overlayAvailable) return false;   // mirrors main's live-window guard
      mode = m; calls.shown.push(opts); return true;
    },
    hideOverlay: () => { mode = null; calls.hidden += 1; },
    getOverlayMode: () => mode,
    isOverlaySender: (event) => event && event.fromOverlay === true,
    randomUUID: () => 'req-1',
    setTimer: (fn) => { timerFn = fn; calls.timers += 1; return 'T'; },
    clearTimer: () => { calls.cleared += 1; },
    timeoutMs: 60000,
  });
  return { ctl, calls, fireTimeout: () => timerFn && timerFn(), getMode: () => mode };
}

const ROWS = [
  { username: 'a@x', title: 't', host: 'h', vaultName: 'Personal' },
  { username: 'b@x', title: 't', host: 'h', vaultName: 'Personal' },
];

test('picker: a valid reply resolves with the chosen index', async () => {
  const h = harness();
  const p = h.ctl.requestPick(ROWS, 0, 'x.test');
  h.ctl.handleReply({ fromOverlay: true }, { requestId: 'req-1', index: 1 });
  assert.deepEqual(await p, { index: 1, reason: 'selected' });
});

test('picker: an explicit null index is a dismissal', async () => {
  const h = harness();
  const p = h.ctl.requestPick(ROWS, 0, 'x.test');
  h.ctl.handleReply({ fromOverlay: true }, { requestId: 'req-1', index: null });
  assert.deepEqual(await p, { index: null, reason: 'dismissed' });
});

test('picker: a MISSING index is malformed, not a dismissal', async () => {
  const h = harness();
  const p = h.ctl.requestPick(ROWS, 0, 'x.test');
  h.ctl.handleReply({ fromOverlay: true }, { requestId: 'req-1' });
  assert.deepEqual(await p, { index: null, reason: 'invalid-reply' });
});

test('picker: a WRONG-SENDER reply leaves the request pending', async () => {
  const h = harness();
  const p = h.ctl.requestPick(ROWS, 0, 'x.test');
  h.ctl.handleReply({ fromOverlay: false }, { requestId: 'req-1', index: 0 });
  assert.equal(h.ctl.isPending(), true, 'stage-1 failure must change NO state');
  // ...and a later valid reply still works.
  h.ctl.handleReply({ fromOverlay: true }, { requestId: 'req-1', index: 0 });
  assert.deepEqual(await p, { index: 0, reason: 'selected' });
});

test('picker: a STALE requestId leaves the request pending', async () => {
  const h = harness();
  const p = h.ctl.requestPick(ROWS, 0, 'x.test');
  h.ctl.handleReply({ fromOverlay: true }, { requestId: 'OLD', index: 0 });
  assert.equal(h.ctl.isPending(), true, 'a late reply from a closed picker must not cancel a live one');
  h.ctl.handleReply({ fromOverlay: true }, { requestId: 'req-1', index: 1 });
  assert.deepEqual(await p, { index: 1, reason: 'selected' });
});

test('picker: an out-of-range index cancels THIS request as invalid-reply', async () => {
  for (const bad of [-1, 2, 1.5, '0', NaN]) {
    const h = harness();
    const p = h.ctl.requestPick(ROWS, 0, 'x.test');
    h.ctl.handleReply({ fromOverlay: true }, { requestId: 'req-1', index: bad });
    assert.deepEqual(await p, { index: null, reason: 'invalid-reply' }, `${String(bad)}`);
  }
});

test('picker: settlement is exactly-once', async () => {
  const h = harness();
  const p = h.ctl.requestPick(ROWS, 0, 'x.test');
  h.ctl.settle(0, 'selected');
  h.ctl.settle(null, 'timeout');          // must be inert
  h.ctl.settle(null, 'blur');             // must be inert
  assert.deepEqual(await p, { index: 0, reason: 'selected' });
  assert.equal(h.ctl.isPending(), false);
  assert.equal(h.calls.cleared, 1, 'the timer is cleared exactly once');
});

test('picker: the timeout settles the request', async () => {
  const h = harness();
  const p = h.ctl.requestPick(ROWS, 0, 'x.test');
  h.fireTimeout();
  assert.deepEqual(await p, { index: null, reason: 'timeout' });
});

test('picker: every cancellation reason resolves the promise', async () => {
  for (const reason of ['escape', 'blur', 'mode-replaced', 'hidden', 'tab-changed', 'window-closed']) {
    const h = harness();
    const p = h.ctl.requestPick(ROWS, 0, 'x.test');
    h.ctl.settle(null, reason);
    assert.deepEqual(await p, { index: null, reason }, reason);
  }
});

test('picker: an unavailable overlay settles immediately instead of hanging', async () => {
  const h = harness({ overlayAvailable: false });
  const p = h.ctl.requestPick(ROWS, 0, 'x.test');
  assert.deepEqual(await p, { index: null, reason: 'window-closed' },
    'a failed show must not leave the fill awaiting a 60s timeout');
  assert.equal(h.ctl.isPending(), false, 'no stale pending state may survive a failed show');
});

test('picker: a PARTIAL (thrown) show settles and tears the overlay back down', async () => {
  // The real showOverlay assigns overlayMode/overlayPrefill before it can throw,
  // so a throw may leave vault rows resident. Clearing only our own pending
  // state would strand them.
  const h = harness({ overlayThrows: true });
  const p = h.ctl.requestPick(ROWS, 0, 'x.test');
  assert.deepEqual(await p, { index: null, reason: 'window-closed' });
  assert.equal(h.ctl.isPending(), false, 'a thrown show must leave no stale pending state');
  assert.equal(h.calls.hidden, 1, 'the partially-shown overlay must be torn down');
  assert.equal(h.getMode(), null, 'no vault rows may remain resident after a failed show');
});

test('picker: rows reach the overlay with exactly four keys', async () => {
  const h = harness();
  const p = h.ctl.requestPick(ROWS, 3, 'x.test');
  const sent = h.calls.shown[0].prefill;
  assert.equal(sent.truncated, 3);
  for (const row of sent.rows) {
    assert.deepEqual(Object.keys(row).sort(), ['host', 'title', 'username', 'vaultName']);
  }
  h.ctl.settle(null, 'escape');
  await p;
});
