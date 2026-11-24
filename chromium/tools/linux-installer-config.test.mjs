import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {stageLinuxPackageKey} from './build.mjs';

const chromium = fileURLToPath(new URL('../', import.meta.url));
const fixture = path.join(chromium, 'tools/fixtures/linux-installer');
const branding = path.join(chromium, 'blanc/branding/linux');
const keygen = path.join(branding, 'generate-keyring.py');
const patch = path.join(chromium, 'patches/0115-blanc-linux-installer.patch');
function temp(t) {
  // macOS limits socket paths to 104 bytes and its os.tmpdir() is deep, so a
  // GnuPG home below it can't start gpg-agent; /tmp keeps the path short.
  const base = process.platform === 'darwin' ? '/tmp' : os.tmpdir();
  const dir = fs.mkdtempSync(path.join(base, 'blanc-installer-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  return dir;
}

function patchedInstaller(t) {
  const src = temp(t);
  const install = 'chrome/installer/linux';
  fs.cpSync(path.join(chromium, 'upstream', install), path.join(src, install), {recursive: true});
  const manpage = 'chrome/app/resources/manpage.1.in';
  fs.mkdirSync(path.dirname(path.join(src, manpage)), {recursive: true});
  fs.copyFileSync(path.join(chromium, 'upstream', manpage), path.join(src, manpage));
  execFileSync('git', ['apply', patch], {cwd: src});
  return src;
}

function prepared(t, channel = 'prototype', repo = 'https://pkg-staging.blanc.day', debArch = 'amd64', rpmArch = 'x86_64') {
  const src = patchedInstaller(t);
  const install = 'chrome/installer/linux';
  const out = path.join(src, 'out');
  fs.cpSync(path.join(src, install), path.join(out, 'installer'), {recursive: true});
  fs.mkdirSync(path.join(out, 'installer/theme'));
  fs.writeFileSync(path.join(out, 'installer/theme/BRANDING'), 'COMPANY_FULLNAME=Bananify Creative\n');
  fs.writeFileSync(path.join(out, 'installer/version.txt'), 'MAJOR=158\nMINOR=0\nBUILD=8127\nPATCH=2\n');
  const probe = (url = repo) => spawnSync('python3', [path.join(fixture, 'probe.py'), src, out, channel, url, debArch, rpmArch],
    {encoding: 'utf8', env: {...process.env, REPOCONFIG: 'https://dl.google.com'}});
  return {out, probe};
}

for (const [channel, host, debArch, rpmArch] of [
  ['prototype', 'pkg-staging.blanc.day', 'amd64', 'x86_64'],
  ['beta', 'pkg.blanc.day', 'arm64', 'aarch64'],
]) {
  test(`installer config, integration files and scripts for ${channel} on ${debArch}`, t => {
    const {out, probe} = prepared(t, channel, 'https://' + host, debArch, rpmArch);
    const repo = 'https://' + host;
    const missing = probe();
    assert.notEqual(missing.status, 0);
    assert.match(missing.stderr, /generate-keyring\.py/);
    const ring = path.join(out, 'installer/common/blanc-repository.gpg');
    execFileSync('python3', [keygen, '--source', path.join(fixture, 'package-test.asc'), '--output', ring]);
    assert.deepEqual(fs.readFileSync(ring), execFileSync('gpg', ['--batch', '--dearmor'], {input: fs.readFileSync(path.join(fixture, 'package-test.asc'))}));
    assert.notEqual(probe(channel === 'beta' ? 'https://pkg-staging.blanc.day' : 'https://pkg.blanc.day').status, 0);
    const result = probe();
    assert.equal(result.status, 0, result.stderr);
    const cfg = JSON.parse(result.stdout);
    const pkg = 'blanc-' + channel;
    assert.equal(cfg.info.PACKAGE, pkg);
    assert.equal(cfg.info.INSTALLDIR, '/opt/bnfy/' + pkg);
    assert.equal(cfg.info.MENUNAME, channel === 'prototype' ? 'Blanc Prototype' : 'Blanc Beta');
    assert.equal(cfg.info.MAINTNAME + ' <' + cfg.info.MAINTMAIL + '>', 'Bananify Creative <support@blanc.day>');
    assert.equal(cfg.info.PRODUCTURL, 'https://blanc.day');
    assert.equal(cfg.wm, pkg);
    assert.equal(cfg.release, 'https://blanc.day/whats-new');
    assert.equal(cfg.deb, `deb [arch=${debArch}] ${repo}/deb stable main`);
    assert.equal(cfg.apt, `deb [arch=${debArch} signed-by=/usr/share/keyrings/${pkg}.gpg] ${repo}/deb stable main`);
    assert.equal(cfg.rpm, repo + '/rpm/stable/$basearch');
    const lines = cfg.dnf.split('\n');
    const source = channel === 'beta' ? `mirrorlist=${cfg.rpm}/mirrorlist` : 'baseurl=' + cfg.rpm;
    for (const line of [`[${pkg}]`, source, 'gpgcheck=1', 'repo_gpgcheck=1',
      `gpgkey=file:///opt/bnfy/${pkg}/blanc-repository.asc`]) assert.ok(lines.includes(line), line);
    assert.equal(lines.filter(l => l.startsWith('gpgkey=')).length, 1);
    for (const line of ['Exec=/usr/bin/' + pkg + ' %U', 'Icon=' + pkg, 'StartupWMClass=' + pkg, 'Categories=Network;WebBrowser;']) {
      assert.ok(cfg.desktop.split('\n').includes(line), line);
    }
    assert.match(cfg.desktop, /^MimeType=.*x-scheme-handler\/http;x-scheme-handler\/https;/m);
    assert.ok(cfg.apparmor.includes(`profile ${pkg} /opt/bnfy/${pkg}/chrome `));
    assert.ok(cfg.artifacts.includes('blanc_blocker/engine.js'));
    assert.ok(cfg.artifacts.includes('blanc-repository.gpg'));
    for (const artifacts of [cfg.artifacts, cfg.rpmArtifacts]) {
      assert.ok(artifacts.includes('notices/THIRD_PARTY_NOTICES.txt'));
      assert.ok(artifacts.includes('notices/LICENSE'));
    }
    for (const script of cfg.scripts) assert.doesNotMatch(script, /dl\.google\.com|google\.com\/linux|\/opt\/(google|chromium\.org)|chromium-browser|PGP_KEY_DATA|update-alternatives --(?:install|remove)|update_defaults_list "/);
  });
}

test('seven Sunrise installer icons regenerate byte for byte', t => {
  const dest = temp(t);
  execFileSync(process.execPath, [path.join(chromium, 'linux/generate-icons.mjs'), '--output', dest]);
  for (const size of [16, 24, 32, 48, 64, 128, 256]) {
    const name = `product_logo_${size}.png`;
    const image = fs.readFileSync(path.join(dest, name));
    assert.equal(image.readUInt32BE(16), size);
    assert.equal(image.readUInt32BE(20), size);
    assert.deepEqual(image, fs.readFileSync(path.join(branding, name)));
  }
});

test('installer keyring is derived from the committed owner public key', t => {
  const source = path.join(chromium, 'linux/keys/blanc-repository.asc');
  const ring = path.join(branding, 'blanc-repository.gpg');
  if (!fs.existsSync(source)) {
    assert.equal(fs.existsSync(ring), false);
    const result = spawnSync('python3', [keygen, '--source', source, '--output', path.join(temp(t), 'test.gpg')], {encoding: 'utf8'});
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /owner.*blanc-repository\.asc/i);
    return;
  }
  const generated = path.join(temp(t), 'test.gpg');
  execFileSync('python3', [keygen, '--source', source, '--output', generated]);
  assert.deepEqual(fs.readFileSync(generated), execFileSync('gpg', ['--batch', '--dearmor'], {input: fs.readFileSync(source)}));
});

test('GN binds the package targets to the browser identity from patch 0113', t => {
  const gn = fs.readFileSync(path.join(patchedInstaller(t), 'chrome/installer/linux/BUILD.gn'), 'utf8');
  assert.match(gn, /assert\(defined\(blanc_linux_package\)/);
  assert.doesNotMatch(gn, /^\s*blanc_linux_package\s*=(?!=)/m);
  assert.match(gn, /assert\(blanc_linux_package == "blanc-\$blanc_linux_channel"/);
  assert.doesNotMatch(gn, /package_name = "blanc-/);
  const config = fs.readFileSync(path.join(chromium, 'blanc/config.gni'), 'utf8');
  assert.match(config, /blanc_linux_build_packages\s*=\s*defined\(blanc_linux_package\) && blanc_blocker_bundle != ""/);
  const resources = fs.readFileSync(path.join(chromium, 'blanc/BUILD.gn'), 'utf8');
  assert.match(resources, /if \(is_linux && target_os == "linux" && blanc_linux_build_packages\) \{\s*assert\(defined\(blanc_linux_package\)/);
});

test('the selected Linux package group has only DEB and RPM installers', t => {
  const gn = fs.readFileSync(path.join(patchedInstaller(t), 'chrome/installer/linux/BUILD.gn'), 'utf8');
  assert.doesNotMatch(gn, /(?:flatpak\/build|debian\/build_repo_package)\.py|linux_package\("(?:stable|unstable|canary)"\)/);
  assert.match(gn, /linux_package\(blanc_linux_channel\)/);
  assert.match(gn, /enable_flatpak = false/, 'existing GN overrides remain recognized');
});

function budget(patches) {
  const rows = execFileSync('git', ['apply', '--numstat', ...patches], {cwd: path.resolve(chromium, '..'), encoding: 'utf8'});
  const files = new Set(rows.trim().split('\n').map(row => row.split('\t')[2]));
  const hunks = patches.reduce((total, name) => total + [...fs.readFileSync(name, 'utf8').matchAll(/^@@ -/gm)].length, 0);
  return {files: files.size, hunks};
}

test('patch 0115 and the desktop queue have measured budgets in the L1 plan', () => {
  const lane = JSON.parse(fs.readFileSync(path.join(chromium, 'lanes/desktop.json')));
  const plan = fs.readFileSync(path.join(chromium, '../docs/superpowers/plans/2026-11-21-linux-fork-l1.md'), 'utf8');
  const patches = lane.patches.map(name => path.join(chromium, name));
  const queue = patches.slice(0, patches.indexOf(patch) + 1);
  const installer = budget([patch]);
  const desktop = budget(queue);
  assert.ok(plan.includes(`0115 touches ${installer.files} upstream files in ${installer.hunks} hunks`));
  assert.ok(plan.includes(`through 0115 touches ${desktop.files} distinct upstream files in ${desktop.hunks} hunks`));
});

test('the L3 plan records the desktop patch footprint through 0116', () => {
  const {patches} = JSON.parse(fs.readFileSync(path.join(chromium, 'lanes/desktop.json')));
  const last = patches.indexOf('patches/0116-blanc-linux-update-notifications.patch');
  assert.ok(last >= 0);
  const queue = patches.slice(0, last + 1).map(name => path.join(chromium, name));
  const change = budget(queue.slice(-1));
  const desktop = budget(queue);
  const plan = fs.readFileSync(path.join(chromium, '../docs/superpowers/plans/2026-11-21-linux-fork-l3.md'), 'utf8');
  assert.ok(plan.includes(`0116 touches ${change.files} upstream files in ${change.hunks} hunks`));
  assert.ok(plan.includes(`through 0116 touches ${desktop.files} distinct upstream files in ${desktop.hunks} hunks`));
});

function repositoryCron(t, format) {
  const {out, probe} = prepared(t);
  execFileSync('python3', [keygen, '--source', path.join(fixture, 'package-test.asc'),
    '--output', path.join(out, 'installer/common/blanc-repository.gpg')]);
  const result = probe();
  assert.equal(result.status, 0, result.stderr);
  const root = temp(t);
  const install = '/opt/bnfy/blanc-prototype';
  const sources = root + '/etc/apt/sources.list.d';
  for (const dir of [install, '/usr/share/keyrings', '/etc/default', '/etc/yum.repos.d', '/etc/apt/sources.list.d', '/bin', '/gpg']) {
    fs.mkdirSync(root + dir, {recursive: true, mode: 0o700});
  }
  const bin = path.join(root, 'bin');
  fs.writeFileSync(path.join(bin, 'apt-config'), `#!/bin/sh\necho "APT_SOURCESDIR='${sources}'"\n`, {mode: 0o755});
  const script = fs.readFileSync(path.join(out, format === 'deb' ? 'repo.cron' : 'rpmrepo.cron'), 'utf8');
  const rendered = script.replace(/\/(?:usr\/share\/keyrings|opt\/bnfy|etc\/default|etc\/yum\.repos\.d|var\/cache\/(?:libdnf5|dnf))\b/g,
    absolute => root + absolute);
  const cron = path.join(root, 'cron');
  fs.writeFileSync(cron, rendered);
  const env = {...process.env, PATH: bin + ':' + process.env.PATH, GNUPGHOME: root + '/gpg'};
  return {root, bin, env, install: root + install, defaults: root + '/etc/default/blanc-prototype',
    run: () => execFileSync('sh', [cron], {env, stdio: 'pipe'})};
}

test('apt cron preserves first-install opt-outs and refreshes a previously managed key', t => {
  const f = repositoryCron(t, 'deb');
  const source = f.root + '/etc/apt/sources.list.d/blanc-prototype.list';
  const keyring = f.root + '/usr/share/keyrings/blanc-prototype.gpg';
  const packaged = f.install + '/blanc-repository.gpg';
  fs.writeFileSync(packaged, 'original');
  fs.writeFileSync(f.defaults, 'repo_add_once="false"\n');
  f.run();
  assert.equal(fs.existsSync(source), false);
  assert.equal(fs.existsSync(keyring), false);
  fs.writeFileSync(source, '# manually managed\n');
  fs.writeFileSync(keyring, 'manual');
  f.run();
  assert.equal(fs.readFileSync(source, 'utf8'), '# manually managed\n');
  assert.equal(fs.readFileSync(keyring, 'utf8'), 'manual');
  fs.writeFileSync(f.defaults, 'repo_add_once="true"\n');
  f.run();
  const managedSource = fs.readFileSync(source);
  assert.equal(fs.readFileSync(keyring, 'utf8'), 'original');
  assert.match(fs.readFileSync(f.defaults, 'utf8'), /repo_add_once="false"/);
  fs.writeFileSync(packaged, 'extended');
  f.run();
  assert.equal(fs.readFileSync(keyring, 'utf8'), 'extended');
  assert.deepEqual(fs.readFileSync(source), managedSource);
});

test('RPM cron updates an already-imported certificate in rpm and the channel metadata keyrings', t => {
  // The cron is a Linux script run with GNU coreutils (chmod --, etc.); CI runs it on Ubuntu.
  if (process.platform !== 'linux') return t.skip('runs the Linux RPM cron, which needs GNU coreutils');
  if (spawnSync('rpm', ['--version']).error?.code === 'ENOENT') return t.skip('rpm is unavailable');
  const f = repositoryCron(t, 'rpm');
  const rpmdb = path.join(f.root, 'rpmdb');
  for (const name of ['rpm', 'rpmkeys']) {
    const real = execFileSync('sh', ['-c', 'command -v ' + name], {encoding: 'utf8'}).trim();
    fs.writeFileSync(path.join(f.bin, name), `#!/bin/sh\nexec "${real}" --dbpath "${rpmdb}" "$@"\n`, {mode: 0o755});
  }
  const cmd = (program, args, input) => execFileSync(program, args, {env: f.env, input, stdio: ['pipe', 'pipe', 'pipe']});
  const gpg = args => cmd('gpg', ['--batch', '--pinentry-mode', 'loopback', '--passphrase', '', ...args]);
  const details = bytes => cmd('gpg', ['--batch', '--with-colons', '--show-keys'], bytes).toString().split('\n');
  const expires = bytes => details(bytes).find(line => line.startsWith('pub:')).split(':')[6];
  gpg(['--quick-generate-key', 'Expiry fixture <fixture@example.invalid>', 'rsa2048', 'sign', '1d']);
  const old = gpg(['--armor', '--export']);
  const fpr = details(old).find(line => line.startsWith('fpr:')).split(':')[9];
  const asc = f.install + '/blanc-repository.asc';
  fs.writeFileSync(asc, old);
  cmd('rpmkeys', ['--import', asc]);
  // Give the cron private DNF configuration as well as a private RPM database.
  const configDir = path.join(f.root, 'dnfconfig');
  fs.mkdirSync(configDir);
  fs.writeFileSync(path.join(configDir, 'dnf.py'), `class Conf:
    cachedir = ${JSON.stringify(f.root + '/var/cache/dnf')}
    def read(self): pass
class conf:
    Conf = Conf
`);
  f.env.PYTHONPATH = configDir;
  const ring = f.root + '/var/cache/dnf/blanc-prototype-0123456789abcdef/pubring';
  fs.mkdirSync(ring, {recursive: true, mode: 0o700});
  cmd('gpg', ['--batch', '--homedir', ring, '--import', asc]);
  const customCache = path.join(f.root, 'dnf5 custom cache');
  fs.writeFileSync(path.join(f.bin, 'dnf5'), `#!/bin/sh\ntest "$1" = --dump-main-config || exit 1\necho "system_cachedir = ${customCache}"\n`, {mode: 0o755});
  const dnf5 = path.join(customCache, 'blanc-prototype-fedcba9876543210/pubring');
  fs.mkdirSync(dnf5, {recursive: true});
  const raw = path.join(dnf5, fpr.slice(-16).toLowerCase() + '.pub');
  fs.writeFileSync(raw, gpg(['--export', fpr]));
  f.run();
  assert.match(fs.readFileSync(f.defaults, 'utf8'), /repo_add_once="false"/);
  gpg(['--quick-set-expire', fpr, '2y']);
  const extended = gpg(['--armor', '--export', fpr]);
  fs.writeFileSync(asc, extended);
  assert.notEqual(expires(old), expires(extended));
  f.run();
  const modern = cmd('rpmkeys', ['--help']).includes('--export');
  const rpmCert = modern ? cmd('rpmkeys', ['--export', fpr])
    : cmd('rpm', ['-q', 'gpg-pubkey', '--qf', '%{DESCRIPTION}']);
  assert.equal(expires(rpmCert), expires(extended), 'rpm database');
  assert.equal(expires(cmd('gpg', ['--homedir', ring, '--export', fpr])), expires(extended), 'GnuPG metadata ring');
  assert.equal(expires(fs.readFileSync(raw)), expires(extended), 'librepo RPM metadata ring');
});

test('package key input invalidates stale output and defers a missing-key error to the installer action', t => {
  const dir = temp(t);
  const source = path.join(dir, 'owner.asc');
  const input = path.join(dir, 'repository-key.input');
  const output = path.join(dir, 'blanc-repository.gpg');
  const action = () => spawnSync('python3', [keygen, '--source', input, '--output', output], {encoding: 'utf8'});

  fs.copyFileSync(path.join(fixture, 'package-test.asc'), source);
  stageLinuxPackageKey(source, input);
  assert.equal(action().status, 0);
  fs.utimesSync(input, 1, 1);
  stageLinuxPackageKey(source, input);
  assert.equal(fs.statSync(input).mtimeMs, 1000);
  fs.unlinkSync(source);
  stageLinuxPackageKey(source, input);
  assert.equal(fs.statSync(input).size, 0);
  const missing = action();
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /owner.*blanc-repository\.asc/i);
});
