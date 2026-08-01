const assert = require('node:assert/strict');
const test = require('node:test');
const {
  MAX_CRASH_EVENTS,
  buildDiagnosticsReport,
  createCrashLedger,
} = require('../../src/main/diagnostics-model');

function fakeStore(data = { version: 1, currentRun: null, events: [] }) {
  return {
    data: structuredClone(data),
    writes: 0,
    updateAndFlush(fn) {
      fn(this.data);
      this.writes += 1;
      return true;
    },
  };
}

test('a clean session writes and clears its marker without adding a crash', () => {
  const store = fakeStore();
  const ledger = createCrashLedger(store, {
    now: () => 1000,
  });

  assert.equal(ledger.hasActiveSession(), false);
  assert.equal(ledger.hasPendingRecovery(), false);
  assert.equal(ledger.startSession(), true);
  assert.equal(ledger.hasActiveSession(), true);
  assert.deepEqual(store.data.currentRun, { startedAt: 1000 });
  assert.deepEqual(ledger.snapshot(), []);
  assert.equal(ledger.endSession(), true);
  assert.equal(ledger.hasActiveSession(), false);
  assert.equal(ledger.hasPendingRecovery(), false);
  assert.equal(store.data.currentRun, null);
});

test('a leftover marker becomes one local unclean-exit event on next launch', () => {
  const store = fakeStore({
    version: 1,
    currentRun: { startedAt: 500 },
    events: [],
  });
  const ledger = createCrashLedger(store, {
    now: () => 1000,
  });

  assert.equal(ledger.hasActiveSession(), true);
  ledger.startSession();
  assert.equal(ledger.hasPendingRecovery(), true);
  assert.deepEqual(ledger.snapshot(), [{
    at: 1000,
    kind: 'unclean-exit',
    previousStartedAt: 500,
  }]);
  assert.deepEqual(store.data.currentRun, { startedAt: 1000 });
});

test('an unresolved recovery choice survives a later clean quit until it is resolved', () => {
  const store = fakeStore({
    version: 1,
    currentRun: { startedAt: 500 },
    recoveryPending: false,
    events: [],
  });
  const ledger = createCrashLedger(store, { now: () => 1000 });

  ledger.startSession();
  ledger.endSession();
  assert.equal(ledger.hasPendingRecovery(), true);
  assert.equal(ledger.resolveRecovery(), true);
  assert.equal(ledger.hasPendingRecovery(), false);
});

test('renderer and child crashes retain only bounded non-browsing metadata', () => {
  let now = 10;
  const store = fakeStore();
  const ledger = createCrashLedger(store, {
    now: () => now++,
  });
  ledger.startSession();
  ledger.recordRenderer({
    surface: 'tab',
    reason: 'crashed',
    exitCode: 9,
    url: 'https://private.example/secret',
  });
  ledger.recordChildProcess({
    type: 'GPU',
    reason: 'oom',
    exitCode: 12,
    serviceName: 'private-profile-name',
  });

  assert.deepEqual(ledger.snapshot(), [
    { at: 11, kind: 'renderer', reason: 'crashed', exitCode: 9, surface: 'tab' },
    { at: 12, kind: 'child-process', reason: 'oom', exitCode: 12, processType: 'gpu' },
  ]);
  assert.doesNotMatch(JSON.stringify(store.data), /private|secret|https/);
});

test('the crash ledger is capped and clear preserves the active-run marker', () => {
  let now = 100;
  const store = fakeStore();
  const ledger = createCrashLedger(store, {
    now: () => now++,
  });
  ledger.startSession();
  for (let index = 0; index < MAX_CRASH_EVENTS + 10; index += 1) {
    ledger.recordRenderer({ surface: 'tab', reason: 'crashed' });
  }
  assert.equal(ledger.snapshot().length, MAX_CRASH_EVENTS);
  const marker = structuredClone(store.data.currentRun);
  store.data.recoveryPending = true;
  assert.equal(ledger.clear(), true);
  assert.deepEqual(store.data.currentRun, marker);
  assert.equal(ledger.hasPendingRecovery(), true);
  assert.deepEqual(ledger.snapshot(), []);
});

test('invalid event timestamps are rejected instead of being persisted', () => {
  const store = fakeStore();
  const ledger = createCrashLedger(store, { now: () => Number.NaN });

  ledger.recordRenderer({ surface: 'tab', reason: 'crashed' });

  assert.deepEqual(store.data.events, []);
  assert.deepEqual(ledger.snapshot(), []);
});

test('the exported report is readable and explicitly excludes private product data', () => {
  const report = buildDiagnosticsReport({
    generatedAt: 2000,
    appInfo: {
      version: '1.1.0',
      packaged: true,
      electron: '43.2.0',
      chromium: '144.0.0.0',
      node: '22.17.0',
      installId: 'must-not-export',
    },
    systemInfo: { platform: 'darwin', architecture: 'arm64', release: '27.0.0' },
    events: [{
      at: 1500,
      kind: 'renderer',
      reason: 'crashed',
      surface: 'tab',
      url: 'https://private.example/',
    }],
  });
  const serialized = JSON.stringify(report);

  assert.equal(report.crashLedger.eventCount, 1);
  assert.equal(report.crashLedger.events[0].at, '1970-01-01T00:00:01.500Z');
  assert.equal(report.privacy.localOnlyUntilExported, true);
  assert.doesNotMatch(serialized, /must-not-export|private\.example/);
});
