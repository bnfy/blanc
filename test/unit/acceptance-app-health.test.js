'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isTransportError,
  probeApp,
  createHealingLog,
  firstLine,
  shouldHealAfterReset,
} = require('../desktop/support/app-health');

const fakeApp = ({ exitCode = null, mainOk = true, pages = [] } = {}) => ({
  process: () => ({ exitCode, signalCode: null, pid: 4242 }),
  evaluate: () => (mainOk ? Promise.resolve(1) : new Promise(() => {})),
  windows: () => pages.map(({ url, ok }) => ({
    isClosed: () => false,
    url: () => url,
    evaluate: () => (ok ? Promise.resolve(1) : Promise.reject(new Error('Target crashed'))),
  })),
});

test('transport errors are recognised and ordinary assertion failures are not', () => {
  for (const message of [
    'Target crashed',
    'electronApplication.evaluate: Target page, context or browser has been closed',
    'Execution context was destroyed',
  ]) assert.equal(isTransportError(message), true, message);
  assert.equal(isTransportError('Expected 3 to equal 4'), false);
  assert.equal(isTransportError(undefined), false);
});

test('a live app with answering pages is healthy', async () => {
  assert.deepEqual(
    await probeApp(fakeApp({ pages: [{ url: 'blanc://newtab/', ok: true }] })),
    { healthy: true, reason: null },
  );
});

test('an exited process is unhealthy with its exit code', async () => {
  const result = await probeApp(fakeApp({ exitCode: 1 }));
  assert.equal(result.healthy, false);
  assert.match(result.reason, /process exited \(code 1/);
});

test('a main process that never answers is unhealthy within the timeout', async () => {
  const result = await probeApp(fakeApp({ mainOk: false }), { timeoutMs: 50 });
  assert.deepEqual(result, { healthy: false, reason: 'main process did not answer' });
});

test('one crashed page makes the app unhealthy and names the page', async () => {
  const result = await probeApp(fakeApp({ pages: [
    { url: 'blanc://newtab/', ok: true },
    { url: 'http://127.0.0.1:1/site/ads.example', ok: false },
  ] }));
  assert.equal(result.healthy, false);
  assert.match(result.reason, /ads\.example did not answer: Target crashed/);
});

test('a missing app is unhealthy', async () => {
  assert.deepEqual(await probeApp(null), { healthy: false, reason: 'no app' });
});

test('a reset failure heals once, and only for a transport error', () => {
  const transport = new Error('electronApplication.evaluate: Target crashed');
  assert.equal(shouldHealAfterReset({ alreadyHealed: false, error: transport }), true);
  assert.equal(shouldHealAfterReset({ alreadyHealed: true, error: transport }), false);
  assert.equal(shouldHealAfterReset({ alreadyHealed: false, error: new Error('reset: workspace not found') }), false);
  assert.equal(firstLine('Target crashed\n    at CRSession'), 'Target crashed');
});

test('the healing log summarises nothing when nothing happened, and every relaunch otherwise', () => {
  const log = createHealingLog();
  assert.deepEqual(log.summaryLines(), []);
  log.record({ scenario: 'A', reason: 'process exited (code 1, signal null)' });
  log.record({ scenario: 'B', reason: 'page x did not answer: Target crashed' });
  assert.deepEqual(log.summaryLines(), [
    'acceptance: the harness relaunched Blanc 2 time(s)',
    '  before "A": process exited (code 1, signal null)',
    '  before "B": page x did not answer: Target crashed',
  ]);
});
