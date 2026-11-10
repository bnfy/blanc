// check-patches.py works per lane (lanes/<name>.json): desktop is unchanged,
// each lane verifies its own pinned inputs, and an unknown lane is refused.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const tree = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const check = (root, ...args) => spawnSync('python3', [path.join(root, 'tools/check-patches.py'), ...args], {encoding: 'utf8'});
const sha = text => crypto.createHash('sha256').update(text).digest('hex');

// A copy of the tree with a one-file Android lane whose only patch edits it.
function withAndroidLane(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-lanes-'));
  try {
    const root = path.join(dir, 'chromium');
    fs.cpSync(tree, root, {recursive: true, filter: src => !src.includes(`${path.sep}node_modules`)});
    const file = 'chrome/android/BUILD.gn', before = 'name = "chrome"\n', after = 'name = "blanc"\n';
    fs.mkdirSync(path.join(root, 'upstream-android/chrome/android'), {recursive: true});
    fs.writeFileSync(path.join(root, 'upstream-android', file), before);
    const upstream = 'a'.repeat(40);
    fs.writeFileSync(path.join(root, 'upstream-android/manifest.json'), JSON.stringify({upstream, files: {[file]: sha(before)}}));
    fs.writeFileSync(path.join(root, 'source-map-android.json'), JSON.stringify({upstream, upstreamFiles: {[file]: sha(after)}}));
    fs.mkdirSync(path.join(root, 'patches/android'), {recursive: true});
    fs.writeFileSync(path.join(root, 'patches/android/0101-test.patch'),
      `--- a/${file}\n+++ b/${file}\n@@ -1 +1 @@\n-${before}+${after}`);
    fs.writeFileSync(path.join(root, 'lanes/android.json'), JSON.stringify({lane: 'android', channel: 'stable', version: '1.0.0.0', upstream,
      upstreamDir: 'upstream-android', sourceMap: 'source-map-android.json', fileCount: 1, patches: ['patches/android/0101-test.patch']}));
    fn(root, file);
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
}

test('desktop lane reconstructs its pinned source set', () => {
  const plain = check(tree), desktop = check(tree, '--lane', 'desktop');
  assert.equal(plain.status, 0, plain.stderr);
  assert.equal(desktop.stdout, plain.stdout);
  assert.match(plain.stdout, /"upstreamFiles": 155/);
});

test('android lane verifies its own inputs', () => withAndroidLane((root, file) => {
  const good = check(root, '--lane', 'android');
  assert.equal(good.status, 0, good.stderr);
  assert.match(good.stdout, /"upstreamFiles": 1/);
  fs.appendFileSync(path.join(root, 'upstream-android', file), '#');
  const bad = check(root, '--lane', 'android');
  assert.notEqual(bad.status, 0);
  assert.match(bad.stderr, /Digest mismatch/);
  assert.equal(check(root, '--lane', 'desktop').status, 0, 'an android input never affects desktop');
}));

test('a lane whose pins disagree is refused', () => withAndroidLane(root => {
  const lane = JSON.parse(fs.readFileSync(path.join(root, 'lanes/android.json')));
  fs.writeFileSync(path.join(root, 'lanes/android.json'), JSON.stringify({...lane, upstream: 'b'.repeat(40)}));
  assert.match(check(root, '--lane', 'android').stderr, /Incorrect or incomplete pinned input set/);
}));

test('unknown lane is refused', () => {
  const result = check(tree, '--lane', 'ios');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Unknown lane 'ios'/);
});
