'use strict';

// The document-policy and modified-link smokes delete their temporary profile
// once Blanc has exited. On Windows a Chromium child process can still hold a
// cache journal open for a moment (EBUSY on profile-Dev\Cache\No_Vary_Search\
// journal.baj, October 2026), which failed a run whose checks had passed.
// removeTempProfile retries, then leaves a still-locked directory behind with
// a note; any other error goes back to the caller.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { removeTempProfile } = require('../desktop/support/temp-profile');

const failWith = (code) => () => { throw Object.assign(new Error(`${code}: busy`), { code }); };

test('a removed profile reports nothing', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-temp-profile-'));
  fs.mkdirSync(path.join(root, 'profile-Dev', 'Cache'), { recursive: true });
  fs.writeFileSync(path.join(root, 'profile-Dev', 'Cache', 'journal.baj'), 'x');
  const logs = [];
  assert.equal(removeTempProfile(root, { log: (line) => logs.push(line) }), null);
  assert.equal(fs.existsSync(root), false);
  assert.deepEqual(logs, []);
});

test('the removal retries a locked file with a growing delay', () => {
  let options;
  removeTempProfile('/tmp/x', { rm: (_root, given) => { options = given; } });
  assert.equal(options.recursive, true);
  assert.equal(options.force, true);
  assert(options.maxRetries >= 10 && options.retryDelay >= 100, JSON.stringify(options));
});

for (const code of ['EBUSY', 'EPERM', 'ENOTEMPTY']) {
  test(`a file still held after the retries (${code}) is left behind with a note`, () => {
    const logs = [];
    assert.equal(removeTempProfile('/tmp/held', { rm: failWith(code), log: (line) => logs.push(line) }), null);
    assert.equal(logs.length, 1);
    assert.match(logs[0], new RegExp(`left /tmp/held behind: ${code}`));
  });
}

test('any other error goes back to the caller', () => {
  const logs = [];
  const error = removeTempProfile('/tmp/x', { rm: failWith('EIO'), log: (line) => logs.push(line) });
  assert.equal(error?.code, 'EIO');
  assert.deepEqual(logs, []);
});
