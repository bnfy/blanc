import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {createHash} from 'node:crypto';
import { installDownloads, installManifest, removePackage, repositoryContents, signedRpmAsset, verifyPasswordAcrossReinstall } from './linux-install.mjs';
import { installedRuntime, standaloneInstalled, verifiedSmokePackage } from './linux-smoke.mjs';
import { googleRepoSnapshot, profileDigest } from './lib/linux-seed.mjs';
import { NativeFixture } from './lib/fixture.mjs';

const tarSha256 = 'a'.repeat(64), exeSha256 = 'b'.repeat(64);
function records(arch) {
  const version = '158.0.8127.2';
  const deb = {file: `blanc-prototype_${version}-1_${arch === 'x64' ? 'amd64' : 'arm64'}.deb`, sha256: 'c'.repeat(64)};
  const rpm = {file: `blanc-prototype-${version}-1.${arch === 'x64' ? 'x86_64' : 'aarch64'}.rpm`, sha256: 'd'.repeat(64)};
  const id = `linux-${arch}-${exeSha256.slice(0, 16)}`;
  return {candidate: {id, arch, exeSha256, version, packages: [deb, {...rpm, sha256: 'e'.repeat(64)}]},
    signed: {candidate: id, arch, tarSha256, deb, rpm}};
}
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
function tempFolder(t) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-install-review-'));
  t.after(() => fs.rmSync(folder, {recursive: true, force: true}));
  return folder;
}

test('install names the missing architecture archive, owner key and individual signed package assets', t => {
  const key = path.join(tempFolder(t), 'blanc-repository.asc');
  const archive = 'blanc-linux-arm64-candidate.tar.gz';
  const manifest = 'signed-candidate-arm64.json';
  const downloads = names => installDownloads({isDraft: true, assets: names.map(name => ({name}))}, 'arm64', key);
  assert.throws(() => downloads(['blanc-linux-x64-candidate.tar.gz']), /blanc-linux-arm64-candidate\.tar\.gz/);
  assert.throws(() => downloads([archive]), /owner.*public.*key.*blanc-repository\.asc/i);
  fs.writeFileSync(key, 'public test key');
  assert.throws(() => downloads([archive]), /signed-candidate-arm64\.json/);
  assert.throws(() => downloads([archive, manifest]), /signed-candidate-arm64\.json\.asc/);
  assert.deepEqual(downloads([archive, manifest, manifest + '.asc']), [archive, manifest, manifest + '.asc']);
  const {candidate, signed} = records('arm64');
  delete candidate.packages;
  assert.throws(() => installManifest(candidate, signed, 'arm64', tarSha256), /arm64.*\.deb.*\.rpm/i);
});

for (const format of ['deb', 'rpm']) {
  test(`installed smoke refuses same-name replacement ${format} bytes before inspecting the executable`, t => {
    const dir = tempFolder(t);
    const {candidate, signed} = records('x64');
    const file = path.join(dir, 'packages', signed[format].file);
    fs.mkdirSync(path.dirname(file));
    fs.writeFileSync(file, 'candidate package');
    candidate.packages.find(p => p.file === signed[format].file).sha256 = digest('candidate package');
    assert.equal(verifiedSmokePackage(dir, candidate, format), file);
    fs.writeFileSync(file, 'same name, different build');
    assert.throws(() => verifiedSmokePackage(dir, candidate, format), /package SHA-256/i);
    // Run through the installed entry point without needing a package manager
    // or an installed binary. Hash rejection must precede either package reader.
    const meta = path.join(dir, 'candidate.json');
    fs.writeFileSync(meta, JSON.stringify(candidate));
    const read = fs.readFileSync;
    t.mock.method(fs, 'readFileSync', (filename, ...args) => filename === '/etc/os-release'
      ? 'ID=' + (format === 'rpm' ? 'fedora' : 'debian') : read(filename, ...args));
    for (const [name, value] of [['platform', 'linux'], ['arch', 'x64']]) {
      const original = Object.getOwnPropertyDescriptor(process, name);
      Object.defineProperty(process, name, {...original, value});
      t.after(() => Object.defineProperty(process, name, original));
    }
    assert.throws(() => installedRuntime('/opt/bnfy/blanc-prototype/chrome', meta), /package SHA-256/i);
  });
}

test('standalone installed smoke uses a new bus, runtime and keyring home, then cleans up', t => {
  const originalHome = tempFolder(t);
  const parent = {HOME: originalHome, DBUS_SESSION_BUS_ADDRESS: 'unix:path=/desktop/bus',
    XDG_RUNTIME_DIR: '/desktop/runtime', GNOME_KEYRING_CONTROL: '/desktop/keyring',
    WAYLAND_DISPLAY: 'wayland-blanc', DISPLAY: ':1'};
  const args = ['--display=wayland', '--installed=/opt/bnfy/blanc-prototype/chrome', '--metadata=candidate.json', 'results'];
  let privateHome;
  assert.throws(() => standaloneInstalled(args, parent, (cmd, argv, {env}) => {
    assert.equal(cmd, 'dbus-run-session');
    assert.equal(argv[0], '--');
    assert.equal(argv[1], process.execPath);
    assert.deepEqual(argv.slice(-args.length), args);
    privateHome = env.HOME;
    assert.notEqual(privateHome, originalHome);
    assert.equal(env.XDG_RUNTIME_DIR, path.join(privateHome, 'runtime'));
    if (process.platform !== 'win32') assert.equal(fs.statSync(env.XDG_RUNTIME_DIR).mode & 0o777, 0o700);
    assert.equal(env.XDG_CONFIG_HOME, path.join(privateHome, '.config'));
    assert.equal(env.DBUS_SESSION_BUS_ADDRESS, undefined);
    assert.equal(env.GNOME_KEYRING_CONTROL, undefined);
    assert.equal(env.WAYLAND_DISPLAY, path.join(parent.XDG_RUNTIME_DIR, 'wayland-blanc'));
    throw Error('simulated child exit');
  }), /simulated child exit/);
  assert.ok(!fs.existsSync(privateHome));
});

test('the Debian remove-only cron cannot recreate enrollment that purge would erase', () => {
  const state = {installDir: false, launcher: false, desktop: false, source: false, key: false, cron: true, apparmor: false, data: true};
  const events = [];
  const deps = {
    command(cmd, op) { events.push(op); if (op === 'purge') Object.assign(state, {source: false, cron: false}); },
    daily() { events.push('cron'); if (state.cron) state.source = true; return state.cron ? ['blanc-prototype'] : []; },
    snapshot(stage) { events.push(stage); return {...state}; },
    enrollment() { return {source: state.source, key: state.key}; },
    record: {files: {}},
  };
  assert.throws(() => removePackage('debian', 'managed', deps), /cron.*enrollment/i);
  assert.ok(events.includes('cron'));
  assert.ok(!events.includes('purge'));
  events.length = 0;
  state.source = true; // A pre-existing managed source may survive until purge.
  removePackage('debian', 'managed', deps);
  assert.ok(events.indexOf('cron') < events.indexOf('purge'));
  assert.ok(events.lastIndexOf('cron') > events.indexOf('purge'));
  assert.equal(state.source, false);
  // A job cleaning up a leaked source after purge must not hide a purge failure.
  state.source = true;
  let purged = false;
  deps.command = (cmd, op) => { if (op === 'purge') purged = true; };
  deps.daily = () => { if (purged) state.source = false; return []; };
  assert.throws(() => removePackage('debian', 'managed', deps), /source.*purge/i);
});

test('a retained encrypted login needs its original key before reinstall and plaintext after it', async () => {
  const events = [];
  let key = 'replacement key';
  const checks = {
    readKey() { events.push('key'); return key; },
    install() { events.push('reinstall'); },
    async decrypt() { events.push('decrypt'); throw Error('cannot read original password'); },
  };
  await assert.rejects(verifyPasswordAcrossReinstall('original key', checks), /key/i);
  assert.deepEqual(events, ['key']);
  events.length = 0;
  key = 'original key';
  await assert.rejects(verifyPasswordAcrossReinstall(key, checks), /cannot read original password/);
  assert.deepEqual(events.slice(0, 3), ['key', 'reinstall', 'decrypt']);
});

test('Google repository baselines detect edits, deletion and migration of existing deb822 sources', t => {
  const root = tempFolder(t);
  const dir = path.join(root, 'etc/apt/sources.list.d');
  fs.mkdirSync(dir, {recursive: true});
  const file = path.join(dir, 'google-chrome.sources');
  fs.writeFileSync(file, 'Types: deb\nEnabled: no\n');
  const renamed = path.join(dir, 'workstation-browser.sources');
  fs.writeFileSync(renamed, 'Types: deb\nURIs: https://dl.google.com/linux/chrome/deb/\n');
  fs.writeFileSync(path.join(dir, 'unrelated.sources'), 'Types: deb\nURIs: https://archive.ubuntu.com/ubuntu/\n');
  const snapshot = () => googleRepoSnapshot(root);
  const before = snapshot();
  assert.equal(before['/etc/apt/sources.list.d/google-chrome.sources'], digest(fs.readFileSync(file)));
  assert.equal(before['/etc/apt/sources.list.d/workstation-browser.sources'], digest(fs.readFileSync(renamed)));
  assert.ok(!Object.hasOwn(before, '/etc/apt/sources.list.d/unrelated.sources'));
  fs.appendFileSync(file, '# changed\n');
  assert.notDeepEqual(snapshot(), before);
  fs.renameSync(file, path.join(dir, 'google-chrome.list'));
  assert.notDeepEqual(snapshot(), before);
  fs.unlinkSync(path.join(dir, 'google-chrome.list'));
  assert.notDeepEqual(snapshot(), before);
});
for (const arch of ['x64', 'arm64']) {
  test(`signed descriptor binds the ${arch} tar, deb and separately signed rpm`, () => {
    const {candidate, signed} = records(arch);
    assert.deepEqual(installManifest(candidate, signed, arch, tarSha256), {deb: signed.deb.file, rpm: signed.rpm.file});
    for (const change of [{arch: 'x86'}, {candidate: 'bogus'}, {tarSha256: exeSha256},
      {rpm: {...signed.rpm, file: '../' + signed.rpm.file}}, {deb: {...signed.deb, sha256: exeSha256}},
      {rpm: {...signed.rpm, file: records(arch === 'x64' ? 'arm64' : 'x64').signed.rpm.file}}]) {
      assert.throws(() => installManifest(candidate, {...signed, ...change}, arch, tarSha256));
    }
    assert.throws(() => installManifest({...candidate, packages: [candidate.packages[0], candidate.packages[0]]}, signed, arch, tarSha256));
  });
}
test('complete enrolled sources use the preview key and the staging repository', () => {
  assert.equal(repositoryContents('ubuntu', 'arm64'), 'deb [arch=arm64 signed-by=/usr/share/keyrings/blanc-prototype.gpg] https://pkg-staging.blanc.day/deb stable main\n');
  assert.equal(repositoryContents('debian', 'x64'), 'deb [arch=amd64 signed-by=/usr/share/keyrings/blanc-prototype.gpg] https://pkg-staging.blanc.day/deb stable main\n');
  assert.equal(repositoryContents('fedora', 'arm64'), '[blanc-prototype]\nname=Blanc Prototype\nbaseurl=https://pkg-staging.blanc.day/rpm/stable/$basearch\nenabled=1\ngpgcheck=1\nrepo_gpgcheck=1\ngpgkey=file:///opt/bnfy/blanc-prototype/blanc-repository.asc\n');
});
test('the profile baseline detects additions, renames, changed bytes and symlink targets', t => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'install-baseline-'));
  t.after(() => fs.rmSync(tmp, {recursive: true, force: true}));
  fs.writeFileSync(path.join(tmp, 'Preferences'), 'first');
  const first = profileDigest(tmp);
  fs.writeFileSync(path.join(tmp, 'Preferences'), 'other');
  assert.notEqual(profileDigest(tmp), first);
  fs.writeFileSync(path.join(tmp, 'Preferences'), 'first');
  assert.equal(profileDigest(tmp), first);
  fs.mkdirSync(path.join(tmp, 'Default'));
  assert.notEqual(profileDigest(tmp), first);
  fs.renameSync(path.join(tmp, 'Preferences'), path.join(tmp, 'Default/Preferences'));
  fs.symlinkSync('missing-a', path.join(tmp, 'link'));
  const before = profileDigest(tmp);
  fs.unlinkSync(path.join(tmp, 'link'));
  fs.symlinkSync('missing-b', path.join(tmp, 'link'));
  assert.notEqual(profileDigest(tmp), before);
});
test('installed fixture lets the browser create the real profile and find the installed engine', async t => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'install-fixture-'));
  t.after(() => fs.rmSync(tmp, {recursive: true, force: true}));
  const fixture = new NativeFixture();
  fixture.reapHelpers = () => []; // No child process is started by this test.
  t.after(() => fixture.close());
  const cfg = {singleBinary: true, executable: path.join(tmp, 'chrome'), executableSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'};
  fs.writeFileSync(cfg.executable, '');
  const home = path.join(tmp, 'home');
  fs.mkdirSync(home);
  fixture.start = async () => { throw Error('captured launch'); };
  if (process.platform !== 'linux') {
    await assert.rejects(fixture.launch(cfg, path.join(tmp, 'other'), {installedHome: home}), /installed.*Linux/i);
  }
  // Exercise the options on Mac developer machines too. start() is intercepted
  // before spawn, and no Chromium GUI or platform command runs.
  const platform = Object.getOwnPropertyDescriptor(process, 'platform');
  try {
    Object.defineProperty(process, 'platform', {...platform, value: 'linux'});
    await assert.rejects(fixture.launch(cfg, path.join(tmp, 'case'), {installedHome: home}), /captured launch/);
  } finally {
    Object.defineProperty(process, 'platform', platform);
  }
  assert.equal(fixture.profile, path.join(home, '.config/blanc-prototype'));
  assert.ok(!fs.existsSync(fixture.profile));
  assert.equal(fixture.launchEnv.HOME, home);
  assert.equal(fixture.launchEnv.XDG_CONFIG_HOME, path.join(home, '.config'));
  assert.ok(!fixture.flags.some(f => /^--(?:user-data-dir|blanc-(?:blocker|prototype)-assets|use-mock-keychain)/.test(f)));
});

test('preparation verifies the detached signature and original and signed package bytes', async t => {
  if (process.platform === 'win32') return t.skip('Linux archive tools');
  const {execFileSync, spawnSync} = await import('node:child_process');
  if (['gpg', 'gpgv', 'sha256sum', 'tar'].some(tool => spawnSync(tool, ['--version']).error)) return t.skip('needs GnuPG and archive tools');
  const {createHash} = await import('node:crypto');
  const {prepareInstallInput} = await import('./linux-install.mjs');
  assert.equal(typeof prepareInstallInput, 'function');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'install-proof-'));
  const gpg = path.join(temp, 'gpg');
  t.after(() => {
    spawnSync('gpgconf', ['--homedir', gpg, '--kill', 'all']);
    fs.rmSync(temp, {recursive: true, force: true});
  });
  fs.mkdirSync(gpg, {mode: 0o700});
  const runGpg = args => execFileSync('gpg', ['--batch', '--homedir', gpg, '--pinentry-mode', 'loopback', '--passphrase', '', ...args], {stdio: ['ignore', 'pipe', 'pipe']});
  runGpg(['--quick-generate-key', 'Blanc disposable install test', 'ed25519', 'sign', '1d']);
  const publicKey = path.join(temp, 'fixture.asc');
  fs.writeFileSync(publicKey, runGpg(['--armor', '--export']));
  const bytes = text => createHash('sha256').update(text).digest('hex');
  const {candidate, signed} = records('arm64');
  signed.deb.sha256 = candidate.packages[0].sha256 = bytes('fixture deb');
  candidate.packages[1].sha256 = bytes('unsigned fixture');
  signed.rpm.sha256 = bytes('signed fixture');
  const tree = path.join(temp, 'tree');
  fs.mkdirSync(path.join(tree, 'packages'), {recursive: true});
  fs.writeFileSync(path.join(tree, 'packages', candidate.packages[0].file), 'fixture deb');
  fs.writeFileSync(path.join(tree, 'packages', candidate.packages[1].file), 'unsigned fixture');
  fs.writeFileSync(path.join(tree, 'candidate.json'), JSON.stringify(candidate));
  const tar = path.join(temp, 'blanc-linux-arm64-candidate.tar.gz');
  execFileSync('tar', ['-czf', tar, '-C', tree, '.']);
  signed.tarSha256 = bytes(fs.readFileSync(tar));
  const manifest = path.join(temp, 'signed-candidate-arm64.json');
  const sign = () => {
    fs.writeFileSync(manifest, JSON.stringify(signed));
    runGpg(['--yes', '--armor', '--detach-sign', manifest]);
  };
  sign();
  fs.writeFileSync(path.join(temp, signed.rpm.file), 'signed fixture');
  assert.throws(() => signedRpmAsset({isDraft: true, assets: []}, 'arm64', temp, signed.tarSha256, publicKey),
    error => error.message.includes('Missing signed RPM ' + signed.rpm.file));
  const prepare = name => prepareInstallInput('arm64', temp, path.join(temp, name), signed.tarSha256, publicKey);
  prepare('good');
  assert.equal(fs.readFileSync(path.join(temp, 'good', signed.rpm.file), 'utf8'), 'signed fixture');
  fs.appendFileSync(manifest, ' ');
  assert.throws(() => prepare('tampered-signature'));
  assert.ok(!fs.existsSync(path.join(temp, 'tampered-signature')));
  sign();
  fs.writeFileSync(path.join(temp, signed.rpm.file), 'replacement');
  assert.throws(() => prepare('tampered-rpm'));
  signed.deb.sha256 = bytes('other deb');
  sign();
  assert.throws(() => prepare('wrong-deb'));
  fs.appendFileSync(tar, '!');
  assert.throws(() => prepare('tampered-tar'));
});
