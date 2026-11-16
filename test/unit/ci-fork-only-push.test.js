'use strict';

// scripts/ci-fork-only-push.sh lets desktop and iOS jobs skip a pull-request
// push that changes only the Chromium fork since a head they passed on. It must answer true for exactly
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

// A stand-in for `gh api`: prints PASSED (the heads this workflow passed on,
// newest first) or fails with GH_FAIL, and records its arguments in GH_LOG.
const STUB = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-fork-only-gh-'));
test.after(() => fs.rmSync(STUB, { recursive: true, force: true }));
const GH = path.join(STUB, 'gh');
fs.writeFileSync(GH, '#!/bin/sh\nprintf "%s\\n" "$*" >> "$GH_LOG"\n[ -z "$GH_FAIL" ] || exit 1\nfor s in $PASSED; do printf "%s\\n" "$s"; done\n', { mode: 0o755 });
const RUN = {
  EVENT_NAME: 'pull_request',
  EVENT_ACTION: 'synchronize',
  HEAD_REF: 'claude/x',
  GITHUB_REPOSITORY: 'bnfy/blanc',
  GITHUB_WORKFLOW_REF: 'bnfy/blanc/.github/workflows/parity-guards.yml@refs/pull/1/merge',
  GH,
  GH_FAIL: '',
};

function classify(dir, env) {
  return execFileSync('sh', [SCRIPT], { cwd: dir, encoding: 'utf8', env: { ...process.env, ...RUN, GH_LOG: path.join(dir, '.gh-log'), ...env }, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}
const push = (dir, passed, after, env = {}) => classify(dir, { PASSED: passed.join(' '), AFTER: after, ...env });

test('only a push confined to the fork since a passing head skips', () => {
  const { dir, commit } = repo();
  const base = commit('src/main/main.js', 'a');
  const fork = commit('chromium/blanc/x.cc', 'b');
  const spaced = commit('experiments/chromium-extension-spike/a b/notes é.md', 'c');
  const docs = commit('docs/chromium-replacement/plan.md', 'd');
  const app = commit('src/main/main.js', 'e');
  assert.equal(push(dir, [base], fork), 'true');
  assert.equal(push(dir, [base], docs), 'true', 'fork, experiment folder (spaces, non-ASCII) and docs');
  assert.equal(push(dir, [fork], spaced), 'true');
  assert.equal(push(dir, [docs], app), 'false', 'an app file changed');
  assert.equal(push(dir, [base], app), 'false');
  assert.equal(push(dir, [fork], base), 'false', 'the passing head is not an ancestor (force push)');
  assert.equal(push(dir, [base], fork, { EVENT_ACTION: 'opened' }), 'false', 'a new PR runs everything');
  assert.equal(push(dir, [base], fork, { EVENT_NAME: 'push' }), 'false');
  assert.equal(push(dir, [], fork), 'false', 'no passing run yet');
  assert.equal(push(dir, ['deadbeef'.repeat(5)], fork), 'false', 'a head that is not in the history');
  assert.equal(push(dir, [fork], fork), 'false', 'only this head passed: no change since');
  assert.equal(push(dir, [base], fork, { HEAD_REF: '' }), 'false');
  assert.equal(push(dir, [base], '', {}), 'false');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('the trust starts from a head this workflow passed on, not the previous push', () => {
  const { dir, commit } = repo();
  const full = commit('src/main/main.js', 'a');
  const app = commit('src/main/main.js', 'b');
  const fork1 = commit('chromium/one.cc', 'c');
  const fork2 = commit('chromium/two.cc', 'd');
  // bnfy/blanc#1542: newer pushes cancelled the run on the app change, so the
  // newest passing head is older and the app change is still in the diff.
  assert.equal(push(dir, [full], fork2), 'false', 'a cancelled run on an app change is not trusted');
  // Fork-only pushes in quick succession (fork1's run cancelled) still skip.
  assert.equal(push(dir, [app, full], fork2), 'true');
  assert.equal(push(dir, [fork1, app], fork2), 'true', 'the newest passing ancestor wins');
  const asked = fs.readFileSync(path.join(dir, '.gh-log'), 'utf8').trim().split('\n').at(-1);
  assert.equal(asked, 'api -X GET repos/bnfy/blanc/actions/workflows/parity-guards.yml/runs -f event=pull_request -f status=success -f branch=claude/x -f per_page=30 --jq .workflow_runs[].head_sha');
  assert.equal(push(dir, [app], fork2, { GH_FAIL: '1' }), 'false', 'the API could not be read');
  assert.equal(push(dir, [app], fork2, { GITHUB_REPOSITORY: '' }), 'false');
  assert.equal(push(dir, [app], fork2, { GITHUB_WORKFLOW_REF: '' }), 'false');
  assert.equal(push(dir, [app], fork2, { GITHUB_WORKFLOW_REF: 'bnfy/blanc/scripts/x.sh@refs/pull/1/merge' }), 'false', 'not a workflow file');
  assert.equal(push(dir, [app], fork2, { GITHUB_WORKFLOW_REF: 'bnfy/blanc/.github/workflows/ios.yml@refs/pull/1/merge' }), 'true');
  assert.match(fs.readFileSync(path.join(dir, '.gh-log'), 'utf8').trim().split('\n').at(-1), /actions\/workflows\/ios\.yml\/runs /);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('a shallow checkout like CI\'s still sees the earlier heads', () => {
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
  assert.equal(push(shallow, [before], after), 'true');
  assert.equal(push(shallow, [after], before), 'false', 'not an ancestor');
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
    assert.match(job, /\n          HEAD_REF: \$\{\{ github\.head_ref \}\}\n/);
  }
  const parity = read('parity-guards.yml');
  assert.match(parity, /if \[ "\$\(sh scripts\/ci-fork-only-push\.sh\)" = true \]; then\n(?:.*\n){0,3}\s+app=false/);
  const changes = parity.slice(parity.indexOf('\n  changes:\n'), parity.indexOf('\n  substrate:\n'));
  assert.match(changes, /\n    permissions:\n      contents: read\n      actions: read\n/);
  assert.match(changes, /\n          GH_TOKEN: \$\{\{ github\.token \}\}\n/);
  assert.match(changes, /\n          HEAD_REF: \$\{\{ github\.head_ref \}\}\n/);
});
