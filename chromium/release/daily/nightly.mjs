#!/usr/bin/env node
// The nightly Blanc Beta candidate on the Mac Studio (owner, 2026-11-14: the full
// suite moves off the release path and runs every night; docs/chromium-beta-release.md,
// "Daily betas"). Started at 02:00 by the LaunchAgent me.bnfy.blanc.beta-nightly in
// the owner's login session, so windows draw and the keychain is open.
//
//   node chromium/release/daily/nightly.mjs            the night: chromium/next's tip
//   node chromium/release/daily/nightly.mjs --targeted  the checkout as it is, only the
//                                                       cases the changes since the last
//                                                       passing night touch (targeted.mjs)
//   node chromium/release/daily/nightly.mjs --plan      say what would run; change nothing
//
// It builds the prototype (scripts/rebuild.sh) and the beta (the next version's GN
// arguments; only blanc_beta_version and blanc_beta_build may change, and the build
// guard's own environment check must name nothing but argsSha256), runs the suite,
// then the beta's unattended checks (blocker, test hooks, profile, notices) under the
// release descriptor the release will use. It writes
// records/nightly/<stamp>/result.json, and records/nightly/latest-pass.json when it
// passed. It never runs while a release is prepared, a build runs, the checkout has
// uncommitted or unpushed work, or another night holds its lock; it never bypasses
// the build guard, and a refusal ends the night with the guard's reason.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { check, reason, sha256, validateGN } from '../policy.mjs';
import { inputInventory, ROOT } from '../preflight.mjs';
import { loadStanding, changedFiles } from '../standing.mjs';
import { competingBuild, processListArgs } from '../../tools/build.mjs';
import { BASE, MARKER, candidateOf } from './beta-prep.mjs';
import { nextVersion, releaseDescriptor } from './descriptor.mjs';
import { planTargeted, loadAreas } from './targeted.mjs';

export const NIGHTLY = path.join(BASE, 'records/nightly');
const SRC = path.join(BASE, 'src');
const NODE = process.execPath;
const BETA_OUT = path.join(SRC, 'out/BlancBeta');
const BETA_APP = path.join(BETA_OUT, 'Blanc Beta.app');
// The beta build may plan a little more than an ordinary incremental one (the
// version is a generated build flag); never a cold build.
export const BETA_MAX_ACTIONS = 3000;

export function shouldSkip({ marker, building, dirty, unpushed, lockHeld, screenLocked }) {
  if (lockHeld) return 'another night is running';
  if (screenLocked) return 'the screen is locked, so the suite cannot draw (unlock the Mac Studio once over Screen Sharing; me.bnfy.blanc.display-awake keeps it awake)';
  if (marker) return 'a release is prepared (records/RELEASE-IN-PROGRESS)';
  if (building) return 'a build is running';
  if (dirty) return 'the Mac Studio checkout has uncommitted changes';
  if (unpushed) return 'the Mac Studio checkout has commits chromium/next does not have';
  return null;
}

// Whether this user's console session is locked (ioreg's IOConsoleUsers). The suite
// needs drawn frames, which a locked screen never gives (owner, 2026-11-14: the
// display is kept awake instead, so it never locks).
export function screenLocked(plistXml, user) {
  const sessions = plistXml.split('<dict>').slice(1);
  const mine = sessions.find(d => new RegExp(`<key>kCGSSessionUserNameKey</key>\\s*<string>${user}</string>`).test(d));
  if (!mine) return true;
  return /<key>CGSSessionScreenIsLocked<\/key>\s*<true\/>/.test(mine) || !/<key>kCGSSessionOnConsoleKey<\/key>\s*<true\/>/.test(mine);
}

// Only the two reviewed version keys change; anything else is refused.
export function bumpBetaArgs(text, version, build) {
  check(/^2\.0\.0-beta\.[1-9]\d*$/.test(version) && Number.isInteger(build) && build > 0, 'beta version');
  let seen = 0;
  const out = text.split('\n').map(line => {
    if (/^blanc_beta_version\s*=/.test(line)) { seen++; return `blanc_beta_version = "${version}"`; }
    if (/^blanc_beta_build\s*=/.test(line)) { seen++; return `blanc_beta_build = ${build}`; }
    return line;
  }).join('\n');
  check(seen === 2, 'the beta GN arguments must set blanc_beta_version and blanc_beta_build once each');
  const before = validateGN(text, 'arm64'), after = validateGN(out, 'arm64');
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)]))
    if (!['blanc_beta_version', 'blanc_beta_build'].includes(key)) check(before[key] === after[key], `GN argument changed: ${key}`);
  return out;
}

// The guard names what changed since the pinned environment; only argsSha256 may.
export function onlyArgsChanged(guardOutput) {
  const m = /Build inputs changed: ([^.]+)\./.exec(guardOutput);
  return Boolean(m) && m[1].split(',').map(s => s.trim()).join() === 'argsSha256';
}

// A night passes when every case passed, or failed only on the known list, after
// one rerun of anything else (pointer and window cases fail when the Mac is used).
export function judgeSuite(baseline, known, rerun = null) {
  check(!baseline.incomplete && !baseline.developmentSubset, 'the suite run is incomplete');
  const cases = baseline.scenarios.flatMap(s => s.cases);
  const knownIds = new Map(known.cases.map(k => [k.id, k]));
  const rerunPass = new Set(rerun ? rerun.scenarios.flatMap(s => s.cases).filter(c => c.result === 'pass').map(c => c.id) : []);
  const bad = cases.filter(c => c.result === 'fail' || c.result === 'undefined');
  const unknown = bad.filter(c => !(knownIds.has(c.id) && knownIds.get(c.id).results.includes(c.result)) && !rerunPass.has(c.id));
  return {
    status: unknown.length ? 'fail' : 'pass',
    pass: cases.filter(c => c.result === 'pass').length + bad.filter(c => rerunPass.has(c.id)).length,
    known: bad.filter(c => knownIds.has(c.id)).map(c => ({ id: c.id, result: c.result, reason: knownIds.get(c.id).reason })),
    passedOnRerun: bad.filter(c => rerunPass.has(c.id)).map(c => c.id),
    unknown: unknown.map(c => ({ id: c.id, result: c.result })),
    rerunCandidates: bad.filter(c => !(knownIds.has(c.id) && knownIds.get(c.id).results.includes(c.result))).map(c => c.id),
  };
}

const stampNow = (d = new Date()) => d.toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-');
const readJSON = file => JSON.parse(fs.readFileSync(file, 'utf8'));

function night(mode) {
  const stamp = `${stampNow()}${mode === 'targeted' ? '-targeted' : ''}`;
  const dir = path.join(NIGHTLY, stamp);
  const log = file => path.join(dir, file);
  const sh = (command, args, { out, cwd = ROOT, env = process.env } = {}) => {
    const fd = out ? fs.openSync(log(out), 'a') : 'ignore';
    try { return spawnSync(command, args, { cwd, env, stdio: ['ignore', fd, fd] }).status === 0; }
    finally { if (out) fs.closeSync(fd); }
  };
  const read = (command, args, cwd = ROOT) => spawnSync(command, args, { cwd, encoding: 'utf8' });
  const git = (...args) => read('git', ['-C', ROOT, ...args]);
  const result = { schema: 1, night: new Date().toISOString().slice(0, 10), stamp, mode, status: 'fail' };
  const finish = (status, why) => {
    Object.assign(result, { status, ...(why ? { why } : {}), finishedAt: new Date().toISOString() });
    fs.writeFileSync(log('result.json'), JSON.stringify(result, null, 2) + '\n');
    if (status === 'pass') fs.writeFileSync(path.join(NIGHTLY, mode === 'targeted' ? 'latest-targeted.json' : 'latest-pass.json'), JSON.stringify({ result: log('result.json') }) + '\n');
    return result;
  };
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });

  if (mode === 'full') {
    check(git('fetch', '-q', 'origin', 'chromium/next').status === 0, 'could not fetch chromium/next');
    const tip = git('rev-parse', 'origin/chromium/next').stdout.trim();
    check(git('checkout', '-q', '--detach', tip).status === 0, 'could not move the checkout to chromium/next');
  }
  result.sourceCommit = git('rev-parse', 'HEAD').stdout.trim();

  // The prototype, the way every fork build is made here (apply, guarded build, runtime config).
  const name = `nightly-${stamp}`;
  if (!sh('bash', [path.join(BASE, 'scripts/rebuild.sh'), name], { out: 'prototype-build.log' })) return finish('fail', 'the prototype build stopped (see prototype-build.log)');
  const config = path.join(BASE, 'evidence/foundation', `${name}-runtime-config.json`);
  result.prototype = { candidate: readJSON(config).candidate, runtimeConfig: config };
  // rebuild.sh points tracker.json at the new candidate; anything else changed means
  // committed generated files (source map, asset hashes) are stale: the build then
  // isn't the committed source.
  const dirty = git('status', '--porcelain').stdout.split('\n').filter(Boolean).filter(l => !l.endsWith('chromium/tracker.json'));
  if (dirty.length) {
    fs.writeFileSync(log('stale-generated.patch'), git('diff').stdout);
    git('checkout', '--', '.');
    return finish('fail', `committed generated files are stale at ${result.sourceCommit.slice(0, 9)}: ${dirty.map(l => l.slice(3)).join(', ')}`);
  }

  // The beta, as the next version.
  const ledger = readJSON(path.join(ROOT, 'chromium/release/ledger.json'));
  const { version, build } = nextVersion(ledger);
  const argsFile = path.join(BETA_OUT, 'args.gn'), args = fs.readFileSync(argsFile, 'utf8');
  const bumped = bumpBetaArgs(args, version, build);
  const guard = extra => read(NODE, [path.join(ROOT, 'chromium/tools/build.mjs'), SRC, ...extra, '--out=BlancBeta']);
  if (bumped !== args) {
    fs.writeFileSync(argsFile, bumped);
    const env = { ...process.env, PATH: `${path.join(BASE, 'depot_tools')}:${process.env.PATH}`, DEPOT_TOOLS_UPDATE: '0' };
    if (!sh('gn', ['gen', 'out/BlancBeta'], { out: 'beta-build.log', cwd: SRC, env })) return finish('fail', 'gn gen for the beta version failed');
    const checked = guard(['--check']);
    if (checked.status !== 0) {
      if (!onlyArgsChanged(checked.stderr + checked.stdout)) return finish('fail', `the build guard refused the beta: ${(checked.stderr || checked.stdout).trim().slice(0, 300)}`);
      if (guard(['--record-environment']).status !== 0) return finish('fail', 'could not record the beta build environment');
    }
  }
  const built = guard(['--build', '--allow-large-build', `--max-actions=${BETA_MAX_ACTIONS}`]);
  fs.appendFileSync(log('beta-build.log'), built.stdout + built.stderr);
  if (built.status !== 0) return finish('fail', 'the beta build stopped (see beta-build.log)');
  const gn = validateGN(fs.readFileSync(argsFile, 'utf8'), 'arm64');
  result.inputDigest = inputInventory(ROOT).digest;
  result.beta = {
    sourceCommit: result.sourceCommit, inputDigest: result.inputDigest, candidate: candidateOf(BETA_APP),
    gnArgsSHA256: sha256(fs.readFileSync(argsFile)), gnArgs: argsFile, app: BETA_APP,
    sparkle: { publicKey: gn.blanc_sparkle_public_key, archiveSHA256: gn.blanc_sparkle_archive_sha256 },
  };
  const standing = loadStanding();
  const profileSHA256 = sha256(fs.readFileSync(path.join(ROOT, 'chromium/release/blanc-beta.provisionprofile')));
  result.release = releaseDescriptor({ ledger, standing, build: result.beta, profileSHA256 });
  const releaseFile = log('release.json');
  fs.writeFileSync(releaseFile, JSON.stringify(result.release, null, 1) + '\n');

  // The suite: every case at night; the touched features' cases when targeted.
  const known = readJSON(path.join(ROOT, 'chromium/release/daily/known-failures.json'));
  const runner = (out, list) => sh(NODE, [path.join(ROOT, 'chromium/tests/runner.mjs'), config, log(out), ...(list ? [`--case-list=${list}`] : [])],
    { out: `${out}.log`, env: { ...process.env, NODE_PATH: path.join(ROOT, 'node_modules') } });
  let caseList = null;
  if (mode === 'targeted') {
    const last = readJSON(readJSON(path.join(NIGHTLY, 'latest-pass.json')).result);
    const plan = planTargeted(changedFiles(last.sourceCommit, result.sourceCommit, ROOT), loadAreas(), readJSON(path.join(ROOT, 'chromium/scenarios/inventory.json')));
    if (plan.full) return finish('fail', `the changes need the full suite: ${plan.why}`);
    result.targeted = { since: last.sourceCommit, cases: plan.cases.length, features: plan.features };
    caseList = log('case-list.json');
    fs.writeFileSync(caseList, JSON.stringify(plan.cases));
  }
  runner('suite', caseList);
  const baselineFile = log('suite/baseline.json');
  if (!fs.existsSync(baselineFile)) return finish('fail', 'the suite stopped before its baseline (see suite.log)');
  const baseline = readJSON(baselineFile);
  if (mode === 'targeted') delete baseline.developmentSubset; // a deliberate subset, judged case by case
  let verdict = judgeSuite(baseline, known);
  if (verdict.rerunCandidates.length) {
    const list = log('rerun-list.json');
    fs.writeFileSync(list, JSON.stringify(verdict.rerunCandidates));
    runner('suite-rerun', list);
    const rerunFile = log('suite-rerun/baseline.json');
    verdict = judgeSuite(baseline, known, fs.existsSync(rerunFile) ? readJSON(rerunFile) : null);
  }
  const summary = { status: verdict.status, sourceCommit: result.sourceCommit, candidate: result.prototype.candidate, mode,
    baselineSHA256: sha256(fs.readFileSync(baselineFile)), executableSummary: baseline.executableSummary,
    pass: verdict.pass, known: verdict.known, passedOnRerun: verdict.passedOnRerun, unknown: verdict.unknown,
    ...(result.targeted ? { targeted: result.targeted } : {}) };
  fs.writeFileSync(log('suite-summary.json'), JSON.stringify(summary, null, 2) + '\n');
  result.suite = { summary: log('suite-summary.json'), pass: verdict.pass };
  if (verdict.status !== 'pass') return finish('fail', `cases failed: ${verdict.unknown.map(c => c.id.replace('spec/acceptance/', '')).join(', ')}`);

  // The beta's unattended checks, under the release descriptor.
  const tool = file => path.join(ROOT, 'chromium/release', file);
  result.evidence = {};
  for (const [gate, file] of [['blocker-payload', 'blocker-evidence.mjs'], ['official-hooks-absent', 'hooks-evidence.mjs'], ['profile-coexistence', 'profile-evidence.mjs']]) {
    result.evidence[gate] = log(`${gate}.json`);
    if (!sh(NODE, [tool(file), releaseFile, BETA_APP, result.evidence[gate]], { out: `${gate}.log` })) return finish('fail', `the ${gate} check failed`);
  }
  const scan = log('sbom-scan.json'), payloads = log('payloads');
  fs.mkdirSync(payloads);
  if (!sh('python3', [tool('sbom_scan.py'), '--src', SRC, '--out-dir', 'out/BlancBeta', scan], { out: 'sbom.log' })) return finish('fail', 'the SBOM scan failed');
  if (!sh(NODE, [tool('sbom.mjs'), 'build', releaseFile, scan, SRC, payloads], { out: 'sbom.log' })) return finish('fail', 'the SBOM build failed');
  result.evidence['notices-and-credits'] = log('notices-and-credits.json');
  if (!sh(NODE, [tool('sbom.mjs'), 'audit', releaseFile, scan, SRC, BETA_APP, path.join(payloads, 'Blanc-Beta.cdx.json'), result.evidence['notices-and-credits']], { out: 'sbom.log' }))
    return finish('fail', 'the notices-and-credits check failed');
  result.beta.payloads = { sbom: path.join(payloads, 'Blanc-Beta.cdx.json'), notices: path.join(payloads, 'NOTICES.txt') };
  return finish('pass');
}

function main(argv) {
  const mode = argv.includes('--targeted') ? 'targeted' : 'full';
  const plan = argv.includes('--plan');
  fs.mkdirSync(NIGHTLY, { recursive: true, mode: 0o700 });
  const lock = path.join(NIGHTLY, '.lock');
  const status = spawnSync('git', ['-C', ROOT, 'status', '--porcelain'], { encoding: 'utf8' }).stdout.trim();
  spawnSync('git', ['-C', ROOT, 'fetch', '-q', 'origin', 'chromium/next']);
  const unpushed = spawnSync('git', ['-C', ROOT, 'merge-base', '--is-ancestor', 'HEAD', 'origin/chromium/next']).status !== 0;
  const why = shouldSkip({
    marker: fs.existsSync(MARKER), lockHeld: fs.existsSync(lock), dirty: Boolean(status),
    building: competingBuild(spawnSync('/bin/ps', processListArgs(), { encoding: 'utf8' }).stdout) || spawnSync('pgrep', ['-f', 'chromium/tests/runner.mjs']).status === 0,
    unpushed: mode === 'full' && unpushed,
    screenLocked: screenLocked(spawnSync('/bin/sh', ['-c', 'ioreg -n Root -d1 -a | plutil -extract IOConsoleUsers xml1 -o - -'], { encoding: 'utf8' }).stdout, process.env.USER ?? ''),
  });
  if (plan) return { would: why ? `skip: ${why}` : `run the ${mode} night at ${spawnSync('git', ['-C', ROOT, 'rev-parse', '--short', mode === 'full' ? 'origin/chromium/next' : 'HEAD'], { encoding: 'utf8' }).stdout.trim()}` };
  if (why) {
    fs.appendFileSync(path.join(NIGHTLY, 'skipped.log'), `${new Date().toISOString()} ${mode}: ${why}\n`);
    return { status: 'skipped', why };
  }
  fs.mkdirSync(lock);
  try { return night(mode); } finally { spawnSync('git', ['-C', ROOT, 'checkout', '-q', '--', 'chromium/tracker.json']); fs.rmdirSync(lock); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const out = main(process.argv.slice(2));
    console.log(JSON.stringify({ status: out.status, why: out.why, would: out.would, stamp: out.stamp }));
    if (out.status === 'fail') process.exitCode = 1;
  } catch (error) { console.error(`Nightly stopped: ${reason(error)}.`); process.exitCode = 1; }
}
