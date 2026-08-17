const test = require('node:test');
const assert = require('node:assert/strict');

const {
  CHECK_INTERVAL_MS,
  FOCUS_CHECK_MIN_INTERVAL_MS,
  createUpdateCheckCoordinator,
} = require('../../src/main/update-checks');

function harness() {
  let currentTime = 1_000;
  let downloaded = false;
  let checks = 0;
  const errors = [];
  const intervals = [];
  let implementation = async () => ({ updateInfo: { version: '1.5.1' } });
  const coordinator = createUpdateCheckCoordinator({
    checkForUpdates: () => {
      checks += 1;
      return implementation();
    },
    isUpdateDownloaded: () => downloaded,
    now: () => currentTime,
    scheduleInterval: (callback, delay) => intervals.push({ callback, delay }),
    onAutomaticError: (err) => errors.push(err),
  });
  return {
    coordinator,
    errors,
    intervals,
    checks: () => checks,
    advance: (duration) => { currentTime += duration; },
    setDownloaded: (value) => { downloaded = value; },
    setImplementation: (fn) => { implementation = fn; },
  };
}

test('starts immediately and checks every thirty minutes', async () => {
  const h = harness();
  h.coordinator.start();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(h.checks(), 1);
  assert.equal(h.intervals.length, 1);
  assert.equal(h.intervals[0].delay, CHECK_INTERVAL_MS);

  h.intervals[0].callback();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(h.checks(), 2);
});

test('focus checks are throttled but run when the last check is stale', async () => {
  const h = harness();
  await h.coordinator.checkForUpdates();

  h.advance(FOCUS_CHECK_MIN_INTERVAL_MS - 1);
  h.coordinator.checkOnFocus();
  await Promise.resolve();
  assert.equal(h.checks(), 1);

  h.advance(1);
  h.coordinator.checkOnFocus();
  await Promise.resolve();
  assert.equal(h.checks(), 2);
});

test('concurrent requests share one metadata check', async () => {
  const h = harness();
  let resolveCheck;
  h.setImplementation(() => new Promise((resolve) => { resolveCheck = resolve; }));

  const first = h.coordinator.checkForUpdates();
  const second = h.coordinator.checkForUpdates();
  await Promise.resolve();
  assert.equal(h.checks(), 1);

  resolveCheck({ updateInfo: { version: '1.5.1' } });
  assert.deepEqual(await first, await second);
});

test('downloaded updates suppress more checks and automatic failures remain observable', async () => {
  const h = harness();
  h.setDownloaded(true);
  assert.equal(await h.coordinator.checkForUpdates(), null);
  assert.equal(h.checks(), 0);

  h.setDownloaded(false);
  h.setImplementation(async () => { throw new Error('feed unavailable'); });
  h.coordinator.start();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(h.errors.length, 1);
  assert.match(h.errors[0].message, /feed unavailable/);
});
