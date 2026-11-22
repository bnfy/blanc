import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';

const chromium = fileURLToPath(new URL('../', import.meta.url));
const upstream = 'chrome/installer/linux';
const ownerKey = path.join(chromium, 'linux/keys/blanc-repository.asc');
const origin = 'https://pkg.blanc.day';
const pkg = 'blanc-beta';
const ring = '/usr/share/keyrings/blanc-beta.gpg';
const opt = '/opt/bnfy/blanc-beta';
const defaults = '/etc/default/blanc-beta';
const list = '/etc/apt/sources.list.d/blanc-beta.list';
const repo = '/etc/yum.repos.d/blanc-beta.repo';
const optedOut = 'repo_add_once="false"\n';
const managed = optedOut + 'repo_managed="true"\n';

function render(t, arch = 'amd64') {
  const root = fs.mkdtempSync(path.join(process.platform === 'darwin' ? '/tmp' : os.tmpdir(), 'blanc-repo-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const out = path.join(root, 'out');
  const install = path.join(root, upstream);
  const man = 'chrome/app/resources/manpage.1.in';
  fs.cpSync(path.join(chromium, 'upstream', upstream), install, {recursive: true});
  fs.cpSync(path.join(chromium, 'upstream', man), path.join(root, man));
  execFileSync('git', ['apply', path.join(chromium, 'patches/0115-blanc-linux-installer.patch')], {cwd: root});
  fs.mkdirSync(out);
  fs.symlinkSync(install, path.join(out, 'installer'));
  fs.mkdirSync(path.join(install, 'theme'));
  fs.writeFileSync(path.join(install, 'theme/BRANDING'), 'COMPANY_FULLNAME=Bananify Creative\n');
  fs.writeFileSync(path.join(install, 'version.txt'), 'MAJOR=158\nMINOR=0\nBUILD=8127\nPATCH=900\n');
  for (const dir of [opt, '/bin', '/gpg', path.dirname(list), path.dirname(repo), path.dirname(ring), path.dirname(defaults)]) {
    fs.mkdirSync(root + dir, {recursive: true, mode: 0o700});
  }
  const env = {...process.env, GNUPGHOME: root + '/gpg', PATH: root + '/bin:' + process.env.PATH};
  const run = (command, args, input) => execFileSync(command, args, {env, input, stdio: 'pipe'});
  run('python3', [path.join(chromium, 'blanc/branding/linux/generate-keyring.py'), '--source', ownerKey,
    '--output', path.join(install, 'common/blanc-repository.gpg')]);
  // Use the same InstallerConfig and template probe as the prototype. Stage just
  // the two real key artifacts, including the RPM installer's generated armor.
  const stageKeys = `
import pathlib, runpy, sys
sys.argv = sys.argv[1:]
p = runpy.run_path(sys.argv[0])
dest = pathlib.Path(sys.argv[1]) / "opt/bnfy/blanc-beta"
for name, artifacts in [("blanc-repository.gpg", p["artifacts"]), ("blanc-repository.asc", p["rpm_artifacts"])]:
    key, = [a for a in artifacts if str(a.dst) == name]
    (dest / name).write_bytes(key.content.encode() if key.content else (p["out"] / key.src).read_bytes())
`;
  const cfg = JSON.parse(run('python3', ['-c', stageKeys, path.join(chromium, 'tools/fixtures/linux-installer/probe.py'),
    root, out, 'beta', origin, arch, arch === 'amd64' ? 'x86_64' : 'aarch64']));
  const read = name => fs.readFileSync(path.join(out, name), 'utf8');
  const stub = (name, body) => fs.writeFileSync(root + '/bin/' + name, '#!/bin/sh\n' + body + '\n', {mode: 0o755});
  stub('xdg-icon-resource', 'exit 0');
  stub('update-desktop-database', 'exit 0');
  stub('apt-config', `echo "APT_SOURCESDIR='${root}/etc/apt/sources.list.d'"`);
  const spec = read('chrome.spec.template');
  const sections = {post: spec.split('\n%post\n')[1].split('\n%preun\n')[0],
    preun: spec.split('\n%preun\n')[1].split('\n%postun\n')[0]};
  function rooted(body) {
    return body.replace(/\/(?:opt\/bnfy|etc\/(?:default|apt\/sources\.list\.d|yum\.repos\.d|apparmor\.d)|usr\/share\/keyrings|var\/cache\/(?:libdnf5|dnf))\b/g, p => root + p);
  }
  function script(name, ...args) {
    run('sh', ['-c', rooted(sections[name] ?? read(name)), name, ...args]);
  }
  return {root, cfg, read, rooted, script, run, stub};
}

for (const arch of ['amd64', 'arm64']) {
  test(`beta renders production repository scripts and the owner's key for ${arch}`, t => {
    const f = render(t, arch);
    assert.equal(f.cfg.info.PACKAGE, pkg);
    assert.equal(f.cfg.apt, `deb [arch=${arch} signed-by=${ring}] ${origin}/deb stable main`);
    assert.equal(f.cfg.dnf, [
      '[blanc-beta]', 'name=Blanc Beta', 'mirrorlist=' + origin + '/rpm/stable/$basearch/mirrorlist',
      'enabled=1', 'gpgcheck=1', 'repo_gpgcheck=1', 'gpgkey=file://' + opt + '/blanc-repository.asc',
    ].join('\n'));
    for (const name of ['repo.cron', 'apt.include', 'rpm.include', 'rpmrepo.cron', 'postinst', 'prerm', 'postrm', 'chrome.spec.template']) {
      assert.doesNotMatch(f.read(name), /dl\.google\.com|pkg-staging|@@\w+/, name);
    }
    const bytes = f.run('gpg', ['--batch', '--dearmor', '--output', '-', ownerKey]);
    assert.deepEqual(fs.readFileSync(f.root + opt + '/blanc-repository.gpg'), bytes);
    assert.deepEqual(f.run('gpg', ['--batch', '--dearmor', '--output', '-', f.root + opt + '/blanc-repository.asc']), bytes);
  });
}

for (const format of ['deb', 'rpm']) {
  test(`beta ${format} honors a pre-install opt-out and cleans up only its enrolled repository`, t => {
    if (format === 'rpm' && process.platform !== 'linux') return t.skip('the RPM cron needs Linux RPM tools and GNU coreutils');
    if (format === 'rpm' && spawnSync('rpmkeys', ['--version']).error?.code === 'ENOENT') return t.skip('rpmkeys is unavailable');
    const f = render(t);
    const apt = format === 'deb';
    const source = f.root + (apt ? list : repo);
    const setting = f.root + defaults;
    const keyring = f.root + ring;
    const cron = apt ? 'repo.cron' : 'rpmrepo.cron';
    const install = () => apt ? f.script('postinst', 'configure') : f.script('post', '1');
    function purge() {
      if (apt) {
        f.script('prerm', 'remove');
        f.script('postrm', 'purge');
      } else f.script('preun', '0');
    }
    if (!apt) {
      for (const cmd of ['rpm', 'rpmkeys']) {
        const binary = f.run('sh', ['-c', 'command -v ' + cmd]).toString().trim();
        f.stub(cmd, `exec "${binary}" --dbpath "${f.root}/rpmdb" "$@"`);
      }
      // DNF's real cache can contain other channels' metadata trust.
      f.stub('dnf5', `echo 'system_cachedir = ${f.root}/dnf5'`);
      f.stub('python3', 'exit 1'); // let the cron use its redirected DNF 4 fallback
    }
    fs.writeFileSync(setting, optedOut);
    install();
    f.script(cron);
    assert.equal(fs.existsSync(source), false);
    assert.equal(fs.existsSync(keyring), false);
    assert.equal(fs.existsSync(f.root + '/rpmdb'), false);
    fs.writeFileSync(source, 'administrator-owned\n');
    purge();
    assert.equal(fs.readFileSync(source, 'utf8'), 'administrator-owned\n');
    assert.equal(fs.readFileSync(setting, 'utf8'), optedOut);
    fs.unlinkSync(source);
    fs.unlinkSync(setting);

    const expected = (apt ? f.cfg.apt.replace(ring, keyring) : f.cfg.dnf.replace(opt, f.root + opt)) + '\n';
    const neighbor = path.join(path.dirname(source), apt ? 'chromium.list' : 'chromium.repo');
    fs.writeFileSync(neighbor, '# independent source\n');
    // Also exercise first enrollment by cron with no previous install script.
    f.script(cron);
    assert.equal(fs.readFileSync(source, 'utf8'), expected);
    assert.equal(fs.readFileSync(setting, 'utf8'), managed);
    purge();
    assert.equal(fs.existsSync(source), false);
    install();
    assert.equal(fs.readFileSync(source, 'utf8'), expected);
    assert.equal(fs.readFileSync(setting, 'utf8'), managed);
    f.script(cron);
    if (apt) assert.deepEqual(fs.readFileSync(keyring), f.run('gpg', ['--batch', '--dearmor', '--output', '-', ownerKey]));
    install();
    if (apt) {
      f.script('prerm', 'upgrade');
      f.script('postrm', 'upgrade');
      f.script('prerm', 'remove');
      f.script('postrm', 'remove');
    } else f.script('preun', '1');
    assert.equal(fs.readFileSync(source, 'utf8'), expected);
    assert.equal(fs.readFileSync(setting, 'utf8'), managed);
    purge();
    for (const file of [source, keyring, setting]) assert.equal(fs.existsSync(file), false, file);
    assert.equal(fs.readFileSync(neighbor, 'utf8'), '# independent source\n');
  });
}

test('the manual setup uses production trust and documents a persistent opt-out', () => {
  const file = path.join(chromium, 'linux/manual-repository.md');
  assert.ok(fs.existsSync(file), 'missing manual repository commands');
  const text = fs.readFileSync(file, 'utf8');
  for (const required of [origin + '/blanc-repository.asc', ring, 'gpg --dearmor', list, repo,
    'rpm --import', 'gpgcheck=1', 'repo_gpgcheck=1', defaults, optedOut.trim(),
    fs.readFileSync(path.join(chromium, 'linux/repository.md'), 'utf8').match(/^Fingerprint: ([A-F0-9]+)$/m)[1]]) {
    assert.ok(text.includes(required), required);
  }
  assert.doesNotMatch(text, /pkg-staging|dl\.google\.com/);
});

test('the documented opt-out disables an enrolled apt source across cron and upgrade', t => {
  const f = render(t);
  const instructions = fs.readFileSync(path.join(chromium, 'linux/manual-repository.md'), 'utf8');
  f.stub('sudo', 'exec "$@"');
  f.script('postinst', 'configure');
  assert.ok(fs.existsSync(f.root + list));
  for (const heading of ['Turn off automatic repository setup', 'Disable an existing source']) {
    const section = instructions.split('\n## ' + heading + '\n')[1].split('\n## ')[0];
    const code = section.match(/^```sh\n([\s\S]*?)\n```$/m)[1];
    f.run('sh', ['-ec', f.rooted(code)]);
  }
  const disabled = fs.readFileSync(f.root + defaults, 'utf8');
  for (const [name, ...args] of [['repo.cron'], ['postinst', 'configure'], ['repo.cron']]) {
    f.script(name, ...args);
    assert.equal(fs.existsSync(f.root + list), false);
    assert.equal(fs.existsSync(f.root + ring), false);
    assert.equal(fs.readFileSync(f.root + defaults, 'utf8'), disabled);
  }
});

test('lifecycle refresh evidence distinguishes Blanc outages from a failed distribution refresh', async () => {
  const {checkRefresh} = await import('../tests/linux-repo-lifecycle.mjs');
  const distro = ['debian_InRelease', 'debian-security_InRelease'];
  const failure = {status: 100, log: "E: Failed to fetch https://pkg.blanc.invalid/deb  Could not resolve 'pkg.blanc.invalid'",
    distro, blanc: false};
  checkRefresh(failure, 'dns', distro);
  assert.throws(() => checkRefresh({...failure, distro: distro.slice(1)}, 'dns', distro));
  assert.throws(() => checkRefresh({...failure, log: failure.log + '\nE: Failed to fetch https://deb.debian.org/debian'}, 'dns', distro));
  assert.throws(() => checkRefresh(failure, '500', distro));
  assert.throws(() => checkRefresh({...failure, status: 0}, 'disabled', distro));
  checkRefresh({status: 0, log: '', distro, blanc: false}, 'disabled', distro);
});

test('the package lifecycle runner skips outside Linux', {skip: process.platform === 'linux' && 'macOS skip check'}, () => {
  const result = spawnSync(process.execPath, [path.join(chromium, 'tests/linux-repo-lifecycle.mjs')], {encoding: 'utf8'});
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /SKIP.*Linux.*apt.*dnf/i);
});
