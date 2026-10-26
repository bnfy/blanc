'use strict';
// The optional self-hosted Mac (docs/ci-self-hosted-macos-runner.md) runs pull
// request code from this repository on a machine the owner controls, so every
// job that can land on it must refuse fork pull requests, and the GitHub-hosted
// Intel, iOS and release jobs must never move to it.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const workflows = path.join(__dirname, '..', '..', '.github', 'workflows');
const read = (name) => fs.readFileSync(path.join(workflows, name), 'utf8');
const FORK_GUARD = "(github.event_name != 'pull_request' || github.event.pull_request.head.repo.full_name == github.repository)";

test('every runs-on that can pick the self-hosted Mac also refuses forks', () => {
  let uses = 0;
  for (const name of fs.readdirSync(workflows).filter((f) => f.endsWith('.yml'))) {
    for (const line of read(name).split('\n')) {
      if (!/^\s*runs-on:/.test(line) || !line.includes('MAC_RUNNER_LABELS')) continue;
      uses += 1;
      assert.ok(line.includes(FORK_GUARD), `${name}: ${line.trim()}`);
      assert.ok(line.includes("vars.MAC_RUNNER_LABELS != ''"), `${name}: falls back to the hosted runner when unset`);
    }
  }
  assert.equal(uses, 5, 'unit, three parity-guards desktop jobs and the uBO desktop job');
});

test('Intel, iOS and the release workflows stay on GitHub-hosted runners', () => {
  for (const name of ['ios.yml', 'release-windows-linux.yml', 'prerelease-smoke.yml', 'nightly-desktop.yml']) {
    assert.ok(!read(name).includes('MAC_RUNNER_LABELS'), name);
  }
  const ublock = read('ublock-origin.yml');
  // Only the Apple Silicon leg is ever redirected.
  assert.match(ublock, /runs-on: \$\{\{ \(matrix\.os == 'macos-15' && vars\.MAC_RUNNER_LABELS/);
  assert.doesNotMatch(ublock, /matrix\.os == 'macos-15-intel' && vars\.MAC_RUNNER_LABELS/);
});

test('the parity macOS legs stay nightly even with the self-hosted Mac', () => {
  // On every pull request they queued three more jobs per PR for the Mac's two
  // VM slots (October 26, 2026); unit (macos-15) and uBO's desktop leg stay.
  const matrices = read('parity-guards.yml').split('\n').filter((line) => /^\s*os: \$\{\{ fromJSON\(/.test(line));
  assert.equal(matrices.length, 3);
  for (const line of matrices) {
    assert.ok(line.includes("github.event_name == 'schedule' || github.event_name == 'workflow_dispatch'"), line.trim());
    assert.ok(!line.includes('MAC_RUNNER_LABELS'), line.trim());
  }
});
