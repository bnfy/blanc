'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  createDayOneSignals,
  DAY_ONE_WINDOW_MS,
  DEFAULT_CHECK_INTERVAL_MS,
  START_DELAY_MS,
} = require('../../src/main/day-one-signals');

function harness({
  createdAt = 0, now = 1_000, isDefault = false, canSend = true, writable = true, sent = {},
} = {}) {
  const state = {
    now, isDefault, canSend, createdAt,
    sent: { default: false, browsed: false, ...sent },
    sentEvents: [], timeouts: [], intervals: [], cleared: [],
  };
  const signals = createDayOneSignals({
    readMeta: () => ({ createdAt: state.createdAt, sent: { ...state.sent } }),
    markSent: (signal) => { if (!writable) return false; state.sent[signal] = true; return true; },
    send: (signal) => state.sentEvents.push(signal),
    canSend: () => state.canSend,
    isDefaultBrowser: () => {
      if (state.isDefault === 'throw') throw new Error('reg.exe failed');
      return state.isDefault;
    },
    now: () => state.now,
    setTimeoutFn: (fn, ms) => { state.timeouts.push({ fn, ms }); return state.timeouts.length; },
    setIntervalFn: (fn, ms) => { state.intervals.push({ fn, ms }); return { id: state.intervals.length, unref() {} }; },
    clearIntervalFn: (handle) => state.cleared.push(handle),
  });
  const activate = () => { signals.start(); state.timeouts.at(-1).fn(); };
  return { signals, state, activate };
}

test('nothing is checked until the start delay has passed', () => {
  const { signals, state } = harness({ isDefault: true });
  signals.start();
  assert.equal(state.timeouts[0].ms, START_DELAY_MS);
  assert.deepEqual(state.sentEvents, []);
  assert.equal(signals.checkDefault(), false, 'Make default before activation does nothing');
});

test('the third counted web page sends day1_browsed once', () => {
  const { signals, state, activate } = harness();
  activate();
  signals.notePageLoaded('https://a.example/');
  signals.notePageLoaded('http://b.example/');
  assert.deepEqual(state.sentEvents, []);
  signals.notePageLoaded('https://c.example/');
  signals.notePageLoaded('https://d.example/');
  assert.deepEqual(state.sentEvents, ['browsed']);
});

test('only http and https pages count', () => {
  const { signals, state, activate } = harness();
  activate();
  for (const url of ['blanc://newtab/', 'about:blank', 'file:///etc/hosts', 'not a url', '', undefined]) {
    signals.notePageLoaded(url);
  }
  signals.notePageLoaded('https://a.example/');
  signals.notePageLoaded('https://b.example/');
  assert.deepEqual(state.sentEvents, []);
});

test('pages counted before activation send on activation', () => {
  const { signals, state, activate } = harness();
  for (const u of ['https://a.example/', 'https://b.example/', 'https://c.example/']) signals.notePageLoaded(u);
  assert.deepEqual(state.sentEvents, []);
  activate();
  assert.deepEqual(state.sentEvents, ['browsed']);
});

test('the default browser is checked on activation, then every 15 minutes until true', () => {
  const { signals, state, activate } = harness();
  activate();
  assert.equal(state.intervals.length, 1);
  assert.equal(state.intervals[0].ms, DEFAULT_CHECK_INTERVAL_MS);
  state.intervals[0].fn();
  assert.deepEqual(state.sentEvents, []);
  state.isDefault = true;
  state.intervals[0].fn();
  assert.deepEqual(state.sentEvents, ['default']);
  assert.equal(state.cleared.length, 1, 'the timer stops once the signal is sent');
  state.intervals[0].fn();
  assert.deepEqual(state.sentEvents, ['default']);
});

test('Make default triggers an immediate check after activation', () => {
  const { signals, state, activate } = harness();
  activate();
  state.isDefault = true;
  assert.equal(signals.checkDefault(), true);
  assert.deepEqual(state.sentEvents, ['default']);
});

test('nothing is sent after the first 24 hours, and the timer stops', () => {
  const { signals, state, activate } = harness();
  activate();
  state.now = DAY_ONE_WINDOW_MS + 1;
  state.isDefault = true;
  state.intervals[0].fn();
  for (const u of ['https://a.example/', 'https://b.example/', 'https://c.example/']) signals.notePageLoaded(u);
  assert.deepEqual(state.sentEvents, []);
  assert.equal(state.cleared.length, 1);
});

test('legacy installs never send and never start a timer', () => {
  const { signals, state, activate } = harness({ createdAt: 'legacy', isDefault: true });
  activate();
  for (const u of ['https://a.example/', 'https://b.example/', 'https://c.example/']) signals.notePageLoaded(u);
  assert.deepEqual(state.sentEvents, []);
  assert.equal(state.intervals.length, 0);
});

test('already-sent signals are not sent again after a restart', () => {
  const { signals, state, activate } = harness({ isDefault: true, sent: { default: true, browsed: true } });
  activate();
  for (const u of ['https://a.example/', 'https://b.example/', 'https://c.example/']) signals.notePageLoaded(u);
  assert.deepEqual(state.sentEvents, []);
  assert.equal(state.intervals.length, 0);
});

test('without consent nothing is sent; a failed flag write blocks the send', () => {
  const noConsent = harness({ canSend: false, isDefault: true });
  noConsent.activate();
  assert.deepEqual(noConsent.state.sentEvents, []);
  const readOnly = harness({ writable: false, isDefault: true });
  readOnly.activate();
  assert.deepEqual(readOnly.state.sentEvents, [], 'the flag must reach disk before the event leaves');
});

test('a throwing default-browser check is treated as not default', () => {
  const { state, activate } = harness({ isDefault: 'throw' });
  activate();
  assert.deepEqual(state.sentEvents, []);
  assert.equal(state.intervals.length, 1, 'the check keeps running after a failed read');
});
