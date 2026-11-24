import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {scanPackage} from '../linux/package-scan.mjs';

const fixtures = fileURLToPath(new URL('fixtures/linux-installer/', import.meta.url));
const key = fs.readFileSync(path.join(fixtures, 'package-test.asc'));
const otherKey = fs.readFileSync(path.join(fixtures, 'other-test.asc'));

function workspace(t, tools) {
  for (const tool of tools) {
    if (spawnSync(tool, ['--version']).error?.code === 'ENOENT') {
      t.skip(tool + ' is unavailable');
      return;
    }
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-scan-test-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  return dir;
}
function write(root, name, content, mode = 0o644) {
  const dest = path.join(root, name);
  fs.mkdirSync(path.dirname(dest), {recursive: true});
  fs.writeFileSync(dest, content, {mode});
}
function fingerprint(dir) {
  const info = execFileSync('gpg', ['--batch', '--homedir', dir, '--with-colons', '--show-keys'], {input: key, encoding: 'utf8'});
  return info.split('\n').find(row => row.startsWith('fpr:')).split(':')[9];
}
function deb(dir, files) {
  const root = path.join(dir, 'root');
  write(root, 'DEBIAN/control', 'Package: blanc-prototype\nVersion: 1\nArchitecture: all\nMaintainer: Fixture <test@example.invalid>\nDescription: fixture\n');
  for (const [name, value] of Object.entries(files)) write(root, name, value, name.startsWith('DEBIAN/') ? 0o755 : 0o644);
  const pkg = path.join(dir, 'fixture.deb');
  execFileSync('dpkg-deb', ['--build', root, pkg]);
  return pkg;
}

for (const [name, files, expected] of [
  ['clean package with an armored key', {'opt/bnfy/blanc-prototype/repo.data': key}, null],
  ['inner chrome executable', {'opt/bnfy/blanc-prototype/chrome': Buffer.from([0x7f, 69, 76, 70, 0])}, null],
  ['embedded blocker missing the fork notices', {'opt/bnfy/blanc-prototype/blanc_blocker/engine.js': 'fixture'}, /THIRD_PARTY_NOTICES/],
  ['embedded blocker with a substituted notice', {
    'opt/bnfy/blanc-beta/blanc_blocker/engine.js': 'fixture',
    'opt/bnfy/blanc-beta/notices/THIRD_PARTY_NOTICES.txt': 'different product',
  }, /THIRD_PARTY_NOTICES/],
  ['Google URL in postinst', {'DEBIAN/postinst': '#!/bin/sh\necho dl.google.com\n'}, /^.*DEBIAN\/postinst: contains dl\.google\.com$/m],
  ['foreign binary keyring with no key extension', {'opt/bnfy/blanc-prototype/resource': () => execFileSync('gpg', ['--batch', '--dearmor'], {input: otherKey})}, /resource.*fingerprint/i],
  ['mixed embedded armor', {'DEBIAN/postinst': Buffer.concat([Buffer.from('#!/bin/sh\n'), key, otherKey])}, /postinst.*fingerprint/i],
  ['reserved AppArmor declaration in a channel-named file', {
    'opt/bnfy/blanc-prototype/apparmor.d/blanc-prototype': 'profile "chrome" /opt/bnfy/blanc-prototype/chrome flags=(unconfined) {\n}\n',
  }, /apparmor.*profile.*chrome/i],
  ['sibling channel AppArmor declaration', {
    'etc/apparmor.d/blanc-prototype': 'profile blanc-beta /opt/bnfy/blanc-prototype/chrome {\n}\n',
  }, /apparmor.*profile.*blanc-beta/i],
  ['matching AppArmor declaration', {
    'opt/bnfy/blanc-beta/apparmor.d/blanc-beta': '# profile chrome\nprofile "blanc-beta" /opt/bnfy/blanc-beta/chrome {\n}\n',
  }, null],
  ['launcher collision', {'usr/bin/blanc': ''}, /usr\/bin\/blanc/],
  ['desktop action collision', {'usr/share/applications/blanc-prototype.desktop': '[Desktop Entry]\nExec=/usr/bin/blanc-prototype %U\n[Desktop Action New]\nExec=/usr/bin/chrome %U\n'}, /desktop.*Exec.*chrome/],
]) {
  test('scan deb ' + name, t => {
    const dir = workspace(t, ['dpkg-deb', 'gpg']);
    if (!dir) return;
    const pkg = deb(dir, Object.fromEntries(Object.entries(files).map(([k, v]) => [k, typeof v === 'function' ? v() : v])));
    const result = scanPackage(pkg, {fingerprint: fingerprint(dir)});
    if (expected) {
      assert.equal(result.ok, false);
      assert.match(result.findings.join('\n'), expected);
    } else {
      assert.deepEqual(result, {ok: true, findings: []});
    }
  });
}

test('scan rpm reads scriptlets, file triggers and transaction file triggers from the header', t => {
  const dir = workspace(t, ['rpmbuild', 'rpm', 'rpm2cpio', 'cpio', 'gpg']);
  if (!dir) return;
  const spec = path.join(dir, 'fixture.spec');
  fs.writeFileSync(spec, `Name: blanc-prototype
Version: 1
Release: 1
Summary: Fixture
License: MIT
BuildArch: noarch
%description
Fixture
%install
mkdir -p "%{buildroot}/opt/bnfy/blanc-prototype"
touch "%{buildroot}/opt/bnfy/blanc-prototype/chrome"
%files
/opt/bnfy/blanc-prototype/chrome
%post
echo dl.google.com
%filetriggerin -- /opt/fixture
echo google.com/linux
%transfiletriggerin -- /opt/fixture
echo /opt/chromium.org
`);
  execFileSync('rpmbuild', ['--quiet', '--define', '_topdir ' + dir, '-bb', spec], {stdio: 'pipe'});
  const pkg = path.join(dir, 'RPMS/noarch/blanc-prototype-1-1.noarch.rpm');
  const result = scanPackage(pkg, {fingerprint: fingerprint(dir)});
  assert.equal(result.ok, false);
  const found = (part, token) => result.findings.some(line => line.toLowerCase().includes(part) && line.endsWith(': contains ' + token));
  assert.ok(found('script', 'dl.google.com'), result.findings.join('\n'));
  assert.ok(found('trigger', 'google.com/linux'), result.findings.join('\n'));
  assert.ok(found('trigger', '/opt/chromium.org'), result.findings.join('\n'));
});
