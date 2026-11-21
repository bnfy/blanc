// The Windows beta release (windows-release.mjs, W3 Task E1): its own
// pre-release, stages in order and never again once the draft exists, the
// signed files bound to the candidate, the staging gate before blanc.day, and
// nothing tagged, offered or published without the owner's typed
// confirmation. A fake world stands in for every command.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {STAGES, STAGING, validateWindowsRelease, admit, nextStage, setupName, assetNames, makeManifest, verifyManifest, runStage, load}
  from './windows-release.mjs';

const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const PUBLISHER = 'CN=Bananify Creative, O=Bananify Creative, L=North Chili, S=New York, C=US';
const release = {schema: 1, product: 'Blanc Beta', platform: 'windows-x64', version: '158.0.8127.902', build: 902, previousBuild: 0,
  tag: 'chromium-beta-windows-158.0.8127.902', sourceCommit: 'a'.repeat(40), prerelease: true, makeLatest: false,
  candidate: {id: 'windows-x64-893ba1a4a1a8a164', zipSha256: 'b'.repeat(64)}};
const ledger = {schema: 1, builds: []};
const done = stages => Object.fromEntries(stages.map(stage => [stage, {at: 'test'}]));

function world(answers = [], {confirm = true, files = {}} = {}) {
  const calls = [];
  return {calls, env: {PATH: '/usr/bin:/bin'}, confirms: [],
    exec(command, args, options = {}) {
      const line = [command, ...args].join(' ');
      calls.push(line);
      for (const [pattern, answer] of answers) if (line.includes(pattern)) {
        const result = typeof answer === 'function' ? answer(args, options) : answer;
        return {status: 0, stdout: '', stderr: '', ...result};
      }
      return {status: 0, stdout: '', stderr: ''};
    },
    async confirm(phrase) { this.confirms.push(phrase); return confirm; },
    now: () => Date.parse('2026-11-20T00:00:00Z'),
    pause: async () => {},
    verifyCrx: () => ({ok: true}),
    ledger: () => ledger,
    ...files,
  };
}
function workFolder(state, r = release) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-win-work-'));
  fs.chmodSync(work, 0o700);
  fs.writeFileSync(path.join(work, 'windows-release.json'), JSON.stringify(r));
  if (state) fs.writeFileSync(path.join(work, 'state.json'), JSON.stringify({schema: 1, release: sha(fs.readFileSync(path.join(work, 'windows-release.json'))), done: state}));
  return work;
}
const absent = [['rev-parse -q --verify', {status: 1}], ['ls-remote', {status: 2}], ['releases --jq', {status: 0, stdout: 'v1.49.1\n'}]];
const draftAssets = zip => ['release view fork-windows-candidate', {stdout: JSON.stringify({assets: [{name: 'blanc-windows-candidate.zip', digest: `sha256:${zip}`}]})}];

test('a Windows beta is its own pre-release, numbered above the last one', () => {
  validateWindowsRelease(release, ledger);
  validateWindowsRelease({...release, version: '158.0.8127.903', build: 903, previousBuild: 902, tag: 'chromium-beta-windows-158.0.8127.903'},
    {schema: 1, builds: [{build: 902}]});
  for (const [name, change, l] of [
    ['tag', {tag: 'chromium-beta-158.0.8127.902'}],
    ['version and build disagree', {version: '158.0.8127.901'}],
    ['not the pinned Chromium', {version: '157.0.8127.902', tag: 'chromium-beta-windows-157.0.8127.902'}],
    ['latest', {makeLatest: true}],
    ['not a pre-release', {prerelease: false}],
    ['candidate id', {candidate: {...release.candidate, id: 'macos-1234567890abcdef'}}],
    ['zip digest', {candidate: {...release.candidate, zipSha256: 'xyz'}}],
    ['source commit', {sourceCommit: 'main'}],
    ['previous build is not the ledger\'s last', {previousBuild: 900}],
    ['build not above the ledger', {previousBuild: 902}, {schema: 1, builds: [{build: 902}]}],
  ]) assert.throws(() => validateWindowsRelease({...release, ...change}, l ?? ledger), undefined, name);
});

test('stages run in order and never again once the draft exists', () => {
  assert.equal(STAGES[0], 'preflight');
  assert.ok(STAGES.indexOf('staging-gate') < STAGES.indexOf('draft'));
  assert.ok(STAGES.indexOf('draft') < STAGES.indexOf('publish'));
  assert.throws(() => admit({done: {}}, 'sign'), /run preflight first/);
  admit({done: done(['preflight', 'sign'])}, 'sign');
  const drafted = done(STAGES.slice(0, STAGES.indexOf('draft') + 1));
  assert.throws(() => admit({done: drafted}, 'draft'), /never rerun/);
  assert.throws(() => admit({done: drafted}, 'manifest'), /never rerun|cannot run again/);
  assert.equal(nextStage({done: drafted}), 'sigstore');
});

test('preflight needs the candidate on the draft with the recorded digest, and no tag', async () => {
  const work = workFolder();
  await runStage('preflight', work, world([...absent, draftAssets(release.candidate.zipSha256)]));
  assert.equal(nextStage(load(work, {ledger}).state), 'sign');
  await assert.rejects(runStage('preflight', workFolder(), world([...absent, draftAssets('c'.repeat(64))])), /candidate/);
  await assert.rejects(runStage('preflight', workFolder(), world([['rev-parse -q --verify', {status: 0, stdout: 'x'}], draftAssets(release.candidate.zipSha256)])), /tag/);
  await assert.rejects(runStage('preflight', workFolder(), world([['--is-ancestor', {status: 1}], ...absent, draftAssets(release.candidate.zipSha256)])), /chromium\/next/);
});

function signWorld({record, installer = Buffer.from('MZ signed installer'), setup = Buffer.from('MZ tagged setup'), served = setup, conclusion = 'success'} = {}) {
  record ??= {schemaVersion: 1, candidateZipSha256: release.candidate.zipSha256, installer: 'blanc-windows-installer-signed.exe',
    files: [{file: 'blanc-windows-installer-signed.exe', sha256: sha(installer), publisher: PUBLISHER},
      {file: 'Blanc-Beta-Setup.exe', sha256: sha(setup), publisher: PUBLISHER}]};
  return world([
    ['run list', {stdout: JSON.stringify([{databaseId: 77, createdAt: '2026-11-20T00:00:05Z'}])}],
    ['run view 77', {stdout: JSON.stringify({conclusion})}],
    ['release download fork-windows-candidate', args => {
      const dir = args[args.indexOf('--dir') + 1];
      fs.writeFileSync(path.join(dir, 'blanc-windows-installer-signed.exe'), installer);
      fs.writeFileSync(path.join(dir, 'Blanc-Beta-Setup.exe'), served);
      fs.writeFileSync(path.join(dir, 'windows-signature.json'), JSON.stringify(record));
      return {};
    }],
  ]);
}

test('sign runs the approved signing job from chromium/next and keeps files bound to this candidate', async () => {
  const work = workFolder(done(['preflight']));
  const io = signWorld();
  await runStage('sign', work, io);
  const dispatch = io.calls.find(c => c.includes('workflow run'));
  assert.match(dispatch, /--ref chromium\/next/);
  assert.match(dispatch, /sign=true/);
  assert.match(dispatch, new RegExp(`sha256=${release.candidate.zipSha256}`));
  assert.doesNotMatch(dispatch, /update_expect/);
  assert.ok(fs.existsSync(path.join(work, 'signed', 'Blanc-Beta-Setup.exe')));
  const recorded = load(work, {ledger}).state.done.sign;
  assert.equal(recorded.run, 77);
  assert.equal(recorded.setupSHA256, sha(Buffer.from('MZ tagged setup')));

  await assert.rejects(runStage('sign', workFolder(done(['preflight'])), signWorld({conclusion: 'failure'})), /signing run/);
  const other = {schemaVersion: 1, candidateZipSha256: 'c'.repeat(64), installer: 'x', files: []};
  await assert.rejects(runStage('sign', workFolder(done(['preflight'])), signWorld({record: other})), /candidate/);
  const unsigned = {schemaVersion: 1, candidateZipSha256: release.candidate.zipSha256, installer: 'blanc-windows-installer-signed.exe',
    files: [{file: 'blanc-windows-installer-signed.exe', sha256: sha(Buffer.from('MZ signed installer')), publisher: 'CN=Someone Else'},
      {file: 'Blanc-Beta-Setup.exe', sha256: sha(Buffer.from('MZ tagged setup')), publisher: PUBLISHER}]};
  await assert.rejects(runStage('sign', workFolder(done(['preflight'])), signWorld({record: unsigned})), /Bananify/);
  await assert.rejects(runStage('sign', workFolder(done(['preflight'])), signWorld({served: Buffer.from('MZ other')})), /differs/);
});

// A work folder past sign, with a signed installer and setup on disk.
function signedWork(stages) {
  const work = workFolder(null);
  const installer = Buffer.from('MZ signed installer'), setup = Buffer.from('MZ tagged setup');
  fs.mkdirSync(path.join(work, 'signed'));
  fs.writeFileSync(path.join(work, 'signed', 'blanc-windows-installer-signed.exe'), installer);
  fs.writeFileSync(path.join(work, 'signed', 'Blanc-Beta-Setup.exe'), setup);
  fs.writeFileSync(path.join(work, 'signed', 'windows-signature.json'), '{"schemaVersion":1}');
  const state = done(stages);
  state.sign = {at: 'test', run: 77, installerSHA256: sha(installer), setupSHA256: sha(setup), signatureSHA256: sha(Buffer.from('{"schemaVersion":1}'))};
  fs.writeFileSync(path.join(work, 'state.json'), JSON.stringify({schema: 1, release: sha(fs.readFileSync(path.join(work, 'windows-release.json'))), done: state}));
  return {work, installer};
}
function packaged(work, installer, {record} = {}) {
  const dir = path.join(work, 'package', release.version);
  fs.mkdirSync(dir, {recursive: true});
  const crx = Buffer.from('Cr24 package');
  fs.writeFileSync(path.join(dir, `blanc-beta-${release.version}.crx3`), crx);
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(record ?? {version: release.version, file: `blanc-beta-${release.version}.crx3`,
    sha256: sha(crx), size: crx.length, run: 'mini_installer.exe', installerSha256: sha(installer),
    publisherKeySha256: '1b7748a81de3cc4bee5a603a45b5c165130b785e46a6099890080aed41323a85'}));
  return sha(crx);
}

test('package takes the owner-signed CRX of exactly the signed installer', async () => {
  const {work, installer} = signedWork(['preflight', 'sign']);
  const ownerStep = world([['update-package-sign.command', () => { packaged(work, installer); return {}; }]]);
  await runStage('package', work, ownerStep);
  assert.ok(ownerStep.calls.some(c => c.includes('update-package-sign.command')));
  assert.ok(fs.existsSync(path.join(work, 'package', release.version, 'mini_installer.exe')));

  const other = signedWork(['preflight', 'sign']);
  const wrong = world([['update-package-sign.command', () => { packaged(other.work, Buffer.from('MZ another installer')); return {}; }]]);
  await assert.rejects(runStage('package', other.work, wrong), /signed installer/);
  const bad = signedWork(['preflight', 'sign']);
  const io = world([['update-package-sign.command', () => { packaged(bad.work, bad.installer); return {}; }]]);
  io.verifyCrx = () => ({ok: false, reason: 'bad signature'});
  await assert.rejects(runStage('package', bad.work, io), /publisher key/);
});

test('upload puts the package in R2 by its digest, and retries once', async () => {
  const {work, installer} = signedWork(['preflight', 'sign', 'package']);
  const digest = packaged(work, installer);
  const state = JSON.parse(fs.readFileSync(path.join(work, 'state.json')));
  state.done.package = {at: 'test', sha256: digest, size: 12, run: 'mini_installer.exe'};
  fs.writeFileSync(path.join(work, 'state.json'), JSON.stringify(state));
  let tries = 0;
  const io = world([['r2 object put', () => ({status: ++tries === 1 ? 1 : 0})]]);
  await runStage('upload', work, io);
  const put = io.calls.filter(c => c.includes('r2 object put'));
  assert.equal(put.length, 2);
  assert.match(put[0], new RegExp(`blanc-windows-updates/${digest}\\.crx3`));
  assert.match(put[0], /--remote/);
});

function gateWork() {
  const {work, installer} = signedWork(['preflight', 'sign', 'package', 'upload']);
  const digest = packaged(work, installer);
  const state = JSON.parse(fs.readFileSync(path.join(work, 'state.json')));
  state.done.package = {at: 'test', sha256: digest, size: 12, run: 'mini_installer.exe'};
  fs.writeFileSync(path.join(work, 'state.json'), JSON.stringify(state));
  return {work, digest};
}
function gateWorld({proof, smoke = {pass: true, updatecheck: 'ok', nextversion: release.version}} = {}) {
  proof ??= {pass: true, details: {staging: STAGING, installed: {setupExit: 0, pv: release.version}}};
  return world([
    draftAssets(release.candidate.zipSha256),
    ['smoke.mjs', {stdout: JSON.stringify(smoke)}],
    ['run list', {stdout: JSON.stringify([{databaseId: 88, createdAt: '2026-11-20T00:00:05Z'}])}],
    ['run view 88', {stdout: JSON.stringify({conclusion: proof.pass ? 'success' : 'failure'})}],
    ['run download 88', args => {
      const dir = path.join(args[args.indexOf('-D') + 1], 'chromium-windows-candidate-88', 'update-proof');
      fs.mkdirSync(dir, {recursive: true});
      fs.writeFileSync(path.join(dir, 'update-proof.json'), JSON.stringify(proof));
      return {};
    }],
  ]);
}

test('the staging gate offers this release from staging, proves it on a runner, then offers nothing', async () => {
  const {work, digest} = gateWork();
  const io = gateWorld();
  await runStage('staging-gate', work, io);
  const deploys = io.calls.filter(c => c.includes('wrangler deploy'));
  assert.equal(deploys.length, 2);
  assert.match(deploys[0], /--env staging/);
  const offered = JSON.parse(deploys[0].slice(deploys[0].indexOf('RELEASE_JSON:') + 'RELEASE_JSON:'.length));
  assert.equal(offered.version, release.version);
  assert.equal(offered.sha256, digest);
  assert.equal(offered.url, `${STAGING}/update/win/pkg/${digest}.crx3`);
  assert.doesNotMatch(deploys[1], /RELEASE_JSON/);
  assert.ok(deploys.every(d => d.includes('--env staging')), 'production is never deployed by the gate');
  const dispatch = io.calls.find(c => c.includes('workflow run'));
  assert.match(dispatch, new RegExp(`update_expect=online:${release.version.replaceAll('.', '\\.')}`));
  assert.match(dispatch, new RegExp(`update_staging=${STAGING}`));

  const failed = gateWork();
  const no = gateWorld({proof: {pass: false, details: {installed: {pv: null}}}});
  await assert.rejects(runStage('staging-gate', failed.work, no), /staging gate/);
  assert.equal(no.calls.filter(c => c.includes('wrangler deploy')).at(-1).includes('RELEASE_JSON'), false, 'staging offers nothing after a failure too');
  await assert.rejects(runStage('staging-gate', gateWork().work, gateWorld({smoke: {pass: true, updatecheck: 'noupdate'}})), /staging/);
});

test('the manifest lists exactly the public files with their digests', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-win-assets-'));
  for (const name of assetNames(release)) fs.writeFileSync(path.join(dir, name), `bytes of ${name}`);
  assert.ok(assetNames(release).includes(setupName(release)));
  assert.equal(setupName(release), 'Blanc-Beta-Setup-158.0.8127.902.exe');
  const {json, checksums} = makeManifest(release, dir);
  fs.writeFileSync(path.join(dir, 'RELEASE-MANIFEST.json'), json);
  fs.writeFileSync(path.join(dir, 'SHA256SUMS'), checksums);
  verifyManifest(dir, release);
  assert.equal(checksums.trim().split('\n').length, assetNames(release).length + 1);
  fs.writeFileSync(path.join(dir, setupName(release)), 'changed');
  assert.throws(() => verifyManifest(dir, release), /differs/);
});

test('draft and publish create nothing without the typed confirmation', async () => {
  const before = STAGES.slice(0, STAGES.indexOf('draft'));
  const work = workFolder(done(before));
  const io = world(absent, {confirm: false});
  await assert.rejects(runStage('draft', work, io), /not confirmed/);
  assert.deepEqual(io.confirms, [`tag and draft ${release.tag}`]);
  assert.ok(!io.calls.some(c => c.includes(' tag ') || c.includes('release create')));

  const ready = workFolder(done(STAGES.slice(0, STAGES.indexOf('publish'))));
  const no = world([], {confirm: false});
  await assert.rejects(runStage('publish', ready, no), /not confirmed/);
  assert.ok(!no.calls.some(c => c.includes('wrangler deploy') || c.includes('release edit')));
});

test('publish offers the release from blanc.day before the release page goes public, and keeps Electron latest', async () => {
  const work = workFolder({...done(STAGES.slice(0, STAGES.indexOf('publish'))), package: {at: 'test', sha256: 'd'.repeat(64), size: 12, run: 'mini_installer.exe'}});
  const answers = [
    ['smoke.mjs', {stdout: JSON.stringify({pass: true, updatecheck: 'ok', nextversion: release.version})}],
    [`releases/tags/${release.tag}`, {stdout: JSON.stringify({draft: false, prerelease: true})}],
    ['releases/latest', {stdout: JSON.stringify({tag_name: 'v1.49.1'})}],
  ];
  const io = world(answers);
  await runStage('publish', work, io);
  const deploy = io.calls.findIndex(c => c.includes('wrangler deploy'));
  const edit = io.calls.findIndex(c => c.includes('release edit'));
  assert.ok(deploy >= 0 && edit > deploy, 'the Worker offers the release before it is published');
  assert.doesNotMatch(io.calls[deploy], /--env staging/);
  const offered = JSON.parse(io.calls[deploy].slice(io.calls[deploy].indexOf('RELEASE_JSON:') + 'RELEASE_JSON:'.length));
  assert.equal(offered.url, `https://blanc.day/update/win/pkg/${'d'.repeat(64)}.crx3`);

  const stolen = workFolder({...done(STAGES.slice(0, STAGES.indexOf('publish'))), package: {at: 'test', sha256: 'd'.repeat(64), size: 12, run: 'mini_installer.exe'}});
  await assert.rejects(runStage('publish', stolen, world([answers[0], answers[1], ['releases/latest', {stdout: JSON.stringify({tag_name: release.tag})}]])), /latest/);
});

test('verify-public runs the published setup alone on a clean runner, after checking what anyone downloads', async () => {
  const work = workFolder(done(STAGES.slice(0, STAGES.indexOf('verify-public'))));
  const signed = Buffer.from('MZ tagged setup');
  const state = JSON.parse(fs.readFileSync(path.join(work, 'state.json')));
  state.done.sign = {at: 'test', setupSHA256: sha(signed)};
  fs.writeFileSync(path.join(work, 'state.json'), JSON.stringify(state));
  const files = Object.fromEntries(assetNames(release).map(name => [name, Buffer.from(`bytes of ${name}`)]));
  files[setupName(release)] = signed;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-win-pub-'));
  for (const [name, bytes] of Object.entries(files)) fs.writeFileSync(path.join(tmp, name), bytes);
  const {json, checksums} = makeManifest(release, tmp);
  Object.assign(files, {'RELEASE-MANIFEST.json': Buffer.from(json), SHA256SUMS: Buffer.from(checksums), 'SHA256SUMS.sigstore.json': Buffer.from('{}')});
  const proof = {pass: true, details: {installed: {setupExit: 0, pv: release.version}}};
  const answers = [
    draftAssets(release.candidate.zipSha256),
    [`releases/tags/${release.tag}`, {stdout: JSON.stringify({assets: Object.keys(files).map(name => ({name, browser_download_url: `https://github.com/x/${name}`}))})}],
    ['/usr/bin/curl', args => { fs.writeFileSync(args[args.indexOf('-o') + 1], files[path.basename(args.at(-1))]); return {}; }],
    ['smoke.mjs', {stdout: JSON.stringify({pass: true, updatecheck: 'ok', nextversion: release.version})}],
    ['run list', {stdout: JSON.stringify([{databaseId: 99, createdAt: '2026-11-20T00:00:05Z'}])}],
    ['run view 99', {stdout: JSON.stringify({conclusion: 'success'})}],
    ['run download 99', args => { const d = path.join(args[args.indexOf('-D') + 1], 'a'); fs.mkdirSync(d); fs.writeFileSync(path.join(d, 'update-proof.json'), JSON.stringify(proof)); return {}; }],
  ];
  const io = world(answers);
  await runStage('verify-public', work, io);
  assert.match(io.calls.find(c => c.includes('workflow run')), new RegExp(`public_tag=${release.tag}`));

  files[setupName(release)] = Buffer.from('MZ swapped');
  await assert.rejects(runStage('verify-public', workFolder(state.done), world(answers)), /differs|signed one/);
});

test('a failed deploy keeps what the command said in a private log in the work folder', async () => {
  const work = workFolder({...done(STAGES.slice(0, STAGES.indexOf('publish'))), package: {at: 'test', sha256: 'd'.repeat(64), size: 12, run: 'mini_installer.exe'}});
  const io = world([['wrangler deploy', {status: 1, stdout: 'deploying', stderr: 'Authentication error [code: 10000]'}]]);
  await assert.rejects(runStage('publish', work, io), /production update server.*WORK\/logs\/deploy-production\.log/);
  const log = path.join(work, 'logs', 'deploy-production.log');
  assert.match(fs.readFileSync(log, 'utf8'), /Authentication error \[code: 10000\]/);
  assert.equal(fs.statSync(log).mode & 0o077, 0);
  assert.ok(!io.calls.some(c => c.includes('release edit')), 'nothing is published after a failed deploy');
});
