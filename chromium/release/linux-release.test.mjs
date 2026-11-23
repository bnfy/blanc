import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { ASSET_NAME } from '../linux/candidate.mjs';
import { STAGES, validateLinuxRelease, runStage, status } from './linux-release.mjs';

const sha = data => createHash('sha256').update(data).digest('hex');
const json = file => JSON.parse(fs.readFileSync(file));
const digest = sha('signed repository');
const fingerprint = 'A'.repeat(40);
const arches = ['x64', 'arm64'];
const candidates = seed => Object.fromEntries(arches.map(arch => [arch, { id: 'linux-' + arch + '-' + sha(seed + arch).slice(0, 16), tarSha256: sha(arch + seed) }]));
const r = {
  schema: 1, version: '158.0.8127.906', build: 906, previousBuild: 0, proofBuild: 905,
  sourceCommit: 'a'.repeat(40), tag: 'chromium-beta-linux-158.0.8127.906',
  prerelease: true, makeLatest: false, candidates: candidates('public'), proofCandidates: candidates('private')
};
const ledger = { schema: 1, builds: [] };
const names = ['blanc-beta_158.0.8127.906-1_amd64.deb', 'blanc-beta_158.0.8127.906-1_arm64.deb',
  'blanc-beta-158.0.8127.906-1.x86_64.rpm', 'blanc-beta-158.0.8127.906-1.aarch64.rpm'];
const ubuntuEvidence = {
  restrictUnprivilegedUserns: '1',
  apparmor: {label: 'blanc-beta (unconfined)', mode: 'unconfined', attachment: '/opt/bnfy/blanc-beta/chrome'}
};
const extras = ['blanc-repository.asc', 'linux-release.json', 'NOTICES.txt', 'RELEASE-MANIFEST.json', 'SHA256SUMS'];
const signature = 'SHA256SUMS.sigstore.json';
test('Linux record pins the version, source, proof and both architectures', () => {
  validateLinuxRelease(r, ledger);
  for (const change of [{ schema: 2 }, { build: 0 }, { build: 905 }, { previousBuild: 904 }, { proofBuild: 902 }, { proofSourceCommit: 'b'.repeat(40) },
  { tag: 'v906' }, { sourceCommit: 'main' }, { prerelease: false }, { makeLatest: true }, { version: '1.2.3.906' },
  { candidates: { x64: r.candidates.x64 } }, { proofCandidates: { arm64: r.proofCandidates.arm64 } },
  { candidates: { ...r.candidates, x64: r.candidates.arm64 } },
  { candidates: { ...r.candidates, arm64: { ...r.candidates.arm64, tarSha256: 'abc' } } }]) {
    assert.throws(() => validateLinuxRelease({ ...r, ...change }, ledger), undefined, JSON.stringify(change));
  }
  validateLinuxRelease({ ...r, previousBuild: 902 }, { schema: 1, builds: [{ build: 902 }, { build: 903, proofOnly: true }] });
});
function world(t) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'linux-release-'));
  t.after(() => fs.rmSync(work, { recursive: true, force: true }));
  fs.writeFileSync(path.join(work, 'linux-release.json'), JSON.stringify(r));
  fs.writeFileSync(path.join(work, 'release-notes.md'), 'Linux beta.');
  const remote = { tag: null, release: null, pointer: null };
  const writes = [], confirmations = [], gates = [];
  const entries = [r.proofBuild, r.build].map(build => ({
    build, sourceCommit: r.sourceCommit, platforms: ['linux'], purpose: build === r.build ? 'release' : 'proof'
  }));
  const io = {
    ledger: () => ledger, async confirm(phrase) { confirmations.push(phrase); return true; },
    preflightSource: () => ({ fingerprint, ledger, claims: {schema: 1, sequences: {'desktop-158': entries}} }),
    snapshot: () => structuredClone(remote), latest: () => 'v1.51.0',
    async buildCheck(ctx, candidate) {
      gates.push(candidate); return { run: 25, ...candidate, treeCommit: r.sourceCommit, fingerprint, scan: true, headers: true, smoke: true };
    },
    async sign(ctx) {
      const packages = names.map(name => {
        fs.writeFileSync(path.join(work, name), name);
        return { name, file: name, sha256: sha(name) };
      });
      return { digest, packages };
    },
    treeDigest: () => digest, upload: () => { }, stagingPointer: () => ({ generation: r.build, digest }),
    async updateProof() { return { digest, run: 11, from: r.proofBuild, to: r.build, legs: legs() }; },
    async repoLifecycle() { return { digest, run: 13, from: r.proofBuild, to: r.build, legs: legs() }; },
    sourceFile: (commit, file) => file.endsWith('.asc') ? 'key' : 'notices',
    signChecksums: dir => fs.writeFileSync(path.join(dir, signature), 'signed'), verifyChecksums: () => { },
    readDraft: () => { }, readProduction: () => { }, finishProduction: () => { }, async verifyPublic() { return { run: 12, version: r.version, legs: legs() }; },
    async write(op, value) {
      assert.ok(fs.existsSync(path.join(work, 'journal.json')), 'intent on disk before ' + op);
      assert.ok(JSON.stringify(json(path.join(work, 'journal.json'))).includes(op));
      writes.push(op);
      if (op === 'tag') remote.tag = value;
      else if (op === 'draft') remote.release = { draft: true, prerelease: true, body: 'Linux beta.', assets: {} };
      else if (op.startsWith('asset:')) remote.release.assets[op.slice(6)] = value;
      else if (op === 'production') remote.pointer = value;
      else if (op === 'publish') remote.release.draft = false;
      else assert.fail('unexpected operation ' + op);
      if (op === io.interrupt) { io.interrupt = null; throw new Error('interrupted'); }
    }
  };
  return { work, io, writes, remote, confirmations, gates, entries };
}
const legs = () => Object.fromEntries(arches.flatMap(a => ['ubuntu', 'debian', 'fedora'].map(d => [a + '-' + d, true])));
async function until(w, stage) {
  for (const s of STAGES.slice(0, STAGES.indexOf(stage))) await runStage(s, w.work, w.io);
}
test('ordered stages bind the four candidates, proof, hand check, manifest and public check', async t => {
  const w = world(t);
  assert.deepEqual(STAGES, ['preflight', 'build-check', 'sign', 'staging', 'update-proof', 'hand-check', 'manifest', 'draft', 'sigstore', 'publish', 'verify-public']);
  await assert.rejects(runStage('sign', w.work, w.io), /preflight/);
  for (const s of STAGES) await runStage(s, w.work, w.io);
  assert.deepEqual(w.gates.map(c => [c.build, c.sourceCommit]), [905, 905, 906, 906].map(b => [b, r.sourceCommit]));
  assert.equal(w.gates.length, 4);
  assert.deepEqual(w.confirmations, ['CHECKED ' + r.version, 'DRAFT ' + r.version, 'PUBLISH ' + r.version]);
  assert.deepEqual(Object.keys(w.remote.release.assets).sort(), [...names, ...extras, signature].sort());
  assert.deepEqual(w.remote.pointer, { generation: r.build, digest, previous: [] });
  assert.equal(status(w.work, w.io).next, null);
  assert.deepEqual(json(path.join(w.work, 'state.json')).done['update-proof'].lifecycle, await w.io.repoLifecycle());
});
test('typed confirmations precede every external write in draft and publish', async t => {
  for (const s of ['hand-check', 'draft', 'publish']) {
    const w = world(t); await until(w, s); const before = [...w.writes];
    w.io.confirm = async phrase => { assert.equal(phrase, ({ draft: 'DRAFT', publish: 'PUBLISH', 'hand-check': 'CHECKED' })[s] + ' ' + r.version); return false; };
    await assert.rejects(runStage(s, w.work, w.io), /confirmed/);
    assert.deepEqual(w.writes, before);
  }
});
for (const [op, stage] of [['tag', 'draft'], ['draft', 'draft'], ['asset:' + names[0], 'draft'], ['asset:' + signature, 'sigstore'], ['production', 'publish'], ['publish', 'publish']]) {
  test('resume reconciles an interruption after ' + op, async t => {
    const w = world(t); await until(w, stage); w.io.interrupt = op;
    await assert.rejects(runStage(stage, w.work, w.io), /interrupted/);
    await assert.rejects(runStage('manifest', w.work, w.io), /already|next|draft/);
    await runStage(stage, w.work, w.io);
    for (const s of STAGES.slice(STAGES.indexOf(stage) + 1)) await runStage(s, w.work, w.io);
    assert.equal(new Set(w.writes).size, w.writes.length);
    assert.equal(w.writes.length, 4 + names.length + extras.length + 1);
  });
}
test('recovery refuses remote tag, asset and generation conflicts before another write', async t => {
  for (const change of [w => { w.remote.tag = '0'.repeat(40); }, w => { w.remote.release.assets[names[0]] = sha('wrong'); },
  w => { w.remote.pointer = { generation: 907, digest: sha('newer') }; }]) {
    const w = world(t); await until(w, 'publish'); w.io.interrupt = 'production';
    await assert.rejects(runStage('publish', w.work, w.io), /interrupted/);
    change(w); const before = [...w.writes];
    await assert.rejects(runStage('publish', w.work, w.io), /journal|conflict|differ|changed/);
    assert.deepEqual(w.writes, before);
  }
});
test('a missing proof leg, another digest or a failed production read-back holds the release', async t => {
  for (const change of [report => { delete report.legs['arm64-fedora']; }, report => { report.digest = sha('other'); }]) {
    const w = world(t); await until(w, 'update-proof'); const proof = await w.io.updateProof(); change(proof);
    w.io.updateProof = async () => proof;
    await assert.rejects(runStage('update-proof', w.work, w.io), /leg|digest/);
  }
  const w = world(t); await until(w, 'publish');
  w.io.readProduction = () => { throw Error('metadata mismatch'); };
  await assert.rejects(runStage('publish', w.work, w.io), /metadata/);
  assert.equal(w.remote.release.draft, true);
});

test('update-proof requires all lifecycle legs for the same signed tree and build pair', async t => {
  const w = world(t); await until(w, 'update-proof');
  const good = await w.io.repoLifecycle();
  for (const broken of [null, {...good, legs: {...good.legs, 'arm64-fedora': false}},
    {...good, digest: sha('wrong')}, {...good, from: 1}, {...good, to: 2}]) {
    w.io.repoLifecycle = async () => broken;
    await assert.rejects(runStage('update-proof', w.work, w.io), /workflow|digest|build/);
    assert.equal(status(w.work).next, 'update-proof');
  }
});

test('lifecycle dispatch requires distinct passing mode reports with the staged digest on each native leg', async t => {
  const {realIO} = await import('./linux-release.mjs');
  const w = world(t);
  let omit, drift, failed;
  const adapter = realIO({exec(cmd, args) {
    assert.equal(cmd, 'gh');
    if (args.includes('workflow')) {
      for (const field of ['check=repo-lifecycle', 'from=158.0.8127.905', 'to=' + r.version, 'repository=staging'])
        assert.ok(args.includes(field), field);
      return {status: 0, stdout: 'https://github.com/bnfy/blanc/actions/runs/13'};
    }
    if (args[0] === 'run' && args[1] === 'view') return {status: 0, stdout: '{}'};
    if (args.includes('watch')) { assert.ok(args.includes('--exit-status')); return {status: 0}; }
    assert.ok(args.includes('download'));
    const dest = args[args.indexOf('--dir') + 1];
    for (const arch of arches) for (const system of ['ubuntu', 'debian', 'fedora']) {
      for (const mode of ['managed', 'opt-out', 'manual']) {
        const name = ['repo-lifecycle', system, arch, mode].join('-');
        if (name !== omit) fs.writeFileSync(path.join(dest, name + '.json'), JSON.stringify({arch, system, mode,
          from: r.proofBuild, to: r.build, digest: name === drift ? sha('different') : digest, pass: name !== failed}));
      }
    }
    return {status: 0};
  }});
  const check = () => adapter.repoLifecycle({work: w.work, r, state: {done: {staging: {digest}}}});
  assert.deepEqual(await check(), await w.io.repoLifecycle());
  omit = 'repo-lifecycle-debian-arm64-opt-out';
  await assert.rejects(check, /evidence/);
  drift = omit; omit = null;
  await assert.rejects(check, /digest/);
  failed = drift; drift = null;
  await assert.rejects(check, /failed/);
});

test('workflow dispatch watches the returned run and rejects skipped or missing evidence', async t => {
  const { realIO } = await import('./linux-release.mjs');
  const w = world(t), calls = [];
  const adapter = realIO({
    exec(command, args) {
      calls.push([command, ...args].join(' '));
      if (args.includes('workflow')) return { status: 0, stdout: '', stderr: 'https://github.com/bnfy/blanc/actions/runs/2345\n' };
      if (args.includes('download')) return { status: 0, stdout: '' };
      if (args.includes('watch')) return { status: 0, stdout: '' };
      if (args[0] === 'run' && args[1] === 'view') return { status: 0, stdout: '{}' };
      throw Error('Unexpected command');
    }
  });
  await assert.rejects(adapter.verifyPublic({ work: w.work, r }), /evidence|report/);
  assert.match(calls[0], /workflow run .*--ref chromium\/next.*check=verify-public.*version=158.0.8127.906/);
  assert.match(calls.join('\n'), /run watch 2345.*--exit-status/);
  assert.ok(!calls.some(c => c.includes('run list')));
});

test('an installed beta smoke distinguishes blocker refusal from DNS or connection failure', async () => {
  const { verifySmoke } = await import('../tests/linux-beta-smoke.mjs');
  const good = {
    system: 'debian', testSwitchFound: false, controlLoaded: true, controlHit: true, blockedHit: false, blockedError: 'net::ERR_BLOCKED_BY_CLIENT',
    renderers: [{ pid: 11, seccomp: '2', namespace: 'pid:[44]' }], browserNamespace: 'pid:[2]'
  };
  verifySmoke(good);
  for (const change of [{ renderers: [] }, { renderers: [{ pid: 11, seccomp: '0', namespace: 'pid:[44]' }] },
  { browserNamespace: 'pid:[44]' }, { blockedError: 'net::ERR_NAME_NOT_RESOLVED' }, { blockedHit: true },
  { controlHit: false }, { testSwitchFound: true }]) assert.throws(() => verifySmoke({ ...good, ...change }));
});

test('pre-draft reruns invalidate later checks and overlapping stages cannot sign twice', async t => {
  const w = world(t);
  await until(w, 'manifest');
  await runStage('build-check', w.work, w.io);
  assert.equal(status(w.work, w.io).next, 'sign');
  let started, finish;
  const ready = new Promise(resolve => { started = resolve; });
  const waiting = new Promise(resolve => { finish = resolve; });
  const sign = w.io.sign;
  w.io.sign = async ctx => { started(); await waiting; return sign(ctx); };
  const running = runStage('sign', w.work, w.io);
  await ready;
  try { await assert.rejects(runStage('sign', w.work, { ...w.io, sign: () => assert.fail('second signer') }), /another release stage/); }
  finally { finish(); await running; }
});

test('draft recovery binds the approved notes as well as the asset bytes', async t => {
  const w = world(t);
  await until(w, 'draft'); w.io.interrupt = 'tag';
  await assert.rejects(runStage('draft', w.work, w.io), /interrupted/);
  fs.writeFileSync(path.join(w.work, 'release-notes.md'), 'Changed without draft approval');
  await assert.rejects(runStage('draft', w.work, w.io), /notes/);
  assert.deepEqual(w.writes, ['tag']);
});

test('the schema also accepts proof candidates discovered on the private draft', () => {
  const { proofCandidates, ...minimal } = r;
  validateLinuxRelease(minimal, ledger);
  assert.throws(() => validateLinuxRelease({ ...minimal, sourceCommit: [minimal.sourceCommit] }, ledger));
});

test('the command adapter checks draft tar bytes, per-build GN args and installed deb and rpm evidence', async t => {
  const { realIO } = await import('./linux-release.mjs');
  const { execFileSync, spawnSync } = await import('node:child_process');
  const w = world(t), dir = path.join(w.work, 'fixture');
  fs.mkdirSync(path.join(dir, 'packages'), { recursive: true });
  const committedArgs = 'is_official_build = true\nblanc_beta_build = 7\nblanc_beta_version = "2.0.0-beta.7"\n';
  const builtArgs = committedArgs.replaceAll('7', '906'), exeSha256 = sha('archive executable');
  const meta = {
    id: 'linux-x64-' + exeSha256.slice(0, 16), exeSha256, treeCommit: r.sourceCommit,
    arch: 'x64', platform: 'linux', channel: 'beta', build: r.build, version: r.version, argsSha256: sha(builtArgs), packages: []
  };
  fs.mkdirSync(path.join(dir, 'chrome'));
  fs.writeFileSync(path.join(dir, 'chrome/chrome'), 'archive executable');
  const packageNames = [names[0], names[2]];
  for (const name of packageNames) {
    meta.packages.push({ file: 'packages/' + name, sha256: sha(name) });
    fs.writeFileSync(path.join(dir, 'packages', name), name);
  }
  fs.writeFileSync(path.join(dir, 'candidate.json'), JSON.stringify(meta));
  const archive = ASSET_NAME(meta.arch, meta.channel, meta.build);
  execFileSync('tar', ['-czf', path.join(w.work, archive), '-C', dir, '.']);
  let tarSha256 = sha(fs.readFileSync(path.join(w.work, archive)));
  let wrongHeader = false, omitUbuntu = false;
  const calls = [];
  const adapter = realIO({
    exec(command, argv) {
      calls.push([command, ...argv]);
      let stdout = '';
      if (command === 'python3') {
        const result = spawnSync(command, argv, {encoding: 'utf8'});
        return {status: result.status, stdout: result.stdout};
      }
      else if (command === '/usr/bin/git') stdout = committedArgs;
      else if (argv[0] === 'release' && argv[1] === 'view') stdout = JSON.stringify({ isDraft: true, assets: [{ name: archive, digest: 'sha256:' + tarSha256 }] });
      else if (argv[0] === 'release' && argv[1] === 'download') fs.copyFileSync(path.join(w.work, archive), path.join(argv[argv.indexOf('--dir') + 1], archive));
      else if (argv[0] === 'workflow') stdout = 'https://github.com/bnfy/blanc/actions/runs/98';
      else if (argv[0] === 'run' && argv[1] === 'download') {
        for (const system of ['ubuntu', 'debian', 'fedora']) {
          if (system === 'ubuntu' && omitUbuntu) continue;
          const dest = path.join(argv[argv.indexOf('--dir') + 1], system);
          fs.mkdirSync(dest);
          const deb = system !== 'fedora', name = deb ? packageNames[0] : packageNames[1], e = {
            system, ...(system === 'ubuntu' && ubuntuEvidence),
            arch: 'x64', version: r.version, pass: true, exeSha256: sha('stripped'), testSwitchFound: false,
            controlLoaded: true, controlHit: true, blockedHit: false, blockedError: 'net::ERR_BLOCKED_BY_CLIENT', browserNamespace: 1,
            renderers: [{ pid: 10, seccomp: '2', namespace: 2 }], package: {
              file: name, sha256: sha(name), exeSha256: sha('stripped'), scan: true, fingerprint,
              header: ['blanc-beta', wrongHeader ? '1.0' : r.version + '-1', deb ? 'amd64' : 'x86_64']
            }
          };
          fs.writeFileSync(path.join(dest, 'linux-beta-smoke-' + (deb ? 'deb' : 'rpm') + '.json'), JSON.stringify(e));
        }
      } else if (argv[0] === 'run' && argv[1] === 'view') stdout = '{}';
      else assert.deepEqual(argv.slice(0, 2), ['run', 'watch']);
      return { status: 0, stdout };
    }
  });
  const ctx = { r, work: w.work, state: { done: { preflight: { fingerprint } } } };
  const c = { arch: 'x64', build: r.build, version: r.version, sourceCommit: r.sourceCommit, id: meta.id, tarSha256 };
  const result = await adapter.buildCheck(ctx, c);
  assert.equal(result.run, 98);
  assert.deepEqual(result.packages, packageNames.map(name => ({ name, sha256: sha(name) })));
  assert.ok(calls.some(argv => argv.includes('check=beta-install') && argv.includes('version=' + r.version) &&
    argv.includes('arch=x64') && argv.includes('sha256=' + tarSha256) && argv.includes('sourceCommit=' + r.sourceCommit)));
  omitUbuntu = true;
  await assert.rejects(adapter.buildCheck(ctx, c), /ubuntu/i);
  omitUbuntu = false;
  wrongHeader = true;
  await assert.rejects(adapter.buildCheck(ctx, c), /header/);
  await assert.rejects(adapter.buildCheck(ctx, { ...c, tarSha256: sha('replaced') }), /digest/);
  wrongHeader = false;
  for (const [field, value, error] of [
    ['build', r.proofBuild, /build/],
    ['build', undefined, /build/],
    ['treeCommit', 'b'.repeat(40), /source|treeCommit/],
    ['version', '158.0.8127.905', /version/],
    ['argsSha256', sha(committedArgs), /GN arguments/]
  ]) {
    fs.writeFileSync(path.join(dir, 'candidate.json'), JSON.stringify({ ...meta, [field]: value }));
    execFileSync('tar', ['-czf', path.join(w.work, archive), '-C', dir, '.']);
    tarSha256 = sha(fs.readFileSync(path.join(w.work, archive)));
    await assert.rejects(adapter.buildCheck(ctx, {...c, tarSha256}), error);
  }
});

test('a preexisting approval directory cannot silently replace the verified signing inputs', async t => {
  const { realIO } = await import('./linux-release.mjs');
  const w = world(t);
  const verified = path.join(w.work, 'verified-packages'), approved = path.join(w.work, 'approved-packages');
  fs.mkdirSync(verified); fs.mkdirSync(approved);
  const inputNames = [...names, ...names.map(n => n.replaceAll('.906', '.905'))];
  for (const name of inputNames) fs.writeFileSync(path.join(verified, name), name);
  // A stale, internally consistent approval can carry the right version and names.
  const packages = inputNames.map(file => ({ file, sha256: sha('other ' + file) }));
  for (const row of packages) fs.writeFileSync(path.join(approved, row.file), 'other ' + row.file);
  fs.writeFileSync(path.join(approved, 'approved-packages.json'), JSON.stringify({ schema: 1, releaseVersion: r.version, packages }));
  const adapter = realIO({
    exec(command, argv) {
      assert.equal(command, 'bash', 'unbound approved files reached a network command');
      assert.match(argv[0], /repository-approve.command$/);
      throw Error('fresh owner approval required');
    }
  });
  await assert.rejects(adapter.sign({
    work: w.work, r, state: {
      release: 'record', done: {
        'build-check': {
          checks: [{ packages: inputNames.map(name => ({ name, sha256: sha(name) })) }]
        }
      }
    }
  }), /fresh owner approval required/);
});

test('the owner helper checks its private RPM copies against build-check before opening the signing key', async t => {
  const {realIO} = await import('./linux-release.mjs');
  const {spawnSync} = await import('node:child_process');
  const w = world(t), verified = path.join(w.work, 'verified-packages');
  fs.mkdirSync(verified);
  const packages = [...names, ...names.map(n => n.replace('.906', '.905'))].map(name => {
    fs.writeFileSync(path.join(verified, name), name);
    return {name, sha256: sha(name)};
  });
  const ctx = {work: w.work, r, state: {release: 'fixture', done: {'build-check': {checks: [{packages}]}}}};
  const owner = path.join(w.work, 'owner');
  fs.mkdirSync(owner);
  fs.writeFileSync(path.join(owner, 'repository-common.sh'), [
    'open_repository_work() { work=$(mktemp -d "$PRIVATE_ROOT/private.XXXXXX"); }',
    'open_signing_key() { echo signing-key-opened >&2; exit 77; }'
  ].join('\n'));
  // Swap the RPM for the duration of the copy. A second check of the
  // mutable original would still see the expected bytes.
  fs.writeFileSync(path.join(owner, 'sitecustomize.py'), `import os, shutil
from pathlib import Path
original_copy = shutil.copyfile
def copyfile(src, dst):
    if str(src) != os.getenv("SWAP_RPM"):
        return original_copy(src, dst)
    original = Path(src).read_bytes()
    try:
        Path(src).write_bytes(b"replacement")
        return original_copy(src, dst)
    finally:
        Path(src).write_bytes(original)
shutil.copyfile = copyfile
`);
  let replace = false;
  const adapter = realIO({exec(cmd, args) {
    assert.equal(cmd, 'bash');
    assert.match(args[0], /repository-approve.command$/);
    const helper = path.join(owner, 'repository-approve.command');
    fs.copyFileSync(args[0], helper);
    const result = spawnSync(cmd, [helper, ...args.slice(1)], {encoding: 'utf8',
      env: {...process.env, PRIVATE_ROOT: w.work, repo: path.resolve(path.dirname(args[0]), '../repository'),
        PYTHONPATH: owner, SWAP_RPM: replace ? path.join(verified, names[2]) : ''}});
    assert.equal(result.status === 77, !replace, result.stderr);
    if (replace) assert.match(result.stderr, /digest|SHA-256/i);
    throw Error('fixture stopped before signing');
  }});
  await assert.rejects(adapter.sign(ctx), /fixture stopped before signing/);
  replace = true;
  await assert.rejects(adapter.sign(ctx), /fixture stopped before signing/);
});

test('draft rechecks the shared claims against the fetched tip', async t => {
  const w = world(t); await until(w, 'draft');
  w.entries[1].platforms = ['windows'];
  await assert.rejects(runStage('draft', w.work, w.io), /no claim names this build, its source commit and linux/);
  assert.deepEqual(w.writes, []);
});

test('after the pointer switches, recovery finishes the uploader read-back before publishing', async t => {
  const w = world(t);
  await until(w, 'publish');
  w.io.interrupt = 'production';
  await assert.rejects(runStage('publish', w.work, w.io), /interrupted/);
  w.io.finishProduction = () => { throw Error('public package read-back failed'); };
  await assert.rejects(runStage('publish', w.work, w.io), /public package read-back failed/);
  assert.equal(w.remote.release.draft, true);
  assert.equal(w.writes.filter(op => op === 'production').length, 1);
  w.io.finishProduction = () => {};
  await runStage('publish', w.work, w.io);
  assert.equal(w.remote.release.draft, false);
  assert.equal(w.writes.filter(op => op === 'production').length, 1);
});

test('preflight needs both Linux claims on the same source, in claim order, and the current Linux ledger', async t => {
  const w = world(t);
  for (const change of [
    entries => entries.shift(),
    entries => { entries[0].sourceCommit = 'b'.repeat(40); },
    entries => { entries[1].platforms = ['windows']; },
    entries => entries.reverse()
  ]) {
    const entries = structuredClone(w.entries);
    change(entries);
    w.io.preflightSource = () => ({ fingerprint, ledger, claims: { schema: 1, sequences: { 'desktop-158': entries } } });
    await assert.rejects(runStage('preflight', w.work, w.io), /no claim|earlier claim/);
  }
  w.io.preflightSource = () => ({ fingerprint, ledger: {schema: 1, builds: [{build: 904}]},
    claims: {schema: 1, sequences: {'desktop-158': w.entries}} });
  await assert.rejects(runStage('preflight', w.work, w.io), /previousBuild/);
});

test('build-check compares evidence for each architecture with the record, even when candidate data includes other fields', async t => {
  const w = world(t);
  const forged = {...r, candidates: {...r.candidates, arm64: {...r.candidates.arm64, sourceCommit: 'b'.repeat(40), version: '158.0.8127.8'}}};
  fs.writeFileSync(path.join(w.work, 'linux-release.json'), JSON.stringify(forged));
  await until(w, 'build-check');
  const buildCheck = w.io.buildCheck;
  w.io.buildCheck = async (ctx, c) => {
    const e = await buildCheck(ctx, c);
    return c.build === r.build && c.arch === 'arm64' ? {...e, treeCommit: 'b'.repeat(40)} : e;
  };
  await assert.rejects(runStage('build-check', w.work, w.io), /source|treeCommit/);
});

test('the owner adapter reads both claims and ledger at the same fetched chromium/next commit', async () => {
  const {realIO} = await import('./linux-release.mjs');
  const tip = 'e'.repeat(40), fpr = '50D361974F477C8C87E117BD95AE97ABCACFEE6C';
  const dir = new URL('../linux/', import.meta.url);
  const claims = {schema: 1, sequences: {'desktop-158': [r.proofBuild, r.build].map(build =>
    ({build, sourceCommit: r.sourceCommit, platforms: ['linux'], purpose: build === r.build ? 'release' : 'proof'}))}};
  const calls = [];
  const adapter = realIO({exec(program, argv) {
    calls.push(argv);
    let status = 0, stdout = '';
    if (program === 'gpg') stdout = 'pub:fixture\nfpr:::::::::' + fpr + ':\n';
    else if (argv.includes('ls-remote')) status = 2;
    else if (argv.includes('rev-parse') && argv.includes('-q')) status = 1;
    else if (argv.includes('rev-parse')) stdout = tip + '\n';
    else if (argv.includes('ls-tree')) stdout = '100644 blob ' + 'f'.repeat(40) + '\tchromium/release/build-reservations.json\n';
    else if (argv.includes('show')) {
      const file = argv.at(-1);
      if (file === tip + ':chromium/release/build-reservations.json') stdout = JSON.stringify(claims);
      else if (file === tip + ':chromium/release/linux-ledger.json') stdout = JSON.stringify(ledger);
      else if (file.startsWith(r.sourceCommit + ':chromium/linux/')) stdout = fs.readFileSync(new URL(file.split(':chromium/linux/')[1], dir), 'utf8');
      else assert.fail('Unexpected git object ' + file);
    }
    return {status, stdout};
  }});
  const result = await adapter.preflightSource({r});
  assert.deepEqual(result.claims, claims);
  assert.deepEqual(result.ledger, ledger);
  assert.ok(calls.some(args => args.includes('fetch') && args.some(a => a.includes('chromium/next'))));
  assert.ok(calls.some(args => args.includes('--is-ancestor') && args.at(-2) === r.sourceCommit && args.at(-1) === tip));
});

test('status validates record shape and preflight uses the fetched ledger on a stale checkout', async t => {
  const w = world(t);
  const record = {...r, previousBuild: 902};
  const write = data => fs.writeFileSync(path.join(w.work, 'linux-release.json'), JSON.stringify(data));
  for (const previousBuild of [undefined, -1, 1.5, '902', r.build]) {
    write({...record, previousBuild});
    assert.throws(() => status(w.work, w.io), /previousBuild/);
  }
  write(record);
  assert.equal(status(w.work, w.io).next, 'preflight');
  const source = w.io.preflightSource();
  w.io.preflightSource = () => ({...source, ledger: {schema: 1, builds: [{build: 902}]}});
  assert.equal((await runStage('preflight', w.work, w.io)).next, 'build-check');
});

test('a remote edit to approved notes stops both interrupted draft adoption and publication', async t => {
  for (const stage of ['draft', 'publish']) {
    const w = world(t);
    await until(w, stage);
    if (stage === 'draft') {
      w.io.interrupt = 'draft';
      await assert.rejects(runStage(stage, w.work, w.io), /interrupted/);
    }
    const writes = [...w.writes];
    w.remote.release.body += ' Edited on GitHub.';
    await assert.rejects(runStage(stage, w.work, w.io), /notes|body/);
    assert.deepEqual(w.writes, writes);
  }
});

test('both GitHub snapshot paths preserve the exact draft body', async () => {
  const {realIO} = await import('./linux-release.mjs');
  const body = '## Linux beta\n\nRelease notes.\n';
  const view = {draft: true, prerelease: true, assets: [], body};
  for (const fallback of [false, true]) {
    const adapter = realIO({
      exec(cmd, args) {
        if (cmd === '/usr/bin/git') return {status: 2};
        if (args.includes('--paginate')) {
          assert.match(args.at(-1), /\bbody\b/);
        } else if (fallback) return {status: 1};
        return {status: 0, stdout: JSON.stringify(view)};
      },
      fetch: async () => new Response(null, {status: 404})
    });
    assert.equal((await adapter.snapshot({r})).release.body, body);
  }
});

test('production writes and read-back recovery pass the full journaled predecessor to the uploader', async () => {
  const {realIO} = await import('./linux-release.mjs');
  for (const before of [null, {generation: 900, digest: sha('previous'), previous: [898, 896]}]) {
    const ctx = {work: '/fixture', r, journal: {before}, state: {done: {'update-proof': {digest}}}};
    const adapter = realIO({exec(cmd, args) {
      assert.equal(cmd, 'bash');
      assert.deepEqual(args.slice(1), ['production', '/fixture/signed-tree', String(r.build), digest, JSON.stringify(before)]);
      return {status: 0};
    }});
    await adapter.write('production', {generation: r.build, digest}, ctx);
    await adapter.finishProduction(ctx, {generation: r.build, digest});
  }
});

test('release hashing opens without following links and checks that descriptor before reading', async t => {
  const w = world(t);
  await until(w, 'draft');
  const notes = fs.realpathSync(path.join(w.work, 'release-notes.md'));
  const open = fs.openSync, stat = fs.fstatSync, read = fs.readSync;
  let selected, checked = false;
  t.mock.method(fs, 'openSync', (file, flags, ...args) => {
    if (file === notes) assert.ok(flags & fs.constants.O_NOFOLLOW, 'release input must open with O_NOFOLLOW');
    const fd = open(file, flags, ...args);
    if (file === notes) {
      selected = fd;
      checked = false;
    }
    return fd;
  });
  t.mock.method(fs, 'fstatSync', (fd, ...args) => {
    if (fd === selected) checked = true;
    return stat(fd, ...args);
  });
  t.mock.method(fs, 'readSync', (fd, ...args) => {
    if (fd === selected) assert.ok(checked, 'fstat the opened descriptor before reading it');
    return read(fd, ...args);
  });
  w.io.confirm = async () => false;
  await assert.rejects(runStage('draft', w.work, w.io), /not confirmed/);
  assert.ok(checked);
});

test('Ubuntu smoke requires restricted user namespaces and the loaded beta profile on the running browser', async () => {
  const {verifySmoke} = await import('../tests/linux-beta-smoke.mjs');
  const good = {
    system: 'ubuntu', ...ubuntuEvidence, testSwitchFound: false, controlLoaded: true, controlHit: true,
    blockedHit: false, blockedError: 'net::ERR_BLOCKED_BY_CLIENT', browserNamespace: 1,
    renderers: [{pid: 11, seccomp: '2', namespace: 2}]
  };
  verifySmoke(good);
  for (const change of [{restrictUnprivilegedUserns: '0'}, {apparmor: undefined},
    {apparmor: {...good.apparmor, mode: undefined}}, {apparmor: {...good.apparmor, attachment: '/usr/bin/other'}},
    {apparmor: {...good.apparmor, label: 'unconfined'}}, {apparmor: {...good.apparmor, label: 'blanc-beta-other'}}]) {
    assert.throws(() => verifySmoke({...good, ...change}), /Ubuntu|AppArmor|profile/i);
  }
});

test('a just-dispatched run that GitHub doesn\'t list yet is waited for, not failed', async t => {
  const { realIO } = await import('./linux-release.mjs');
  const w = world(t);
  for (const [missing, outcome] of [[2, 'watched'], [Infinity, 'never']]) {
    const calls = [];
    let views = 0, slept = 0;
    const adapter = realIO({
      sleep: () => { slept++; },
      exec(command, args) {
        calls.push([command, ...args].join(' '));
        if (args.includes('workflow')) return { status: 0, stdout: '', stderr: 'https://github.com/bnfy/blanc/actions/runs/45067527269\n' };
        if (args[0] === 'run' && args[1] === 'view') return ++views > missing ? { status: 0, stdout: '{}' } : { status: 1, stdout: '', stderr: 'HTTP 404: Not Found' };
        if (args.includes('download')) return { status: 0, stdout: '' };
        if (args.includes('watch')) return { status: 0, stdout: '' };
        throw Error('Unexpected command');
      }
    });
    const run = adapter.verifyPublic({ work: w.work, r });
    if (outcome === 'watched') {
      await assert.rejects(run, /evidence|report/);
      assert.equal(views, 3);
      assert.equal(slept, 2);
      assert.match(calls.join('\n'), /run watch 45067527269/);
    } else {
      await assert.rejects(run, /never became visible/);
      assert.ok(!calls.some(c => c.includes('run watch')));
    }
  }
});
