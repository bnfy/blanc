'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

// Duo-1 (design 2026-10-29 §4.5): only an iOS 27.1 SDK build fills the iPhone
// Duo's inner display; an older one is letterboxed. The TestFlight script must
// refuse to archive with an older SDK, before it asks 1Password for anything.
const script = path.join(__dirname, '../../scripts/ios-testflight.sh');

function run(sdkVersion) {
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'ios-testflight-sdk-'));
  fs.writeFileSync(path.join(bin, 'xcrun'), `#!/bin/sh\necho ${sdkVersion}\n`, { mode: 0o755 });
  // Reached only once the guard has passed.
  fs.writeFileSync(path.join(bin, 'op'), '#!/bin/sh\necho reached-op\nexit 0\n', { mode: 0o755 });
  try {
    return spawnSync('bash', [script, '--export'], {
      encoding: 'utf8',
      env: { PATH: `${bin}:/usr/bin:/bin`, HOME: os.tmpdir() },
    });
  } finally {
    fs.rmSync(bin, { recursive: true, force: true });
  }
}

for (const old of ['26.6', '27.0', '18.4']) {
  test(`an iOS ${old} SDK is refused before anything is signed`, () => {
    const result = run(old);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stderr, /iOS 27\.1 SDK/);
    assert.doesNotMatch(result.stdout, /reached-op/);
  });
}

for (const ok of ['27.1', '27.2', '28.0']) {
  test(`an iOS ${ok} SDK goes on`, () => {
    const result = run(ok);
    assert.match(result.stdout, /reached-op/, result.stderr);
  });
}
