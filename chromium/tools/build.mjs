import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

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
// A cold plan prints every compiler command and can exceed spawnSync's output
// limit. Keep the full log on disk; scan it with bounded memory for guard inputs.
export function planSummary(file) {
  const fd = fs.openSync(file, 'r');
  const chunk = Buffer.alloc(64 * 1024);
  let carry = '';
  let actions = null;
  let noWork = false;
  let regeneration = false;
  let buildflags = false;
  try {
    let bytes;
    while ((bytes = fs.readSync(fd, chunk, 0, chunk.length, null)) > 0) {
      const text = carry + chunk.toString('utf8', 0, bytes);
      for (const match of text.matchAll(/\[\d+\/(\d+)\]|Build Succeeded: (\d+) steps/g)) {
        actions = Math.max(actions ?? 0, Number(match[1] ?? match[2]));
      }
      noWork ||= /no work to do/i.test(text);
      regeneration ||= /--regeneration\s+gen|Regenerating ninja files/.test(text);
      buildflags ||= /write_buildflag_header\.py/.test(text);
      carry = text.slice(-256);
    }
  } finally {
    fs.closeSync(fd);
  }
  return [
    actions !== null ? `Build Succeeded: ${actions} steps` : noWork ? 'no work to do' : '',
    regeneration ? '--regeneration gen' : '',
    buildflags ? 'write_buildflag_header.py' : '',
  ].join('\n');
}
export function checkPlan(output, allowLarge = false, rejectBuildflags = false, maxActions = null) {
  if (/--regeneration\s+gen|Regenerating ninja files/.test(output)) {
    throw new Error('GN regeneration is pending. Regenerate with unchanged arguments after reviewing the environment, then rerun preflight. No compilation started.');
  }
  // Siso's dry run does not execute generators. A changed buildflag can
  // invalidate shared libraries and their dependents after this small plan.
  if (/write_buildflag_header\.py/.test(output) && (!allowLarge || rejectBuildflags)) {
    throw new Error('Generated build flags are pending; the dry run can hide dependent compilation. Review and generate those flags separately, then rerun preflight. No compilation started.');
  }
  const actions = plannedActions(output);
  if (maxActions !== null && actions > maxActions) {
    throw new Error(`Dry-run scope ${actions} exceeds approved maximum ${maxActions}. No compilation started.`);
  }
  if (actions > 1000 && !allowLarge) {
    throw new Error('Large rebuild stopped before compilation. Diagnose the saved plan; use --allow-large-build only for an intentional rebuild.');
  }
  return actions;
}
export function maximumActions(options) {
  const values = options.filter(option => option.startsWith('--max-actions='));
  if (!values.length) return null;
  if (values.length !== 1 || !/^--max-actions=(0|[1-9][0-9]{0,8})$/.test(values[0]))
    throw new Error('Use one --max-actions=N with N between 0 and 999999999.');
  return Number(values[0].split('=')[1]);
}
// Windows is a second build of the desktop lane, cross-compiled on the
// x86-64 Linux server (chromium/windows/). It shares the lane's patches and
// source with the Mac; only the output and the machine differ.
export const WINDOWS_OUTPUTS = ['BlancWinPrototype', 'BlancWinBeta'];
const MAC_OUTPUTS = ['BlancPrototype', 'BlancRelease', 'BlancBeta'];
// The preview candidate's output, or the release channel's own (F0.3); never
// an arbitrary path, so a typo cannot start a cold build somewhere new.
export function outputName(options) {
  const values = options.filter(option => option.startsWith('--out='));
  if (!values.length) return 'BlancPrototype';
  const names = [...MAC_OUTPUTS, ...WINDOWS_OUTPUTS];
  if (values.length !== 1 || !names.includes(values[0].slice('--out='.length)))
    throw new Error(`Use one --out=${names.join(' or --out=')}.`);
  return values[0].slice('--out='.length);
}
// The lane decides the output, the target and the machine. Desktop keeps its
// defaults; Android (chromium/android/) builds the APK on x86-64 Linux only.
export const ANDROID_OUTPUTS = ['AndroidDebug', 'AndroidDebugX64', 'AndroidRelease', 'AndroidReleaseX64'];
export function buildLane(options) {
  const lanes = options.filter(option => option.startsWith('--lane='));
  if (lanes.length > 1 || (lanes.length && !['--lane=desktop', '--lane=android'].includes(lanes[0])))
    throw new Error('Use one --lane=desktop or --lane=android.');
  const lane = lanes.length ? lanes[0].slice('--lane='.length) : 'desktop';
  if (lane === 'desktop') {
    const out = outputName(options);
    if (WINDOWS_OUTPUTS.includes(out) && options.some(option => option.startsWith('--sdk-root=')))
      throw new Error('--sdk-root is a macOS option; the Windows output has none.');
    // The Windows output also builds Chromium's installer (W1 Part B), which
    // packs the browser it builds: one named extra target, nothing chosen on
    // the command line. The beta also builds Blanc's updater and its setup
    // program, UpdaterSetup.exe (W3 Task B2), Chromium's tag tool, which tags
    // the signed setup as the online installer, and the test setup
    // UpdaterSetup_test.exe, which reads overrides.json, for the release's
    // staging gate (W3 Task E1).
    if (out === 'BlancWinBeta')
      return { lane, out, target: 'chrome', extraTargets: ['mini_installer', 'chrome/updater/win/installer:installer', 'chrome/updater/tools:tag',
        'chrome/updater/win/installer:installer_test'] };
    return WINDOWS_OUTPUTS.includes(out) ? { lane, out, target: 'chrome', extraTargets: ['mini_installer'] } : { lane, out, target: 'chrome' };
  }
  if (options.some(option => option.startsWith('--sdk-root='))) throw new Error('--sdk-root is a macOS option; the Android lane has none.');
  const values = options.filter(option => option.startsWith('--out='));
  if (values.length > 1 || (values.length && !ANDROID_OUTPUTS.includes(values[0].slice('--out='.length))))
    throw new Error(`Use one --out=${ANDROID_OUTPUTS.join(' or --out=')} with --lane=android.`);
  const out = values.length ? values[0].slice('--out='.length) : ANDROID_OUTPUTS[0];
  if (out === 'AndroidRelease') return { lane, out, target: 'chrome_public_bundle' };
  // The emulator gates run Blanc's Robolectric suite from this output (a1-gate.sh, a5a-gate.sh), so it
  // is built with the app; otherwise it keeps an earlier build's jars, which a Chromium update breaks.
  if (out === 'AndroidDebugX64') return { lane, out, target: 'chrome_public_apk', extraTargets: ['blanc/android:blanc_android_junit_tests'] };
  return { lane, out, target: 'chrome_public_apk' };
}
export function requireAndroidHost(platform = process.platform, arch = process.arch) {
  if (platform !== 'linux' || arch !== 'x64') throw new Error(`The Android lane builds only on x86-64 Linux (this is ${platform} ${arch}). No build started.`);
}
// A desktop output belongs to one kind of machine: the Mac outputs to macOS,
// the Windows output to the x86-64 Linux server that cross-compiles it.
export function requireDesktopHost(outName, platform = process.platform, arch = process.arch) {
  if (WINDOWS_OUTPUTS.includes(outName)) {
    if (platform !== 'linux' || arch !== 'x64') throw new Error(`${outName} builds only on x86-64 Linux (this is ${platform} ${arch}). No build started.`);
  } else if (platform !== 'darwin') {
    throw new Error(`${outName} builds only on macOS (this is ${platform} ${arch}). No build started.`);
  }
}
// The Visual Studio package and SDK the pinned tree asks for. Both are plain
// string assignments in build/vs_toolchain.py; anything else needs a person.
export function windowsToolchainPins(vsToolchainSource) {
  const pin = name => {
    const match = new RegExp(`^${name} = '([0-9A-Za-z.]+)'$`, 'm').exec(vsToolchainSource);
    if (!match) throw new Error(`Cannot read ${name} from build/vs_toolchain.py; review the toolchain by hand.`);
    return match[1];
  };
  return { toolchainHash: pin('TOOLCHAIN_HASH'), sdkVersion: pin('SDK_VERSION') };
}
// Also catches legacy invocations outside this wrapper. Be conservative
// across checkouts because a second browser compile competes for the machine.
export function competingBuild(processList) {
  return processList.split('\n').some(line => /(?:^|\/)siso\s+ninja(?:\s|$)/.test(line));
}
export function processListArgs(platform = process.platform) {
  return platform === 'darwin' ? ['-axo', 'comm=,args='] : ['-eo', 'comm=,args='];
}
export function localJobs(options) {
  const values = options.filter(option => option.startsWith('--local-jobs='));
  if (!values.length) return [];
  if (values.length !== 1 || !/^--local-jobs=([1-9][0-9]{0,2})$/.test(values[0])) {
    throw new Error('Use one --local-jobs=N with N between 1 and 999.');
  }
  return ['-local_jobs', values[0].split('=')[1]];
}
function run(command, args, { stdoutOnly = false, ...options } = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024, ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${path.basename(command)} failed (${result.status}): ${result.stderr || ''}`);
  return `${result.stdout || ''}${stdoutOnly ? '' : result.stderr || ''}`.trim();
}
// An explicit recovered SDK must match the sysroot actually used by Ninja.
// This changes observation only; it never rewrites arguments or environment pins.
export function selectedSdk(options, out) {
  const values = options.filter(option => option.startsWith('--sdk-root='));
  if (!values.length) return null;
  if (values.length !== 1) throw new Error('Use exactly one --sdk-root=ABSOLUTE_PATH.');
  const requested = values[0].slice('--sdk-root='.length);
  if (!path.isAbsolute(requested)) throw new Error('SDK root must be absolute.');
  const root = fs.realpathSync(requested);
  if (!fs.statSync(root).isDirectory() || !fs.existsSync(path.join(root, 'SDKSettings.json')))
    throw new Error('SDK root must contain SDKSettings.json.');
  const graph = fs.readFileSync(path.join(out, 'toolchain.ninja'), 'utf8');
  const paths = [...graph.matchAll(/-isysroot ([^\s]+)/g)].map(match => match[1]);
  if (!paths.length) throw new Error('No sysroot found in the current toolchain graph.');
  for (const candidate of new Set(paths)) {
    if (candidate.includes('$') || candidate.includes('"') || candidate.includes("'"))
      throw new Error('Unsupported escaped sysroot; review the graph explicitly.');
    if (fs.realpathSync(path.resolve(out, candidate)) !== root)
      throw new Error('Selected SDK does not match the current toolchain graph.');
  }
  return root;
}
// The Android lane's pinned inputs: Chromium's own clang, JDK, SDK build
// tools and NDK (the NDK's version is in its README.chromium).
function androidEnvironment(src, out) {
  const env = { ...process.env, DEPOT_TOOLS_UPDATE: '0' };
  const read = file => fs.readFileSync(path.join(src, file), 'utf8').trim();
  const inputs = {
    host: `${process.platform} ${process.arch}`,
    clangRevision: read('third_party/llvm-build/Release+Asserts/cr_build_revision'),
    clangVersion: run(path.join(src, 'third_party/llvm-build/Release+Asserts/bin/clang'), ['--version']),
    jdk: run(path.join(src, 'third_party/jdk/current/bin/java'), ['-version']),
    sdkBuildTools: fs.readdirSync(path.join(src, 'third_party/android_sdk/public/build-tools')).sort().join(' '),
    ndk: /^Version:\s*(\S+)/m.exec(read('third_party/android_toolchain/README.chromium'))?.[1] ?? 'unknown',
    argsSha256: digest(fs.readFileSync(path.join(out, 'args.gn'))),
  };
  return { inputs, env };
}
// The unpacked Windows SDK is served through a case-insensitive FUSE mount
// that a reboot removes; without it every compile fails on a missing header.
export function windowsToolchainMounted(procMounts, src) {
  const mount = path.join(src, 'third_party/depot_tools/win_toolchain/vs_files');
  return procMounts.split('\n').some(line => { const [, where, type] = line.split(' '); return where === mount && type === 'fuse.ciopfs'; });
}
// The Windows output's pinned inputs: Chromium's own clang, the Visual Studio
// package the tree asks for, and the package gclient actually unpacked
// (build/win_toolchain.json, written by its hook).
function windowsEnvironment(src, out) {
  const env = { ...process.env, DEPOT_TOOLS_UPDATE: '0' };
  const read = file => fs.readFileSync(path.join(src, file), 'utf8');
  const inputs = {
    host: `${process.platform} ${process.arch}`,
    clangRevision: read('third_party/llvm-build/Release+Asserts/cr_build_revision').trim(),
    clangVersion: run(path.join(src, 'third_party/llvm-build/Release+Asserts/bin/clang'), ['--version']),
    ...windowsToolchainPins(read('build/vs_toolchain.py')),
    toolchainSha256: digest(read('build/win_toolchain.json')),
    argsSha256: digest(fs.readFileSync(path.join(out, 'args.gn'))),
  };
  return { inputs, env };
}
function environment(src, out, sdkRoot = null) {
  const developerDir = fs.realpathSync(process.env.DEVELOPER_DIR || run('/usr/bin/xcode-select', ['-p']));
  const env = { ...process.env, DEVELOPER_DIR: developerDir, DEPOT_TOOLS_UPDATE: '0' };
  const xcrun = args => run('/usr/bin/xcrun', ['--sdk', 'macosx', ...args], { env, stdoutOnly: true });
  const selectedSettings = sdkRoot ? JSON.parse(fs.readFileSync(path.join(sdkRoot, 'SDKSettings.json'), 'utf8')) : null;
  if (selectedSettings && (typeof selectedSettings.Version !== 'string' || !selectedSettings.Version))
    throw new Error('Selected SDK has no version identity.');
  // xcrun may reject a durable copied SDK name; read that verified SDK's own
  // metadata rather than accidentally observing Xcode's default SDK.
  const selectedBuild = sdkRoot ? run('/usr/bin/plutil', ['-extract', 'ProductBuildVersion', 'raw', '-o', '-',
    path.join(sdkRoot, 'System/Library/CoreServices/SystemVersion.plist')], { stdoutOnly: true }) : null;
  const inputs = {
    developerDir,
    xcode: run('/usr/bin/xcodebuild', ['-version'], { env, stdoutOnly: true }),
    sdkPath: sdkRoot || xcrun(['--show-sdk-path']),
    sdkVersion: selectedSettings?.Version || xcrun(['--show-sdk-version']),
    sdkBuild: selectedBuild || xcrun(['--show-sdk-build-version']),
    clangRevision: fs.readFileSync(path.join(src, 'third_party/llvm-build/Release+Asserts/cr_build_revision'), 'utf8').trim(),
    clangVersion: run(path.join(src, 'third_party/llvm-build/Release+Asserts/bin/clang'), ['--version']),
    argsSha256: digest(fs.readFileSync(path.join(out, 'args.gn'))),
  };
  return { inputs, env };
}
function main() {
  const [source, ...options] = process.argv.slice(2);
  const allowed = new Set(['--check', '--build', '--record-environment', '--allow-large-build', '--reject-buildflags']);
  if (!source || options.some(option => !allowed.has(option) && !option.startsWith('--local-jobs=') && !option.startsWith('--out=') && !option.startsWith('--lane=') && !option.startsWith('--sdk-root=') && !option.startsWith('--max-actions='))) {
    throw new Error('Usage: node build.mjs CHROMIUM_SRC [--check | --build | --record-environment] [--allow-large-build] [--reject-buildflags] [--max-actions=N] [--local-jobs=N] [--lane=desktop|android] [--out=BlancPrototype|BlancRelease|BlancBeta|BlancWinPrototype|AndroidDebug|AndroidDebugX64|AndroidRelease|AndroidReleaseX64] [--sdk-root=ABSOLUTE_PATH]');
  }
  const workerArgs = localJobs(options);
  const maxActions = maximumActions(options);
  const modes = options.filter(option => ['--check', '--build', '--record-environment'].includes(option));
  if (modes.length > 1) throw new Error('Choose one mode.');
  const mode = modes[0] || '--check';
  const src = fs.realpathSync(source);
  const { lane, out: outName, target, extraTargets = [] } = buildLane(options);
  const targets = [target, ...extraTargets];
  if (lane === 'android') requireAndroidHost(); else requireDesktopHost(outName);
  const windows = WINDOWS_OUTPUTS.includes(outName);
  if (windows && !windowsToolchainMounted(fs.readFileSync('/proc/mounts', 'utf8'), src))
    throw new Error('The Windows toolchain is not mounted. Run chromium/windows/server/mount-toolchain.sh, then rerun. No build started.');
  const out = path.join(src, 'out', outName);
  const pinFile = path.join(out, '.blanc-build-environment.json');
  const lock = path.join(out, '.blanc-build-guard.lock');
  const observe = () => lane === 'android' ? androidEnvironment(src, out)
    : windows ? windowsEnvironment(src, out) : environment(src, out, selectedSdk(options, out));
  const { inputs, env } = observe();
  if (mode === '--record-environment') {
    // A declared baseline, never a claim that the build passed. Recording is
    // separate from compilation and cannot bypass the large-plan guard.
    fs.writeFileSync(pinFile, JSON.stringify(inputs, null, 2) + '\n');
    console.log(`Recorded build environment: ${pinFile}\n${inputs.xcode ?? inputs.jdk ?? `Visual Studio package ${inputs.toolchainHash}, Windows SDK ${inputs.sdkVersion}`}\nNo build started.`);
    return;
  }
  if (!fs.existsSync(pinFile)) throw new Error('No pinned environment. Review the toolchain and record it with --record-environment first.');
  const changed = changedInputs(JSON.parse(fs.readFileSync(pinFile, 'utf8')), inputs);
  if (changed.length) throw new Error(`Build inputs changed: ${changed.join(', ')}. Review the cache impact before recording a new environment. No build started.`);
  if (competingBuild(run('/bin/ps', processListArgs()))) {
    throw new Error('A Siso build is already running. Wait for it; no competing build or dry run started.');
  }
  fs.mkdirSync(lock);
  try {
    const siso = path.join(src, 'third_party/siso/cipd/siso');
    const args = ['ninja', '-offline', ...workerArgs, '-C', out];
    const planFile = path.join(out, 'blanc-build-plan.log');
    const planFd = fs.openSync(planFile, 'w');
    let result;
    try {
      result = spawnSync(siso, [...args, '-n', ...targets], {
        cwd: src, env, stdio: ['ignore', planFd, planFd],
      });
    } finally {
      fs.closeSync(planFd);
    }
    if (result.error || result.status !== 0) throw new Error(`Dry run failed (${result.error?.message ?? result.status ?? result.signal}); inspect ${planFile}. No build started.`);
    const output = planSummary(planFile);
    const actions = plannedActions(output);
    console.log(`Dry-run scheduled actions: ${actions} (generated outputs may add work). Plan: ${planFile}`);
    checkPlan(output, options.includes('--allow-large-build'), options.includes('--reject-buildflags'), maxActions);
    if (mode !== '--build') { console.log('Check only; no compilation started.'); return; }
    // Re-resolve the selected sysroot as well as re-reading the environment:
    // the SDK link or graph may have changed during the dry run.
    if (changedInputs(inputs, observe().inputs).length) {
      throw new Error('Build environment changed during preflight. No build started.');
    }
    if (!actions) return;
    const build = process.platform === 'darwin'
      ? spawnSync('/usr/bin/caffeinate', ['-i', siso, ...args, ...targets], { cwd: src, env, stdio: 'inherit' })
      : spawnSync(siso, [...args, ...targets], { cwd: src, env, stdio: 'inherit' });
    if (build.error) throw build.error;
    if (build.status !== 0) throw new Error(`Build did not complete successfully (${build.status ?? build.signal}). Cached work was preserved.`);
    fs.writeFileSync(path.join(out, '.blanc-last-successful-build.json'), JSON.stringify({ inputs, completedAt: new Date().toISOString() }, null, 2) + '\n');
    // Only the preview build is the tracked desktop candidate. The Android
    // candidate is recorded once the tracker holds Android candidates (A0 task 7).
    if (lane === 'desktop' && outName === 'BlancPrototype') run(process.execPath, [path.join(path.dirname(fileURLToPath(import.meta.url)), 'progress.mjs'), `--candidate-from-output=${out}`]);
  } finally {
    fs.rmdirSync(lock);
  }
}
// Real paths: on macOS a temp or symlinked path (/var → /private/var) would otherwise never match.
if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  try { main(); } catch (error) { console.error(`Blanc build guard: ${error.message}`); process.exitCode = 1; }
}
