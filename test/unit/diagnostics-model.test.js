const assert = require('node:assert/strict');
const test = require('node:test');
const { MAX_CRASH_EVENTS, buildDiagnosticsReport, createCrashLedger } =
  require('../../src/main/diagnostics-model');

function fakeStore(data = { version: 1, currentRun: null, recoveryPending: false, events: [] }) {
  return {
    data: structuredClone(data),
    updateAndFlush(fn) { fn(this.data); return true; },
  };
}

test('clean and unclean sessions keep a durable recovery marker', () => {
  const clean = fakeStore();
  const cleanLedger = createCrashLedger(clean, { now: () => 1000 });
  assert.equal(cleanLedger.startSession(), true);
  assert.equal(cleanLedger.hasActiveSession(), true);
  assert.equal(cleanLedger.endSession(), true);
  assert.equal(cleanLedger.hasActiveSession(), false);
  assert.deepEqual(cleanLedger.snapshot(), []);

  const crashed = fakeStore({
    version: 1,
    currentRun: { startedAt: 500 },
    recoveryPending: false,
    events: [],
  });
  const crashLedger = createCrashLedger(crashed, { now: () => 1000 });
  crashLedger.startSession();
  assert.equal(crashLedger.hasPendingRecovery(), true);
  assert.deepEqual(crashLedger.snapshot(), [{
    at: 1000, kind: 'unclean-exit', previousStartedAt: 500,
  }]);
  assert.equal(crashLedger.resolveRecovery(), true);
  assert.equal(crashLedger.hasPendingRecovery(), false);
});

test('events retain only bounded non-browsing metadata and cap at 50', () => {
  let now = 10;
  const store = fakeStore();
  const ledger = createCrashLedger(store, { now: () => now++ });
  ledger.startSession();
  ledger.recordRenderer({
    surface: 'tab', reason: 'crashed', exitCode: 9,
    url: 'https://private.example/secret', snapshot: { post: 'secret' },
  });
  ledger.recordChildProcess({
    type: 'GPU', reason: 'oom', exitCode: 12, serviceName: 'private-profile-name',
  });
  for (let index = 0; index < MAX_CRASH_EVENTS + 10; index += 1) {
    ledger.recordRenderer({ surface: 'tab', reason: 'crashed' });
  }
  assert.equal(ledger.snapshot().length, MAX_CRASH_EVENTS);
  assert.doesNotMatch(JSON.stringify(store.data), /private|secret|https|post/i);
});

test('clear preserves active and pending lifecycle markers', () => {
  const store = fakeStore({
    version: 1,
    currentRun: { startedAt: 500 },
    recoveryPending: true,
    events: [{ at: 600, kind: 'renderer', surface: 'tab', reason: 'crashed' }],
  });
  const ledger = createCrashLedger(store);
  assert.equal(ledger.clear(), true);
  assert.deepEqual(store.data.currentRun, { startedAt: 500 });
  assert.equal(store.data.recoveryPending, true);
  assert.deepEqual(ledger.snapshot(), []);
});

test('the report is readable and excludes injected product data', () => {
  const report = buildDiagnosticsReport({
    generatedAt: 2000,
    appInfo: { version: '1.10.0', packaged: true, electron: '44.0.0', installId: 'nope' },
    systemInfo: { platform: 'darwin', architecture: 'arm64', release: '27.0.0' },
    events: [{ at: 1500, kind: 'renderer', reason: 'crashed', surface: 'tab', url: 'https://private.example/' }],
  });
  const serialized = JSON.stringify(report);
  assert.equal(report.crashLedger.eventCount, 1);
  assert.equal(report.crashLedger.events[0].at, '1970-01-01T00:00:01.500Z');
  assert.equal(report.privacy.localOnlyUntilExported, true);
  assert.doesNotMatch(serialized, /nope|private\.example/);
});
