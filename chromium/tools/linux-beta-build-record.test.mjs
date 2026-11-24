import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {fixture, hash} from './fixtures/linux-candidate.mjs';

const chromium = fileURLToPath(new URL('../', import.meta.url));

// Run the real guard and packaging commands in two disposable Git checkouts.
// Only the host, compiler, process list and Linux package tools are fixtures.
function betaBuild(t, {comment = false} = {}) {
  const f = fixture(t, 'x64', 906);
  const tree = path.join(f.dir, 'blanc');
  const src = path.join(f.dir, 'checkout/src');
  function write(file, data, mode = 0o644) {
    fs.mkdirSync(path.dirname(file), {recursive: true});
    fs.writeFileSync(file, data, {mode});
  }
  const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, '-c', 'user.name=Fixture',
    '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgSign=false', ...args], {encoding: 'utf8'}).trim();
  function commit(cwd, message) {
    git(cwd, 'add', '.');
    git(cwd, 'commit', '--allow-empty', '-qm', message);
    return git(cwd, 'rev-parse', 'HEAD');
  }
  write(path.join(src, 'browser.cc'), 'upstream');
  write(path.join(src, 'unmapped.cc'), 'upstream');
  write(path.join(src, '.gitignore'), '/out\n/build/\n/buildtools/\n/third_party/\n');
  git(src, 'init', '-q');
  const upstream = commit(src, 'upstream');
  write(path.join(src, 'browser.cc'), 'applied');
  const applied = {upstream, upstreamFiles: {'browser.cc': hash('applied')}, canonicalSha256: {}};
  const marker = path.join(src, '../.blanc-applied-source-map.json');
  write(marker, JSON.stringify(applied));
  const map = JSON.stringify({...applied, selection: 'fixture'}, null, 2) + '\n';
  write(path.join(tree, 'chromium/source-map.json'), map);
  write(path.join(tree, 'chromium/lanes/desktop.json'), JSON.stringify({upstream, sourceMap: 'source-map.json', version: '158.0.8127.2'}));
  for (const file of ['tools/build.mjs', 'tools/checkout-status.mjs', 'linux', 'windows/candidate.mjs', 'release/beta-args.mjs']) {
    fs.cpSync(path.join(chromium, file), path.join(tree, 'chromium', file), {recursive: true});
  }
  const args = path.join(tree, 'chromium/linux/args/beta-x64.gn');
  if (comment) write(args, fs.readFileSync(args, 'utf8').replace('blanc_beta_build = 900', '\tblanc_beta_build=900  # development default'));
  write(path.join(tree, 'chromium/blanc/services/blocker/bundle_hash.h'), `kBlancBlockerBundleSha256[] = "${hash('engine')}"`);
  git(tree, 'init', '-q');
  const treeCommit = commit(tree, 'beta source A');
  fs.symlinkSync(path.dirname(f.out), path.join(src, 'out'));
  fs.cpSync(path.join(f.dir, 'build'), path.join(src, 'build'), {recursive: true});
  write(path.join(src, 'third_party/llvm-build/Release+Asserts/cr_build_revision'), 'fixture');
  write(path.join(src, 'third_party/llvm-build/Release+Asserts/bin/clang'), '#!/bin/sh\necho clang', 0o755);
  write(path.join(src, 'build/linux/debian_bullseye_amd64-sysroot', '.' + 'a'.repeat(64)), '');
  write(path.join(src, 'third_party/siso/cipd/siso'), '#!/bin/sh\necho "Build Succeeded: 1 steps"\n', 0o755);
  write(path.join(src, 'buildtools/linux64/gn'), '#!/bin/sh\necho chrome\necho chrome_sandbox\n', 0o755);
  write(path.join(f.dir, 'blanc-assets/blocker/engine.js'), 'engine');
  f.command('dpkg-deb', 'case "$1" in -R) tar -xf "$2" -C "$3" ;; --fsys-tarfile) cat "$2" ;; *) exit 1 ;; esac');
  f.command('rpm', '[[ $1 == -qp ]]');
  if (process.platform === 'darwin') {
    f.command('cpio', 'if [[ ${3:-} == --no-absolute-filenames ]]; then exec /usr/bin/cpio --quiet -id; fi\nexec /usr/bin/cpio "$@"');
  }
  const host = path.join(f.dir, 'linux-host.cjs');
  write(host, `Object.defineProperty(process, 'platform', {value: 'linux'});
Object.defineProperty(process, 'arch', {value: 'x64'});
const cp = require('node:child_process'), spawn = cp.spawnSync;
cp.spawnSync = (command, ...args) => command === '/bin/ps' ? {status: 0, stdout: ''} : spawn(command, ...args);
require('node:module').syncBuiltinESMExports();
`);
  const run = (script, ...args) => spawnSync(process.execPath, ['--require', host, path.join(tree, 'chromium', script), ...args],
    {env: {...process.env, HOME: f.dir}, encoding: 'utf8'});
  const guard = mode => run('tools/build.mjs', src, mode, '--out=BlancLinuxBeta');
  const pack = () => run('linux/package-candidate.mjs', src, f.folder, '--out=BlancLinuxBeta');
  const ok = result => assert.equal(result.status, 0, result.stderr);
  ok(run('release/beta-args.mjs', '--build=906', args, path.join(f.out, 'args.gn')));
  ok(guard('--record-environment'));
  const record = path.join(f.out, '.blanc-last-successful-build.json');
  return {...f, src, marker, record, treeCommit, guard, pack, ok, advance: () => commit(tree, 'commit B, identical build inputs')};
}

test('packaging refuses to attribute the guarded Linux beta build to a later commit with identical args', t => {
  const f = betaBuild(t);
  f.ok(f.guard('--build'));
  assert.notEqual(f.advance(), f.treeCommit);
  const result = f.pack();
  assert.notEqual(result.status, 0, 'candidate was relabeled with the later checkout');
  assert.match(result.stderr, /guarded.*source|source.*guarded/i);
  assert.equal(fs.existsSync(f.folder), false);
  fs.writeFileSync(path.join(f.src, 'third_party/siso/cipd/siso'), '#!/bin/sh\necho "no work to do"\n');
  f.ok(f.guard('--build'));
  assert.equal(JSON.parse(fs.readFileSync(f.record)).treeCommit, f.treeCommit);
});

test('Linux beta build and packaging verify the applied source map', t => {
  const f = betaBuild(t);
  const good = fs.readFileSync(f.marker, 'utf8');
  const stale = JSON.parse(good);
  stale.upstreamFiles['browser.cc'] = hash('other source');
  fs.writeFileSync(f.marker, JSON.stringify(stale));
  assert.notEqual(f.guard('--build').status, 0, 'a stale apply record cannot authorize compilation');
  assert.throws(() => fs.readFileSync(f.record), {code: 'ENOENT'});
  fs.writeFileSync(f.marker, good);
  fs.writeFileSync(path.join(f.src, 'browser.cc'), 'unapplied');
  assert.notEqual(f.guard('--build').status, 0, 'a matching marker cannot vouch for changed source bytes');
  fs.writeFileSync(path.join(f.src, 'browser.cc'), 'applied');
  f.ok(f.guard('--build'));
  const record = JSON.parse(fs.readFileSync(f.record));
  assert.equal(record.treeCommit, f.treeCommit);
  assert.equal(record.appliedSourceMapSha256, hash(good));
  fs.writeFileSync(f.marker, JSON.stringify(stale));
  assert.notEqual(f.pack().status, 0, 'a different applied map cannot qualify this build');
  fs.writeFileSync(f.marker, good);
  fs.writeFileSync(f.record, JSON.stringify({...record, appliedSourceMapSha256: hash('wrong map')}));
  assert.match(f.pack().stderr, /guarded.*applied map/i);
});

test('the Linux beta refuses a change outside the map and preserves the shared checkout', t => {
  const f = betaBuild(t);
  const file = path.join(f.src, 'unmapped.cc');
  fs.writeFileSync(file, 'local edit');
  const result = f.guard('--build');
  assert.notEqual(result.status, 0, 'unmapped Chromium edits must stop the build');
  assert.match(result.stderr, /outside the lane.s map/);
  assert.equal(fs.readFileSync(file, 'utf8'), 'local edit');
  assert.equal(fs.existsSync(f.record), false);
  fs.writeFileSync(file, 'upstream');
  f.ok(f.guard('--build'));
  const extra = path.join(f.src, 'untracked.cc');
  fs.writeFileSync(extra, 'another edit');
  assert.match(f.pack().stderr, /outside the lane.s map/);
  assert.equal(fs.readFileSync(extra, 'utf8'), 'another edit');
});

test('a Linux beta build cannot write provenance if the checkout changes during compilation', t => {
  const f = betaBuild(t);
  fs.writeFileSync(path.join(f.src, 'third_party/siso/cipd/siso'), [
    '#!/bin/sh', 'case " $* " in *" -n "*) echo "Build Succeeded: 1 steps" ;;',
    '*) echo changed > unmapped.cc ;; esac', ''
  ].join('\n'));
  const build = f.guard('--build');
  assert.notEqual(build.status, 0);
  assert.match(build.stderr, /outside the lane.s map/);
  assert.equal(fs.readFileSync(path.join(f.src, 'unmapped.cc'), 'utf8'), 'changed\n');
  assert.equal(fs.existsSync(f.record), false);
});

test('a legacy build record or an interrupted Linux beta rebuild cannot qualify a candidate', t => {
  const f = betaBuild(t);
  f.ok(f.guard('--build'));
  const {inputs, completedAt} = JSON.parse(fs.readFileSync(f.record));
  fs.writeFileSync(f.record, JSON.stringify({inputs, completedAt}));
  assert.notEqual(f.pack().status, 0, 'legacy records have no source provenance');
  f.ok(f.guard('--build'));
  fs.writeFileSync(path.join(f.src, 'third_party/siso/cipd/siso'),
    '#!/bin/sh\ncase " $* " in *" -n "*) echo "Build Succeeded: 1 steps" ;; *) exit 1 ;; esac\n');
  assert.notEqual(f.guard('--build').status, 0);
  assert.notEqual(f.pack().status, 0, 'a failed rebuild invalidates the earlier success');
});

test('packaging reads the numbered Linux beta args that setup wrote from a commented GN assignment', t => {
  const f = betaBuild(t, {comment: true});
  f.ok(f.guard('--build'));
  const result = f.pack();
  f.ok(result);
  const candidate = JSON.parse(result.stdout);
  assert.equal(candidate.build, 906);
  assert.equal(candidate.version, '158.0.8127.906');
  assert.equal(candidate.treeCommit, f.treeCommit);
  assert.equal(candidate.appliedSourceMapSha256, hash(fs.readFileSync(f.marker)));
});
