// Emulator release gate. No approved exclusions until a real release APK discovers hook failures.
// NetLog covers Chromium traffic only; the separate server packet capture remains required.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../..');
export function androidPackage(value = process.env.BLANC_ANDROID_PACKAGE ?? 'me.bnfy.blanc.dev') {
  if (!['me.bnfy.blanc.dev', 'me.bnfy.blanc'].includes(value)) throw Error('Unsupported Android package');
  return value;
}
// Conservative direct compile-guard proof. Indirect Java/GN or native guards need a reviewed
// proof added here when discovery first proposes an exclusion, never an unguarded switch match.
function guardedSwitch(source, need) {
  const active = [];
  let found = false, unsafe = false;
  for (const line of source.split('\n')) {
    if (/^\s*#\s*if(?:def|ndef)?\b/.test(line)) active.push(/^\s*#\s*if\s+BUILDFLAG\(ENABLE_BLANC_TEST_HOOKS\)\s*$/.test(line));
    else if (/^\s*#\s*(else|elif)\b/.test(line)) { if (active.length) active[active.length - 1] = false; }
    else if (/^\s*#\s*endif\b/.test(line)) active.pop();
    if (line.includes(`HasSwitch("${need.slice(2)}")`)) { found = true; if (!active.includes(true)) unsafe = true; }
  }
  return {found, unsafe};
}
export function validateExclusions(entries, scenarios, sources) {
  if (!Array.isArray(entries)) throw Error('Exclusions must be an array');
  const ids = new Set(scenarios.match(/@F\d+-\d+\b/g) ?? []), used = new Set();
  for (const entry of entries) {
    if (!entry || !ids.has(entry.scenario) || used.has(entry.scenario) || typeof entry.reason !== 'string' || !entry.reason.trim()
      || typeof entry.needs !== 'string' || !/^--blanc-[a-z0-9-]+$/.test(entry.needs)) throw Error('Invalid exclusion scenario, needs or reason');
    const proof = sources.map(source => guardedSwitch(source, entry.needs));
    if (!proof.some(p => p.found) || proof.some(p => p.unsafe)) throw Error(`Exclusion ${entry.scenario} lacks ENABLE_BLANC_TEST_HOOKS proof`);
    used.add(entry.scenario);
  }
  return entries;
}
function files(dir, pattern) {
  return fs.readdirSync(dir, {withFileTypes: true}).flatMap(e => e.isDirectory() ? files(path.join(dir, e.name), pattern)
    : pattern.test(e.name) ? [fs.readFileSync(path.join(dir, e.name), 'utf8')] : []);
}
function command(program, args, options = {}) {
  const r = spawnSync(program, args, {encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, ...options});
  if (r.error || r.status !== 0) throw Error(`${path.basename(program)} failed: ${r.error?.message ?? r.stderr ?? r.status}`);
  return r.stdout;
}
function main([apkArg, evidenceArg, ...extra]) {
  if (!apkArg || !evidenceArg || extra.length) throw Error('Usage: release-gate.sh <apk> <evidence>');
  const apk = path.resolve(apkArg), evidence = path.resolve(evidenceArg);
  // Never reuse a previous gate report or child evidence as a current pass.
  fs.mkdirSync(evidence, {recursive: true});
  const fd = fs.openSync(path.join(evidence, 'release-gate.json'), 'wx');
  const report = {schema: 1, package: null, apkSHA256: null, sourceCommit: null, verdict: 'fail', exclusions: [], results: [],
    exclusionDiscovery: 'pending-real-release-apk', scope: 'Chromium NetLog only; OS/Play services packet capture is separate'};
  const fail = [];
  try {
    report.apkSHA256 = crypto.createHash('sha256').update(fs.readFileSync(apk)).digest('hex');
    report.sourceCommit = command('git', ['-C', repo, 'rev-parse', '--verify', 'HEAD^{commit}']).trim();
    if (!/^[a-f0-9]{40}$/.test(report.sourceCommit)) throw Error('Invalid source commit');
    report.package = /^package: name='([^']+)'/m.exec(command('aapt2', ['dump', 'badging', apk]))?.[1] ?? null;
    if (report.package !== 'me.bnfy.blanc') throw Error('APK package must be me.bnfy.blanc');
    report.exclusions = validateExclusions(JSON.parse(fs.readFileSync(path.join(here, 'release-gate-exclusions.json'), 'utf8')),
      files(path.join(repo, 'spec/acceptance'), /\.feature$/).join('\n'), files(path.join(repo, 'chromium/blanc'), /\.(?:cc|h|java)$/));
    // Exclusive child directories ensure no stale child report can satisfy this run.
    fs.mkdirSync(path.join(evidence, 'outbound'));
    fs.mkdirSync(path.join(evidence, 'acceptance'));
    const env = {...process.env, BLANC_ANDROID_PACKAGE: report.package};
    delete env.BLANC_GATE_ONLY; delete env.BLANC_GATE_SKIP;
    const run = (name, program, args) => {
      const log = fs.openSync(path.join(evidence, `${name}.log`), 'wx');
      let r;
      try { r = spawnSync(program, args, {cwd: repo, env, stdio: ['ignore', log, log]}); }
      finally { fs.closeSync(log); }
      const pass = !r.error && r.status === 0;
      report.results.push({name, verdict: pass ? 'pass' : 'fail', exitCode: r.status, error: r.error?.message});
      if (!pass) fail.push(name);
      return pass;
    };
    if (run('outbound', process.execPath, [path.join(here, 'outbound-gate.mjs'), '--apk', apk, '--package', report.package,
      '--avd', process.env.BLANC_ANDROID_AVD ?? 'android_36_google_apis_x64', '--evidence', path.join(evidence, 'outbound')])) {
      const privacy = JSON.parse(fs.readFileSync(path.join(evidence, 'outbound/outbound-android.json'), 'utf8'));
      if (privacy.verdict !== 'pass') { fail.push('outbound-report'); report.results[0].verdict = 'fail'; }
    }
    const tags = report.exclusions.length ? ['--tags', `not (${report.exclusions.map(e => e.scenario).join(' or ')})`] : [];
    if (run('acceptance', 'bash', [path.join(here, 'acceptance/run.sh'), apk, path.join(evidence, 'acceptance'), ...tags])) {
      const features = JSON.parse(fs.readFileSync(path.join(evidence, 'acceptance/acceptance.json'), 'utf8'));
      const scenarios = features.flatMap(f => f.elements ?? []).filter(e => e.type === 'scenario');
      if (!scenarios.length || scenarios.some(s => !s.steps?.length || [...(s.before ?? []), ...s.steps, ...(s.after ?? [])].some(step => step.result?.status !== 'passed'))) {
        fail.push('acceptance-report'); report.results.at(-1).verdict = 'fail';
      }
    }
    if (!fail.length) report.verdict = 'pass';
  } catch (error) { fail.push(error.message); report.error = error.message; }
  finally { fs.writeFileSync(fd, JSON.stringify(report, null, 2) + '\n'); fs.closeSync(fd); }
  console.log(report.verdict === 'pass' ? 'Release gate: pass' : `Release gate: FAIL (${fail.join(', ')})`);
  if (report.verdict !== 'pass') process.exitCode = 1;
}
// Real paths: on macOS a temp or symlinked path (/var → /private/var) would otherwise never match.
if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  try { main(process.argv.slice(2)); } catch (error) { console.error(`Release gate: FAIL (${error.message})`); process.exitCode = 1; }
}
