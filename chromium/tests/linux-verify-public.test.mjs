import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import YAML from 'yaml';
import {packageNames} from '../linux/candidate.mjs';

const version = '158.0.8127.906';
const tag = 'chromium-beta-linux-' + version;
const sourceCommit = 'a'.repeat(40);
const download = 'https://github.com/bnfy/blanc/releases/download/' + tag + '/';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const read = file => fs.readFileSync(file, 'utf8');
function temp(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'linux-public-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  return dir;
}

// Serve Task 5's manifest and checksum formats entirely from memory. Every
// external operation, including cosign, must match a known fixture operation.
function releaseFixture(t, mutate = {}) {
  const dir = path.join(temp(t), 'assets');
  const files = {};
  for (const arch of ['x64', 'arm64']) {
    for (const name of Object.values(packageNames(version, arch, 'beta'))) files[name] = 'fixture ' + name;
  }
  files['blanc-repository.asc'] = 'fixture public key';
  files['NOTICES.txt'] = 'fixture notices';
  const record = {schema: 1, version, tag, sourceCommit, build: 906, prerelease: true, makeLatest: false};
  mutate.record?.(record);
  files['linux-release.json'] = JSON.stringify(record);
  const manifest = {schema: 1, platform: 'linux', version, tag, sourceCommit,
    assets: Object.entries(files).map(([name, data]) => ({name, size: Buffer.byteLength(data), sha256: sha(data)}))};
  mutate.manifest?.(manifest);
  files['RELEASE-MANIFEST.json'] = JSON.stringify(manifest);
  const sums = Object.entries(files).map(([name, data]) => sha(data) + '  ' + name);
  mutate.sums?.(sums);
  files.SHA256SUMS = sums.join('\n') + '\n';
  files['SHA256SUMS.sigstore.json'] = 'fixture bundle';
  mutate.files?.(files);
  const view = {draft: false, prerelease: true, tag_name: tag, assets: Object.entries(files).map(([name, data]) => ({
    name, state: 'uploaded', size: Buffer.byteLength(data), digest: 'sha256:' + sha(data), browser_download_url: download + name
  }))};
  mutate.view?.(view);
  const received = [], sigstore = [];
  const apiCalls = [];
  function run(command, args, input) {
    if (command === 'cosign') {
      sigstore.push(args);
      if (mutate.badSignature) throw Error('signature verification failed');
    } else {
      assert.equal(command, 'curl');
      assert.equal(args[0], '-q', 'ignore curlrc credentials');
      assert.ok(!args.some(a => /(?:authorization|token|netrc|oauth)/i.test(a)));
      const url = args.at(-1), api = 'https://api.github.com/repos/bnfy/blanc/';
      if (url.startsWith(api)) {
        apiCalls.push({header: args.includes('@-'), input});
        if (args.includes('@-')) assert.equal(input, 'Authorization: Bearer fixture-token\n');
        else assert.equal(input, undefined);
      } else {
        assert.ok(!args.includes('--header') && input === undefined, 'downloads stay logged out');
      }
      if (url === api + 'releases/tags/' + tag) return {stdout: JSON.stringify(view), stderr: ''};
      if (url === api + 'releases/latest') return {stdout: JSON.stringify({tag_name: mutate.latest ?? 'v1.51.0'}), stderr: ''};
      if (url === api + 'git/ref/tags/' + tag) return {stdout: JSON.stringify({object: {type: 'commit', sha: sourceCommit}}), stderr: ''};
      assert.ok(url.startsWith(download), 'unexpected address ' + url);
      const name = url.slice(download.length);
      assert.ok(Object.hasOwn(files, name));
      const output = args[args.indexOf('--output') + 1];
      assert.equal(output, path.join(dir, name));
      fs.writeFileSync(output, files[name]);
      received.push(name);
    }
    return {stdout: '', stderr: ''};
  }
  return {dir, run, received, sigstore, files, apiCalls};
}

test('logged-out download authenticates all ten public assets using the owner’s pinned identity and issuer', async t => {
  const {verifyPublicAssets} = await import('./linux-verify-public.mjs');
  const f = releaseFixture(t);
  await verifyPublicAssets(version, f.dir, f.run);
  assert.deepEqual(f.received.sort(), Object.keys(f.files).sort());
  assert.deepEqual(f.sigstore, [['verify-blob', '--bundle', path.join(f.dir, 'SHA256SUMS.sigstore.json'),
    '--certificate-identity', 'anthony@bnfy.me', '--certificate-oidc-issuer', 'https://github.com/login/oauth',
    path.join(f.dir, 'SHA256SUMS')]]);
});

test('the workflow token reaches only the metadata calls, on stdin', async t => {
  const {verifyPublicAssets} = await import('./linux-verify-public.mjs');
  const f = releaseFixture(t);
  const saved = process.env.GH_TOKEN;
  process.env.GH_TOKEN = 'fixture-token';
  t.after(() => { if (saved === undefined) delete process.env.GH_TOKEN; else process.env.GH_TOKEN = saved; });
  await verifyPublicAssets(version, f.dir, f.run);
  assert.equal(f.apiCalls.length, 3);
  assert.ok(f.apiCalls.every(call => call.header));
  assert.deepEqual(f.received.sort(), Object.keys(f.files).sort());
});

test('without a token the metadata calls are anonymous too', async t => {
  const {verifyPublicAssets} = await import('./linux-verify-public.mjs');
  const f = releaseFixture(t);
  const saved = process.env.GH_TOKEN;
  delete process.env.GH_TOKEN;
  t.after(() => { if (saved !== undefined) process.env.GH_TOKEN = saved; });
  await verifyPublicAssets(version, f.dir, f.run);
  assert.ok(f.apiCalls.length === 3 && f.apiCalls.every(call => !call.header));
});

for (const [why, mutation] of Object.entries({
  draft: {view: v => { v.draft = true; }},
  stable: {view: v => { v.prerelease = false; }},
  'wrong tag': {view: v => { v.tag_name += '0'; }},
  latest: {latest: tag},
  'missing asset': {view: v => v.assets.pop()},
  'duplicate asset': {view: v => v.assets.push(v.assets[0])},
  'unsafe name': {view: v => { v.assets[0].name = '../outside'; }},
  'another download URL': {view: v => { v.assets[0].browser_download_url += '.other'; }},
  'wrong source': {record: r => { r.sourceCommit = 'b'.repeat(40); }},
  'another version': {manifest: m => { m.version += '0'; }},
  'missing manifest entry': {manifest: m => m.assets.pop()},
  'wrong size': {manifest: m => { m.assets[0].size++; }},
  'wrong manifest digest': {manifest: m => { m.assets[0].sha256 = '0'.repeat(64); }},
  'missing manifest checksum': {sums: s => s.pop()},
  'duplicate checksum': {sums: s => s.push(s[0])},
  'tampered arm64 package': {files: f => { f[packageNames(version, 'arm64', 'beta').rpm] += '!'; }},
  'bad signature': {badSignature: true}
})) test('public verification rejects ' + why, async t => {
  const {verifyPublicAssets} = await import('./linux-verify-public.mjs');
  const f = releaseFixture(t, mutation);
  await assert.rejects(async () => verifyPublicAssets(version, f.dir, f.run));
});

function installFixture(t, system, arch, changes = {}) {
  const results = temp(t), assets = '/fixture-assets';
  const rpm = system === 'fedora';
  const native = rpm ? (arch === 'arm64' ? 'aarch64' : 'x86_64') : (arch === 'arm64' ? 'arm64' : 'amd64');
  const file = path.join(assets, packageNames(version, arch, 'beta')[rpm ? 'rpm' : 'deb']);
  const repo = 'https://pkg.blanc.day';
  const aptSource = 'deb [arch=' + native + ' signed-by=/usr/share/keyrings/blanc-beta.gpg] ' + repo + '/deb stable main';
  const dnfSource = '[blanc-beta]\nname=Blanc Beta\nenabled=1\ngpgcheck=1\nrepo_gpgcheck=1\n' +
    'gpgkey=file:///opt/bnfy/blanc-beta/blanc-repository.asc\nmirrorlist=' + repo + '/rpm/stable/$basearch/mirrorlist';
  const report = path.join(results, 'verify-public-' + system + '-' + arch + '.json');
  const calls = [];
  const io = {
    read(file) {
      if (file === (rpm ? '/etc/yum.repos.d/blanc-beta.repo' : '/etc/apt/sources.list.d/blanc-beta.list'))
        return changes.source ?? (rpm ? dnfSource : aptSource);
      return read(file);
    },
    run(command, args) {
      const argv = [command, ...args];
      if (argv.includes('install')) {
        assert.ok(argv.includes(rpm ? 'dnf' : 'apt-get') && argv.includes(file));
        calls.push('install');
      } else if (argv.includes(rpm ? 'makecache' : 'update')) {
        calls.push('refresh');
        if (changes.error) throw Error('refresh failed');
        return {stdout: changes.warning ?? '', stderr: ''};
      } else if (argv.includes(rpm ? 'repoquery' : 'madison')) {
        if (rpm) assert.ok(argv.includes('--repo=blanc-beta') && argv.includes('--available'));
        calls.push('listing');
        return {stdout: changes.listing ?? (rpm ? 'blanc-beta ' + version + '-1 ' + native :
          ' blanc-beta | ' + version + '-1 | ' + repo + '/deb stable/main ' + native + ' Packages'), stderr: ''};
      } else {
        assert.equal(command, 'xvfb-run');
        const index = args.findIndex(a => a.endsWith('/linux-beta-smoke.mjs'));
        assert.ok(index > 0 && args.includes('dbus-run-session'));
        assert.equal(args[index + 1], version);
        const smoke = {system, arch, version, pass: true, testSwitchFound: false, controlHit: true, controlLoaded: true,
          blockedHit: false, blockedError: 'net::ERR_BLOCKED_BY_CLIENT', browserNamespace: 1, renderers: [{seccomp: '2', namespace: 2}],
          restrictUnprivilegedUserns: '1', apparmor: {mode: 'unconfined', attachment: '/opt/bnfy/blanc-beta/chrome', label: 'blanc-beta'},
          ...changes.smoke};
        fs.writeFileSync(args[index + 2], JSON.stringify(smoke));
        calls.push('smoke');
      }
      return {stdout: '', stderr: ''};
    }
  };
  return {options: {system, arch, version, assets, results}, io, calls, report};
}

for (const system of ['ubuntu', 'debian', 'fedora']) for (const arch of ['x64', 'arm64']) {
  test(system + '/' + arch + ' installs the right public file and produces Task 5 evidence', async t => {
    const {verifyPublicInstall} = await import('./linux-verify-public.mjs');
    const f = installFixture(t, system, arch);
    verifyPublicInstall(f.options, f.io);
    assert.deepEqual(f.calls, ['install', 'refresh', 'listing', 'smoke']);
    assert.deepEqual(JSON.parse(read(f.report)), {system, arch, version, pass: true});
  });
}

test('the release tool accepts the six artifacts from one verify-public dispatch', async t => {
  const {realIO} = await import('../release/linux-release.mjs');
  const {verifyPublicInstall} = await import('./linux-verify-public.mjs');
  const legs = {};
  const adapter = realIO({exec(command, args) {
    assert.equal(command, 'gh');
    if (args[0] === 'workflow') {
      assert.deepEqual(args.slice(args.indexOf('-f')), ['-f', 'check=verify-public', '-f', 'version=' + version]);
      return {status: 0, stdout: 'https://github.com/bnfy/blanc/actions/runs/123'};
    }
    assert.equal(args[2], '123');
    if (args[1] === 'download') {
      const dir = args[args.indexOf('--dir') + 1];
      for (const arch of ['x64', 'arm64']) for (const system of ['ubuntu', 'debian', 'fedora']) {
        const f = installFixture(t, system, arch);
        verifyPublicInstall(f.options, f.io);
        fs.cpSync(f.options.results, path.join(dir, 'verify-public-' + system + '-' + arch + '-123-1'), {recursive: true});
        legs[arch + '-' + system] = true;
      }
    } else if (args[0] === 'run' && args[1] === 'view') return {status: 0, stdout: '{}'};
    else assert.equal(args[1], 'watch');
    return {status: 0, stdout: ''};
  }});
  const report = await adapter.verifyPublic({work: temp(t), r: {version}});
  assert.deepEqual(report, {run: 123, version, legs});
});

for (const [system, why, change] of [
  ['ubuntu', 'installed database alone', {listing: 'blanc-beta | ' + version + '-1 | /var/lib/dpkg/status'}],
  ['debian', 'another origin', {listing: 'blanc-beta | ' + version + '-1 | https://pkg-staging.blanc.day/deb stable/main amd64 Packages'}],
  ['debian', 'commented-out source', {source: '# https://pkg.blanc.day/deb'}],
  ['ubuntu', 'recoverable apt warning', {warning: 'W: Some index files failed to download.'}],
  ['fedora', 'successful dnf exit with a warning', {warning: 'Warning: skipped repository blanc-beta'}],
  ['fedora', 'makecache failure', {error: true}],
  ['fedora', 'wrong repository version', {listing: 'blanc-beta 158.0.8127.905-1 x86_64'}],
  ['fedora', 'smoke from another distro', {smoke: {system: 'debian'}}],
  ['debian', 'wrong installed version', {smoke: {version: '158.0.8127.905'}}],
  ['debian', 'smoke from another arch', {smoke: {arch: 'arm64'}}],
  ['ubuntu', 'missing blocker evidence', {smoke: {blockedError: null}}]
]) test(system + ' withholds the pass report for ' + why, async t => {
  const {verifyPublicInstall} = await import('./linux-verify-public.mjs');
  const f = installFixture(t, system, 'x64', change);
  assert.throws(() => verifyPublicInstall(f.options, f.io));
  assert.equal(fs.existsSync(f.report), false);
});

test('Task 5 dispatch selects six fresh native containers; only the metadata step holds a read-only token', () => {
  const workflow = YAML.parse(read(new URL('../../.github/workflows/chromium-linux-candidate.yml', import.meta.url)));
  assert.ok(workflow.on.workflow_dispatch.inputs.check.options.includes('verify-public'));
  assert.equal(workflow.on.workflow_dispatch.inputs.version.type, 'string');
  const job = workflow.jobs['verify-public'];
  assert.match(job.if, /inputs.check == 'verify-public'/);
  assert.deepEqual(job.strategy.matrix.arch.toSorted(), ['arm64', 'x64']);
  assert.deepEqual(job.strategy.matrix.system.toSorted(), ['debian', 'fedora', 'ubuntu']);
  assert.match(job['runs-on'], /matrix.arch.*ubuntu-24\.04-arm.*ubuntu-24\.04/);
  assert.deepEqual(job.permissions, {contents: 'read'});
  const holders = job.steps.filter(step => /github\.token|GH_TOKEN|GITHUB_TOKEN|secrets\./i.test(JSON.stringify(step)));
  assert.deepEqual(holders.map(step => step.name), ['Authenticate every public asset']);
  assert.deepEqual(holders[0].env, {GH_TOKEN: '${{ github.token }}'});
  assert.doesNotMatch(holders[0].run, /GH_TOKEN|docker/);
  const steps = JSON.stringify(job.steps);
  assert.doesNotMatch(steps, /gh release|fork-linux-candidate/i);
  for (const image of ['ubuntu:24.04', 'debian:12', 'fedora:45@sha256:']) assert.ok(steps.includes(image));
  assert.ok(steps.includes('docker run') && steps.includes('actions/upload-artifact@'));
});
