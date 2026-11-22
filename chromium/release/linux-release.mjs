#!/usr/bin/env node
// One owner-run stage per invocation. The private work directory holds
// linux-release.json, release-notes.md, and the state needed to resume.
// The private proof build (B-1) and release build (B) name the same source
// commit. Each has a desktop claim. The record pins both release candidates;
// the proof candidates can also be pinned, or resolved from their draft assets.
//
// Workflow evidence is downloaded by dispatch run ID. The install job runs
// linux-beta-smoke.mjs VERSION linux-beta-smoke-{deb,rpm}.json --package=FILE.
// Task 6/7 jobs return CHECK-{ubuntu,debian,fedora}-{x64,arm64}.json with
// system, arch and pass. The proof also records numeric from/to and digest;
// verify-public records the installed four-part version.
import fs from 'node:fs';
import os from 'node:os';
import { gunzipSync } from 'node:zlib';
import { verifySmoke } from '../tests/linux-beta-smoke.mjs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { CHROME_VERSION, check, equal, sha256, reason } from './policy.mjs';
import { ROOT } from './preflight.mjs';
import { REPO, COSIGN_IDENTITY, COSIGN_ISSUER, COSIGN_REDIRECT, realIO as ownerIO, confirmAbsent } from './release.mjs';
import { claimProblem } from './build-claims.mjs';
import { betaArgsFor } from './beta-args.mjs';
import { ASSET_NAME, candidateId } from '../linux/candidate.mjs';

export const STAGES = ['preflight', 'build-check', 'sign', 'staging', 'update-proof', 'hand-check', 'manifest', 'draft', 'sigstore', 'publish', 'verify-public'];
const arches = { x64: ['amd64', 'x86_64'], arm64: ['arm64', 'aarch64'] };
const candidateDraft = 'fork-linux-candidate';
const workflowFile = 'chromium-linux-candidate.yml';
const keyFile = 'chromium/linux/keys/blanc-repository.asc';
const noticeFile = 'chromium/blanc/notices/THIRD_PARTY_NOTICES.txt';
const linux = path.join(ROOT, 'chromium/linux');
const bundle = 'SHA256SUMS.sigstore.json';
const hashPattern = /^[a-f0-9]{64}$/;
const commitPattern = /^[a-f0-9]{40}$/;
const json = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const format = data => JSON.stringify(data, null, 2) + '\n';
const version = build => CHROME_VERSION.slice(0, CHROME_VERSION.lastIndexOf('.') + 1) + build;
const packageNames = (v, arch) => {
  const [deb, rpm] = arches[arch];
  return ['blanc-beta_' + v + '-1_' + deb + '.deb', 'blanc-beta-' + v + '-1.' + rpm + '.rpm'];
};
const allPackages = v => Object.keys(arches).flatMap(a => packageNames(v, a));
function candidateMatrix(r) {
  return [r.proofBuild, r.build].flatMap(build => Object.keys(arches).map(arch => {
    const candidate = (build === r.build ? r.candidates : r.proofCandidates)?.[arch];
    return { arch, build, version: version(build), sourceCommit: r.sourceCommit,
      ...(candidate && {id: candidate.id, tarSha256: candidate.tarSha256}) };
  }));
}

function validateRecord(r) {
  check(r?.schema === 1, 'linux-release.json schema must be 1');
  check(Number.isInteger(r.build) && r.build > 1 && r.build <= 9999, 'invalid desktop build');
  equal(r.version, version(r.build), 'version must use the pinned Chromium and claimed build');
  equal(r.tag, 'chromium-beta-linux-' + r.version, 'invalid Linux beta tag');
  check(r.prerelease === true && r.makeLatest === false, 'Linux release must be a pre-release with latest=false');
  check(typeof r.sourceCommit === 'string' && commitPattern.test(r.sourceCommit), 'full release source commit required');
  if (r.proofSourceCommit !== undefined) equal(r.proofSourceCommit, r.sourceCommit, 'both builds must name the same source commit');
  equal(r.proofBuild, r.build - 1, 'proofBuild must be B-1');
  check(r.previousBuild === null || (Number.isInteger(r.previousBuild) && r.previousBuild >= 0 && r.previousBuild < r.build),
    'previousBuild must be null or an earlier Linux build');
  for (const candidates of [r.candidates, ...(r.proofCandidates === undefined ? [] : [r.proofCandidates])]) {
    equal(Object.keys(candidates ?? {}).sort(), Object.keys(arches).sort(), 'both x64 and arm64 candidates are required');
    for (const [arch, c] of Object.entries(candidates)) {
      check(typeof c?.id === 'string' && new RegExp('^linux-' + arch + '-[0-9a-f]{16}$').test(c.id) &&
        typeof c.tarSha256 === 'string' && hashPattern.test(c.tarSha256), 'invalid candidate ID or tar SHA-256 for ' + arch);
    }
  }
}

export function validateLinuxRelease(r, ledger) {
  validateRecord(r);
  check(ledger?.schema === 1 && Array.isArray(ledger.builds), 'invalid Linux ledger');
  const last = ledger.builds.filter(b => !b.proofOnly).at(-1)?.build ?? 0;
  check(r.previousBuild === last || (last === 0 && r.previousBuild === null), 'previousBuild must be the last released Linux build');
  return r;
}

// Packages are large enough that reading two into memory can exhaust Node.
function fileHash(file) {
  const { O_RDONLY, O_NOFOLLOW, O_NONBLOCK } = fs.constants;
  const fd = fs.openSync(file, O_RDONLY | O_NOFOLLOW | O_NONBLOCK);
  try {
    check(fs.fstatSync(fd).isFile(), 'regular release file required: ' + path.basename(file));
    const block = Buffer.allocUnsafe(1024 * 1024), h = createHash('sha256');
    let n;
    while ((n = fs.readSync(fd, block, 0, block.length, null)) > 0) h.update(block.subarray(0, n));
    return h.digest('hex');
  } finally { fs.closeSync(fd); }
}
function save(file, value) {
  const temp = file + '.' + randomUUID();
  const fd = fs.openSync(temp, 'wx', 0o600);
  try { fs.writeFileSync(fd, format(value)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(temp, file);
  const parent = fs.openSync(path.dirname(file), 'r');
  try { fs.fsyncSync(parent); } finally { fs.closeSync(parent); }
}
function privateWork(work) {
  check(path.isAbsolute(work), 'absolute work folder required');
  work = fs.realpathSync(work);
  check(work !== ROOT && !work.startsWith(ROOT + path.sep) && (fs.statSync(work).mode & 0o077) === 0, 'owner-only work folder outside the repository required');
  return work;
}
function load(work) {
  const record = fs.readFileSync(path.join(work, 'linux-release.json'));
  const binding = sha256(record), r = JSON.parse(record);
  const statePath = path.join(work, 'state.json'), journalPath = path.join(work, 'journal.json');
  const state = fs.existsSync(statePath) ? json(statePath) : { schema: 1, release: binding, done: {} };
  const journal = fs.existsSync(journalPath) ? json(journalPath) : null;
  equal(state.release, binding, 'release record changed after a stage was recorded');
  if (journal) equal(journal.release, binding, 'journal belongs to another release');
  validateRecord(r);
  return { work, r, state, statePath, journal, journalPath, assets: path.join(work, 'assets') };
}
export function status(work) {
  const { state } = load(privateWork(work));
  return { done: Object.keys(state.done), next: STAGES.find(s => !state.done[s]) ?? null };
}
function tree(ctx, io) {
  const { digest } = ctx.state.done.sign;
  equal(io.treeDigest(ctx), digest, 'signed tree digest changed after signing');
  return { generation: ctx.r.build, digest };
}
function checkLegs(report) {
  check(Number.isSafeInteger(report?.run) && report.run > 0, 'missing workflow run');
  for (const arch of Object.keys(arches)) for (const os of ['ubuntu', 'debian', 'fedora']) {
    check(report.legs?.[arch + '-' + os] === true, 'missing or failed workflow leg ' + arch + '-' + os);
  }
}
async function confirm(io, verb, ctx) {
  check(await io.confirm(verb + ' ' + ctx.r.version), 'not confirmed');
}
// A remote object may be absent, present with its intended value, or in
// conflict. Only a pending intent may be absent. A completed write disappearing
// is a conflict too. A visible release must have a publish intent.
function reconcile(ctx, remote) {
  const { intents, before } = ctx.journal;
  const observed = {
    tag: remote.tag, draft: remote.release ? true : null,
    production: remote.pointer, publish: remote.release?.draft === false ? true : null
  };
  if (remote.release) {
    check(remote.release.prerelease === true && typeof remote.release.draft === 'boolean', 'release disagrees with journal');
    check(typeof remote.release.body === 'string' && sha256(remote.release.body) === ctx.journal.notes,
      'remote release notes differ from the approved notes');
    for (const [name, hash] of Object.entries(remote.release.assets)) observed['asset:' + name] = hash;
  }
  for (const key of new Set([...Object.keys(observed), ...Object.keys(intents)])) {
    const actual = observed[key] ?? null, previous = key === 'production' ? before : null;
    const intent = intents[key];
    if (intent && isDeepStrictEqual(actual, intent.value)) continue;
    check((!intent || !intent.done) && isDeepStrictEqual(actual, previous), 'remote ' + key + ' conflicts with release journal');
  }
  return observed;
}
async function perform(ctx, io, key, value) {
  const journal = ctx.journal;
  let observed = reconcile(ctx, await io.snapshot(ctx));
  let intent = journal.intents[key];
  if (!intent) {
    intent = journal.intents[key] = { value, done: false };
    save(ctx.journalPath, journal);
  }
  equal(intent.value, value, 'local ' + key + ' differs from journal');
  if (!isDeepStrictEqual(observed[key], value)) {
    await io.write(key, value, ctx);
    observed = reconcile(ctx, await io.snapshot(ctx));
    equal(observed[key], value, 'remote ' + key + ' did not match after write');
  } else if (key === 'production' && !intent.done) {
    // The pointer can be visible before the uploader finishes its read-back
    // and retention pass. On the same generation it performs only that tail.
    await io.finishProduction(ctx, value);
    reconcile(ctx, await io.snapshot(ctx));
  }
  if (!intent.done) { intent.done = true; save(ctx.journalPath, journal); }
}
function validateAssets(ctx) {
  const hashes = ctx.state.done.manifest.hashes;
  for (const [name, digest] of Object.entries(hashes)) equal(fileHash(path.join(ctx.assets, name)), digest, 'manifest asset changed: ' + name);
  return hashes;
}

async function checkSource(ctx, io) {
  const {r} = ctx;
  const {claims, ledger, fingerprint} = await io.preflightSource(ctx);
  validateLinuxRelease(r, ledger);
  for (const build of [r.proofBuild, r.build]) {
    const problem = claimProblem(claims, {build, sourceCommit: r.sourceCommit, platform: 'linux'});
    check(!problem, 'Linux build ' + build + ': ' + problem);
  }
  check(/^[A-F0-9]{40}$/.test(fingerprint), 'missing committed repository key fingerprint');
  return {fingerprint};
}

const stages = {
  async preflight(ctx, io) {
    const source = await checkSource(ctx, io);
    const remote = await io.snapshot(ctx);
    check(!remote.tag && !remote.release, 'release or tag already exists');
    return source;
  },
  async 'build-check'(ctx, io) {
    const checks = [];
    for (const candidate of candidateMatrix(ctx.r)) {
      const evidence = await io.buildCheck(ctx, candidate);
      for (const [k, v] of Object.entries(candidate)) equal(evidence[k], v, 'build check refers to another candidate: ' + k);
      equal(evidence.treeCommit, ctx.r.sourceCommit, 'candidate treeCommit differs from the release source commit');
      equal(evidence.fingerprint, ctx.state.done.preflight.fingerprint, 'scan used another key');
      check(evidence.scan === true && evidence.headers === true && evidence.smoke === true && Number.isSafeInteger(evidence.run) && evidence.run > 0, 'candidate package checks failed');
      checks.push(evidence);
    }
    return { checks };
  },
  async sign(ctx, io) {
    const result = await io.sign(ctx);
    check(hashPattern.test(result.digest), 'signer returned no tree digest');
    equal(io.treeDigest(ctx), result.digest, 'signed tree digest differs');
    equal(result.packages.map(p => p.name).sort(), allPackages(ctx.r.version).sort(), 'signed tree must contain only the public build for both arches');
    for (const p of result.packages) equal(fileHash(path.join(ctx.work, p.file)), p.sha256, 'approved package differs from signed tree');
    return result;
  },
  async staging(ctx, io) {
    const pointer = tree(ctx, io);
    await io.upload('staging', ctx, pointer);
    equal(await io.stagingPointer(ctx), pointer, 'staging serves another generation');
    return pointer;
  },
  async 'update-proof'(ctx, io) {
    const target = tree(ctx, io);
    equal(await io.stagingPointer(ctx), target, 'staging differs before proof');
    const report = await io.updateProof(ctx);
    checkLegs(report);
    equal(report.from, ctx.r.proofBuild, 'proof started from another build');
    equal(report.to, ctx.r.build, 'proof installed another build');
    equal(report.digest, target.digest, 'proof digest differs from staged tree');
    equal(await io.stagingPointer(ctx), target, 'staging changed during proof');
    return report;
  },
  async 'hand-check'(ctx, io) {
    const target = tree(ctx, io);
    equal(await io.stagingPointer(ctx), target, 'the VM must check the proven staging tree');
    await confirm(io, 'CHECKED', ctx);
    equal(await io.stagingPointer(ctx), target, 'staging changed during the VM hand check');
    return target;
  },
  async manifest(ctx, io) {
    const { r, assets } = ctx;
    tree(ctx, io);
    fs.mkdirSync(assets, { recursive: true, mode: 0o700 });
    const files = [];
    for (const p of ctx.state.done.sign.packages) {
      const dest = path.join(assets, p.name);
      fs.copyFileSync(path.join(ctx.work, p.file), dest);
      equal(fileHash(dest), p.sha256, 'package differs from approved bytes');
      files.push(p.name);
    }
    for (const [name, source] of [['blanc-repository.asc', keyFile], ['NOTICES.txt', noticeFile]]) {
      fs.writeFileSync(path.join(assets, name), io.sourceFile(r.sourceCommit, source)); files.push(name);
    }
    fs.copyFileSync(path.join(ctx.work, 'linux-release.json'), path.join(assets, 'linux-release.json'));
    files.push('linux-release.json');
    const entries = files.map(name => ({ name, size: fs.statSync(path.join(assets, name)).size, sha256: fileHash(path.join(assets, name)) }));
    const manifest = format({ schema: 1, platform: 'linux', version: r.version, sourceCommit: r.sourceCommit, tag: r.tag, assets: entries });
    fs.writeFileSync(path.join(assets, 'RELEASE-MANIFEST.json'), manifest);
    const hashes = Object.fromEntries(entries.map(e => [e.name, e.sha256]));
    hashes['RELEASE-MANIFEST.json'] = sha256(Buffer.from(manifest));
    const sums = Object.entries(hashes).map(([name, hash]) => hash + '  ' + name + '\n').join('');
    fs.writeFileSync(path.join(assets, 'SHA256SUMS'), sums);
    hashes.SHA256SUMS = sha256(Buffer.from(sums));
    return { hashes };
  },
  async draft(ctx, io) {
    const { r } = ctx, hashes = validateAssets(ctx);
    const notes = fileHash(path.join(ctx.work, 'release-notes.md'));
    if (!ctx.journal) {
      await confirm(io, 'DRAFT', ctx);
      const source = await checkSource(ctx, io);
      equal(source.fingerprint, ctx.state.done.preflight.fingerprint, 'repository key changed after preflight');
      const remote = await io.snapshot(ctx);
      check(!remote.tag && !remote.release && (!remote.pointer || remote.pointer.generation < r.build), 'tag, draft or production generation already exists');
      ctx.journal = { schema: 1, release: ctx.state.release, notes, before: remote.pointer, intents: {} };
      save(ctx.journalPath, ctx.journal);
    }
    equal(ctx.journal.notes, notes, 'release notes changed after draft approval');
    await perform(ctx, io, 'tag', r.sourceCommit);
    await perform(ctx, io, 'draft', true);
    for (const [name, hash] of Object.entries(hashes)) await perform(ctx, io, 'asset:' + name, hash);
    await io.readDraft(ctx, hashes);
    return { tag: r.tag };
  },
  async sigstore(ctx, io) {
    validateAssets(ctx);
    const file = path.join(ctx.assets, bundle);
    if (!fs.existsSync(file)) await io.signChecksums(ctx.assets);
    await io.verifyChecksums(ctx.assets);
    const hash = fileHash(file);
    await perform(ctx, io, 'asset:' + bundle, hash);
    return { sha256: hash };
  },
  async publish(ctx, io) {
    validateAssets(ctx);
    const target = tree(ctx, io);
    equal(target.digest, ctx.state.done['update-proof'].digest, 'production requires staging-proven digest');
    equal(ctx.state.done['hand-check'].digest, target.digest, 'VM hand check names another digest');
    if (!ctx.journal.intents.production) await confirm(io, 'PUBLISH', ctx);
    const stable = await io.latest();
    check(/^v\d+\.\d+\.\d+$/.test(stable), 'latest release must be Electron Blanc');
    const before = ctx.journal.before;
    const previous = before ? [before.generation, ...before.previous].slice(0, 2) : [];
    await perform(ctx, io, 'production', { ...target, previous });
    await io.readProduction(ctx, target);
    await perform(ctx, io, 'publish', true);
    const latest = await io.latest();
    check(/^v\d+\.\d+\.\d+$/.test(latest), 'latest release must still be Electron Blanc after publication');
    return { latest, ...target };
  },
  async 'verify-public'(ctx, io) {
    const report = await io.verifyPublic(ctx);
    equal(report.version, ctx.r.version, 'public check used another version');
    checkLegs(report);
    return report;
  },
};

export async function runStage(stage, work, io = realIO()) {
  work = privateWork(work);
  // flock is attached to the shared open file description. The parent's fd
  // keeps the lock after Python exits, and the kernel drops it even on SIGKILL.
  const fd = fs.openSync(path.join(work, 'release.lock'), 'a', 0o600);
  try {
    const lock = spawnSync('python3', ['-c', 'import fcntl, sys\ntry: fcntl.flock(3, fcntl.LOCK_EX | fcntl.LOCK_NB)\nexcept BlockingIOError: sys.exit(73)'],
      { stdio: ['ignore', 'ignore', 'pipe', fd] });
    check(lock.status !== 73, 'another release stage is running in this work directory');
    check(lock.status === 0, 'could not lock the release work directory with python3');
    const ctx = load(work);
    if (ctx.journal) reconcile(ctx, await io.snapshot(ctx));
    else check(!ctx.state.done.draft, 'release journal is missing');
    const next = STAGES.find(s => !ctx.state.done[s]);
    const index = STAGES.indexOf(stage);
    const rerun = index >= 0 && !ctx.journal && index < STAGES.indexOf('draft') && ctx.state.done[stage];
    check(stage === next || rerun, 'next stage is ' + (next ?? 'none') + '; completed stages cannot run again');
    if (rerun) {
      // Discard dependent evidence before the rerun, including on a failure.
      for (const name of STAGES.slice(index)) delete ctx.state.done[name];
      save(ctx.statePath, ctx.state);
    }
    const result = await stages[stage](ctx, io);
    ctx.state.done[stage] = { ...result, at: new Date().toISOString() };
    save(ctx.statePath, ctx.state);
    return { stage, next: STAGES[index + 1] ?? null };
  } finally { fs.closeSync(fd); }
}

const scratch = (parent, name) => fs.mkdtempSync(path.join(parent, name + '-'));
const signedTree = ctx => path.join(ctx.work, 'signed-tree');
const origins = { staging: 'https://pkg-staging.blanc.day', production: 'https://pkg.blanc.day' };

function artifactFiles(folder) {
  return fs.readdirSync(folder, { withFileTypes: true, recursive: true }).filter(e => e.isFile()).map(e => path.join(e.parentPath, e.name));
}
function exactFile(files, name) {
  const matches = files.filter(f => path.basename(f) === name);
  check(matches.length === 1, 'expected one workflow evidence file named ' + name);
  return matches[0];
}
function inventory(ctx) {
  const record = json(path.join(signedTree(ctx), 'signed-tree.json'));
  const list = record.files.map(e => e.sha256 + '  ' + e.path + '\n').join('');
  equal(sha256(Buffer.from(list)), record.digest, 'signed tree inventory digest changed');
  return record;
}

// Commands and HTTP reads are confined to this adapter. A dispatch follows
// the run URL returned by GitHub, never the latest run of a shared workflow.
export function realIO(commands = ownerIO()) {
  const must = (cmd, args, message, options) => {
    const result = commands.exec(cmd, args, options);
    check(result.status === 0, message);
    return result.stdout;
  };
  const gh = (args, message, options) => must('gh', [...args, '--repo', REPO], message, options);
  const api = (args, message) => must('gh', ['api', ...args], message);
  const git = (args, message) => must('/usr/bin/git', ['-C', ROOT, ...args], message);
  const sourceFile = (commit, file) => git(['show', commit + ':' + file], 'cannot read ' + file + ' from source commit');
  const request = (url) => (commands.fetch ?? fetch)(url, { redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(60000) });
  async function pointer(target) {
    const res = await request(origins[target] + '/current.json');
    if (res.status === 404) return null;
    check(res.ok, 'cannot read ' + target + ' generation');
    const value = await res.json();
    check(Number.isSafeInteger(value.generation) && value.generation > 0 && hashPattern.test(value.digest) && Array.isArray(value.previous), 'invalid generation pointer');
    return value;
  }
  function workflow(ctx, inputs) {
    const output = gh(['workflow', 'run', workflowFile, '--ref', 'chromium/next', ...Object.entries(inputs).flatMap(([key, value]) => ['-f', key + '=' + value])],
      'could not dispatch ' + inputs.check);
    const prefix = 'https://github.com/' + REPO + '/actions/runs/';
    const url = output.trim().split(/\s+/).find(word => word.startsWith(prefix));
    check(url && /^[1-9]\d*$/.test(url.slice(prefix.length)), 'dispatch returned no unique workflow run URL; inspect the dispatch');
    const id = url.slice(prefix.length);
    gh(['run', 'watch', id, '--exit-status'], 'workflow ' + id + ' did not pass', { interactive: true });
    const dir = scratch(ctx.work, 'run-' + id);
    gh(['run', 'download', id, '--dir', dir], 'could not download workflow evidence for ' + id);
    return { run: Number(id), files: artifactFiles(dir), dir };
  }
  function matrixReport(ctx, checkName, inputs) {
    // Each leg's proof harness writes its version/digest and aggregate pass
    // only after all its positive, refusal and uninstall checks have run.
    const { run, files } = workflow(ctx, { check: checkName, ...inputs });
    const result = { run, legs: {} };
    for (const arch of Object.keys(arches)) for (const distro of ['ubuntu', 'debian', 'fedora']) {
      const report = json(exactFile(files, checkName + '-' + distro + '-' + arch + '.json'));
      check(report.arch === arch && report.system === distro && report.pass === true, 'failed ' + checkName + ' evidence for ' + distro + ' ' + arch);
      const expected = checkName === 'update-proof' ? { from: ctx.r.proofBuild, to: ctx.r.build, digest: ctx.state.done.staging.digest } : { version: ctx.r.version };
      for (const [key, value] of Object.entries(expected)) equal(report[key], value, 'wrong ' + key + ' in ' + checkName + ' evidence');
      Object.assign(result, expected);
      result.legs[arch + '-' + distro] = true;
    }
    return result;
  }
  function candidateAssets() {
    const release = JSON.parse(gh(['release', 'view', candidateDraft, '--json', 'isDraft,assets'], 'cannot read candidate draft'));
    check(release.isDraft === true, 'candidate transfer release must still be a draft');
    return release.assets;
  }
  const ownerCommand = (name, args) => must('bash', [path.join(linux, 'owner', name + '.command'), ...args], name + ' failed',
    { interactive: true, env: { ...(commands.env ?? process.env), OP_BIOMETRIC_UNLOCK_ENABLED: 'true' } });
  const adapter = {
    confirm: phrase => commands.confirm(phrase), sourceFile,
    preflightSource(ctx) {
      const { r } = ctx;
      const ref = 'refs/remotes/origin/chromium/next';
      git(['fetch', '-q', '--no-tags', '--no-write-fetch-head', 'origin', '+refs/heads/chromium/next:' + ref], 'could not fetch chromium/next');
      const tip = git(['rev-parse', '--verify', ref + '^{commit}'], 'could not read fetched chromium/next').trim();
      check(commitPattern.test(tip), 'invalid fetched chromium/next commit');
      git(['merge-base', '--is-ancestor', r.sourceCommit, tip], 'source commit is not on chromium/next');
      const file = 'chromium/release/build-reservations.json';
      const listed = git(['ls-tree', tip, '--', file], 'could not inspect desktop claims at fetched tip');
      const claims = listed ? JSON.parse(sourceFile(tip, file)) : null;
      const ledger = JSON.parse(sourceFile(tip, 'chromium/release/linux-ledger.json'));
      confirmAbsent(commands, r);
      const expected = /^Fingerprint: ([0-9A-F]{40})$/m.exec(sourceFile(r.sourceCommit, 'chromium/linux/repository.md'))?.[1];
      check(expected, 'repository.md must record the owner key fingerprint');
      const key = sourceFile(r.sourceCommit, keyFile);
      equal(fs.readFileSync(path.join(ROOT, keyFile), 'utf8'), key, 'local signer key differs from release commit');
      const homedir = scratch(os.tmpdir(), 'blanc-key-check');
      try {
        const listing = must('gpg', ['--no-options', '--homedir', homedir, '--batch', '--with-colons', '--show-keys'],
          'cannot read the committed public key', { input: key });
        const primaries = [...listing.matchAll(/^pub:.*\nfpr:{9}([A-F0-9]+):/gm)].map(m => m[1]);
        equal(primaries, [expected], 'repository fingerprint differs from committed primary key');
      } finally { fs.rmSync(homedir, { recursive: true, force: true }); }
      return { claims, ledger, fingerprint: expected };
    },
    async snapshot(ctx) {
      const tag = ctx.r.tag;
      const refs = commands.exec('/usr/bin/git', ['-C', ROOT, 'ls-remote', '--exit-code', '--refs', 'origin', 'refs/tags/' + tag]);
      check(refs.status === 0 || refs.status === 2, 'cannot establish remote tag state');
      const commit = refs.status === 2 ? null : refs.stdout.trim().split('\t')[0];
      check(commit === null || commitPattern.test(commit), 'invalid remote tag SHA');
      // Use the single-release endpoint for read-backs. A 404 cannot
      // establish draft absence: the authenticated, paginated listing can.
      const found = commands.exec('gh', ['api', 'repos/' + REPO + '/releases/tags/' + tag]);
      let view = null;
      if (found.status === 0) view = JSON.parse(found.stdout);
      else {
        const line = api(['--paginate', 'repos/' + REPO + '/releases?per_page=100', '--jq',
          '.[] | select(.tag_name == "' + tag + '") | {draft,prerelease,body,assets:[.assets[]|{name,digest,state}]}'],
          'GitHub did not list releases including drafts').trim();
        if (line) view = JSON.parse(line);
      }
      let release = null;
      if (view) {
        const assets = {};
        for (const asset of view.assets) {
          check(asset.state === 'uploaded' && /^sha256:[a-f0-9]{64}$/.test(asset.digest) && !Object.hasOwn(assets, asset.name), 'release asset has no unique verified digest');
          assets[asset.name] = asset.digest.slice(7);
        }
        release = { draft: view.draft, prerelease: view.prerelease, body: view.body, assets };
      }
      return { tag: commit, release, pointer: await pointer('production') };
    },
    latest: () => api(['repos/' + REPO + '/releases/latest', '--jq', '.tag_name'], 'cannot identify latest release').trim(),
    async buildCheck(ctx, c) {
      const tarName = ASSET_NAME(c.arch, 'beta', c.build);
      const asset = candidateAssets().find(a => a.name === tarName);
      check(asset && /^sha256:[a-f0-9]{64}$/.test(asset.digest), 'candidate missing from draft: ' + tarName);
      const tarSha256 = asset.digest.slice(7);
      if (c.tarSha256) equal(c.tarSha256, tarSha256, 'candidate tar digest differs from record');
      const dir = scratch(ctx.work, 'candidate');
      const verified = path.join(ctx.work, 'verified-packages');
      fs.mkdirSync(verified, { recursive: true, mode: 0o700 });
      try {
        gh(['release', 'download', candidateDraft, '--pattern', tarName, '--dir', dir], 'cannot download candidate tar');
        const tar = path.join(dir, tarName);
        const extracted = path.join(dir, 'packages');
        const meta = JSON.parse(must('python3', [path.join(linux, 'repository/metadata.py'), 'unpack-beta-candidate',
          c.arch, tarSha256, tar, extracted, c.version], 'could not verify candidate archive, build, version and package hashes'));
        const names = packageNames(c.version, c.arch);
        equal(meta.treeCommit, ctx.r.sourceCommit, 'candidate treeCommit does not match release source commit');
        equal(meta.version, version(c.build), 'candidate version does not match claimed build');
        const id = candidateId(meta.exeSha256, c.arch);
        check(meta.platform === 'linux' && meta.channel === 'beta' && meta.arch === c.arch &&
          meta.id === id && (!c.id || c.id === id), 'candidate identity differs from the selected Linux beta');
        const committed = sourceFile(ctx.r.sourceCommit, 'chromium/linux/args/beta-' + c.arch + '.gn');
        const args = betaArgsFor(committed, {build: c.build});
        equal(meta.argsSha256, sha256(Buffer.from(args)), 'candidate was built with different GN arguments');
        const packages = names.map(name => {
          const file = path.join(extracted, name), digest = fileHash(file);
          const row = meta.packages.find(p => p.file === name || p.file === 'packages/' + name);
          equal(row?.sha256, digest, 'candidate package differs from embedded metadata');
          fs.copyFileSync(file, path.join(verified, name));
          return { name, sha256: digest };
        });
        const { run, files } = workflow(ctx, { check: 'beta-install', arch: c.arch, version: c.version, sha256: tarSha256 });
        const fingerprint = ctx.state.done.preflight.fingerprint;
        for (const p of packages) {
          const deb = p.name.endsWith('.deb');
          const systems = deb ? ['debian', 'ubuntu'] : ['fedora'];
          const reports = files.filter(f => path.basename(f) === 'linux-beta-smoke-' + (deb ? 'deb' : 'rpm') + '.json').map(json);
          equal(reports.map(e => e.system).sort(), systems, 'expected installed smoke evidence from ' + systems.join(' and '));
          for (const e of reports) {
            verifySmoke(e);
            check(e.pass === true && e.version === c.version && e.arch === c.arch && hashPattern.test(e.exeSha256) &&
              e.exeSha256 === e.package?.exeSha256 &&
              e.package?.scan === true && e.package.fingerprint === fingerprint && e.package.file === p.name &&
              e.package.sha256 === p.sha256, 'installed package evidence differs from candidate');
            equal(e.package.header, ['blanc-beta', c.version + '-1', arches[c.arch][deb ? 0 : 1]], 'package header mismatch');
          }
        }
        return { ...c, treeCommit: meta.treeCommit, version: meta.version, id, tarSha256, run, fingerprint, packages, headers: true, scan: true, smoke: true };
      } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    },
    treeDigest: ctx => inventory(ctx).digest,
    async sign(ctx) {
      const verified = path.join(ctx.work, 'verified-packages');
      const inputs = ctx.state.done['build-check'].checks.flatMap(c => c.packages);
      for (const p of inputs) {
        equal(fileHash(path.join(verified, p.name)), p.sha256, 'verified package changed before RPM signing');
      }
      const name = 'approved-packages.json';
      const binding = sha256(Buffer.from(format({ record: ctx.state.release, inputs })));
      const receiptFile = path.join(ctx.work, 'signing-receipt.json');
      let approved;
      if (fs.existsSync(receiptFile)) {
        const receipt = json(receiptFile);
        equal(receipt.binding, binding, 'the cached RPM approval was for different verified inputs');
        approved = path.join(ctx.work, receipt.directory);
        equal(fileHash(path.join(approved, name)), receipt.sha256, 'package approval changed since the signer returned');
      } else {
        // The owner helper installs its output atomically. Persist its input
        // and output hashes before handing a single signed file to GitHub.
        approved = path.join(scratch(ctx.work, 'approval'), 'packages');
        ownerCommand('repository-approve', [verified, approved]);
        save(receiptFile, { binding, directory: path.relative(ctx.work, approved), sha256: fileHash(path.join(approved, name)) });
      }
      const record = json(path.join(approved, name));
      for (const p of inputs.filter(p => p.name.endsWith('.deb'))) {
        equal(record.packages.find(row => row.file === p.name)?.sha256, p.sha256, 'approval changed a verified deb');
      }
      equal(record.releaseVersion, ctx.r.version, 'approval names another release version');
      const expected = [...allPackages(version(ctx.r.proofBuild)), ...allPackages(ctx.r.version)].sort();
      equal(record.packages.map(p => p.file).sort(), expected, 'approval package set differs');
      const draft = candidateAssets();
      for (const file of [...expected, name, name + '.asc']) {
        const local = path.join(approved, file), digest = fileHash(local);
        const pkg = record.packages.find(p => p.file === file);
        if (pkg) equal(pkg.sha256, digest, 'approved bytes changed');
        const existing = draft.find(a => a.name === file);
        if (existing?.digest === 'sha256:' + digest) continue;
        check(!existing || file === name || file === name + '.asc', 'private draft already holds different signed bytes for ' + file);
        gh(['release', 'upload', candidateDraft, local, ...(existing ? ['--clobber'] : [])], 'could not transfer approved packages to private draft');
      }
      const signed = signedTree(ctx);
      if (!fs.existsSync(signed)) {
        const { files } = workflow(ctx, { check: 'repo-metadata', sha256: fileHash(path.join(approved, name)) });
        const tree = path.dirname(exactFile(files, 'tree.json'));
        ownerCommand('repository-sign', [approved, tree, signed]);
      }
      const inv = inventory(ctx);
      const packages = allPackages(ctx.r.version).map(name => {
        const matches = inv.files.filter(e => path.basename(e.path) === name);
        check(matches.length === 1, 'package missing from signed tree');
        const row = record.packages.find(p => p.file === name);
        equal(matches[0].sha256, row.sha256, 'tree package differs from owner approval');
        return { name, file: path.join('signed-tree', matches[0].path), sha256: row.sha256 };
      });
      return { digest: inv.digest, packages };
    },
    upload(target, ctx, p) {
      const args = [target, signedTree(ctx), String(p.generation)];
      if (target === 'production') args.push(ctx.state.done['update-proof'].digest, JSON.stringify(ctx.journal.before));
      ownerCommand('repository-upload', args);
    },
    finishProduction: (ctx, target) => adapter.upload('production', ctx, target),
    async stagingPointer() {
      const p = await pointer('staging');
      return p && { generation: p.generation, digest: p.digest };
    },
    updateProof: async ctx => matrixReport(ctx, 'update-proof', { from: version(ctx.r.proofBuild), to: ctx.r.version, repository: 'staging' }),
    verifyPublic: async ctx => matrixReport(ctx, 'verify-public', { version: ctx.r.version }),
    async readDraft(ctx, hashes) {
      const dir = scratch(ctx.work, 'read-draft');
      try {
        gh(['release', 'download', ctx.r.tag, '--dir', dir], 'could not read back the draft');
        equal(fs.readdirSync(dir).sort(), Object.keys(hashes).sort(), 'draft has unexpected assets');
        for (const [name, hash] of Object.entries(hashes)) equal(fileHash(path.join(dir, name)), hash, 'draft download differs: ' + name);
      } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    },
    signChecksums(dir) {
      const env = commands.env ?? process.env, file = path.join(dir, bundle), tmp = file + '.pending';
      must('cosign', ['sign-blob', '--yes', '--oidc-redirect-url', COSIGN_REDIRECT, '--bundle', tmp, path.join(dir, 'SHA256SUMS')],
        'Sigstore signing in Safari did not complete', { interactive: true, env: { ...env, PATH: path.join(ROOT, 'scripts/release-bin') + ':' + env.PATH } });
      fs.renameSync(tmp, file);
    },
    verifyChecksums: dir => must('cosign', ['verify-blob', '--bundle', path.join(dir, bundle), '--certificate-identity', COSIGN_IDENTITY,
      '--certificate-oidc-issuer', COSIGN_ISSUER, path.join(dir, 'SHA256SUMS')], 'Sigstore verification against the pinned GitHub identity failed'),
    async write(op, value, ctx) {
      const { r } = ctx;
      if (op === 'tag') api(['--method', 'POST', 'repos/' + REPO + '/git/refs', '-f', 'ref=refs/tags/' + r.tag, '-f', 'sha=' + value], 'could not create release tag');
      else if (op === 'draft') {
        equal(fileHash(path.join(ctx.work, 'release-notes.md')), ctx.journal.notes, 'approved release notes changed');
        gh(['release', 'create', r.tag, '--verify-tag', '--draft', '--prerelease', '--latest=false', '--title', 'Blanc Beta ' + r.version + ' for Linux',
          '--notes-file', path.join(ctx.work, 'release-notes.md')], 'could not create private pre-release');
      } else if (op.startsWith('asset:')) {
        const file = path.join(ctx.assets, op.slice(6));
        equal(fileHash(file), value, 'asset changed before upload');
        gh(['release', 'upload', r.tag, file], 'could not upload ' + op.slice(6));
      } else if (op === 'production') adapter.upload('production', ctx, value);
      else if (op === 'publish') gh(['release', 'edit', r.tag, '--draft=false', '--prerelease', '--latest=false'], 'could not publish pre-release');
      else check(false, 'unknown release write');
    },
    async readProduction(ctx) {
      // InRelease and repomd.xml name indexes, not the package version.
      // Bind their public bytes AND the package indexes to the proven signed tree.
      const files = inventory(ctx).files;
      async function bytes(name) {
        const row = files.find(e => e.path === name);
        check(row, 'missing signed metadata: ' + name);
        const response = await request(origins.production + '/' + name);
        check(response.ok, 'public metadata download failed: ' + name);
        const data = Buffer.from(await response.arrayBuffer());
        equal(sha256(data), row.sha256, 'production metadata differs from proven tree: ' + name);
        return data;
      }
      await bytes('deb/dists/stable/InRelease');
      for (const [deb, rpm] of Object.values(arches)) {
        const packages = await bytes('deb/dists/stable/main/binary-' + deb + '/Packages');
        check(packages.toString().split('\n').includes('Version: ' + ctx.r.version + '-1'), 'production apt index names another version');
        const base = 'rpm/stable/' + rpm + '/repodata/';
        await bytes(base + 'repomd.xml'); await bytes(base + 'repomd.xml.asc');
        const primary = files.filter(e => e.path.startsWith(base) && /-primary\.xml\.gz$/.test(e.path));
        check(primary.length === 1, 'missing signed dnf primary index');
        check(gunzipSync(await bytes(primary[0].path)).toString().includes('ver="' + ctx.r.version + '"'), 'production dnf index names another version');
      }
    },
  };
  return adapter;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [stage, work, ...extra] = process.argv.slice(2);
  try {
    check(work && !extra.length, 'usage: linux-release.mjs status|' + STAGES.join('|') + ' WORK');
    if (stage === 'status') console.log(JSON.stringify(status(work)));
    else {
      check(process.platform === 'darwin' && process.stdin.isTTY, 'run release stages from a foreground macOS Terminal');
      console.log(JSON.stringify(await runStage(stage, work)));
    }
  } catch (error) { console.error('Linux beta release stopped: ' + reason(error)); process.exitCode = 1; }
}
