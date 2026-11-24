import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export const fingerprint = 'AB'.repeat(20);
export function fixture(t, arch, betaBuild) {
  const pkg = betaBuild ? 'blanc-beta' : 'blanc-prototype';
  const version = '158.0.8127.' + (betaBuild ?? 2);
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-candidate-')));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  const output = 'BlancLinux' + (arch === 'arm64' ? 'Arm64' : '') + (betaBuild ? 'Beta' : 'Prototype');
  const out = path.join(dir, 'out', output);
  const folder = path.join(dir, 'candidate');
  const engine = path.join(dir, 'engine.js');
  const deb = `${pkg}_${version}-1_${arch === 'arm64' ? 'arm64' : 'amd64'}.deb`;
  const rpm = `${pkg}-${version}-1.${arch === 'arm64' ? 'aarch64' : 'x86_64'}.rpm`;
  fs.mkdirSync(out, {recursive: true});
  for (const file of ['chrome', 'chrome_sandbox']) fs.writeFileSync(path.join(out, file), file);
  // Keep the package readers local. The packager still selects the installed path
  // from real tar and cpio streams and runs the Chromium strip-script interface.
  const bin = path.join(dir, 'bin');
  fs.mkdirSync(bin);
  const oldPath = process.env.PATH;
  process.env.PATH = bin + path.delimiter + oldPath;
  t.after(() => { process.env.PATH = oldPath; });
  const command = (name, body) => fs.writeFileSync(path.join(bin, name), '#!/bin/bash\nset -eu\n' + body, {mode: 0o755});
  command('dpkg-deb', `case "$1" in
    --fsys-tarfile) cat "$2" ;;
    -f)
      [[ \${2##*/} == "${deb}" ]]
      case "$3" in
        Package) echo ${pkg} ;;
        Architecture) echo ${arch === 'arm64' ? 'arm64' : 'amd64'} ;;
        *) exit 1 ;;
      esac ;;
    *) exit 1 ;;
  esac`);
  command('rpm2cpio', 'cat "$1"');
  const script = path.join(dir, 'build/linux/strip_binary.py');
  fs.mkdirSync(path.dirname(script), {recursive: true});
  fs.writeFileSync(script, `from pathlib import Path
import sys
args = dict(zip(sys.argv[1::2], sys.argv[2::2]))
assert Path(args['--symbol-output']).name == 'chrome.debug'
Path(args['--stripped-binary-output']).write_bytes(b'stripped ' + Path(args['--binary-input']).read_bytes())
`);
  const member = './opt/bnfy/' + pkg + '/chrome';
  fs.mkdirSync(path.dirname(path.join(dir, member)), {recursive: true});
  function writePackage(file, browser) {
    fs.writeFileSync(path.join(dir, member), browser);
    const bytes = file === rpm
      ? execFileSync('cpio', ['-o', '-H', 'newc'], {cwd: dir, input: member + '\n', stdio: ['pipe', 'pipe', 'pipe']})
      : execFileSync('tar', ['-cf', '-', member], {cwd: dir});
    fs.writeFileSync(path.join(out, file), bytes);
  }
  for (const file of [deb, rpm]) writePackage(file, 'stripped chrome');
  fs.writeFileSync(engine, 'engine');
  const build = {arch, version, upstream: 'a'.repeat(40), treeCommit: 'b'.repeat(40),
    builtAt: '2026-11-21T12:00:00Z', argsSha256: hash('args')};
  if (betaBuild) Object.assign(build, {channel: 'beta', build: betaBuild});
  const inputs = {src: dir, files: ['chrome', 'chrome_sandbox'], engine, engineSha256: hash('engine'), fingerprint};
  const archive = async scan => {
    const {archiveCandidate} = await import('../../linux/package-candidate.mjs');
    return archiveCandidate(out, folder, build, inputs, scan);
  };
  return {dir, out, folder, deb, rpm, archive, inputs, command, writePackage};
}
export const clean = () => ({ok: true, findings: []});
