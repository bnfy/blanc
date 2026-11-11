'use strict';

// GitHub-hosted runners' default apt mirror, azure.archive.ubuntu.com, failed
// to resolve on November 11, 2026, so every parity-guards job that installs
// packages points apt elsewhere first (scripts/ci-apt-mirror.sh), and so does
// the Site workflow's Playwright install. The release workflow does the same
// inline; ecs-release-pipeline.test.js guards that.

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

test('the Site workflow switches the mirror before Playwright installs its apt packages', () => {
  const workflow = read('.github', 'workflows', 'site.yml');
  const steps = workflow.split(/\n(?=\s+- (?:name|uses|run):)/);
  const deps = steps.filter(step => step.includes('--with-deps'));
  assert.equal(deps.length, 1, 'one Playwright install with system packages');
  const [step] = deps;
  const mirror = step.indexOf('bash scripts/ci-apt-mirror.sh');
  assert.ok(mirror >= 0 && mirror < step.indexOf('playwright install'), `mirror first in:\n${step}`);
  assert.match(step, /bash scripts\/ci-apt-mirror\.sh && npx playwright install --with-deps chromium/, 'a failed switch stops the step');
});

test('the mirror script leaves azure.archive.ubuntu.com and refuses to run off a CI runner', () => {
  const script = read('scripts', 'ci-apt-mirror.sh');
  assert.match(script, /^set -euo pipefail$/m);
  assert.match(script, /GITHUB_ACTIONS:-\} != true \|\| \$\{RUNNER_OS:-\} != Linux/);
  // The whole line, so kernel.org is the only mirror: a fallback such as
  // archive.ubuntu.com was tried first on every index and timed out.
  assert.match(script, /^\s*printf '%s\\n' http:\/\/mirrors\.edge\.kernel\.org\/ubuntu\/ \| sudo tee \/etc\/apt\/apt-mirrors\.txt >\/dev\/null$/m);
  assert.match(script, /azure\.archive\.ubuntu\.com is still configured/);
  assert.doesNotMatch(script, /apt-get/, 'the step itself runs apt, after the script');
});
