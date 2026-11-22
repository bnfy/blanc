import assert from 'node:assert/strict';
import {execFile, execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {promisify} from 'node:util';
import {claimExact, claimProblem, claimsAtTip, ClaimTaken, nextBuild} from './build-claims.mjs';

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
