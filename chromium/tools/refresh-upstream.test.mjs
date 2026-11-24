// refresh-upstream.py moves a lane's pinned Chromium inputs to a new checkout (the rebase drill,
// docs/android/rebase.md): the pristine files and their hashes, the pins, and the patched hashes
// check-patches.py verifies. It writes nothing when a pinned file is missing from the checkout.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync, spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const TOOL = fileURLToPath(new URL('refresh-upstream.py', import.meta.url));
const sha = text => crypto.createHash('sha256').update(text).digest('hex');
const OLD = 'a'.repeat(40);

// A chromium/ folder with one Android lane over two pinned files and one patch, and a new checkout.
function fixture(t, {newFiles = {'chrome/a.txt': 'alpha 2\n', 'chrome/b.txt': 'beta 2\n'}, patch} = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'refresh-upstream-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  const root = path.join(dir, 'chromium'), src = path.join(dir, 'src');
  const write = (base, name, text) => { const p = path.join(base, name); fs.mkdirSync(path.dirname(p), {recursive: true}); fs.writeFileSync(p, text); };
  const old = {'chrome/a.txt': 'alpha 1\n', 'chrome/b.txt': 'beta 1\n'};
  for (const [name, text] of Object.entries(old)) write(root, `upstream-android/${name}`, text);
  const files = Object.fromEntries(Object.entries(old).map(([n, t]) => [n, sha(t)]));
  write(root, 'upstream-android/manifest.json', JSON.stringify({upstream: OLD, version: '156.0.1.1', files}));
  write(root, 'patches/android/0101-x.patch', patch ?? [
    'diff --git a/chrome/b.txt b/chrome/b.txt', '--- a/chrome/b.txt', '+++ b/chrome/b.txt',
    '@@ -1 +1,2 @@', ' beta 2', '+blanc', ''].join('\n'));
  write(root, 'lanes/android.json', JSON.stringify({lane: 'android', channel: 'stable', version: '156.0.1.1', upstream: OLD,
    upstreamDir: 'upstream-android', sourceMap: 'source-map-android.json', fileCount: 2, patches: ['patches/android/0101-x.patch']}));
  write(root, 'source-map-android.json', JSON.stringify({upstream: OLD, selection: 'fixture', upstreamFiles: {'chrome/a.txt': sha('alpha 1\n'), 'chrome/b.txt': sha('beta 1\nblanc\n')}}));
  for (const [name, text] of Object.entries(newFiles)) write(src, name, text);
  write(src, 'chrome/VERSION', 'MAJOR=157\nMINOR=0\nBUILD=2\nPATCH=3\n');
  execFileSync('git', ['init', '-q', src]);
  execFileSync('git', ['-C', src, 'add', '-A']);
  execFileSync('git', ['-C', src, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', 'new']);
  const head = execFileSync('git', ['-C', src, 'rev-parse', 'HEAD'], {encoding: 'utf8'}).trim();
  const read = name => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));
  const run = (...args) => spawnSync('python3', [TOOL, '--lane', 'android', '--root', root, ...args], {encoding: 'utf8'});
  return {root, src, head, read, run};
}

test('a refresh moves the pristine files, their hashes, every pin and the patched hashes to the checkout', t => {
  const f = fixture(t);
  const r = f.run('--src', f.src, '--version', '157.0.2.3');
  assert.equal(r.status, 0, r.stderr);
  const manifest = f.read('upstream-android/manifest.json'), lane = f.read('lanes/android.json'), map = f.read('source-map-android.json');
  assert.deepEqual(manifest, {upstream: f.head, version: '157.0.2.3', files: {'chrome/a.txt': sha('alpha 2\n'), 'chrome/b.txt': sha('beta 2\n')}});
  assert.equal(fs.readFileSync(path.join(f.root, 'upstream-android/chrome/b.txt'), 'utf8'), 'beta 2\n');
  assert.equal(lane.version, '157.0.2.3'); assert.equal(lane.upstream, f.head); assert.equal(map.upstream, f.head);
  assert.deepEqual(map.upstreamFiles, {'chrome/a.txt': sha('alpha 2\n'), 'chrome/b.txt': sha('beta 2\nblanc\n')});
  assert.equal(map.selection, 'fixture');
});

test('a pinned file missing from the checkout is named, and nothing is written', t => {
  const f = fixture(t, {newFiles: {'chrome/a.txt': 'alpha 2\n'}});
  const before = ['upstream-android/manifest.json', 'lanes/android.json', 'source-map-android.json'].map(f.read);
  const r = f.run('--src', f.src, '--version', '157.0.2.3');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /chrome\/b\.txt/);
  assert.deepEqual(['upstream-android/manifest.json', 'lanes/android.json', 'source-map-android.json'].map(f.read), before);
  assert.equal(fs.readFileSync(path.join(f.root, 'upstream-android/chrome/a.txt'), 'utf8'), 'alpha 1\n');
});

test('a patch that no longer applies is named; the pins move, the patched hashes wait for the rebased patch', t => {
  const f = fixture(t, {newFiles: {'chrome/a.txt': 'alpha 2\n', 'chrome/b.txt': 'something else\n'}});
  const r = f.run('--src', f.src, '--version', '157.0.2.3');
  assert.equal(r.status, 3);
  assert.match(r.stderr, /0101-x\.patch/);
  assert.equal(f.read('lanes/android.json').upstream, f.head);
  assert.equal(f.read('source-map-android.json').upstreamFiles['chrome/b.txt'], sha('beta 1\nblanc\n'));
});

test('--patched-only recomputes the patched hashes once the patch is rebased', t => {
  const f = fixture(t, {newFiles: {'chrome/a.txt': 'alpha 2\n', 'chrome/b.txt': 'something else\n'}});
  assert.equal(f.run('--src', f.src, '--version', '157.0.2.3').status, 3);
  fs.writeFileSync(path.join(f.root, 'patches/android/0101-x.patch'), [
    'diff --git a/chrome/b.txt b/chrome/b.txt', '--- a/chrome/b.txt', '+++ b/chrome/b.txt',
    '@@ -1 +1,2 @@', ' something else', '+blanc',
    '--- /dev/null', '+++ b/chrome/new.txt', '@@ -0,0 +1 @@', '+new file', ''].join('\n'));
  const r = f.run('--patched-only');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(f.read('source-map-android.json').upstreamFiles['chrome/b.txt'], sha('something else\nblanc\n'));
  assert.equal(f.read('source-map-android.json').upstreamFiles['chrome/new.txt'], sha('new file\n'));
});

test('a version that is not four numbers is refused before anything is read', t => {
  const f = fixture(t);
  assert.equal(f.run('--src', f.src, '--version', '157').status, 2);
});

test('a version that is not the checkout\'s own chrome/VERSION is refused, and nothing is written', t => {
  const f = fixture(t);
  const before = f.read('lanes/android.json');
  const r = f.run('--src', f.src, '--version', '157.0.2.4');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /157\.0\.2\.3/);
  assert.deepEqual(f.read('lanes/android.json'), before);
});

// A copy of just the pinned files, as fetched from gitiles at one commit: no .git.
function plainCopy(t, f) {
  const copy = fs.mkdtempSync(path.join(os.tmpdir(), 'refresh-upstream-copy-'));
  t.after(() => fs.rmSync(copy, {recursive: true, force: true}));
  fs.cpSync(f.src, copy, {recursive: true, filter: s => path.basename(s) !== '.git'});
  return copy;
}

test('a copy that is not a git checkout pins the commit named by --upstream', t => {
  const f = fixture(t);
  const commit = 'b'.repeat(40);
  const r = f.run('--src', plainCopy(t, f), '--version', '157.0.2.3', '--upstream', commit);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(f.read('upstream-android/manifest.json').upstream, commit);
  assert.equal(f.read('lanes/android.json').upstream, commit);
  assert.equal(f.read('source-map-android.json').upstream, commit);
});

test('a copy that is not a git checkout and has no --upstream is refused, and nothing is written', t => {
  const f = fixture(t);
  const before = f.read('lanes/android.json');
  const r = f.run('--src', plainCopy(t, f), '--version', '157.0.2.3');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /pass --upstream/);
  assert.deepEqual(f.read('lanes/android.json'), before);
});

test('--upstream that is not the checkout\'s HEAD is refused, and nothing is written', t => {
  const f = fixture(t);
  const before = f.read('lanes/android.json');
  const r = f.run('--src', f.src, '--version', '157.0.2.3', '--upstream', 'c'.repeat(40));
  assert.equal(r.status, 1);
  assert.match(r.stderr, /not the checkout's HEAD/);
  assert.deepEqual(f.read('lanes/android.json'), before);
  assert.equal(f.run('--src', f.src, '--version', '157.0.2.3', '--upstream', 'short').status, 2);
});
