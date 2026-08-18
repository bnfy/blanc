const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createUpdaterLog, MAX_LOG_BYTES } = require('../../src/main/updater-log');

const created = [];
function tmpDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-updater-log-'));
  created.push(dir);
  return dir;
}

// When a file can't be written the logger falls back to console on purpose;
// silence it so that expected fallback output doesn't clutter the test run.
function withSilencedConsole(fn) {
  const saved = { info: console.info, warn: console.warn, error: console.error, log: console.log, debug: console.debug };
  console.info = console.warn = console.error = console.log = console.debug = () => {};
  try {
    fn();
  } finally {
    Object.assign(console, saved);
  }
}

test.after(() => {
  for (const dir of created) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (_) {
      /* best effort */
    }
  }
});

test('records leveled lines to updater.log', () => {
  const dir = tmpDir();
  const log = createUpdaterLog(dir);

  log.info('checking for update');
  log.warn('Cannot download differentially, fallback to full download');
  log.error(new Error('boom'));

  const contents = fs.readFileSync(path.join(dir, 'updater.log'), 'utf8');
  assert.match(contents, /\[info\] checking for update/);
  assert.match(contents, /\[warn\] Cannot download differentially/);
  assert.match(contents, /\[error\] Error: boom/, 'Error objects log their stack/message, not [object Object]');
});

test('formats message-bearing objects without [object Object]', () => {
  const dir = tmpDir();
  const log = createUpdaterLog(dir);

  log.error({ message: 'structured failure', code: 'ERR_X' });

  const contents = fs.readFileSync(path.join(dir, 'updater.log'), 'utf8');
  assert.match(contents, /structured failure/);
  assert.doesNotMatch(contents, /\[object Object\]/);
});

test('never throws when the log directory cannot be created', () => {
  // Point at a path whose parent is a file, so mkdir fails.
  const dir = tmpDir();
  const filePath = path.join(dir, 'not-a-dir');
  fs.writeFileSync(filePath, 'x');
  const log = createUpdaterLog(path.join(filePath, 'logs'));

  withSilencedConsole(() => {
    assert.doesNotThrow(() => {
      log.info('still safe');
      log.error('still safe');
    });
  });
});

test('never throws when the log file itself cannot be written', () => {
  // Occupy the log path with a directory so appendFileSync fails (EISDIR),
  // exercising the best-effort catch around the write itself.
  const dir = tmpDir();
  fs.mkdirSync(path.join(dir, 'updater.log'));
  const log = createUpdaterLog(dir);

  withSilencedConsole(() => {
    assert.doesNotThrow(() => {
      log.info('x');
      log.error(new Error('y'));
    });
  });
});

test('rotates a single generation once the log grows past the cap', () => {
  const dir = tmpDir();
  const logPath = path.join(dir, 'updater.log');
  fs.writeFileSync(logPath, 'x'.repeat(MAX_LOG_BYTES + 1));

  // The size is enforced on write, so the first line past the cap rotates.
  const log = createUpdaterLog(dir);
  log.info('fresh line');

  assert.ok(fs.existsSync(`${logPath}.old`), 'oversized log rolled to .old');
  const fresh = fs.readFileSync(logPath, 'utf8');
  assert.match(fresh, /\[info\] fresh line/);
  assert.ok(fresh.length < 1000, 'new log starts fresh, not appended to the old one');
});
