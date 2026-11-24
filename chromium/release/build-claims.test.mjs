import assert from 'node:assert/strict';
import {execFile, execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {promisify} from 'node:util';
import {claimExact, claimProblem, claimsAtTip, ClaimTaken, nextBuild} from './build-claims.mjs';
import {ReleaseCheckError} from './policy.mjs';

const file = 'chromium/release/build-reservations.json';
const branch = 'chromium/next';
const ref = 'refs/heads/' + branch;
const sequence = entries => ({schema: 1, sequences: {'desktop-158': entries}});
const entry = (build, sourceCommit, platforms = ['linux'], purpose = 'release') => ({build, sourceCommit, platforms, purpose});

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-claims-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  const remote = path.join(dir, 'remote.git'), root = path.join(dir, 'checkout');
  fs.mkdirSync(root);
  const git = (...args) => execFileSync('git', args, {cwd: root, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe']}).trim();
  git('init', '--bare', remote);
  git('init', '-b', branch);
  git('config', 'user.name', 'Build Claims Test');
  git('config', 'user.email', 'builds@example.invalid');
  git('config', 'commit.gpgSign', 'false');
  const hooks = path.join(dir, 'hooks');
  fs.mkdirSync(hooks);
  git('config', 'core.hooksPath', hooks);
  fs.mkdirSync(path.join(root, path.dirname(file)), {recursive: true});
  for (const platform of ['windows', 'linux']) {
    fs.writeFileSync(path.join(root, 'chromium/release', platform + '-ledger.json'), JSON.stringify({schema: 1, builds: []}));
  }
  git('add', 'chromium/release');
  git('commit', '--allow-empty', '-m', 'First source');
  const first = git('rev-parse', 'HEAD');
  git('commit', '--allow-empty', '-m', 'Second source');
  const source = git('rev-parse', 'HEAD');
  git('push', remote, ref);
  const tip = () => git('--git-dir', remote, 'rev-parse', ref);
  return {dir, root, remote, git, first, source, hooks, tip, options: {root, remote, branch, git: 'git'}};
}

test('next desktop number exceeds both platform ledgers and all claims', () => {
  const claims = sequence([entry(904, 'a'.repeat(40)), entry(908, 'b'.repeat(40), ['linux'], 'proof')]);
  assert.equal(nextBuild({ledgers: [[900, 906], [903]], claims}), 909);
  assert.equal(nextBuild({ledgers: [[912, 904], [903]], claims}), 913);
  assert.equal(nextBuild({ledgers: [[], [911]], claims: null}), 912);
  assert.equal(nextBuild({ledgers: [[], []], claims: null}), 1);
});

test('release eligibility uses the first matching platform claim and only its predecessors', () => {
  const sourceCommit = 'a'.repeat(40);
  const shared = entry(906, sourceCommit, ['windows', 'linux']);
  const higher = entry(907, sourceCommit);
  const other = entry(906, 'b'.repeat(40));
  for (const platform of shared.platforms) {
    const release = {build: 906, sourceCommit, platform};
    assert.equal(claimProblem(sequence([shared, higher, other]), release), null);
    assert.match(claimProblem(sequence([higher, shared]), release), /earlier claim holds a higher build/);
    assert.match(claimProblem(sequence([other, shared]), release), /earlier claim holds this build number for other source/);
    assert.equal(claimProblem(null, release), 'no claim names this build, its source commit and ' + platform);
  }
});

test('the first claim creates only the claims file and leaves the caller index and checkout alone', t => {
  const f = fixture(t);
  assert.equal(claimsAtTip(f.options), null);
  fs.writeFileSync(path.join(f.root, 'local'), 'local change');
  f.git('add', 'local');
  const row = entry(905, f.source, ['windows', 'linux']);
  const result = claimExact(row, f.options);
  assert.deepEqual(result, {commit: f.tip(), created: true});
  assert.equal(f.git('diff', '--name-only', f.source, result.commit), file);
  assert.equal(f.git('rev-parse', 'HEAD'), f.source);
  assert.equal(f.git('diff', '--cached', '--name-only'), 'local');
  assert.equal(fs.existsSync(path.join(f.root, file)), false);
  assert.deepEqual(claimsAtTip(f.options), sequence([row]));
  assert.deepEqual(claimExact({...row, platforms: ['linux', 'windows']}, f.options), {...result, created: false});
  assert.equal(f.tip(), result.commit);
  assert.throws(() => claimExact(entry(906, f.source, ['mac']), f.options), /platform/);
  assert.throws(() => claimExact(entry('2.0.0-beta.906', f.source), f.options), /build/);
  assert.equal(f.tip(), result.commit);
});

test('a second platform may claim the same source and number, and later claims do not strand an identical retry', t => {
  const f = fixture(t);
  const proof = entry(905, f.source, ['linux'], 'proof');
  const windows = entry(905, f.source, ['windows']);
  const later = entry(906, f.source);
  for (const row of [proof, windows, later]) assert.equal(claimExact(row, f.options).created, true);
  const before = f.tip();
  assert.equal(claimExact(proof, f.options).created, false);
  assert.throws(() => claimExact(entry(904, f.source), f.options), ClaimTaken);
  assert.throws(() => claimExact(entry(905, f.first), f.options), ClaimTaken);
  assert.equal(f.tip(), before);
  assert.deepEqual(claimsAtTip(f.options), sequence([proof, windows, later]));
});

test('two claimers racing to push the same build for different source have exactly one winner', async t => {
  const f = fixture(t);
  // Both processes must reach their first push before either can publish.
  fs.writeFileSync(path.join(f.hooks, 'pre-push'), [
    '#!/bin/sh', 'set -eu', 'touch "$CLAIM_BARRIER/$CLAIMER"',
    'i=0', 'until test -f "$CLAIM_BARRIER/0" && test -f "$CLAIM_BARRIER/1"; do',
    '  i=$((i + 1)); test "$i" -lt 200 || exit 1; sleep 0.05', 'done', ''
  ].join('\n'), {mode: 0o755});
  const script = [
    'const {claimExact, ClaimTaken} = await import(process.argv[1]);',
    'try {console.log(JSON.stringify(claimExact(JSON.parse(process.argv[2]), JSON.parse(process.argv[3]))))}',
    'catch (e) {if (!(e instanceof ClaimTaken)) throw e; console.log(JSON.stringify({taken:true}))}'
  ].join('\n');
  const claim = async (source, i) => {
    const {stdout} = await promisify(execFile)(process.execPath, ['--input-type=module', '-e', script,
      new URL('./build-claims.mjs', import.meta.url).href, JSON.stringify(entry(905, source)), JSON.stringify(f.options)],
    {env: {...process.env, CLAIM_BARRIER: f.dir, CLAIMER: String(i)}});
    return JSON.parse(stdout);
  };
  const results = await Promise.all([claim(f.first, 0), claim(f.source, 1)]);
  assert.equal(results.filter(r => r.taken).length, 1);
  assert.deepEqual(results.find(r => r.created), {commit: f.tip(), created: true});
  assert.equal(claimsAtTip(f.options).sequences['desktop-158'].length, 1);
});

test('a push rejected by an unrelated commit is reapplied on its tip without changing the number', t => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.root, 'unrelated'), 'another author');
  f.git('add', 'unrelated');
  f.git('commit', '-m', 'An unrelated change');
  f.git('push', f.remote, 'HEAD:refs/heads/unrelated');
  const unrelated = f.git('rev-parse', 'HEAD');
  fs.writeFileSync(path.join(f.hooks, 'pre-push'), [
    '#!/bin/sh', 'set -eu', 'git --git-dir="$2" update-ref refs/heads/chromium/next ' + unrelated, ''
  ].join('\n'), {mode: 0o755});
  const row = entry(905, f.source);
  const {commit, created} = claimExact(row, f.options);
  assert.equal(created, true);
  assert.equal(f.tip(), commit);
  assert.equal(f.git('rev-parse', commit + '^'), unrelated);
  assert.equal(f.git('diff', '--name-only', unrelated, commit), file);
  assert.deepEqual(claimsAtTip(f.options), sequence([row]));
});

for (const platform of ['windows', 'linux']) {
  test('new claims respect the fetched ' + platform + ' ledger, including after a rejected push', t => {
    const f = fixture(t);
    const row = entry(905, f.source);
    const ledger = 'chromium/release/' + platform + '-ledger.json';
    fs.writeFileSync(path.join(f.root, ledger), JSON.stringify({schema: 1, builds: [{build: 905, sourceCommit: f.first}]}));
    f.git('add', ledger);
    f.git('commit', '-m', 'Release build 905');
    const released = f.git('rev-parse', 'HEAD');
    f.git('push', f.remote, 'HEAD:refs/heads/release-fixture');
    f.git('checkout', '--quiet', '--detach', f.source);
    fs.writeFileSync(path.join(f.hooks, 'pre-push'),
      '#!/bin/sh\ngit --git-dir="$2" update-ref refs/heads/chromium/next ' + released + '\n', {mode: 0o755});
    assert.throws(() => claimExact(row, f.options), ClaimTaken, 'reread the ledger on retry');
    fs.unlinkSync(path.join(f.hooks, 'pre-push'));
    assert.throws(() => claimExact(row, f.options), ClaimTaken, 'conflicting published build');
    assert.throws(() => claimExact(entry(904, f.first), f.options), ClaimTaken, 'below a published build');
    assert.equal(f.tip(), released);
    assert.equal(claimsAtTip(f.options), null);
    const otherPlatform = platform === 'windows' ? 'linux' : 'windows';
    assert.equal(claimExact(entry(905, f.first, [otherPlatform]), f.options).created, true, 'the same source may share a number');
  });
}

test('resuming an identical reservation survives a subsequently published higher build', t => {
  const f = fixture(t);
  const row = entry(905, f.first);
  const claim = claimExact(row, f.options);
  f.git('fetch', f.remote, ref);
  f.git('merge', '--ff-only', claim.commit);
  const ledger = 'chromium/release/windows-ledger.json';
  fs.writeFileSync(path.join(f.root, ledger), JSON.stringify({schema: 1, builds: [{build: 906, sourceCommit: f.source}]}));
  f.git('add', ledger);
  f.git('commit', '-m', 'Later Windows release');
  f.git('push', f.remote, ref);
  const before = f.tip();
  assert.deepEqual(claimExact(row, f.options), {commit: before, created: false});
  assert.equal(f.tip(), before);
});

test('invalid remote claims and a rejected push with an unchanged tip fail closed', t => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.hooks, 'pre-push'), '#!/bin/sh\nexit 1\n', {mode: 0o755});
  assert.throws(() => claimExact(entry(905, f.source), f.options), /push/);
  assert.equal(f.tip(), f.source);
  fs.mkdirSync(path.join(f.root, path.dirname(file)), {recursive: true});
  fs.writeFileSync(path.join(f.root, file), '{}');
  f.git('add', file);
  f.git('commit', '-m', 'Malformed claim file');
  f.git('push', '--no-verify', f.remote, ref);
  const before = f.tip();
  assert.throws(() => claimsAtTip(f.options), /claim/);
  assert.throws(() => claimExact(entry(906, f.source), f.options), /claim/);
  assert.equal(before, f.tip());
});

test('an interrupted git push stops the claim instead of reporting success', t => {
  const f = fixture(t);
  // The push reaches the remote, then git dies from SIGINT (Ctrl-C reaching
  // the process group) before it can exit normally.
  const wrapper = path.join(f.dir, 'git-interrupted-push');
  fs.writeFileSync(wrapper, '#!/bin/sh\ngit "$@"; rc=$?\nfor a in "$@"; do [ "$a" = push ] && kill -INT $$; done\nexit $rc\n', {mode: 0o755});
  const claim = {build: 905, sourceCommit: f.source, platforms: ['windows'], purpose: 'release'};
  assert.throws(() => claimExact(claim, {...f.options, git: wrapper}), err => err instanceof ReleaseCheckError && /interrupted/.test(err.message));
  // The claim landed, so the next run finds it and does nothing.
  assert.deepEqual(claimExact(claim, f.options), {commit: f.tip(), created: false});
});

test('an interrupted git fetch stops before any claim is pushed', t => {
  const f = fixture(t);
  const wrapper = path.join(f.dir, 'git-interrupted-fetch');
  fs.writeFileSync(wrapper, '#!/bin/sh\nfor a in "$@"; do [ "$a" = fetch ] && kill -INT $$; done\nexec git "$@"\n', {mode: 0o755});
  const before = f.tip();
  assert.throws(() => claimExact({build: 905, sourceCommit: f.source, platforms: ['linux'], purpose: 'release'}, {...f.options, git: wrapper}),
    err => err instanceof ReleaseCheckError && /interrupted/.test(err.message));
  assert.equal(f.tip(), before);
});
