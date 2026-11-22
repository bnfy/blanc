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
// guard refusal other than the beta's version edit all leave it for a person,
// and a stop puts back what this night changed before it could record it.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {argsDrift, windowsBetaArgs, guardNamesOnlyArgs} from '../../release/daily/desktop-nightly-rules.mjs';

const OUTPUTS = [{name: 'BlancWinPrototype', args: 'prototype-x64.gn', beta: false}, {name: 'BlancWinBeta', args: 'beta-x64.gn', beta: true}];
export const GUARD_FLAGS = Object.freeze(['--allow-large-build', '--max-actions=3000', '--reject-buildflags']);
// Inputs the Linux lane's guard stages in the shared checkout (not in the desktop map).
const SHARED_STAGED = new Set(['blanc/branding/linux/repository-key.input']);
const NO_BYTECODE = {...process.env, PYTHONDONTWRITEBYTECODE: '1'};

class Stop extends Error {}
const stop = reason => { throw new Stop(reason); };
const hashOf = data => crypto.createHash('sha256').update(data).digest('hex');

// A fixed reason for each refusal the guard is known to give.
export function guardReason(output, text) {
  const changed = /Build inputs changed: ([^.]+)\./.exec(text);
  if (/Dry-run scope \d+ exceeds approved maximum/.test(text)) return `${output}: the build plan is larger than 3000 actions`;
  if (/Generated build flags are pending/.test(text)) return `${output}: generated build flags are pending`;
  if (changed) return `${output}: the build environment changed: ${changed[1].split(',').map(s => s.trim()).filter(s => /^[A-Za-z0-9]+$/.test(s)).join(', ')}`;
  if (/GN regeneration is pending/.test(text)) return `${output}: GN regeneration is pending`;
  if (/locked/.test(text)) return `${output}: the desktop checkout lock was refused`;
  return `${output}: the build guard refused it`;
}

export function defaultPaths(stamp, home = os.homedir()) {
  const src = path.join(home, 'chromium-desktop/src');
  return {src, tree: path.join(home, 'blanc-desktop'), applied: path.join(home, 'chromium-desktop/.blanc-applied-source-map.json'),
    lock: path.join(home, 'chromium-desktop/.blanc-checkout.lock'),
    evidence: path.join(home, 'blanc-evidence/windows', `nightly-${stamp}`), gn: path.join(src, 'buildtools/linux64/gn'), node: process.execPath};
}

export function runNightBuild({commit, build, stamp, io, paths, token}) {
  const undo = [];  // what to put back if the night stops before it can record it
  try {
    if (!/^[0-9a-f]{40}$/.test(commit) || !Number.isInteger(build) || !/^[0-9]{8}-[0-9]{4}$/.test(stamp)) stop('bad arguments');
    const {src, tree, applied, evidence, gn, node, lock} = paths;
    // Nothing is touched unless the checkout lock holds this night's token.
    let held = null;
    try { held = io.read(path.join(lock, 'owner')).trim(); } catch { held = null; }
    if (!token || held !== token) stop('the desktop checkout lock does not hold this night\'s token');

    const readJSON = file => JSON.parse(io.read(file));
    const run = (command, args, options) => io.exec(command, args, options);
    const must = (result, reason) => { if (result.status !== 0) stop(reason); return result; };

    must(run('bash', [path.join(tree, 'chromium/windows/server/mount-toolchain.sh')]), 'the toolchain mount failed');

    const lane = readJSON(path.join(tree, 'chromium/lanes/desktop.json'));
    const current = readJSON(path.join(tree, 'chromium', lane.sourceMap));
    const previous = io.exists(applied) ? readJSON(applied) : null;
    if (previous && previous.upstream !== current.upstream) stop('the Chromium pin changed; a rebase is a person\'s job');
    const head = must(run('git', ['-C', src, 'rev-parse', 'HEAD']), 'could not read the Chromium checkout').stdout.trim();
    if (head !== current.upstream) stop('the Chromium checkout is not at the lane\'s pin');

    // A file the previous lane patched and this one no longer does goes back to
    // the pin's bytes (or away, if the pin never had it), but only if it is
    // exactly as the previous map left it.
    for (const [name, placed] of Object.entries(previous?.upstreamFiles ?? {})) {
      if (Object.hasOwn(current.upstreamFiles, name)) continue;
      const file = path.join(src, name);
      if (io.sha256(file) !== placed) stop('a retired patched file was changed by something else');
      const before = io.read(file);
      undo.push(() => io.write(file, before));
      if (run('git', ['-C', src, 'cat-file', '-e', `${previous.upstream}:${name}`]).status === 0) {
        const pristine = must(run('git', ['-C', src, 'show', `${previous.upstream}:${name}`], {binary: true}), 'could not read a retired file from the pin');
        io.write(file, pristine.stdout);
      } else {
        io.remove(file);
      }
    }

    const apply = extra => run('python3', [path.join(tree, 'chromium/tools/apply.py'), '--lane', 'desktop', '--src', src,
      '--previous-map', applied, ...extra], {env: NO_BYTECODE});
    must(apply([]), 'the apply check refused the checkout');
    must(apply(['--apply', '--backup', path.join(evidence, 'apply-backup')]), 'the apply step failed');
    io.write(applied, JSON.stringify({upstream: current.upstream, upstreamFiles: current.upstreamFiles, canonicalSha256: current.canonicalSha256}, null, 2));
    undo.length = 0;  // the new map now describes the tree
    const after = JSON.parse(must(apply([]), 'the post-apply check failed').stdout || '{}');
    if (after.changes !== 0) stop('the applied tree does not equal the pin plus the map');

    // Nothing else in the Chromium checkout, submodules included, may differ from the pin.
    const known = new Set([...Object.keys(current.upstreamFiles), ...Object.keys(current.canonicalSha256), ...SHARED_STAGED]);
    const status = must(run('git', ['-C', src, 'status', '--porcelain', '--untracked-files=all', '--ignore-submodules=none']), 'git status failed').stdout;
    for (const line of String(status).split('\n').filter(Boolean)) {
      const name = line.slice(3).replace(/^"|"$/g, '');
      if (name.startsWith('out/')) continue;
      if (!known.has(name)) stop('the Chromium checkout has a change outside the lane\'s map');
    }

    // Arguments: each output's args.gn must still be what its environment
    // recorded, and match the committed file (the beta apart from its version).
    let betaWritten = null;
    const betaArgs = path.join(src, 'out/BlancWinBeta/args.gn');
    for (const output of OUTPUTS) {
      const out = path.join(src, 'out', output.name);
      const currentArgs = io.read(path.join(out, 'args.gn'));
      const committed = io.read(path.join(tree, 'chromium/windows/args', output.args));
      const pin = readJSON(path.join(out, '.blanc-build-environment.json'));
      if (pin.argsSha256 !== hashOf(currentArgs)) stop(`${output.name}: args.gn is not the one its environment recorded`);
      if (argsDrift(currentArgs, committed, {ignoreVersion: output.beta}).length) stop(`${output.name}: args.gn differs from the committed arguments`);
      if (output.beta) betaWritten = {before: currentArgs, after: windowsBetaArgs(committed, build)};
    }
    io.write(betaArgs, betaWritten.after);
    let betaRecorded = false;
    undo.push(() => { if (!betaRecorded) io.write(betaArgs, betaWritten.before); });
    for (const output of OUTPUTS) must(run(gn, ['gen', `out/${output.name}`], {cwd: src}), `${output.name}: gn gen failed`);

    const guard = (output, mode) => run(node, [path.join(tree, 'chromium/tools/build.mjs'), src, mode, `--out=${output}`,
      ...(mode === '--record-environment' ? [] : GUARD_FLAGS)]);
    for (const output of OUTPUTS) {
      let checked = guard(output.name, '--check');
      if (checked.status !== 0) {
        const text = `${checked.stdout}${checked.stderr}`;
        if (!output.beta || !guardNamesOnlyArgs(text)) stop(guardReason(output.name, text));
        // Only this night's version edit may be recorded.
        if (hashOf(io.read(betaArgs)) !== hashOf(betaWritten.after)) stop('BlancWinBeta: args.gn is not the one this night wrote');
        must(guard(output.name, '--record-environment'), 'BlancWinBeta: could not record its environment');
        betaRecorded = true;
        checked = guard(output.name, '--check');
        if (checked.status !== 0) stop(guardReason(output.name, `${checked.stdout}${checked.stderr}`));
      } else if (output.beta) {
        betaRecorded = true;  // the recorded environment already matches these arguments
      }
      const built = guard(output.name, '--build');
      if (built.status !== 0) stop(guardReason(output.name, `${built.stdout}${built.stderr}`).replace('the build guard refused it', 'it did not build'));
    }

    const packages = {};
    for (const output of OUTPUTS) {
      const folder = path.join(evidence, output.beta ? 'beta' : 'prototype');
      must(run(node, [path.join(tree, 'chromium/windows/package-candidate.mjs'), src, folder, `--out=${output.name}`]), `${output.name}: did not package`);
      packages[output.beta ? 'beta' : 'prototype'] = readJSON(path.join(folder, 'package.json'));
    }
    return {status: 'built', ...packages};
  } catch (error) {
    for (const put of undo.reverse()) { try { put(); } catch { /* best effort; the next night's checks catch what remains */ } }
    if (error instanceof Stop) return {status: 'stopped', reason: error.message};
    return {status: 'stopped', reason: 'the server phase failed unexpectedly'};
  }
}

export function realIO() {
  return {
    read: file => fs.readFileSync(file, 'utf8'),
    write: (file, data) => fs.writeFileSync(file, data),
    remove: file => fs.rmSync(file, {force: true}),
    exists: file => fs.existsSync(file),
    sha256: file => fs.existsSync(file) ? hashOf(fs.readFileSync(file)) : null,
    exec(command, args, {cwd, env, binary = false} = {}) {
      const result = spawnSync(command, args, {cwd, env, encoding: binary ? 'buffer' : 'utf8', maxBuffer: 256 * 1024 * 1024});
      return {status: result.error ? -1 : result.status, stdout: result.stdout ?? '', stderr: result.stderr ? String(result.stderr) : ''};
    },
  };
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  const [commit, build, stamp] = process.argv.slice(2);
  console.log(JSON.stringify(runNightBuild({commit, build: Number(build), stamp, io: realIO(), paths: defaultPaths(stamp),
    token: process.env.BLANC_CHECKOUT_LOCK_OWNER})));
}
