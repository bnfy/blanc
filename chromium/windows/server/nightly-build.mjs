#!/usr/bin/env node
// The Windows nightly's server phase (docs/superpowers/plans/2026-11-21-windows-nightly.md,
// Task 4). nightly-bootstrap.sh holds the desktop checkout lock, checks out the
// night's commit and runs this with BLANC_CHECKOUT_LOCK_OWNER, so the guard
// builds under that lock and nothing else touches the checkout from apply to
// packages:
//
//   node chromium/windows/server/nightly-build.mjs COMMIT BUILD STAMP
//
// It prints one JSON line: {status: "built"|"stopped", reason?, prototype?, beta?}.
// A stop is never forced past: drift, an unrecognised file, a changed pin or a
// guard refusal other than the beta's version edit all leave it for a person.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {argsDrift, windowsBetaArgs, guardNamesOnlyArgs} from '../../release/daily/desktop-nightly-rules.mjs';

const OUTPUTS = [{name: 'BlancWinPrototype', args: 'prototype-x64.gn', beta: false}, {name: 'BlancWinBeta', args: 'beta-x64.gn', beta: true}];
export const GUARD_FLAGS = Object.freeze(['--allow-large-build', '--max-actions=3000', '--reject-buildflags']);

class Stop extends Error {}
const stop = reason => { throw new Stop(reason); };

export function defaultPaths(stamp, home = os.homedir()) {
  const src = path.join(home, 'chromium-desktop/src');
  return {src, tree: path.join(home, 'blanc-desktop'), applied: path.join(home, 'chromium-desktop/.blanc-applied-source-map.json'),
    evidence: path.join(home, 'blanc-evidence/windows', `nightly-${stamp}`), gn: path.join(src, 'buildtools/linux64/gn'), node: process.execPath};
}

export function runNightBuild({commit, build, stamp, io, paths}) {
  try {
    if (!/^[0-9a-f]{40}$/.test(commit) || !Number.isInteger(build) || !/^[0-9]{8}-[0-9]{4}$/.test(stamp)) stop('bad arguments');
    const {src, tree, applied, evidence, gn, node} = paths;
    const readJSON = file => JSON.parse(io.read(file));
    const run = (command, args, options) => io.exec(command, args, options);
    const must = (result, reason) => { if (result.status !== 0) stop(reason); return result; };

    must(run('bash', [path.join(tree, 'chromium/windows/server/mount-toolchain.sh')]), 'the toolchain mount failed');

    const lane = readJSON(path.join(tree, 'chromium/lanes/desktop.json'));
    const current = readJSON(path.join(tree, 'chromium', lane.sourceMap));
    const previous = io.exists(applied) ? readJSON(applied) : null;
    if (previous && previous.upstream !== current.upstream) stop('the Chromium pin changed; a rebase is a person\'s job');

    // A file the previous lane patched and this one no longer does goes back to
    // the pin's bytes, but only if it is exactly as the previous map left it.
    for (const [name, placed] of Object.entries(previous?.upstreamFiles ?? {})) {
      if (Object.hasOwn(current.upstreamFiles, name)) continue;
      if (io.sha256(path.join(src, name)) !== placed) stop('a retired patched file was changed by something else');
      const pristine = must(run('git', ['-C', src, 'show', `${previous.upstream}:${name}`]), 'could not read a retired file from the pin');
      io.write(path.join(src, name), pristine.stdout);
    }

    const apply = extra => run('python3', [path.join(tree, 'chromium/tools/apply.py'), '--lane', 'desktop', '--src', src,
      '--previous-map', applied, ...extra]);
    must(apply([]), 'the apply check refused the checkout');
    must(apply(['--apply', '--backup', path.join(evidence, 'apply-backup')]), 'the apply step failed');
    io.write(applied, JSON.stringify({upstream: current.upstream, upstreamFiles: current.upstreamFiles, canonicalSha256: current.canonicalSha256}, null, 2));
    const after = JSON.parse(must(apply([]), 'the post-apply check failed').stdout || '{}');
    if (after.changes !== 0) stop('the applied tree does not equal the pin plus the map');

    // Nothing else in the Chromium checkout may differ from the pin.
    const known = new Set([...Object.keys(current.upstreamFiles), ...Object.keys(current.canonicalSha256)]);
    const status = must(run('git', ['-C', src, 'status', '--porcelain', '--untracked-files=all']), 'git status failed').stdout;
    for (const line of status.split('\n').filter(Boolean)) {
      const name = line.slice(3).replace(/^"|"$/g, '');
      if (name.startsWith('out/')) continue;
      if (!known.has(name)) stop('the Chromium checkout has a change outside the lane\'s map');
    }

    // Arguments: each output's args.gn must still be what its environment
    // recorded, and match the committed file (the beta apart from its version).
    const writes = [];
    for (const output of OUTPUTS) {
      const out = path.join(src, 'out', output.name);
      const currentArgs = io.read(path.join(out, 'args.gn'));
      const committed = io.read(path.join(tree, 'chromium/windows/args', output.args));
      const pin = readJSON(path.join(out, '.blanc-build-environment.json'));
      if (pin.argsSha256 !== crypto.createHash('sha256').update(currentArgs).digest('hex')) stop(`${output.name}'s args.gn is not the one its environment recorded`);
      if (argsDrift(currentArgs, committed, {ignoreVersion: output.beta}).length) stop(`${output.name}'s args.gn differs from the committed arguments`);
      if (output.beta) writes.push([path.join(out, 'args.gn'), windowsBetaArgs(committed, build)]);
    }
    for (const [file, text] of writes) io.write(file, text);
    for (const output of OUTPUTS) must(run(gn, ['gen', `out/${output.name}`], {cwd: src}), `gn gen ${output.name} failed`);

    const guard = (output, mode) => run(node, [path.join(tree, 'chromium/tools/build.mjs'), src, mode, `--out=${output}`,
      ...(mode === '--record-environment' ? [] : GUARD_FLAGS)]);
    for (const output of OUTPUTS) {
      let checked = guard(output.name, '--check');
      if (checked.status !== 0) {
        if (!output.beta || !guardNamesOnlyArgs(checked.stdout + checked.stderr)) stop(`the build guard refused ${output.name}`);
        must(guard(output.name, '--record-environment'), `could not record ${output.name}'s environment`);
        checked = must(guard(output.name, '--check'), `the build guard refused ${output.name} after recording`);
      }
      must(guard(output.name, '--build'), `${output.name} did not build`);
    }

    const packages = {};
    for (const output of OUTPUTS) {
      const folder = path.join(evidence, output.beta ? 'beta' : 'prototype');
      must(run(node, [path.join(tree, 'chromium/windows/package-candidate.mjs'), src, folder, `--out=${output.name}`]), `${output.name} did not package`);
      packages[output.beta ? 'beta' : 'prototype'] = readJSON(path.join(folder, 'package.json'));
    }
    return {status: 'built', ...packages};
  } catch (error) {
    if (error instanceof Stop) return {status: 'stopped', reason: error.message};
    return {status: 'stopped', reason: 'the server phase failed unexpectedly'};
  }
}

export function realIO() {
  return {
    read: file => fs.readFileSync(file, 'utf8'),
    write: (file, text) => fs.writeFileSync(file, text),
    exists: file => fs.existsSync(file),
    sha256: file => fs.existsSync(file) ? crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') : null,
    exec(command, args, {cwd} = {}) {
      const result = spawnSync(command, args, {cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024});
      return {status: result.error ? -1 : result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? ''};
    },
  };
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  const [commit, build, stamp] = process.argv.slice(2);
  if (!process.env.BLANC_CHECKOUT_LOCK_OWNER) {
    console.log(JSON.stringify({status: 'stopped', reason: 'run through nightly-bootstrap.sh, which holds the checkout lock'}));
  } else {
    console.log(JSON.stringify(runNightBuild({commit, build: Number(build), stamp, io: realIO(), paths: defaultPaths(stamp)})));
  }
}
