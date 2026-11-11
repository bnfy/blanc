'use strict';

// GitHub-hosted runners' default apt mirror, azure.archive.ubuntu.com, failed
// to resolve on November 11, 2026, so every parity-guards job that installs
// packages points apt elsewhere first (scripts/ci-apt-mirror.sh). The release
// workflow does the same inline; ecs-release-pipeline.test.js guards that.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const read = (...parts) => fs.readFileSync(path.join(ROOT, ...parts), 'utf8');

test('every apt-get update in parity-guards runs after the mirror switch, in the same step', () => {
  const workflow = read('.github', 'workflows', 'parity-guards.yml');
  const steps = workflow.split(/\n(?=\s+- (?:name|uses|run):)/);
  const apt = steps.filter(step => step.includes('apt-get update'));
  assert.ok(apt.length >= 2, 'shared-spaces and browser-shortcuts install packages');
  for (const step of apt) {
    const mirror = step.indexOf('bash scripts/ci-apt-mirror.sh');
    assert.ok(mirror >= 0 && mirror < step.indexOf('apt-get update'), `mirror first in:\n${step}`);
  }
});

test('the mirror script leaves azure.archive.ubuntu.com and refuses to run off a CI runner', () => {
  const script = read('scripts', 'ci-apt-mirror.sh');
  assert.match(script, /^set -euo pipefail$/m);
  assert.match(script, /GITHUB_ACTIONS:-\} != true \|\| \$\{RUNNER_OS:-\} != Linux/);
  assert.ok(script.includes("printf '%s\\n' http://mirrors.edge.kernel.org/ubuntu/"), 'the kernel.org mirror comes first');
  assert.match(script, /azure\.archive\.ubuntu\.com is still configured/);
  assert.doesNotMatch(script, /apt-get/, 'the step itself runs apt, after the script');
});
