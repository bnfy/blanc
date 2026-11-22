#!/usr/bin/env node
// Host: download VERSION NEW_ASSET_DIR. Fresh container (ordinary user):
// install SYSTEM ARCH VERSION READ_ONLY_ASSET_DIR RESULT_DIR.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {packageNames} from '../linux/candidate.mjs';
import {CHROME_VERSION} from '../release/policy.mjs';
import {COSIGN_IDENTITY, COSIGN_ISSUER, REPO} from '../release/release.mjs';
import {hashFile} from './lib/linux-seed.mjs';
import {verifySmoke} from './linux-beta-smoke.mjs';

const manifestFile = 'RELEASE-MANIFEST.json';
const sums = 'SHA256SUMS', bundle = sums + '.sigstore.json';
const origin = 'https://pkg.blanc.day';
const read = file => fs.readFileSync(file, 'utf8');
function runCommand(command, args) {
  const result = spawnSync(command, args, {encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
    env: {...process.env, LC_ALL: 'C'}});
  if (result.error) throw result.error;
  if (result.status !== 0) throw Error(command + ' failed: ' + (result.stdout + result.stderr).slice(-4000));
  return result;
}

function buildNumber(version) {
  const build = Number(version.split('.').at(-1));
  assert.ok(Number.isInteger(build) && build > 1 && build <= 9999 &&
    version === CHROME_VERSION.slice(0, CHROME_VERSION.lastIndexOf('.') + 1) + build, 'invalid Linux release version');
  return build;
}

export function verifyPublicAssets(version, dir, run = runCommand) {
  const build = buildNumber(version), tag = 'chromium-beta-linux-' + version;
  const payload = ['x64', 'arm64'].flatMap(arch => Object.values(packageNames(version, arch, 'beta')))
    .concat(['blanc-repository.asc', 'NOTICES.txt', 'linux-release.json']);
  const names = [...payload, manifestFile, sums, bundle];
  const curl = ['-q', '-fsSL', '--proto', '=https', '--proto-redir', '=https', '--retry', '2'];
  const api = route => JSON.parse(run('curl', [...curl, 'https://api.github.com/repos/' + REPO + '/' + route]).stdout);
  const view = api('releases/tags/' + tag);
  assert.equal(view.tag_name, tag);
  assert.equal(view.draft, false, 'the public release is still a draft');
  assert.equal(view.prerelease, true, 'expected a pre-release');
  const latest = api('releases/latest');
  assert.match(latest.tag_name, /^v\d+\.\d+\.\d+$/, 'latest must still be an Electron release');
  const ref = api('git/ref/tags/' + tag).object;
  assert.equal(ref.type, 'commit', 'expected the release tool’s lightweight tag');
  assert.match(ref.sha, /^[0-9a-f]{40}$/);
  assert.deepEqual(view.assets.map(a => a.name).sort(), names.toSorted(), 'unexpected public asset set');

  fs.mkdirSync(dir); // No leftovers from an earlier download can satisfy this run.
  const measured = new Map();
  for (const name of names) {
    const asset = view.assets.find(a => a.name === name);
    const url = 'https://github.com/' + REPO + '/releases/download/' + tag + '/' + name;
    assert.equal(asset.browser_download_url, url, 'unexpected public download URL');
    assert.equal(asset.state, 'uploaded');
    const file = path.join(dir, name);
    run('curl', [...curl, '--output', file, url]);
    const size = fs.statSync(file).size, sha256 = hashFile(file);
    assert.equal(asset.size, size, 'download size: ' + name);
    assert.equal(asset.digest, 'sha256:' + sha256, 'download digest: ' + name);
    measured.set(name, {name, size, sha256});
  }
  const file = name => path.join(dir, name);
  run('cosign', ['verify-blob', '--bundle', file(bundle), '--certificate-identity', COSIGN_IDENTITY,
    '--certificate-oidc-issuer', COSIGN_ISSUER, file(sums)]);
  const expectedLines = [...payload, manifestFile].map(name => measured.get(name).sha256 + '  ' + name);
  const lines = read(file(sums)).split('\n');
  assert.equal(lines.pop(), '', 'expected newline-terminated SHA256SUMS');
  assert.deepEqual(lines.sort(), expectedLines.sort(), 'SHA256SUMS must cover every payload and the manifest exactly once');

  const manifest = JSON.parse(read(file(manifestFile)));
  const record = JSON.parse(read(file('linux-release.json')));
  for (const doc of [manifest, record]) {
    assert.equal(doc.schema, 1);
    assert.equal(doc.tag, tag);
    assert.equal(doc.version, version);
    assert.equal(doc.sourceCommit, ref.sha, 'source must match the published tag');
  }
  assert.equal(record.build, build);
  assert.equal(record.prerelease, true);
  assert.equal(record.makeLatest, false);
  assert.equal(manifest.platform, 'linux');
  assert.deepEqual(manifest.assets.map(a => a.name).sort(), payload.toSorted(), 'unexpected manifest asset set');
  for (const entry of manifest.assets) assert.deepEqual(entry, measured.get(entry.name), 'manifest mismatch: ' + entry.name);
}

function checkDnfSource(source) {
  const lines = source.split(/\r?\n/).map(s => s.trim()).filter(s => s && !s.startsWith('#') && !s.startsWith(';'));
  assert.equal(lines.shift(), '[blanc-beta]');
  const fields = new Map();
  for (const line of lines) {
    const match = /^([\w.-]+)\s*=\s*(.*)$/.exec(line);
    assert.ok(match && !fields.has(match[1]), 'unexpected or duplicate entry in blanc-beta.repo');
    fields.set(match[1], match[2]);
  }
  assert.equal(fields.get('mirrorlist'), origin + '/rpm/stable/$basearch/mirrorlist');
  assert.ok(!fields.has('baseurl') && !fields.has('metalink'), 'expected the production generation mirrorlist');
  for (const key of ['enabled', 'gpgcheck', 'repo_gpgcheck']) assert.equal(fields.get(key), '1', key);
  assert.equal(fields.get('gpgkey'), 'file:///opt/bnfy/blanc-beta/blanc-repository.asc');
}

function cleanRefresh(result) {
  const log = result.stdout + '\n' + result.stderr;
  assert.doesNotMatch(log, /^\s*(?:[WE]:|Err:)|\b(?:warnings?|errors?|failed|skipping unavailable repositor(?:y|ies))\b/im,
    'repository refresh emitted a diagnostic:\n' + log.slice(-4000));
}

export function verifyPublicInstall({system, arch, version, assets, results}, io = {run: runCommand, read}) {
  buildNumber(version);
  assert.ok(['ubuntu', 'debian', 'fedora'].includes(system), 'unknown distribution');
  const rpm = system === 'fedora', names = packageNames(version, arch, 'beta');
  const sudo = (...args) => io.run('sudo', ['-n', ...args]);
  const file = path.resolve(assets, rpm ? names.rpm : names.deb);
  sudo(rpm ? 'dnf' : 'apt-get', '-y', 'install', file);

  if (rpm) {
    checkDnfSource(io.read('/etc/yum.repos.d/blanc-beta.repo'));
    cleanRefresh(sudo('dnf', '-y', '--refresh', '--setopt=blanc-beta.skip_if_unavailable=False', 'makecache'));
    // Query root's freshly populated cache, excluding the installed RPM database.
    const listing = sudo('dnf', '--cacheonly', '--repo=blanc-beta', 'repoquery', '--available',
      '--queryformat', '%{name} %{version}-%{release} %{arch}\\n', 'blanc-beta').stdout;
    const native = arch === 'arm64' ? 'aarch64' : 'x86_64';
    assert.ok(listing.split('\n').includes('blanc-beta ' + version + '-1 ' + native), 'public RPM missing from blanc-beta metadata');
  } else {
    const native = arch === 'arm64' ? 'arm64' : 'amd64';
    const source = 'deb [arch=' + native + ' signed-by=/usr/share/keyrings/blanc-beta.gpg] ' + origin + '/deb stable main';
    const lines = io.read('/etc/apt/sources.list.d/blanc-beta.list').split('\n').map(s => s.trim());
    assert.deepEqual(lines.filter(s => s && !s.startsWith('#')), [source], 'expected the signed production apt source');
    cleanRefresh(sudo('apt-get', '-o', 'APT::Update::Error-Mode=any', 'update'));
    const listing = io.run('apt-cache', ['madison', 'blanc-beta']).stdout;
    const wanted = origin + '/deb stable/main ' + native + ' Packages';
    assert.ok(listing.split('\n').some(line => {
      const [name, v, from] = line.split('|').map(s => s.trim());
      return name === 'blanc-beta' && v === version + '-1' && from === wanted;
    }), 'public deb missing from the production repository');
  }

  const smokeFile = path.join(results, 'installed-smoke.json');
  io.run('xvfb-run', ['-a', 'dbus-run-session', '--', process.execPath, path.join(import.meta.dirname, 'linux-beta-smoke.mjs'),
    version, smokeFile]);
  const smoke = JSON.parse(io.read(smokeFile));
  verifySmoke(smoke);
  const report = {system: smoke.system, arch: smoke.arch, version: smoke.version, pass: smoke.pass};
  assert.deepEqual(report, {system, arch, version, pass: true}, 'installed smoke differs from the requested leg');
  fs.writeFileSync(path.join(results, 'verify-public-' + system + '-' + arch + '.json'), JSON.stringify(report, null, 2) + '\n', {flag: 'wx'});
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const [mode, ...args] = process.argv.slice(2);
    if (mode === 'download' && args.length === 2) verifyPublicAssets(...args);
    else if (mode === 'install' && args.length === 5) {
      const [system, arch, version, assets, results] = args;
      assert.equal(process.platform, 'linux');
      assert.equal(process.arch, arch);
      assert.notEqual(process.getuid(), 0, 'the installed browser must run as an ordinary user');
      verifyPublicInstall({system, arch, version, assets, results});
    } else throw Error('usage: download VERSION NEW_ASSET_DIR | install SYSTEM ARCH VERSION ASSET_DIR RESULT_DIR');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
