import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {fileURLToPath} from 'node:url';
import { TAG, nextRelease, tagFor, validateLedger } from './versions.mjs';
import { competingBuild, processListArgs } from '../../tools/build.mjs';
const SHA = /^[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;
const check = (condition, message) => { if (!condition) throw new Error(message); };
const digest = data => crypto.createHash('sha256').update(data).digest('hex');
export function validateBuildRecord(record, ledgerEntry) {
  check(record?.schema === 1, 'build record schema must be 1');
  for (const key of ['tag', 'commit', 'versionName', 'versionCode']) {
    check(record[key] !== undefined && record[key] === ledgerEntry?.[key], `build record ${key} differs from ledger`);
  }
  check(record.tag === tagFor(record.versionName, record.versionCode), 'invalid build tag');
  for (const key of ['commit', 'appliedOver', 'upstream']) check(COMMIT.test(record[key] ?? ''), `invalid ${key}`);
  check(SHA.test(record.argsSha256 ?? ''), 'invalid argsSha256');
  check(record.aab?.file === 'ChromePublic.aab' && SHA.test(record.aab.sha256 ?? '') && Number.isSafeInteger(record.aab.bytes) && record.aab.bytes > 0, 'invalid or missing aab');
  const date = typeof record.builtAt === 'string' ? Date.parse(record.builtAt) : NaN;
  check(Number.isFinite(date) && new Date(date).toISOString() === record.builtAt, 'invalid builtAt');
  if (Object.hasOwn(record, 'gatesApk')) check(SHA.test(record.gatesApk?.sha256 ?? ''), 'invalid gatesApk');
}
// A release's arguments: the tagged template plus its version lines.
export function releaseArgs(template, versionName, versionCode) {
  return template + `\nblanc_android_version_name = "${versionName}"\nandroid_override_version_name = "${versionName}"\nandroid_override_version_code = "${versionCode}"\n`;
}
// The build guard pins each output's arguments, and every release changes them by its version
// lines. When the pin is exactly this template with an earlier version (any 1.0.0-beta.N, or any
// name in `earlierNames` (the ledger's), with a lower version code, whether or not that build
// reached the ledger), only the version changed:
// the pin with the new arguments' hash, every toolchain field untouched. Otherwise null, and the
// guard stops the build for a review.
export function pinForNewVersion(pin, template, versionCode, args, earlierNames = []) {
  const next = digest(args);
  if (pin?.argsSha256 === next) return null;
  for (let code = 1; code < versionCode; code++) {
    const names = new Set([...Array.from({ length: code }, (_, beta) => `1.0.0-beta.${beta + 1}`), ...earlierNames]);
    for (const name of names) {
      if (digest(releaseArgs(template, name, code)) === pin?.argsSha256) return { ...pin, argsSha256: next };
    }
  }
  return null;
}
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, ...options });
  if (result.error) throw result.error;
  check(result.status === 0, `${path.basename(command)} failed: ${result.stderr || result.status}`);
  return result.stdout?.trim() ?? '';
}
const git = (tree, ...args) => run('git', ['-C', tree, ...args]);
const jsonAt = (tree, revision, name) => JSON.parse(git(tree, 'show', `${revision}:${name}`));
// Paths `git status --porcelain` reports as changed that Blanc doesn't apply (a rename counts both sides).
export function unexpectedChromiumChanges(porcelain, managed) {
  // The status letters may have lost their leading space to trimming, so strip them by pattern.
  return porcelain.split('\n').filter(Boolean).flatMap(line => line.replace(/^\s*[MADRCUT?!]{1,2}\s+/, '').split(' -> '))
    .filter(file => !managed.has(file));
}
function releaseEntry(tree, tag) {
  check(!git(tree, 'status', '--porcelain'), 'release checkout must be clean');
  const commit = git(tree, 'rev-parse', '--verify', 'HEAD^{commit}');
  let tagged;
  try { tagged = git(tree, 'rev-parse', '--verify', `refs/tags/${tag}^{commit}`); }
  catch { throw new Error('release tag is missing or does not resolve to a commit'); }
  check(COMMIT.test(commit) && tagged === commit, 'release tag must name the checked-out commit');
  const ledger = jsonAt(tree, commit, 'chromium/android/release/ledger.json');
  validateLedger(ledger);
  const found = ledger.builds.find(entry => entry.tag === tag);
  if (found) {
    check(found.commit === commit, 'ledger commit differs from release tag');
    check(found.state === 'built', 'ledger state must be built (pending); uploaded or abandoned builds cannot rebuild');
    return found;
  }
  const match = TAG.exec(tag);
  check(match, 'invalid release tag');
  const pending = nextRelease(ledger, match[1]);
  check(pending.tag === tag, 'release tag is not the next ledger versionCode');
  return { ...pending, commit };
}
function archive(tree, commit, destination) {
  fs.mkdirSync(destination, { recursive: true });
  // Stream the archive through a file: never hold the source tree in memory.
  const archiveFile = path.join(destination, '.source.tar');
  const fd = fs.openSync(archiveFile, 'wx');
  try { run('git', ['-C', tree, 'archive', '--format=tar', commit], { stdio: ['ignore', fd, 'pipe'] }); }
  finally { fs.closeSync(fd); }
  run('tar', ['-xf', archiveFile, '-C', destination]);
  fs.unlinkSync(archiveFile);
}
function main() {
  const [tag, ...options] = process.argv.slice(2);
  check(tag && TAG.test(tag), 'Usage: release-build.sh TAG --previous-map COMMIT [--dry-run] [--gates]');
  const previousIndex = options.indexOf('--previous-map');
  check(previousIndex >= 0 && COMMIT.test(options[previousIndex + 1] ?? ''), '--previous-map requires a full lowercase commit');
  const previous = options[previousIndex + 1];
  const rest = options.filter((_, index) => index !== previousIndex && index !== previousIndex + 1);
  check(rest.every(option => ['--dry-run', '--gates'].includes(option)) && new Set(rest).size === rest.length, 'unknown or repeated release option');
  const dry = rest.includes('--dry-run');
  const gates = rest.includes('--gates');
  const tree = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
  const home = os.homedir();
  const clone = path.join(home, 'blanc-release');
  const src = path.join(home, 'chromium-android/src');
  const evidence = path.join(home, 'blanc-evidence/android/release', tag);
  check(!competingBuild(run('ps', processListArgs())), 'A Siso build is already running; no shared checkout was changed');
  const checkIsolation = () => {
    const development = path.join(home, 'blanc');
    check(!fs.existsSync(development) || fs.realpathSync(clone) !== fs.realpathSync(development), 'refusing the development clone');
    check(!fs.lstatSync(clone).isSymbolicLink(), 'dedicated release clone must not be a symlink');
  };
  if (dry) {
    check(fs.existsSync(clone), 'dry run needs a prepared ~/blanc-release clone at the release tag; nothing was changed');
    checkIsolation();
    const entry = releaseEntry(clone, tag);
    console.log(`Would use blobless dedicated ${clone}, verify ${tag} at ${entry.commit}, and export it with git archive.
Would reconstruct previous source map from ${previous}; apply Android source with a durable backup, refusing unknown cached bytes.
Would copy ZXing/blocker assets, refuse a Chromium checkout off the pin or with changes Blanc doesn't apply,
write each output's release arguments and regenerate GN with them, recording the environment pin once.
Would build out/AndroidRelease chrome_public_bundle through build.mjs (a full rebuild) and verify BlancRelease.java.
${gates ? 'Would build out/AndroidReleaseX64 chrome_public_apk through build.mjs.' : 'Use --gates to also build out/AndroidReleaseX64 chrome_public_apk.'}
Would write ${evidence}/build.json. No changes made.`);
    return;
  }
  check(!fs.existsSync(path.join(evidence, 'build.json')), 'build record already exists; preserve it and reconcile by hand');
  if (!fs.existsSync(clone)) run('git', ['clone', '--filter=blob:none', git(tree, 'remote', 'get-url', 'origin'), clone]);
  checkIsolation();
  check(!git(clone, 'status', '--porcelain'), 'dedicated release clone must be clean');
  run('git', ['-C', clone, 'fetch', '--filter=blob:none', 'origin', `refs/tags/${tag}:refs/tags/${tag}`]);
  run('git', ['-C', clone, 'checkout', '--detach', `refs/tags/${tag}`]);
  const entry = releaseEntry(clone, tag);
  // A previous map must come from this repository's fetched object database.
  check(git(clone, 'rev-parse', '--verify', `${previous}^{commit}`) === previous, 'previous-map commit is unavailable; fetch it explicitly first');
  fs.mkdirSync(evidence, { recursive: true });
  const attempt = fs.mkdtempSync(path.join(evidence, 'attempt-'));
  const exported = path.join(attempt, 'source');
  archive(clone, entry.commit, exported);
  const read = name => JSON.parse(fs.readFileSync(path.join(exported, name), 'utf8'));
  const oldAndroid = jsonAt(clone, previous, 'chromium/source-map-android.json');
  const oldCanonical = jsonAt(clone, previous, 'chromium/source-map.json');
  const previousMap = path.join(attempt, 'previous-map.json');
  fs.writeFileSync(previousMap, JSON.stringify({ upstream: oldAndroid.upstream, upstreamFiles: oldAndroid.upstreamFiles, canonicalSha256: oldCanonical.canonicalSha256 }, null, 2) + '\n', { flag: 'wx' });
  const tools = path.join(exported, 'chromium/tools');
  run('python3', [path.join(tools, 'apply.py'), '--lane', 'android', '--src', src, '--previous-map', previousMap, '--apply', '--backup', path.join(attempt, 'backup')], { stdio: 'inherit' });
  for (const [asset, destination] of [['zxing/core-3.5.3.jar', 'blanc/android/zxing/core-3.5.3.jar'], ['blocker/engine.js', 'blanc/android/blocker_assets/engine.js']]) {
    const target = path.join(src, destination);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(home, 'blanc-assets', asset), target);
  }
  // The bundle is only what the tag says if Chromium is at the pinned upstream and its only changes are
  // the files Blanc applies: an edit left in from debugging would otherwise ship.
  const androidMap = read('chromium/source-map-android.json');
  const upstream = git(src, 'rev-parse', 'HEAD');
  check(upstream === androidMap.upstream, `Chromium checkout is at ${upstream}, not the pinned ${androidMap.upstream}`);
  const stray = unexpectedChromiumChanges(git(src, 'status', '--porcelain', '--untracked-files=no'), new Set(Object.keys(androidMap.upstreamFiles)));
  check(!stray.length, `Chromium checkout has changes Blanc doesn't apply: ${stray.slice(0, 5).join(', ')}${stray.length > 5 ? ', …' : ''}`);
  const outputs = [['AndroidRelease', 'release-arm64.gn'], ...(gates ? [['AndroidReleaseX64', 'release-x64.gn']] : [])];
  for (const [outName, template] of outputs) {
    const out = path.join(src, 'out', outName);
    const argsTemplate = fs.readFileSync(path.join(exported, 'chromium/android/args', template), 'utf8');
    const args = releaseArgs(argsTemplate, entry.versionName, entry.versionCode);
    fs.mkdirSync(out, { recursive: true });
    const argsFile = path.join(out, 'args.gn');
    fs.writeFileSync(argsFile, args);
    // GN runs every time: a release changes its version lines, and a patch can change a BUILD.gn with
    // the arguments unchanged, which the build guard refuses until GN regenerates. Arguments come only
    // from the tagged templates above.
    run(path.join(home, 'depot_tools/gn'), ['gen', out], { cwd: src, stdio: 'inherit' });
    const buildTool = [path.join(tools, 'build.mjs'), src, '--lane=android', `--out=${outName}`];
    // The toolchain baseline is recorded once per output; later changes to it still stop the build.
    const pinFile = path.join(out, '.blanc-build-environment.json');
    // Read once and decide from what was read; the file is never tested for existence first.
    let pin = null;
    try { pin = JSON.parse(fs.readFileSync(pinFile, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (pin === null) run(process.execPath, [...buildTool, '--record-environment'], { stdio: 'inherit' });
    else {
      const earlierNames = jsonAt(clone, entry.commit, 'chromium/android/release/ledger.json').builds.map(build => build.versionName);
      const moved = pinForNewVersion(pin, argsTemplate, entry.versionCode, args, earlierNames);
      if (moved) fs.writeFileSync(pinFile, JSON.stringify(moved, null, 2) + '\n');
    }
    // A release is an intentional full rebuild, so the large-plan guard is waived here only.
    run(process.execPath, [...buildTool, '--build', '--allow-large-build'], { stdio: 'inherit' });
    const generated = fs.readFileSync(path.join(out, 'gen/blanc/android/org/chromium/blanc/BlancRelease.java'), 'utf8');
    check(generated.includes(`VERSION = "${entry.versionName}"`), `${outName} generated BlancRelease.java version mismatch`);
  }
  const aabFile = path.join(src, 'out/AndroidRelease/apks/ChromePublic.aab');
  const bytes = fs.readFileSync(aabFile);
  const record = { schema: 1, tag, commit: entry.commit, appliedOver: previous, upstream, versionName: entry.versionName, versionCode: entry.versionCode, argsSha256: digest(fs.readFileSync(path.join(src, 'out/AndroidRelease/args.gn'))), aab: { file: 'ChromePublic.aab', sha256: digest(bytes), bytes: bytes.length }, builtAt: new Date().toISOString() };
  if (gates) record.gatesApk = { sha256: digest(fs.readFileSync(path.join(src, 'out/AndroidReleaseX64/apks/ChromePublic.apk'))) };
  validateBuildRecord(record, entry);
  fs.writeFileSync(path.join(evidence, 'build.json'), JSON.stringify(record, null, 2) + '\n', { flag: 'wx' });
}
// Real paths: on macOS a temp or symlinked path (/var → /private/var) would otherwise never match.
if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  try { main(); } catch (error) { console.error(`Android release: ${error.message}`); process.exitCode = 1; }
}
