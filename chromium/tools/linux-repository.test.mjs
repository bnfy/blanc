import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {mkdtempSync, rmSync} from 'node:fs';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {MemoryBucket} from '../linux/repository/fixtures/memory-bucket.mjs';

const repository = fileURLToPath(new URL('../linux/repository/', import.meta.url));
const plan = () => import('../linux/repository/plan-upload.mjs');
const hash = data => createHash('sha256').update(data).digest('hex');
const pkg = n => `deb/pool/main/b/blanc-beta/blanc-beta_158.0.8127.${n}-1_amd64.deb`;
const tree = paths => {
  const files = [...paths].sort().map(path => ({path, sha256: hash(path)}));
  return {schema: 1, files, digest: hash(files.map(p => p.sha256 + '  ' + p.path + '\n').join(''))};
};

test('planUpload orders immutable packages, no-cache metadata and one pointer', async () => {
  const {planUpload} = await plan();
  const t = tree([pkg(2), 'rpm/stable/x86_64/blanc-beta-158.0.8127.2-1.x86_64.rpm', 'deb/dists/stable/InRelease']);
  const ops = planUpload(t, {target: 'staging', generation: 2});
  assert.deepEqual(ops.map(o => o.phase), ['pool','pool','generation','generation','pointer']);
  for (const op of ops) {
    assert.match(op.sha256, /^[a-f0-9]{64}$/);
    assert.ok(op.file);
    assert.equal(op.cacheControl, op.phase === 'pool' ? 'public, max-age=31536000, immutable' : 'no-cache');
    if (op.phase === 'generation') assert.ok(op.key.startsWith('generations/2/'));
  }
  assert.equal(ops.at(-1).key, 'current.json');
});

test('production requires the staging-proven tree digest and verifies the inventory', async () => {
  const {planUpload} = await plan();
  const t = tree([pkg(2)]);
  for (const provenDigest of [undefined, 'b'.repeat(64)]) {
    assert.throws(() => planUpload(t, {target: 'production', generation: 2, provenDigest}), /proven/);
  }
  assert.ok(planUpload(t, {target: 'production', generation: 2, provenDigest: t.digest}));
  assert.throws(() => planUpload({...t, files: tree([pkg(1)]).files},
    {target: 'production', generation: 2, provenDigest: t.digest}), /digest/);
});

test('a proven tree can only publish under its own build, before any bucket write', async () => {
  const {publishTree} = await import('../linux/repository/worker/upload.mjs');
  const bucket = new MemoryBucket();
  bucket.put = () => assert.fail('unexpected bucket write');
  for (const paths of [[pkg(1)], [pkg(2), 'rpm/stable/aarch64/blanc-beta-158.0.8127.1-1.aarch64.rpm'],
    ['deb/dists/stable/InRelease']]) {
    const signed = tree(paths);
    for (const target of ['production', 'staging']) {
      await assert.rejects(publishTree(bucket, '', signed, {target, generation: 2, provenDigest: signed.digest}),
        /generation.*build|build.*generation/i);
    }
  }
});

test('the repository artifact allowlist covers only indexes and the inventory', async () => {
  const workflow = await readFile(path.join(repository, '../../../.github/workflows/chromium-linux-candidate.yml'), 'utf8');
  const job = workflow.split('\n  repo-metadata:\n')[1];
  const artifact = job.split('uses: actions/upload-artifact@');
  assert.equal(artifact.length, 2);
  const paths = artifact[1].match(/^          path: \|\n((?:            [^\n]+\n)+)/m)?.[1];
  assert.deepEqual(paths?.trim().split(/\n\s*/).map(p => p.replace('${{ runner.temp }}/unsigned-tree/', '')), [
    'tree.json', 'deb/dists/stable', 'rpm/stable/x86_64/repodata', 'rpm/stable/aarch64/repodata',
  ]);
});

test('both signing callers retrieve the concealed item field and leave RPM input intact', async t => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'blanc-passphrase-'));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  const owner = path.join(repository, '../owner');
  const fixturePassword = '  fixture, "password"  ';
  await writeFile(path.join(dir, 'op'), `#!/bin/bash
set -eu
[[ "$#" == 12 && "$1" == item && "$2" == get && "$3" == 'Blanc Linux Repository Signing (passphrase and revocation)' ]] || exit 1
shift 3
[[ "$*" == '--vault Dev --account my.1password.com --fields label=password --format json --reveal' ]] || exit 1
echo '${JSON.stringify({value: fixturePassword})}'
`, {mode: 0o755});
  await writeFile(path.join(dir, 'gpg'), `#!/bin/bash
IFS= read -r password <&3 && [[ "$password" == '${fixturePassword}' ]] && cat
`, {mode: 0o755});
  const options = {encoding: 'utf8', env: {...process.env, PATH: dir + ':' + process.env.PATH,
    BLANC_OP: path.join(dir, 'op'), BLANC_WORK_TMP: dir}, input: 'rpm payload'};
  const metadata = spawnSync('bash', ['-c', 'source "$1"; password', '_', path.join(owner, 'repository-common.sh')], options);
  assert.equal(metadata.status, 0, metadata.stderr);
  assert.equal(metadata.stdout, fixturePassword + '\n');
  const rpm = spawnSync(path.join(owner, 'repository-rpm-gpg.sh'), [], options);
  assert.equal(rpm.status, 0, rpm.stderr);
  assert.equal(rpm.stdout, 'rpm payload');
});

test('pruning keeps three versions per arch and all packages in the last three published generations', async () => {
  const {pruneKeys} = await plan();
  const x64 = [1,2,9,10,11,12].map(pkg);
  const arm = x64.slice(0, 3).map(p => p.replace('amd64', 'arm64'));
  const keys = [...x64, ...arm, 'generations/7/a', 'generations/8/b', 'generations/10/c', 'generations/12/d', 'publisher.lock'];
  assert.deepEqual(pruneKeys(keys, new Map([[12, [pkg(12)]], [10, [pkg(1)]], [8, [pkg(2)]]])).sort(),
    [pkg(9), 'generations/7/a'].sort());
});

test('R2 refuses a concurrent publisher and releases the lock after failure', async () => {
  const {withPublisherLock} = await plan();
  const bucket = new MemoryBucket();
  await assert.rejects(withPublisherLock(bucket, async () => {
    await assert.rejects(withPublisherLock(bucket, () => assert.fail()), /lock/i);
    throw Error('interrupted');
  }), /interrupted/);
  assert.equal(await withPublisherLock(bucket, () => 12), 12);
});

test('owner checks approved package headers, signatures and bounded index reads', () => {
  const r = spawnSync('python3', [path.join(repository, 'fixtures/check-index.py')], {encoding: 'utf8'});
  assert.equal(r.status, 0, r.stderr);
});

test('real apt and dnf refreshes across two signed repository generations', {timeout: 240000}, async t => {
  const commands = ['apt-ftparchive','createrepo_c','apt-get','dnf','dpkg-deb','rpmbuild','rpmsign','rpmkeys','gpg','gpgv'];
  const missing = commands.filter(cmd => spawnSync('which', [cmd]).status !== 0);
  if (missing.length) {
    assert.ok(!process.env.BLANC_REQUIRE_REPO_TOOLS, 'missing: ' + missing.join(', '));
    return t.skip('missing: ' + missing.join(', '));
  }
  const dir = mkdtempSync(path.join(os.tmpdir(), 'blanc-repos-'));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  const {exercisePackageManagers} = await import('../linux/repository/fixtures/refresh.mjs');
  await exercisePackageManagers(dir);
});


test('interrupted uploads resume without exposing partial metadata or rewriting the pointer', async t => {
  const {publishTree} = await import('../linux/repository/worker/upload.mjs');
  const {default: worker} = await import('../linux/repository/worker/index.mjs');
  const bucket = new MemoryBucket();
  const dir = mkdtempSync(path.join(os.tmpdir(), 'blanc-upload-'));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  const pool = pkg(2);
  const signed = tree([pool, 'deb/dists/stable/InRelease']);
  for (const {path: name} of signed.files) {
    await mkdir(path.dirname(path.join(dir, name)), {recursive: true});
    await writeFile(path.join(dir, name), name);
  }
  const reads = [];
  const readBack = key => {
    reads.push(key);
    return worker.fetch(new Request('http://repo.test/' + key), {PACKAGES: bucket});
  };
  const options = {target: 'staging', generation: 2, readBack};
  const put = bucket.put.bind(bucket);
  bucket.put = (key, body, args) => {
    if (key.endsWith('/InRelease')) throw Error('simulated interruption');
    return put(key, body, args);
  };
  await assert.rejects(publishTree(bucket, dir, signed, options), /interruption/);
  assert.ok(await bucket.get(pool));
  assert.equal(await bucket.get('current.json'), null);
  bucket.put = put;
  await publishTree(bucket, dir, signed, options);
  assert.equal((await (await bucket.get('current.json')).json()).digest, signed.digest);
  assert.ok(reads.includes('current.json') && signed.files.every(f => reads.includes(f.path)));
  bucket.put = (key, body, args) => {
    assert.equal(key, 'publisher.lock', 'resume after the pointer switch must skip all published writes');
    return put(key, body, args);
  };
  await publishTree(bucket, dir, signed, options);
});

test('production advances from the journaled predecessor and resumes the exact published history', async t => {
  const {publishTree} = await import('../linux/repository/worker/upload.mjs');
  const {default: worker} = await import('../linux/repository/worker/index.mjs');
  const bucket = new MemoryBucket();
  const dir = mkdtempSync(path.join(os.tmpdir(), 'blanc-production-'));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  const readBack = key => worker.fetch(new Request('http://repo.test/' + key), {PACKAGES: bucket});
  let before = null;
  for (const generation of [2, 4, 5, 8]) {
    const name = pkg(generation), signed = tree([name]);
    await mkdir(path.dirname(path.join(dir, name)), {recursive: true});
    await writeFile(path.join(dir, name), name);
    const options = {target: 'production', generation, provenDigest: signed.digest, readBack, expectedPredecessor: before};
    const current = await publishTree(bucket, dir, signed, options);
    assert.deepEqual(current.previous, before ? [before.generation, ...before.previous].slice(0, 2) : []);
    assert.deepEqual(await publishTree(bucket, dir, signed, options), current);
    before = current;
  }
});

test('production compares the full journaled predecessor under the publisher lock before any content write', async () => {
  const {publishTree} = await import('../linux/repository/worker/upload.mjs');
  const signed = tree([pkg(5)]), before = {generation: 3, digest: hash('three'), previous: [2, 1]};
  const advanced = {generation: 4, digest: hash('four'), previous: [3, 2]};
  for (const [expectedPredecessor, observed] of [
    [before, advanced], [before, {...before, digest: hash('different')}], [before, {...before, previous: [1]}],
    [null, advanced], [before, null], [before, {generation: 5, digest: signed.digest, previous: [4, 3]}]
  ]) {
    const bucket = new MemoryBucket(), writes = [];
    const put = bucket.put.bind(bucket);
    bucket.put = async (key, ...args) => {
      writes.push(key);
      if (key === 'publisher.lock' && observed) await put('current.json', JSON.stringify(observed));
      return put(key, ...args);
    };
    await assert.rejects(publishTree(bucket, '', signed, {
      target: 'production', generation: 5, provenDigest: signed.digest, expectedPredecessor,
      readBack: () => assert.fail('unexpected read-back')
    }), /predecessor|journal/);
    assert.deepEqual(writes, ['publisher.lock']);
    const pointer = await bucket.get('current.json');
    assert.deepEqual(pointer && await pointer.json(), observed);
  }
});

test('all owner repository commands refuse Linux and an unregistered Mac before opening any service', async t => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'repo-guard-'));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  const commands = {
    uname: 'echo "$PLATFORM"',
    ioreg: 'echo \'    "IOPlatformUUID" = "00000000-0000-4000-8000-000000000001"\'',
    git: 'echo 00000000-0000-4000-8000-000000000002',
    gh: 'echo "unexpected draft access" >&2; exit 70',
    gpg: 'echo "unexpected key access" >&2; exit 70',
    op: 'echo "unexpected vault access" >&2; exit 70',
    node: 'echo "unexpected publisher access" >&2; exit 70',
  };
  for (const [name, script] of Object.entries(commands)) {
    await writeFile(path.join(dir, name), '#!/bin/bash\n' + script + '\n', {mode: 0o755});
  }
  const owner = path.join(repository, '../owner');
  for (const platform of ['Linux', 'Darwin']) {
    for (const [script, args] of [
      ['sign-candidate.command', ['x64', 'a'.repeat(64)]],
      ['sign-candidate.command', ['beta', 'SHA256SUMS', dir, 'APPROVED']],
      ['repository-approve.command', [dir, 'APPROVED', 'fixture checksums']],
      ['repository-sign.command', ['APPROVED', 'UNSIGNED', 'SIGNED']],
      ['repository-upload.command', ['staging', 'SIGNED', '3']],
    ]) {
      const result = spawnSync('bash', [path.join(owner, script), ...args], {
        encoding: 'utf8', env: {...process.env, PLATFORM: platform, BLANC_WORK_TMP: dir,
          BLANC_OP: path.join(dir, 'op'), PATH: dir + ':' + process.env.PATH},
      });
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /owner.s Mac/, script + ' on ' + platform + ': ' + result.stderr);
      assert.doesNotMatch(result.stderr, /unexpected/);
    }
  }
});

test('beta signing binds both architectures and consecutive builds to their selected tarball digests', t => {
  // The nested GnuPG agent socket must fit in macOS's sockaddr_un.sun_path.
  const temp = process.platform === 'darwin' ? '/private/tmp' : os.tmpdir();
  const dir = mkdtempSync(path.join(temp, 'repo-beta-'));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  const result = spawnSync('bash', [path.join(repository, 'fixtures/sign-beta.sh'), dir],
    {encoding: 'utf8', timeout: 90000});
  assert.equal(result.status, 0, result.error?.message ?? result.stderr);
});

test('two simultaneous publishers produce a single lock winner', async () => {
  const {withPublisherLock} = await plan();
  const bucket = new MemoryBucket();
  let entered = 0;
  const results = await Promise.allSettled([1, 2].map(() =>
    withPublisherLock(bucket, async () => { entered++; })));
  assert.equal(entered, 1);
  assert.match(results.find(r => r.status === 'rejected').reason.message, /lock/);
});

test('a skipped proof build cannot be approved', () => {
  const r = spawnSync('python3', ['-c', `
import metadata
names = []
for n in [1, 3]:
    names.extend(f'blanc-beta_158.0.8127.{n}-1_{a}.deb' for a in ['amd64', 'arm64'])
    names.extend(f'blanc-beta-158.0.8127.{n}-1.{a}.rpm' for a in ['x86_64', 'aarch64'])
metadata.validate_matrix(names)
`], {cwd: repository, encoding: 'utf8'});
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /consecutive/);
});

test('planUpload rejects a signed path the public Worker cannot serve before any writes', async () => {
  const {publishTree} = await import('../linux/repository/worker/upload.mjs');
  for (const file of ['rpm/stable/x86_64/repodata/other.rpm', 'deb/dists/stable/private.json']) {
    const bucket = new MemoryBucket();
    bucket.put = () => assert.fail('unexpected bucket write');
    await assert.rejects(publishTree(bucket, '', tree([pkg(2), file]), {target: 'staging', generation: 2}),
      /unknown tree path/i);
  }
});

test('publication retains two previous generations and prunes only after successful public read-back', async t => {
  const {publishTree} = await import('../linux/repository/worker/upload.mjs');
  const {default: worker} = await import('../linux/repository/worker/index.mjs');
  const dir = mkdtempSync(path.join(os.tmpdir(), 'repo-retention-'));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  const bucket = new MemoryBucket();
  const readBack = key => worker.fetch(new Request('https://fixture.invalid/' + key), {PACKAGES: bucket});
  const release = 'deb/dists/stable/InRelease';
  let expectedPredecessor = null;
  for (const generation of [2, 4, 5, 9]) {
    const signed = tree([pkg(generation), release]);
    for (const {path: file} of signed.files) {
      await mkdir(path.dirname(path.join(dir, file)), {recursive: true});
      await writeFile(path.join(dir, file), file);
    }
    const options = {generation, target: 'production', provenDigest: signed.digest, expectedPredecessor, readBack};
    if (generation === 9) {
      await assert.rejects(publishTree(bucket, dir, signed, {...options, readBack: () => new Response(null, {status: 503})}),
        /read-back/);
      assert.ok(await bucket.get('generations/2/' + release));
      assert.ok(await bucket.get(pkg(2)));
    }
    expectedPredecessor = await publishTree(bucket, dir, signed, options);
  }
  assert.deepEqual((await (await bucket.get('current.json')).json()).previous, [5, 4]);
  for (const n of [2, 4, 5, 9]) {
    assert.equal((await readBack('generations/' + n + '/' + release)).status, n === 2 ? 404 : 200);
    assert.equal((await readBack(pkg(n))).status, n === 2 ? 404 : 200);
  }
});
