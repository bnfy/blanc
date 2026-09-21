'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  BADGE_GUARD_INTERVAL_MS,
  installBadgeApiPolicy,
  clearApplicationBadge,
  applicationBadgeIsVisible,
  startApplicationBadgeGuard,
} = require('../../src/main/app-badge-policy');

const mainSource = fs.readFileSync(path.join(__dirname, '../../src/main/main.js'), 'utf8');

test('badge policy installs only a frame preload', () => {
  const calls = [];
  const session = {
    registerPreloadScript: (options) => {
      calls.push(options);
      return 'badge-preload';
    },
  };
  assert.equal(installBadgeApiPolicy(session, '/badge-api-preload.js'), 'badge-preload');
  assert.deepEqual(calls, [{
    type: 'frame',
    filePath: '/badge-api-preload.js',
  }]);
  assert.match(mainSource, /installBadgeApiPolicy\(/);
  assert.doesNotMatch(mainSource, /type:\s*['"]service-worker['"]/);
});

test('macOS stale badge cleanup uses the Dock API', () => {
  const calls = [];
  const app = { dock: { setBadge: (value) => calls.push(value) } };
  assert.equal(clearApplicationBadge(app, { platform: 'darwin' }), true);
  assert.deepEqual(calls, ['']);
});

test('Linux stale badge cleanup resets the launcher count', () => {
  const calls = [];
  const app = { setBadgeCount: (value) => calls.push(value) };
  assert.equal(clearApplicationBadge(app, { platform: 'linux' }), true);
  assert.deepEqual(calls, [0]);
});

test('badge cleanup is a no-op on unsupported platforms', () => {
  assert.equal(clearApplicationBadge({}, { platform: 'win32' }), false);
});

test('badge visibility reads the platform-native badge value', () => {
  assert.equal(applicationBadgeIsVisible({ dock: { getBadge: () => '8' } }, {
    platform: 'darwin',
  }), true);
  assert.equal(applicationBadgeIsVisible({ dock: { getBadge: () => '' } }, {
    platform: 'darwin',
  }), false);
  assert.equal(applicationBadgeIsVisible({ getBadgeCount: () => 8 }, {
    platform: 'linux',
  }), true);
});

test('badge guard clears startup and later service-worker badge writes', () => {
  const calls = [];
  const scheduled = [];
  const cleared = [];
  let badge = 'old';
  const timer = { unrefCalls: 0, unref() { this.unrefCalls += 1; } };
  const app = {
    dock: {
      getBadge: () => badge,
      setBadge: (value) => {
        badge = value;
        calls.push(value);
      },
    },
  };
  const guard = startApplicationBadgeGuard(app, {
    platform: 'darwin',
    setIntervalFn: (callback, interval) => {
      scheduled.push({ callback, interval });
      return timer;
    },
    clearIntervalFn: (value) => cleared.push(value),
  });

  assert.equal(guard.active, true);
  assert.deepEqual(calls, ['']);
  assert.equal(scheduled[0].interval, BADGE_GUARD_INTERVAL_MS);
  assert.equal(timer.unrefCalls, 1);

  badge = '8';
  scheduled[0].callback();
  assert.deepEqual(calls, ['', '']);
  assert.equal(badge, '');

  scheduled[0].callback();
  assert.deepEqual(calls, ['', '']);
  guard.stop();
  guard.stop();
  assert.deepEqual(cleared, [timer]);
});
