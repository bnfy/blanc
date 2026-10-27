'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isTransportError,
  probeApp,
  createHealingLog,
  firstLine,
  shouldHealAfterReset,
  exitCodeOf,
  routeUncaught,
} = require('../desktop/support/app-health');

const fakeApp = ({ exitCode = null, mainOk = true, pages = [] } = {}) => ({
  process: () => ({ exitCode, signalCode: null, pid: 4242 }),
  evaluate: () => (mainOk ? Promise.resolve(1) : new Promise(() => {})),
  windows: () => pages.map(({ url, ok, error = 'Target crashed', hang = false, closesDuringProbe = false }) => {
    let closed = false;
    return {
      isClosed: () => closed,
      url: () => url,
      evaluate: () => {
        if (hang) return new Promise(() => {});
        if (ok) return Promise.resolve(1);
        if (closesDuringProbe) closed = true;
        return Promise.reject(new Error(`page.evaluate: ${error}`));
      },
    };
  }),
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
  assert.match(result.reason, /ads\.example did not answer: page\.evaluate: Target crashed/);
});

test('a page in the middle of a navigation is not a crash', async () => {
  const result = await probeApp(fakeApp({ pages: [
    { url: 'blanc://newtab/', ok: false, error: 'Execution context was destroyed, most likely because of a navigation' },
  ] }));
  assert.deepEqual(result, { healthy: true, reason: null });
});

test('a page that is slow to answer is not a crash', async () => {
  const result = await probeApp(fakeApp({ pages: [{ url: 'blanc://newtab/', hang: true }] }), { timeoutMs: 50 });
  assert.deepEqual(result, { healthy: true, reason: null });
});

test('a page that closed while it was probed is skipped', async () => {
  const result = await probeApp(fakeApp({ pages: [
    { url: 'http://127.0.0.1:1/site/gone', ok: false, error: 'Target page, context or browser has been closed', closesDuringProbe: true },
  ] }));
  assert.deepEqual(result, { healthy: true, reason: null });
});

test('an app whose handle Playwright already disposed is unhealthy, not a throw', async () => {
  const disposed = { process: () => { throw new TypeError("Cannot read properties of undefined (reading '_object')"); } };
  assert.deepEqual(await probeApp(disposed), { healthy: false, reason: 'app handle disposed' });
  assert.equal(exitCodeOf(disposed), 'disposed');
  assert.equal(exitCodeOf(fakeApp({ exitCode: null })), null);
  assert.equal(exitCodeOf(fakeApp({ exitCode: 1 })), 1);
});

test('only a late dead-target error thrown by Playwright itself is swallowed; everything else reaches Cucumber', () => {
  const fromPlaywright = (message) => Object.assign(new Error(message), {
    stack: `Error: ${message}\n    at assert (/x/node_modules/playwright-core/lib/coreBundle.js:838:11)\n    at _CRSession._onMessage (/x/node_modules/playwright-core/lib/coreBundle.js:35014:11)`,
  });
  const fromStep = (message) => Object.assign(new Error(message), {
    stack: `Error: ${message}\n    at BlancWorld.<anonymous> (/x/test/desktop/steps/glance.steps.js:12:3)`,
  });
  assert.equal(routeUncaught(fromPlaywright('Target crashed'), { listeners: 1 }), 'suspect');
  assert.equal(routeUncaught(fromPlaywright('Target page, context or browser has been closed'), { listeners: 0 }), 'suspect');
  // A navigation race is not a dead target, wherever it comes from.
  assert.equal(routeUncaught(fromPlaywright('Execution context was destroyed'), { listeners: 1 }), 'forward');
  // A floating promise in step code keeps failing its step.
  assert.equal(routeUncaught(fromStep('Target crashed'), { listeners: 1 }), 'forward');
  assert.equal(routeUncaught(new Error('real bug in a step'), { listeners: 1 }), 'forward');
  assert.equal(routeUncaught(new Error('real bug outside any hook'), { listeners: 0 }), 'fatal');
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
  log.record({ scenario: 'B', reason: 'page x did not answer: Target crashed', exception: 'uncaughtException\nError: boom\n    at x' });
  assert.deepEqual(log.summaryLines(), [
    'acceptance: the harness relaunched Blanc 2 time(s)',
    '  before "A": process exited (code 1, signal null)',
    '  before "B": page x did not answer: Target crashed',
    '    main-process exception: uncaughtException',
    '    Error: boom',
    '        at x',
  ]);
});
