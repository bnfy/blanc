'use strict';

// GitHub-hosted runners' default apt mirror, azure.archive.ubuntu.com, failed
// to resolve on November 11, 2026, so every workflow step that installs
// packages points apt elsewhere first: through scripts/ci-apt-mirror.sh where
// the job checks out the workflow commit, inline where it may check out an
// older ref (the release workflow, the hosted published-asset smoke).
// ecs-release-pipeline.test.js also guards the release path.

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

test('no workflow step installs apt packages before leaving the default mirror', () => {
  const dir = path.join(ROOT, '.github', 'workflows');
  const files = fs.readdirSync(dir).filter(name => /\.ya?ml$/.test(name));
  let checked = 0;
  for (const name of files) {
    const steps = read('.github', 'workflows', name).split(/\n(?=\s+- (?:name|uses|run|id):)/);
    for (const step of steps) {
      const apt = step.search(/apt-get (?:update|install)|apt install|--with-deps/);
      if (apt < 0) continue;
      checked += 1;
      const script = step.indexOf('ci-apt-mirror.sh');
      const inline = step.indexOf("printf '%s\\n' http://mirrors.edge.kernel.org/ubuntu/ | sudo tee /etc/apt/apt-mirrors.txt");
      const mirror = [script, inline].filter(index => index >= 0);
      assert.ok(mirror.length && Math.min(...mirror) < apt, `${name}: mirror switch must come first in:\n${step}`);
      assert.doesNotMatch(step, /archive\.ubuntu\.com\/ubuntu\/ \|/, `${name}: kernel.org alone, no archive.ubuntu.com fallback`);
      if (inline >= 0) assert.match(step, /azure\.archive\.ubuntu\.com is still configured/, `${name}: inline switch must refuse a leftover Azure host`);
    }
  }
  assert.ok(checked >= 10, `found only ${checked} apt steps; the step splitter may have broken`);
});
