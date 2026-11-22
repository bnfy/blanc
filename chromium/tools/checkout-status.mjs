import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const localIO = {
  exists: fs.existsSync,
  read: file => fs.readFileSync(file, 'utf8'),
  exec: (cmd, args) => spawnSync(cmd, args, {encoding: 'utf8', maxBuffer: 256 * 1024 * 1024}),
};

export function checkoutStatusProblem(src, current, io = localIO) {
  // Nothing else in the Chromium checkout, submodules included, may differ from the pin.
  const known = new Set([...Object.keys(current.upstreamFiles), ...Object.keys(current.canonicalSha256)]);
  const status = io.exec('git', ['-C', src, 'status', '--porcelain', '--untracked-files=all', '--ignore-submodules=none']);
  if (status.status !== 0) return 'git status failed';
  // gclient writes inside some submodules itself (a CIPD package, a nested
  // dependency at its own DEPS revision). Such a submodule passes only at its
  // gitlink, with every change inside it a path DEPS declares there.
  const declared = (text, key) => text.includes(`'${key}'`) || text.includes(`"${key}"`);
  const srcDeps = io.exists(path.join(src, 'DEPS')) ? io.read(path.join(src, 'DEPS')) : '';
  const gclientOnly = name => {
    const staged = io.exec('git', ['-C', src, 'ls-files', '-s', '--', name]);
    if (staged.status !== 0) return false;
    const link = /^160000 ([0-9a-f]{40}) /.exec(String(staged.stdout));
    if (!link) return false;
    const sub = path.join(src, name);
    const head = io.exec('git', ['-C', sub, 'rev-parse', 'HEAD']);
    if (head.status !== 0 || head.stdout.trim() !== link[1]) return false;
    const inner = io.exec('git', ['-C', sub, 'status', '--porcelain', '--ignore-submodules=none']);
    const entries = String(inner.stdout).split('\n').filter(Boolean).map(l => l.slice(3).replace(/^"|"$/g, '').replace(/\/$/, ''));
    if (inner.status !== 0 || entries.length === 0) return false;
    const ownDeps = io.exists(path.join(sub, 'DEPS')) ? io.read(path.join(sub, 'DEPS')) : '';
    const relative = /^use_relative_paths\s*=\s*True/m.test(ownDeps);
    return entries.every(entry => declared(srcDeps, `src/${name}/${entry}`) || (relative && declared(ownDeps, entry)));
  };
  for (const line of String(status.stdout).split('\n').filter(Boolean)) {
    const name = line.slice(3).replace(/^"|"$/g, '');
    if (name.startsWith('out/')) continue;
    if (!known.has(name) && !gclientOnly(name)) return "the Chromium checkout has a change outside the lane's map";
  }
  return null;
}
