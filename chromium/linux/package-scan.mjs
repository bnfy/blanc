// Inspect the payload and maintainer scripts without installing or running them.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {gunzipSync} from 'node:zlib';

const forbiddenText = ['dl.google.com', 'google.com/linux', '/opt/chromium.org', '/opt/google', 'chromium-browser'];
const forbiddenNames = new Set(['chromium', 'chromium-browser', 'chromium-browser.desktop', 'google-chrome',
  'Chromium Safe Storage', 'Chromium Keys', 'Chrome Safe Storage', 'Chrome Keys', 'chrome', 'Blanc', 'blanc',
  'blanc.desktop', '~/.config/Blanc', '~/.config/chromium', '/opt/chromium.org/chromium', '/opt/google/chrome']);

function run(program, args, options = {}) {
  const result = spawnSync(program, args, {encoding: 'utf8', ...options});
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${program}: ${result.stderr?.trim() || result.signal || result.status}`);
  return result.stdout;
}

function collides(value) {
  const name = path.posix.basename(value).replace(/\.(desktop|list|sources|repo|gpg)$/, '');
  return forbiddenNames.has(value) || forbiddenNames.has(name);
}

function inspectPath(name, directory, findings) {
  const absolute = '/' + name;
  if (forbiddenText.some(token => token.startsWith('/opt/') && (absolute === token || absolute.startsWith(token + '/')))) {
    findings.add(`${name}: reserved install path`);
  }
  // The executable inside a channel's install directory is legitimately named chrome.
  const identity = (directory && /^opt\/(?:bnfy\/)?[^/]+$/.test(name)) ||
    /^(?:usr\/bin|usr\/share\/applications|etc\/(?:apparmor\.d|cron\.daily|yum\.repos\.d|zypp\/repos\.d|apt\/sources\.list\.d))\/[^/]+$/.test(name) ||
    /^opt\/[^/]+\/[^/]+\/(?:apparmor\.d|cron)\/[^/]+$/.test(name);
  if (identity && collides(absolute)) findings.add(`${name}: reserved identity`);
}

function inspectKey(bytes, label, fingerprint, home, findings) {
  try {
    const rows = run('gpg', ['--no-options', '--homedir', home, '--batch', '--with-colons', '--show-keys'],
      {input: bytes}).split('\n').map(row => row.split(':'));
    let primary = false;
    let count = 0;
    for (const [type, , , , , , , , , value] of rows) {
      if (type === 'sec' || type === 'ssb') findings.add(`${label}: secret OpenPGP key`);
      if (type === 'pub' || type === 'sub' || type === 'sec') primary = type !== 'sub';
      if (type === 'fpr' && primary) {
        count++;
        if (value !== fingerprint) findings.add(`${label}: unexpected primary fingerprint ${value}`);
        primary = false;
      }
    }
    if (!count) findings.add(`${label}: no primary fingerprint`);
  } catch (error) {
    findings.add(`${label}: unreadable OpenPGP fingerprint (${error.message})`);
  }
}

function inspectText(text, label, fingerprint, home, findings) {
  for (const token of forbiddenText) {
    if (text.includes(token)) findings.add(`${label}: contains ${token}`);
  }
  // Maintainer scripts may carry multiple armor blocks or Chromium's base64 heredoc.
  const armors = text.match(/-----BEGIN PGP (PUBLIC|PRIVATE) KEY BLOCK-----[\s\S]*?-----END PGP \1 KEY BLOCK-----/g) || [];
  for (const armor of armors) inspectKey(armor, label, fingerprint, home, findings);
  if ((text.match(/-----BEGIN PGP (?:PUBLIC|PRIVATE) KEY BLOCK-----/g) || []).length !== armors.length) {
    findings.add(`${label}: incomplete OpenPGP key`);
  }
  for (const match of text.matchAll(/^PGP_KEY_DATA=\$\(cat <<(\w+)\r?\n([\s\S]*?)^\1$/gm)) {
    inspectKey(Buffer.from(match[2], 'base64'), label, fingerprint, home, findings);
  }
  if (/(?:^|\/)apparmor\.d\/[^/]+$/.test(label)) {
    for (const match of text.matchAll(/^[ \t]*profile\s+(?:"([^"\n]+)"|([^\s{]+))/gm)) {
      const name = match[1] ?? match[2];
      const file = path.posix.basename(label);
      if (collides(name) || (/^blanc-(?:prototype|beta)$/.test(file) && name !== file)) {
        findings.add(`${label}: unexpected AppArmor profile ${name}`);
      }
    }
  }
  if (label.endsWith('.desktop')) {
    for (const [, field, value] of text.matchAll(/^(Exec|Icon|StartupWMClass)=(.+)$/gm)) {
      const command = value.trim().match(/^(?:"([^"]+)"|(\S+))/);
      const name = field === 'Exec' ? (command?.[1] || command?.[2] || '') : value.trim();
      if (collides(name)) findings.add(`${label}: reserved ${field} ${value}`);
    }
  }
}

function scanFile(file, name, fingerprint, home, findings) {
  const header = Buffer.alloc(4096);
  const fd = fs.openSync(file, 'r');
  let count;
  try { count = fs.readSync(fd, header); } finally { fs.closeSync(fd); }
  if (!count) return;
  const prefix = header.subarray(0, count);
  // OpenPGP old/new packet headers: public/secret primary key. The packet
  // body starts with the key version after a variable-length size field.
  const first = prefix[0];
  const newFormat = (first & 0xc0) === 0xc0;
  const tag = newFormat ? first & 0x3f : (first >> 2) & 0x0f;
  const body = newFormat ? (prefix[1] < 192 ? 2 : prefix[1] === 255 ? 6 : 3)
    : [2, 3, 5, 1][first & 3];
  if (((first & 0x80) && (tag === 5 || tag === 6) && [3, 4, 5, 6].includes(prefix[body])) ||
      prefix.subarray(8, 12).equals(Buffer.from('KBXf'))) {
    inspectKey(fs.readFileSync(file), name, fingerprint, home, findings);
    return;
  }
  if (prefix[0] === 0x1f && prefix[1] === 0x8b && /\.gz$/.test(name)) {
    const plain = gunzipSync(fs.readFileSync(file));
    if (!plain.subarray(0, 4096).includes(0)) inspectText(plain.toString(), name, fingerprint, home, findings);
  } else if (!prefix.includes(0)) {
    inspectText(fs.readFileSync(file, 'utf8'), name, fingerprint, home, findings);
  }
}

export function scanPackage(packagePath, {fingerprint, noticesDir = path.resolve(import.meta.dirname, '../blanc/notices')}) {
  if (!/^[a-f\d]{40}$/i.test(fingerprint ?? '')) return {ok: false, findings: ['Expected a 40-hex primary fingerprint']};
  const pkg = path.resolve(packagePath);
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-package-'));
  const findings = new Set();
  const root = path.join(temp, 'files');
  const home = path.join(temp, 'gpg');
  try {
    fs.mkdirSync(root);
    fs.mkdirSync(home, {mode: 0o700});
    fingerprint = fingerprint.toUpperCase();
    if (pkg.endsWith('.deb')) {
      run('dpkg-deb', ['-R', pkg, root]);
    } else if (pkg.endsWith('.rpm')) {
      const scripts = run('rpm', ['-qp', '--scripts', '--triggers', '--filetriggers', pkg]);
      inspectText(scripts, 'RPM scriptlets and triggers', fingerprint, home, findings);
      run('bash', ['-o', 'pipefail', '-c', 'rpm2cpio "$1" | cpio --quiet -id --no-absolute-filenames', 'scan-rpm', pkg], {cwd: root});
    } else {
      throw new Error('Expected a .deb or .rpm package');
    }
    const regularFiles = new Set();
    function walk(dir) {
      for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
        const file = path.join(dir, entry.name);
        const name = path.relative(root, file);
        inspectPath(name, entry.isDirectory(), findings);
        if (entry.isDirectory()) walk(file);
        else if (entry.isFile()) {
          regularFiles.add(name);
          scanFile(file, name, fingerprint, home, findings);
        }
      }
    }
    walk(root);
    for (const channel of ['prototype', 'beta']) {
      const install = 'opt/bnfy/blanc-' + channel;
      if (!regularFiles.has(install + '/blanc_blocker/engine.js')) continue;
      for (const notice of ['LICENSE', 'ASSET-LICENSE.md', 'THIRD_PARTY_NOTICES.txt']) {
        const file = path.join(install, 'notices', notice);
        const expected = path.join(noticesDir, notice);
        if (!regularFiles.has(file) || !fs.readFileSync(path.join(root, file)).equals(fs.readFileSync(expected))) {
          findings.add(`${file}: missing or incorrect fork notice`);
        }
      }
    }
  } catch (error) {
    findings.add(error.message);
  } finally {
    fs.rmSync(temp, {recursive: true, force: true});
  }
  return {ok: !findings.size, findings: [...findings]};
}
