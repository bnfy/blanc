'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const script = fs.readFileSync(path.join(__dirname, '../../scripts/release.sh'), 'utf8');

test('build-only exits after packaged checks and cannot reach tag or publication', t => {
  const begin = script.indexOf('if [ "$BUILD_ONLY" = 1 ]; then\n  echo "==> Signed/notarized');
  const end = script.indexOf('\n# A draft release', begin);
  assert(begin > script.indexOf('if should_run ecs-acceptance; then'));
  assert(end < script.indexOf('git tag "$TAG"'));
  assert(script.includes('if [ "$BUILD_ONLY" != 1 ] && [ "$LOCAL_HEAD" != "$(git rev-parse origin/main)" ]; then'));
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-build-only-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  fs.writeFileSync(path.join(temp, 'installer.dmg'), 'test artifact');
  const digest = createHash('sha256').update('test artifact').digest('hex');
  // Test the publication boundary independently of the host's checksum CLI.
  // The fixture accepts only the exact production invocation and returns the
  // real fixture digest; installer digest verification has separate coverage.
  const checksumFixture = `shasum() { test "$#" = 3 && test "$1" = -a && test "$2" = 256 && test "$3" = installer.dmg || return 1; printf '%s  %s\\n' '${digest}' "$3"; }\n`;
  for (const mode of ['0', '1']) {
    const result = spawnSync('bash', ['-c', 'set -eu\n' + checksumFixture + 'BUILD_ONLY=' + mode + '\nLOCAL_HEAD=test\nMAC_ASSETS=(installer.dmg)\n'
      + script.slice(begin, end) + '\necho PUBLICATION_SENTINEL'], { cwd: temp, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.includes('PUBLICATION_SENTINEL'), mode === '0');
    if (mode === '1') assert.match(result.stdout, /[a-f0-9]{64}.*installer\.dmg/);
  }
});
