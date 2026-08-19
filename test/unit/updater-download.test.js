const test = require('node:test');
const assert = require('node:assert/strict');

const {
  formatBytes,
  formatSpeed,
  createDownloadProgressLogger,
  createDownloadStallWatchdog,
  shouldArmDownloadStallWatchdog,
  PROGRESS_LOG_INTERVAL_MS,
  DOWNLOAD_STALL_MS,
} = require('../../src/main/updater-download');

test('formatBytes and formatSpeed render human-readable sizes', () => {
  assert.equal(formatBytes(512), '512 B');
  assert.equal(formatBytes(1536), '1.5 KB');
  assert.equal(formatBytes(5 * 1024 * 1024), '5.0 MB');
  assert.equal(formatBytes(Number.NaN), '?');
  assert.equal(formatSpeed(1024 * 1024), '1.0 MB/s');
  assert.equal(formatSpeed(0), '0 B/s');
});

test('progress logger throttles by time interval', () => {
  let t = 0;
  const lines = [];
  const logger = createDownloadProgressLogger({
    log: (m) => lines.push(m),
    minIntervalMs: 1000,
    percentStep: 100,
    now: () => t,
  });

  logger.note({ percent: 1, transferred: 1, total: 100, bytesPerSecond: 1 });
  logger.note({ percent: 2, transferred: 2, total: 100, bytesPerSecond: 1 });
  assert.equal(lines.length, 1, 'second line within interval is suppressed');

  t = 1000;
  logger.note({ percent: 2, transferred: 2, total: 100, bytesPerSecond: 1 });
  assert.equal(lines.length, 2, 'interval elapsed allows another line');
});

test('progress logger also logs on a large percent jump', () => {
  let t = 0;
  const lines = [];
  const logger = createDownloadProgressLogger({
    log: (m) => lines.push(m),
    minIntervalMs: 60_000,
    percentStep: 5,
    now: () => t,
  });

  logger.note({ percent: 0, transferred: 0, total: 100, bytesPerSecond: 1 });
  logger.note({ percent: 6, transferred: 6, total: 100, bytesPerSecond: 1 });
  assert.equal(lines.length, 2, 'a >=5% jump bypasses the time throttle');
});

test('stall watchdog fires after silence and can be disarmed', () => {
  let t = 0;
  const stalls = [];
  const timers = [];
  const watchdog = createDownloadStallWatchdog({
    stallMs: 5000,
    now: () => t,
    setTimer: (fn, delay) => {
      const id = timers.length;
      timers.push({ fn, fireAt: t + delay, id });
      return id;
    },
    clearTimer: (id) => {
      const idx = timers.findIndex((entry) => entry.id === id);
      if (idx >= 0) timers.splice(idx, 1);
    },
    onStall: () => stalls.push(t),
  });

  function runDueTimers() {
    const due = timers.filter((entry) => entry.fireAt <= t);
    for (const entry of due) {
      const idx = timers.indexOf(entry);
      if (idx >= 0) timers.splice(idx, 1);
      entry.fn();
    }
  }

  watchdog.arm();
  runDueTimers();
  assert.equal(stalls.length, 0);

  t = 4999;
  runDueTimers();
  assert.equal(stalls.length, 0, 'still within stall window');

  t = 5000;
  runDueTimers();
  assert.equal(stalls.length, 1, 'stall fires once silence exceeds stallMs');

  watchdog.disarm();
  t = 20_000;
  runDueTimers();
  assert.equal(stalls.length, 1, 'disarm prevents a second stall');
});

test('stall watchdog resets when progress resumes', () => {
  let t = 0;
  const stalls = [];
  let nextId = 0;
  const timers = new Map();
  const watchdog = createDownloadStallWatchdog({
    stallMs: 1000,
    now: () => t,
    setTimer: (fn, delay) => {
      const id = ++nextId;
      timers.set(id, { fn, fireAt: t + delay });
      return id;
    },
    clearTimer: (id) => timers.delete(id),
    onStall: () => stalls.push(t),
  });

  function runDueTimers() {
    for (const [id, entry] of [...timers.entries()]) {
      if (entry.fireAt <= t) {
        timers.delete(id);
        entry.fn();
      }
    }
  }

  watchdog.arm();
  t = 900;
  watchdog.touch();
  runDueTimers();
  assert.equal(stalls.length, 0, 'touch pushed the deadline forward');

  t = 1800;
  runDueTimers();
  assert.equal(stalls.length, 0, 'still within window after touch');

  t = 1901;
  runDueTimers();
  assert.equal(stalls.length, 1);
});

test('exported stall and log intervals are sensible defaults', () => {
  assert.ok(PROGRESS_LOG_INTERVAL_MS >= 10_000);
  assert.ok(DOWNLOAD_STALL_MS >= 60_000);
});

test('stall watchdog arms only for a fresh in-flight download', () => {
  const token = { cancel() {} };
  const available = { isUpdateAvailable: true, cancellationToken: token };

  assert.equal(shouldArmDownloadStallWatchdog(available, {
    alreadyDownloading: false,
    alreadyDownloaded: false,
  }), true);

  assert.equal(shouldArmDownloadStallWatchdog(available, {
    alreadyDownloading: true,
    alreadyDownloaded: false,
  }), false, 'repeated checks must not clobber the in-flight token');

  assert.equal(shouldArmDownloadStallWatchdog(available, {
    alreadyDownloading: false,
    alreadyDownloaded: true,
  }), false, 'a cached previous-session download already raised update-downloaded');

  assert.equal(shouldArmDownloadStallWatchdog(
    { isUpdateAvailable: false, cancellationToken: token },
    { alreadyDownloading: false, alreadyDownloaded: false },
  ), false);

  assert.equal(shouldArmDownloadStallWatchdog(
    { isUpdateAvailable: true },
    { alreadyDownloading: false, alreadyDownloaded: false },
  ), false);
});
