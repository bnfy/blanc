import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
if (process.platform === 'linux') {
  const pkg = spawnSync('pkg-config', ['--cflags', '--libs', 'libpulse'], { encoding: 'utf8' });
  if (pkg.status !== 0) throw new Error('Linux audio build requires pkg-config and libpulse-dev.');
  const out = path.join(root, 'native/linux/audio-monitor');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const compile = spawnSync('cc', ['-std=c11', '-D_POSIX_C_SOURCE=200809L', '-O2', '-Wall', '-Wextra', '-Werror',
    path.join(root, 'runtime/linux-audio/monitor.c'), '-o', out,
    ...pkg.stdout.trim().split(/\s+/)], { stdio: 'inherit' });
  if (compile.status !== 0) throw new Error('Linux audio helper compilation failed');
  const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  const version = spawnSync('pkg-config', ['--modversion', 'libpulse'], { encoding: 'utf8' });
  if (version.status !== 0) throw new Error('Cannot identify the libpulse build dependency');
  fs.writeFileSync(out + '.json', JSON.stringify({ schemaVersion: 1, arch: process.arch,
    sourceSha256: sha256(path.join(root, 'runtime/linux-audio/monitor.c')),
    binarySha256: sha256(out), libpulseBuildVersion: version.stdout.trim() }, null, 2) + '\n');
  console.log('Built native Linux output-monitor helper and source/binary record.');
}
