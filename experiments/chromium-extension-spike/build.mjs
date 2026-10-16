import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const digest = value => crypto.createHash('sha256').update(value).digest('hex');
export function changedInputs(saved, current) {
  return [...new Set([...Object.keys(saved), ...Object.keys(current)])]
    .filter(key => saved[key] !== current[key]);
}
export function plannedActions(output) {
  // Siso's denominator shrinks as cached actions are pruned. Use the largest
  // observed count conservatively; uncertain plans must never start a build.
  const counts = [...output.matchAll(/\[\d+\/(\d+)\]/g)].map(match => Number(match[1]));
  counts.push(...[...output.matchAll(/Build Succeeded: (\d+) steps/g)].map(match => Number(match[1])));
  if (counts.length) return Math.max(...counts);
  if (/no work to do/i.test(output)) return 0;
  throw new Error('Cannot determine the dry-run action count; inspect the saved plan. No build started.');
}
export function checkPlan(output, allowLarge = false) {
  if (/--regeneration\s+gen|Regenerating ninja files/.test(output)) {
    throw new Error('GN regeneration is pending. Regenerate with unchanged arguments after reviewing the environment, then rerun preflight. No compilation started.');
  }
  // Siso's dry run does not execute generators. A changed buildflag can
  // invalidate shared libraries and their dependents after this small plan.
  if (/write_buildflag_header\.py/.test(output) && !allowLarge) {
    throw new Error('Generated build flags are pending; the dry run can hide dependent compilation. Review and generate those flags separately, then rerun preflight. No compilation started.');
  }
  const actions = plannedActions(output);
  if (actions > 1000 && !allowLarge) {
    throw new Error('Large rebuild stopped before compilation. Diagnose the saved plan; use --allow-large-build only for an intentional rebuild.');
  }
  return actions;
}
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024, ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${path.basename(command)} failed (${result.status}): ${result.stderr || ''}`);
  return `${result.stdout || ''}${result.stderr || ''}`.trim();
}
function environment(src, out) {
  const developerDir = fs.realpathSync(process.env.DEVELOPER_DIR || run('/usr/bin/xcode-select', ['-p']));
  const env = { ...process.env, DEVELOPER_DIR: developerDir, DEPOT_TOOLS_UPDATE: '0' };
  const xcrun = args => run('/usr/bin/xcrun', ['--sdk', 'macosx', ...args], { env });
  const inputs = {
    developerDir,
    xcode: run('/usr/bin/xcodebuild', ['-version'], { env }),
    sdkPath: xcrun(['--show-sdk-path']),
    sdkVersion: xcrun(['--show-sdk-version']),
    sdkBuild: xcrun(['--show-sdk-build-version']),
    clangRevision: fs.readFileSync(path.join(src, 'third_party/llvm-build/Release+Asserts/cr_build_revision'), 'utf8').trim(),
    clangVersion: run(path.join(src, 'third_party/llvm-build/Release+Asserts/bin/clang'), ['--version']),
    argsSha256: digest(fs.readFileSync(path.join(out, 'args.gn'))),
  };
  return { inputs, env };
}
function main() {
  const [source, ...options] = process.argv.slice(2);
  const allowed = new Set(['--check', '--build', '--record-environment', '--allow-large-build']);
  if (!source || options.some(option => !allowed.has(option))) {
    throw new Error('Usage: node build.mjs CHROMIUM_SRC [--check | --build | --record-environment] [--allow-large-build]');
  }
  const modes = options.filter(option => ['--check', '--build', '--record-environment'].includes(option));
  if (modes.length > 1) throw new Error('Choose one mode.');
  const mode = modes[0] || '--check';
  const src = fs.realpathSync(source);
  const out = path.join(src, 'out/BlancPrototype');
  const pinFile = path.join(out, '.blanc-build-environment.json');
  const lock = path.join(out, '.blanc-build-guard.lock');
  const { inputs, env } = environment(src, out);
  if (mode === '--record-environment') {
    // A declared baseline, never a claim that the build passed. Recording is
    // separate from compilation and cannot bypass the large-plan guard.
    fs.writeFileSync(pinFile, JSON.stringify(inputs, null, 2) + '\n');
    console.log(`Recorded build environment: ${pinFile}\n${inputs.xcode}\nNo build started.`);
    return;
  }
  if (!fs.existsSync(pinFile)) throw new Error('No pinned environment. Review the toolchain and record it with --record-environment first.');
  const changed = changedInputs(JSON.parse(fs.readFileSync(pinFile, 'utf8')), inputs);
  if (changed.length) throw new Error(`Build inputs changed: ${changed.join(', ')}. Review the cache impact before recording a new environment. No build started.`);
  // Also catches legacy invocations outside this wrapper. Be conservative
  // across checkouts because a second browser compile competes for this Mac.
  const commands = run('/bin/ps', ['-axo', 'comm=,args=']);
  if (commands.split('\n').some(line => /(?:^|\/)siso\s+ninja(?:\s|$)/.test(line))) {
    throw new Error('A Siso build is already running. Wait for it; no competing build or dry run started.');
  }
  fs.mkdirSync(lock);
  try {
    const siso = path.join(src, 'third_party/siso/cipd/siso');
    const args = ['ninja', '-offline', '-C', out];
    const planFile = path.join(out, 'blanc-build-plan.log');
    const result = spawnSync(siso, [...args, '-n', 'chrome'], {
      cwd: src, env, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024,
    });
    const output = `${result.stdout || ''}\n${result.stderr || ''}`;
    fs.writeFileSync(planFile, output);
    if (result.error || result.status !== 0) throw new Error(`Dry run failed; inspect ${planFile}. No build started.`);
    const actions = plannedActions(output);
    console.log(`Dry-run scheduled actions: ${actions} (generated outputs may add work). Plan: ${planFile}`);
    checkPlan(output, options.includes('--allow-large-build'));
    if (mode !== '--build') { console.log('Check only; no compilation started.'); return; }
    if (changedInputs(inputs, environment(src, out).inputs).length) {
      throw new Error('Build environment changed during preflight. No build started.');
    }
    if (!actions) return;
    const build = spawnSync('/usr/bin/caffeinate', ['-i', siso, ...args, 'chrome'], { cwd: src, env, stdio: 'inherit' });
    if (build.error) throw build.error;
    if (build.status !== 0) throw new Error(`Build did not complete successfully (${build.status ?? build.signal}). Cached work was preserved.`);
    fs.writeFileSync(path.join(out, '.blanc-last-successful-build.json'), JSON.stringify({ inputs, completedAt: new Date().toISOString() }, null, 2) + '\n');
  } finally {
    fs.rmdirSync(lock);
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { main(); } catch (error) { console.error(`Blanc build guard: ${error.message}`); process.exitCode = 1; }
}
