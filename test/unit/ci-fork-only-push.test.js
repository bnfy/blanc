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

function classify(dir, env) {
  return execFileSync('sh', [SCRIPT], { cwd: dir, encoding: 'utf8', env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
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
  }
  const parity = read('parity-guards.yml');
  assert.match(parity, /if \[ "\$\(sh scripts\/ci-fork-only-push\.sh\)" = true \]; then\n(?:.*\n){0,3}\s+app=false/);
});
