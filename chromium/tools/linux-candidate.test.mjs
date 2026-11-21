import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ASSET_NAME, candidateId, runtimeFiles, runtimeConfig } from '../linux/candidate.mjs';
import { linuxCandidate } from './progress.mjs';

const exeSha256 = 'ab'.repeat(32);
const id = 'linux-x64-abababababababab';

test('Linux candidate IDs come from the chrome SHA-256', () => {
  assert.equal(candidateId(exeSha256), id);
  assert.equal(candidateId(exeSha256, 'arm64'), 'linux-arm64-abababababababab');
  assert.equal(ASSET_NAME('x64'), 'blanc-linux-x64-candidate.tar.gz');
  assert.equal(ASSET_NAME('arm64'), 'blanc-linux-arm64-candidate.tar.gz');
  for (const arch of ['amd64', '../arm64', null]) {
    assert.throws(() => candidateId(exeSha256, arch), /arch/i);
    assert.throws(() => ASSET_NAME(arch), /arch/i);
  }
  for (const bad of ['abc', 'ab'.repeat(33), 'ag'.repeat(32), exeSha256.toUpperCase(), undefined]) {
    assert.throws(() => candidateId(bad), /SHA-256/);
  }
});

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const version = '158.0.8127.2';
const fingerprint = 'AB'.repeat(20);
const linux = fileURLToPath(new URL('../linux/', import.meta.url));
function fixture(t, arch) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-candidate-')));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  const out = path.join(dir, 'out');
  const folder = path.join(dir, 'candidate');
  const engine = path.join(dir, 'engine.js');
  const deb = `blanc-prototype_${version}-1_${arch === 'arm64' ? 'arm64' : 'amd64'}.deb`;
  const rpm = `blanc-prototype-${version}-1.${arch === 'arm64' ? 'aarch64' : 'x86_64'}.rpm`;
  fs.mkdirSync(out);
  for (const file of ['chrome', 'chrome_sandbox']) fs.writeFileSync(path.join(out, file), file);
  // Keep the package readers local. The packager still selects the installed path
  // from real tar and cpio streams and runs the Chromium strip-script interface.
  const bin = path.join(dir, 'bin');
  fs.mkdirSync(bin);
  const oldPath = process.env.PATH;
  process.env.PATH = bin + path.delimiter + oldPath;
  t.after(() => { process.env.PATH = oldPath; });
  const command = (name, body) => fs.writeFileSync(path.join(bin, name), '#!/bin/bash\nset -eu\n' + body, {mode: 0o755});
  command('dpkg-deb', '[[ $1 == --fsys-tarfile ]] && cat "$2"');
  command('rpm2cpio', 'cat "$1"');
  const script = path.join(dir, 'build/linux/strip_binary.py');
  fs.mkdirSync(path.dirname(script), {recursive: true});
  fs.writeFileSync(script, `from pathlib import Path
import sys
args = dict(zip(sys.argv[1::2], sys.argv[2::2]))
assert Path(args['--symbol-output']).name == 'chrome.debug'
Path(args['--stripped-binary-output']).write_bytes(b'stripped ' + Path(args['--binary-input']).read_bytes())
`);
  const member = './opt/bnfy/blanc-prototype/chrome';
  fs.mkdirSync(path.dirname(path.join(dir, member)), {recursive: true});
  function writePackage(file, browser) {
    fs.writeFileSync(path.join(dir, member), browser);
    const bytes = file === rpm
      ? execFileSync('cpio', ['-o', '-H', 'newc'], {cwd: dir, input: member + '\n', stdio: ['pipe', 'pipe', 'pipe']})
      : execFileSync('tar', ['-cf', '-', member], {cwd: dir});
    fs.writeFileSync(path.join(out, file), bytes);
  }
  for (const file of [deb, rpm]) writePackage(file, 'stripped chrome');
  fs.writeFileSync(engine, 'engine');
  const build = {arch, version, upstream: 'a'.repeat(40), treeCommit: 'b'.repeat(40),
    builtAt: '2026-11-21T12:00:00Z', argsSha256: hash('args')};
  const inputs = {src: dir, files: ['chrome', 'chrome_sandbox'], engine, engineSha256: hash('engine'), fingerprint};
  const archive = async scan => {
    const {archiveCandidate} = await import('../linux/package-candidate.mjs');
    return archiveCandidate(out, folder, build, inputs, scan);
  };
  return {dir, out, folder, deb, rpm, archive, inputs, command, writePackage};
}
const clean = () => ({ok: true, findings: []});

for (const arch of ['x64', 'arm64']) {
  test(`the ${arch} archive binds both scanned packages and runs from its chrome directory`, async t => {
    const f = fixture(t, arch);
    const scanned = [];
    const record = await f.archive((file, options) => {
      assert.deepEqual(options, {fingerprint});
      assert.deepEqual(fs.readFileSync(file), fs.readFileSync(path.join(f.out, path.basename(file))));
      scanned.push(path.basename(file));
      return clean();
    });
    assert.deepEqual(scanned.sort(), [f.deb, f.rpm].sort());
    assert.equal(path.basename(record.tar), ASSET_NAME(arch));
    assert.equal(record.tarSha256, hash(fs.readFileSync(record.tar)));
    const unpacked = path.join(f.dir, 'unpacked');
    fs.mkdirSync(unpacked);
    execFileSync('tar', ['-xzf', record.tar, '-C', unpacked]);
    const candidate = JSON.parse(fs.readFileSync(path.join(unpacked, 'candidate.json')));
    assert.equal(candidate.id, candidateId(hash('chrome'), arch));
    assert.equal(candidate.arch, arch);
    assert.deepEqual(candidate.packages, [f.deb, f.rpm].map(file => ({file, sha256: hash(fs.readFileSync(path.join(f.out, file)))})));
    for (const {file, sha256} of candidate.packages) {
      assert.equal(hash(fs.readFileSync(path.join(unpacked, 'packages', file))), sha256);
    }
    const config = runtimeConfig(unpacked, candidate);
    assert.equal(hash(fs.readFileSync(config.executable)), config.executableSha256);
    assert.equal(fs.readFileSync(path.join(config.blockerAssets, 'engine.js'), 'utf8'), 'engine');
    assert.ok(fs.statSync(path.join(unpacked, 'chrome/chrome-sandbox')).isFile());
    assert.equal(linuxCandidate(record).id, candidate.id);
    const wrong = {...candidate, arch: arch === 'x64' ? 'arm64' : 'x64'};
    assert.throws(() => runtimeConfig(unpacked, wrong), /does not match/);
    assert.throws(() => linuxCandidate(wrong), /does not match/);
  });
}

test('either scanner finding or a missing package refuses the whole archive', async t => {
  const f = fixture(t, 'arm64');
  for (const bad of [f.deb, f.rpm]) {
    await assert.rejects(f.archive(file => path.basename(file) === bad
      ? {ok: false, findings: ['fixture: unexpected repository key']} : clean()), /unexpected repository key/);
    assert.ok(!fs.existsSync(f.folder));
  }
  fs.unlinkSync(path.join(f.out, f.rpm));
  await assert.rejects(f.archive(clean), /aarch64\.rpm/);
  assert.ok(!fs.existsSync(f.folder));
});

test('a preview approval binds the original DEB and the verified, signed RPM', async t => {
  const f = fixture(t, 'arm64');
  const record = await f.archive(clean);
  const metadata = path.join(linux, 'repository/metadata.py');
  const dest = path.join(f.dir, 'packages');
  const prepare = (arch, sha, folder) => spawnSync('python3',
    [metadata, 'unpack-candidate', arch, sha, record.tar, folder], {encoding: 'utf8'});
  assert.notEqual(prepare('x64', record.tarSha256, path.join(f.dir, 'wrong-arch')).status, 0);
  assert.notEqual(prepare('arm64', '0'.repeat(64), path.join(f.dir, 'wrong-tar')).status, 0);
  const prepared = prepare('arm64', record.tarSha256, dest);
  assert.equal(prepared.status, 0, prepared.stderr);
  fs.appendFileSync(path.join(dest, f.rpm), 'fixture signature');
  execFileSync('python3', [metadata, 'approve-candidate', dest]);
  const signed = JSON.parse(fs.readFileSync(path.join(dest, 'signed-candidate-arm64.json')));
  assert.deepEqual(signed, {
    candidate: record.id, tarSha256: record.tarSha256, arch: 'arm64',
    deb: record.packages[0], rpm: {file: f.rpm, sha256: hash(fs.readFileSync(path.join(dest, f.rpm)))},
  });
});

test('without the owner key the x64 runtime can be smoked and signing names the missing packages', async t => {
  const f = fixture(t, 'x64');
  const {repositoryFingerprint} = await import('../linux/package-candidate.mjs');
  f.inputs.fingerprint = repositoryFingerprint(path.join(f.dir, 'missing/blanc-repository.asc'));
  for (const pkg of [f.deb, f.rpm]) fs.unlinkSync(path.join(f.out, pkg));
  const record = await f.archive(() => assert.fail('runtime-only packaging scanned an installer'));
  assert.deepEqual(record.packages, []);
  const unpacked = path.join(f.dir, 'unpacked');
  fs.mkdirSync(unpacked);
  execFileSync('tar', ['-xzf', record.tar, '-C', unpacked]);
  const candidate = JSON.parse(fs.readFileSync(path.join(unpacked, 'candidate.json')));
  assert.deepEqual(candidate.packages, []);
  assert.equal(hash(fs.readFileSync(runtimeConfig(unpacked, candidate).executable)), record.exeSha256);
  assert.ok(!fs.existsSync(path.join(unpacked, 'packages')));
  const sign = spawnSync('python3', [path.join(linux, 'repository/metadata.py'), 'unpack-candidate',
    'x64', record.tarSha256, record.tar, path.join(f.dir, 'sign')], {encoding: 'utf8'});
  assert.notEqual(sign.status, 0);
  assert.match(sign.stderr, /runtime-only.*DEB.*RPM.*blanc-repository\.asc/i);
});

for (const format of ['deb', 'rpm']) {
  test(`reject a stale ${format} even with a matching stale chrome.stripped`, async t => {
    const f = fixture(t, 'x64');
    fs.writeFileSync(path.join(f.out, 'chrome.stripped'), 'stripped old chrome');
    f.writePackage(f[format], 'stripped old chrome');
    await assert.rejects(f.archive(clean), error => error.message.includes(f[format]) &&
      /installed chrome.*staged (?:runtime|browser)/i.test(error.message));
    assert.ok(!fs.existsSync(f.folder));
  });
}

test('hosted candidate checks name the missing arm64 archive even if x64 is available', t => {
  const f = fixture(t, 'arm64');
  const workflow = fs.readFileSync(path.join(linux, '../../.github/workflows/chromium-linux-candidate.yml'), 'utf8');
  const download = workflow.split('      - &download\n')[1].split('        run: |\n')[1].split('      - &unpack')[0];
  f.command('gh', `[[ $1 == release && $2 == view ]]
echo '{"isDraft":true,"assets":[{"name":"blanc-linux-candidate.tar.gz"}]}'`);
  const res = spawnSync('bash', ['-eu', '-c', download], {encoding: 'utf8', env: {...process.env,
    ARCH: 'arm64', ASSET: ASSET_NAME('arm64'), CANDIDATE_SHA256: exeSha256,
    RUNNER_TEMP: f.dir, DRAFT_TAG: 'fixture', GITHUB_REPOSITORY: 'fixture'}});
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /missing.*blanc-linux-arm64-candidate\.tar\.gz/i);
});

test('repository metadata with real packages names the missing committed key before downloading approvals', t => {
  const f = fixture(t, 'x64');
  const workflow = fs.readFileSync(path.join(linux, '../../.github/workflows/chromium-linux-candidate.yml'), 'utf8');
  const step = workflow.split('      - name: Download the approved packages from the candidate draft\n')[1]
    .split('        run: |\n')[1].split('      - name:')[0];
  f.command('gh', 'exit 91');
  const res = spawnSync('bash', ['-eu', '-c', step], {cwd: f.dir, encoding: 'utf8',
    env: {...process.env, RUNNER_TEMP: f.dir, APPROVAL_SHA256: exeSha256, GITHUB_REPOSITORY: 'fixture'}});
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /missing.*blanc-repository\.asc.*packages/i);
});

// Simulate the draft asset API on disk. Exclusive link creation models GitHub
// rejecting an existing asset name unless the caller explicitly clobbers it.
async function draftFixture(t) {
  const f = fixture(t, 'x64');
  const record = await f.archive(clean);
  const draft = path.join(f.dir, 'draft');
  fs.mkdirSync(draft);
  const asset = ASSET_NAME('x64');
  fs.copyFileSync(record.tar, path.join(draft, asset));
  fs.writeFileSync(path.join(f.dir, 'bin/gh'), `#!/usr/bin/env python3
import hashlib, json, os, shutil, sys
from pathlib import Path
root = Path(os.environ['DRAFT_FIXTURE'])
verb, tag, *args = sys.argv[2:]
assert sys.argv[1] == 'release' and tag == 'fork-linux-candidate'
i = args.index('--repo')
del args[i:i+2]
if verb == 'view':
    if '--jq' in args:
        assert args[args.index('--jq') + 1] == '.isDraft'
        print('true')
    else:
        print(json.dumps({'isDraft': True, 'assets': [
            {'name': f.name, 'digest': 'sha256:' + hashlib.sha256(f.read_bytes()).hexdigest()} for f in root.iterdir()]}))
elif verb == 'download':
    shutil.copy(root / args[args.index('--pattern') + 1], args[args.index('--dir') + 1])
elif verb == 'delete-asset':
    (root / args[0]).unlink()
elif verb == 'upload':
    for name in (a for a in args if a != '--clobber'):
        target = root / Path(name).name
        if '--clobber' in args:
            shutil.copyfile(name, target)
        else:
            os.link(name, target)
else:
    sys.exit(1)
`, {mode: 0o755});
  f.command('scp', 'src=${@: -2:1}; cp "${src#fixture:}" "${@: -1}"');
  f.command('uname', 'echo Darwin');
  const owner = path.join(f.dir, 'owner');
  fs.mkdirSync(owner);
  const signer = path.join(owner, 'sign-candidate.command');
  fs.copyFileSync(path.join(linux, 'owner/sign-candidate.command'), signer);
  fs.writeFileSync(path.join(owner, 'repository-common.sh'), `source "$REAL_LINUX/owner/repository-common.sh"
repo="$REAL_LINUX/repository"
public="$REAL_LINUX/../tools/fixtures/linux-installer/package-test.asc"
open_repository_work() { work=$(mktemp -d "$DRAFT_FIXTURE/../work.XXXXXX"); }
open_rpm_database() { :; }
open_signing_key() { :; }
sign_rpm() { echo signature >> "$1"; }
sign_record() {
  echo signature > "$1.asc"
  if [[ \${REPLACE_DURING_SIGN:-} == yes ]]; then
    echo newer > "$DRAFT_FIXTURE/blanc-linux-x64-candidate.tar.gz"
    echo 'newer approval' > "$DRAFT_FIXTURE/signed-candidate-x64.json"
  fi
}
`);
  const run = (args, extra = {}) => spawnSync('bash', args, {encoding: 'utf8',
    env: {...process.env, REAL_LINUX: linux, DRAFT_FIXTURE: draft, ...extra}});
  return {f, record, draft, sign: extra => run([signer, 'x64', record.tarSha256], extra),
    ship: () => run([path.join(linux, 'ship-candidate.sh'), 'fixture', f.folder])};
}

test('an older signer refuses an archive replaced while the owner signs', async t => {
  const d = await draftFixture(t);
  const res = d.sign({REPLACE_DURING_SIGN: 'yes'});
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /archive.*(changed|SHA-256)|SHA-256.*archive/i);
  assert.equal(fs.readFileSync(path.join(d.draft, 'signed-candidate-x64.json'), 'utf8'), 'newer approval\n');
  assert.ok(!fs.existsSync(path.join(d.draft, d.f.rpm)));
  assert.ok(!fs.existsSync(path.join(d.draft, 'blanc-linux-x64-candidate.lock')));
});

test('shipping and signing share an exclusive draft lock for each architecture', async t => {
  const d = await draftFixture(t);
  const lock = path.join(d.draft, 'blanc-linux-x64-candidate.lock');
  fs.writeFileSync(lock, 'another writer');
  for (const operation of [d.ship, d.sign]) {
    const res = operation();
    assert.notEqual(res.status, 0);
    assert.match(res.stderr, /lock.*x64|x64.*lock/i);
    assert.equal(fs.readFileSync(lock, 'utf8'), 'another writer');
  }
  fs.unlinkSync(lock);
  fs.writeFileSync(path.join(d.draft, 'blanc-linux-arm64-candidate.lock'), 'independent writer');
  for (const operation of [d.ship, d.sign]) {
    const res = operation();
    assert.equal(res.status, 0, res.stderr);
    assert.ok(!fs.existsSync(lock));
  }
  assert.ok(fs.existsSync(path.join(d.draft, 'signed-candidate-x64.json.asc')));
});

test('Linux runtime dependencies stay inside the output and include chrome', () => {
  assert.deepEqual(runtimeFiles(['./chrome', 'locales/en-US.pak', '  icudtl.dat ', '', 'chrome']),
    ['chrome', 'icudtl.dat', 'locales/en-US.pak']);
  for (const outside of ['/etc/passwd', '..', 'locales/../../outside', './a/../b', 'C:/outside', 'a\\b']) {
    assert.throws(() => runtimeFiles(['chrome', outside]), /outside the output/);
  }
  assert.throws(() => runtimeFiles(['chrome_sandbox', 'resources.pak']), /chrome/);
});

test('Linux run config binds the candidate ID to its executable hash', () => {
  const record = { id, exeSha256 };
  assert.deepEqual(runtimeConfig('unpacked', record), {
    candidate: id, executable: path.join('unpacked', 'chrome'), executableSha256: exeSha256,
    singleBinary: true, blockerAssets: path.join('unpacked', 'blocker'), diskAssets: false,
  });
  for (const wrongId of ['windows-x64-abababababababab', 'linux-x64-0000000000000000']) {
    assert.throws(() => runtimeConfig('unpacked', { ...record, id: wrongId }), /does not match/);
  }
  assert.throws(() => runtimeConfig('unpacked', { id }));
});
