'use strict';

// scripts/ci-fork-only-push.sh lets desktop and iOS jobs skip a pull-request
// push that changes only the Chromium fork. It must answer true for exactly
// that and fail closed for everything else; the workflows that use it must
// keep the skip a job-level `if:` that a failed classification never triggers.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..');
const SCRIPT = path.join(ROOT, 'scripts', 'ci-fork-only-push.sh');

function repo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-fork-only-'));
  const git = (...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd: dir, encoding: 'utf8' }).trim();
  git('init', '-q');
  git('remote', 'add', 'origin', dir);
  const commit = (file, text) => {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), text);
    git('add', '-A');
    git('commit', '-qm', file);
    return git('rev-parse', 'HEAD');
  };
  return { dir, git, commit };
}

// A stand-in for `gh api`: prints PREVIOUS (the previous head's run
// conclusion) or fails with GH_FAIL, and records its arguments in GH_LOG.
const GH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-fork-only-gh-')), 'gh');
fs.writeFileSync(GH, '#!/bin/sh\nprintf "%s\\n" "$*" >> "$GH_LOG"\n[ -z "$GH_FAIL" ] || exit 1\nprintf "%s\\n" "$PREVIOUS"\n', { mode: 0o755 });
const RUN = {
  GITHUB_REPOSITORY: 'bnfy/blanc',
  GITHUB_WORKFLOW_REF: 'bnfy/blanc/.github/workflows/parity-guards.yml@refs/pull/1/merge',
  GH,
  PREVIOUS: 'success',
  GH_FAIL: '',
};

function classify(dir, env) {
  const log = path.join(dir, '.gh-log');
  return execFileSync('sh', [SCRIPT], { cwd: dir, encoding: 'utf8', env: { ...process.env, ...RUN, GH_LOG: log, ...env }, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

test('only a pull-request push confined to the fork skips', () => {
  const { dir, commit } = repo();
  const base = commit('src/main/main.js', 'a');
  const fork = commit('chromium/blanc/x.cc', 'b');
  const spaced = commit('experiments/chromium-extension-spike/a b/notes é.md', 'c');
  const docs = commit('docs/chromium-replacement/plan.md', 'd');
  const app = commit('src/main/main.js', 'e');
  const push = (before, after, action = 'synchronize') =>
    classify(dir, { EVENT_NAME: 'pull_request', EVENT_ACTION: action, BEFORE: before, AFTER: after });
  assert.equal(push(base, fork), 'true');
  assert.equal(push(base, docs), 'true', 'fork, experiment folder (spaces, non-ASCII) and docs');
  assert.equal(push(fork, spaced), 'true');
  assert.equal(push(docs, app), 'false', 'an app file changed');
  assert.equal(push(base, app), 'false');
  assert.equal(push(fork, base), 'false', 'not a fast-forward (force push)');
  assert.equal(push(base, fork, 'opened'), 'false', 'a new PR runs everything');
  assert.equal(push('0000000000000000000000000000000000000000', fork), 'false');
  assert.equal(push('', fork), 'false');
  assert.equal(push('deadbeef'.repeat(5), fork), 'false', 'a commit that cannot be fetched');
  assert.equal(classify(dir, { EVENT_NAME: 'push', EVENT_ACTION: '', BEFORE: base, AFTER: fork }), 'false');
  assert.equal(push(fork, fork), 'false', 'no change at all');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('the previous head\'s run of this workflow must have succeeded', () => {
  const { dir, commit } = repo();
  const base = commit('src/main/main.js', 'a');
  const fork = commit('chromium/blanc/x.cc', 'b');
  const push = (env) => classify(dir, { EVENT_NAME: 'pull_request', EVENT_ACTION: 'synchronize', BEFORE: base, AFTER: fork, ...env });
  assert.equal(push({}), 'true');
  const asked = fs.readFileSync(path.join(dir, '.gh-log'), 'utf8').trim().split('\n').at(-1);
  assert.match(asked, new RegExp(`^api repos/bnfy/blanc/actions/workflows/parity-guards\\.yml/runs\\?head_sha=${base}&event=pull_request&per_page=1 --jq `));
  // bnfy/blanc#1542: newer pushes cancelled the runs that would have run the
  // desktop jobs, and a fork-only push then skipped them.
  assert.equal(push({ PREVIOUS: 'cancelled' }), 'false', 'a cancelled run ran nothing');
  assert.equal(push({ PREVIOUS: 'failure' }), 'false');
  assert.equal(push({ PREVIOUS: 'skipped' }), 'false');
  assert.equal(push({ PREVIOUS: '' }), 'false', 'still running, or no run for that head');
  assert.equal(push({ GH_FAIL: '1' }), 'false', 'the API could not be read');
  assert.equal(push({ GITHUB_REPOSITORY: '' }), 'false');
  assert.equal(push({ GITHUB_WORKFLOW_REF: '' }), 'false');
  assert.equal(push({ GITHUB_WORKFLOW_REF: 'bnfy/blanc/scripts/x.sh@refs/pull/1/merge' }), 'false', 'not a workflow file');
  assert.equal(push({ GITHUB_WORKFLOW_REF: 'bnfy/blanc/.github/workflows/ios.yml@refs/pull/1/merge' }), 'true');
  assert.match(fs.readFileSync(path.join(dir, '.gh-log'), 'utf8').trim().split('\n').at(-1), /actions\/workflows\/ios\.yml\/runs/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('a shallow checkout like CI\'s still sees the push\'s history', () => {
  // GitHub checks out the PR's merge commit two levels deep: the head commit
  // is present, but its parents are cut off.
  const { dir, git, commit } = repo();
  const base = commit('src/main/main.js', 'a');
  git('checkout', '-q', '-b', 'pr');
  commit('chromium/zero.cc', 'z');
  const before = commit('chromium/one.cc', 'b');
  const after = commit('chromium/two.cc', 'c');
  git('checkout', '-q', '--detach', base);
  commit('README.md', 'main moved on');
  git('merge', '-q', '--no-ff', '-m', 'merge', 'pr');
  git('branch', 'merge-ref');
  const shallow = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-fork-only-shallow-'));
  execFileSync('git', ['clone', '-q', '--depth', '2', '--branch', 'merge-ref', `file://${dir}`, shallow]);
  const push = (b, a) => classify(shallow, { EVENT_NAME: 'pull_request', EVENT_ACTION: 'synchronize', BEFORE: b, AFTER: a });
  assert.equal(push(before, after), 'true');
  assert.equal(push(after, before), 'false', 'not a fast-forward');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(shallow, { recursive: true, force: true });
});

test('the desktop and iOS workflows skip only on a "true" answer', () => {
  const read = (name) => fs.readFileSync(path.join(ROOT, '.github', 'workflows', name), 'utf8');
  for (const name of ['ios.yml', 'ublock-origin.yml']) {
    const text = read(name);
    assert.match(text, /\n  fork-only:\n/, `${name} classifies the push`);
    assert.match(text, /run: echo "skip=\$\(sh scripts\/ci-fork-only-push\.sh\)" >> "\$GITHUB_OUTPUT"/);
    const gated = text.split('\n    needs: fork-only\n').length - 1;
    assert.ok(gated >= 1, `${name} gates its jobs`);
    assert.equal(text.split("needs.fork-only.outputs.skip != 'true'").length - 1, gated,
      `${name}: every gated job runs unless the answer is exactly true`);
    assert.equal(text.split("!cancelled() && needs.fork-only.outputs.skip").length - 1, gated);
    const job = text.slice(text.indexOf('\n  fork-only:\n'), text.indexOf('\n    needs: fork-only\n'));
    assert.match(job, /\n    permissions:\n      contents: read\n      actions: read\n/, `${name}: the classifier may read runs`);
    assert.match(job, /\n          GH_TOKEN: \$\{\{ github\.token \}\}\n/);
  }
  const parity = read('parity-guards.yml');
  assert.match(parity, /if \[ "\$\(sh scripts\/ci-fork-only-push\.sh\)" = true \]; then\n(?:.*\n){0,3}\s+app=false/);
  const changes = parity.slice(parity.indexOf('\n  changes:\n'), parity.indexOf('\n  substrate:\n'));
  assert.match(changes, /\n    permissions:\n      contents: read\n      actions: read\n/);
  assert.match(changes, /\n          GH_TOKEN: \$\{\{ github\.token \}\}\n/);
});
