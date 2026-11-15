// apply.py brings a pinned Chromium checkout to the canonical source. A Blanc file the repository
// dropped or moved must leave the checkout too, or a clean build still sees it (a stale resource in a
// listed folder failed the first Android release build). It is removed only when its bytes are exactly
// what the previous source map put there, with a preimage in the backup.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync, spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const TOOLS = fileURLToPath(new URL('./', import.meta.url));
const sha = text => crypto.createHash('sha256').update(text).digest('hex');

// A chromium/ folder whose canonical source holds keep.txt only; the previous map also had gone.txt.
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-apply-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  // apply.py keeps backups outside the repository (the chromium/ folder's parent).
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-apply-backup-'));
  t.after(() => fs.rmSync(outside, {recursive: true, force: true}));
  const root = path.join(dir, 'repo/chromium'), src = path.join(dir, 'src'), backup = path.join(outside, 'backup');
  const write = (base, name, text) => { const p = path.join(base, name); fs.mkdirSync(path.dirname(p), {recursive: true}); fs.writeFileSync(p, text); };
  fs.mkdirSync(path.join(root, 'tools'), {recursive: true});
  for (const f of ['apply.py', 'lane.py']) fs.copyFileSync(path.join(TOOLS, f), path.join(root, 'tools', f));
  write(src, 'README', 'chromium\n');
  execFileSync('git', ['init', '-q', src]);
  execFileSync('git', ['-C', src, 'add', '-A']);
  execFileSync('git', ['-C', src, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', 'pin']);
  const head = execFileSync('git', ['-C', src, 'rev-parse', 'HEAD'], {encoding: 'utf8'}).trim();
  write(root, 'upstream-android/manifest.json', JSON.stringify({upstream: head, files: {}}));
  write(root, 'lanes/android.json', JSON.stringify({upstream: head, upstreamDir: 'upstream-android', sourceMap: 'source-map-android.json', fileCount: 0, patches: []}));
  write(root, 'source-map-android.json', JSON.stringify({upstream: head, upstreamFiles: {}}));
  write(root, 'blanc/keep.txt', 'keep\n');
  write(root, 'source-map.json', JSON.stringify({canonicalSha256: {'blanc/keep.txt': sha('keep\n')}}));
  const previous = path.join(dir, 'previous.json');
  fs.writeFileSync(previous, JSON.stringify({upstream: head, upstreamFiles: {}, canonicalSha256: {'blanc/keep.txt': sha('keep\n'), 'blanc/gone.txt': sha('gone\n'), 'blanc/old/res/moved.txt': sha('moved\n')}}));
  const run = () => spawnSync('python3', [path.join(root, 'tools/apply.py'), '--lane', 'android', '--src', src, '--previous-map', previous, '--apply', '--backup', backup], {encoding: 'utf8'});
  return {src, backup, write, run};
}

test('a file the previous map placed and the canonical source dropped is removed, with a preimage', t => {
  const f = fixture(t);
  f.write(f.src, 'blanc/gone.txt', 'gone\n');
  f.write(f.src, 'blanc/old/res/moved.txt', 'moved\n');
  const r = f.run();
  assert.equal(r.status, 0, r.stderr);
  assert.equal(fs.existsSync(path.join(f.src, 'blanc/gone.txt')), false);
  assert.equal(fs.readFileSync(path.join(f.src, 'blanc/keep.txt'), 'utf8'), 'keep\n');
  assert.equal(fs.existsSync(path.join(f.src, 'blanc/old')), false, 'the emptied folder goes too');
  assert.equal(fs.readFileSync(path.join(f.backup, 'preimages/blanc/gone.txt'), 'utf8'), 'gone\n');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(f.backup, 'journal.json'), 'utf8')).find(c => c.path === 'blanc/gone.txt'),
    {path: 'blanc/gone.txt', before: sha('gone\n'), after: null});
});

test('a dropped file that was edited in the checkout is refused, and nothing changes', t => {
  const f = fixture(t);
  f.write(f.src, 'blanc/gone.txt', 'edited\n');
  const r = f.run();
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /blanc\/gone\.txt/);
  assert.equal(fs.readFileSync(path.join(f.src, 'blanc/gone.txt'), 'utf8'), 'edited\n');
  assert.equal(fs.existsSync(path.join(f.src, 'blanc/keep.txt')), false);
});

test('a dropped file already absent needs no change', t => {
  const f = fixture(t);
  const r = f.run();
  assert.equal(r.status, 0, r.stderr);
  assert.equal(fs.existsSync(path.join(f.src, 'blanc/gone.txt')), false);
});
