import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { buildLane } from './build.mjs';
const moduleURL = new URL('../android/release/record.mjs', import.meta.url);
const script = new URL('../android/server/release-build.sh', import.meta.url);
const entry = { tag: 'android-v1.0.0-beta.1-1', commit: 'a'.repeat(40), versionName: '1.0.0-beta.1', versionCode: 1 };
const valid = () => ({ schema: 1, ...entry, appliedOver: 'b'.repeat(40), upstream: 'c'.repeat(40), argsSha256: 'd'.repeat(64), aab: { file: 'ChromePublic.aab', sha256: 'e'.repeat(64), bytes: 100 }, builtAt: '2026-11-15T00:00:00.000Z' });
async function validator() { assert.ok(fs.existsSync(moduleURL), 'release record module exists'); return (await import(moduleURL)).validateBuildRecord; }
test('matching build record passes', async () => { (await validator())(valid(), entry); });
for (const field of ['tag', 'commit', 'versionName', 'versionCode']) test(`different ${field} is refused`, async () => {
  const validate = await validator(); assert.throws(() => validate({ ...valid(), [field]: field === 'versionCode' ? 2 : 'different' }, entry));
});
test('every required field and malformed digests are refused', async () => {
  const validate = await validator();
  for (const key of Object.keys(valid())) { const record = valid(); delete record[key]; assert.throws(() => validate(record, entry), key); }
  for (const key of ['argsSha256', 'upstream', 'appliedOver']) assert.throws(() => validate({ ...valid(), [key]: 'bad' }, entry));
  for (const aab of [null, {}, { ...valid().aab, sha256: 'bad' }, { ...valid().aab, bytes: 0 }, { ...valid().aab, file: '../ChromePublic.aab' }]) assert.throws(() => validate({ ...valid(), aab }, entry));
  assert.throws(() => validate({ ...valid(), gatesApk: {} }, entry));
});
test('release outputs use bundle for arm64 and APK for x64', () => {
  assert.deepEqual(buildLane(['--lane=android', '--out=AndroidRelease']), { lane: 'android', out: 'AndroidRelease', target: 'chrome_public_bundle' });
  assert.deepEqual(buildLane(['--lane=android', '--out=AndroidReleaseX64']), { lane: 'android', out: 'AndroidReleaseX64', target: 'chrome_public_apk' });
});
test('release shell parses and refuses non-Linux before stdout even in dry run', () => {
  assert.ok(fs.existsSync(script), 'release shell exists');
  assert.equal(spawnSync('bash', ['-n', fileURLToPath(script)]).status, 0);
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'release-host-'));
  try { fs.writeFileSync(path.join(temp, 'uname'), '#!/bin/sh\necho Darwin\n', { mode: 0o755 });
    const result = spawnSync('bash', [fileURLToPath(script), entry.tag, '--previous-map', 'b'.repeat(40), '--dry-run'], { encoding: 'utf8', env: { ...process.env, PATH: `${temp}:${process.env.PATH}` } });
    assert.notEqual(result.status, 0); assert.equal(result.stdout, ''); assert.match(result.stderr, /only on x86-64 Linux/);
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});
for (const scenario of ['dirty', 'untagged', 'mismatched-ledger', 'clean', 'dirty-script']) test(`fixture Git ${scenario} preflight ${['clean', 'dirty-script'].includes(scenario) ? 'prints a read-only plan' : 'refuses before mutation'}`, () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'release-git-'));
  try {
    fs.mkdirSync(path.join(temp, 'blanc-release'));
    fs.writeFileSync(path.join(temp, 'uname'), '#!/bin/sh\ncase "$1" in -s) echo Linux;; -m) echo x86_64;; esac\n', { mode: 0o755 });
    fs.writeFileSync(path.join(temp, 'ps'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    fs.writeFileSync(path.join(temp, 'git'), `#!/bin/sh
case "$2" in */blanc-release) ;; *) echo 'script checkout must not be queried for release state' >&2; exit 99;; esac
shift 2
case "$1" in
status) [ "$SCENARIO" != dirty ] || echo ' M dirty';;
rev-parse) case "$3" in refs/tags/*) [ "$SCENARIO" != untagged ] || exit 1;; esac; printf '%s\\n' '${entry.commit}';;
show) if [ "$SCENARIO" = mismatched-ledger ]; then printf '%s\\n' '${JSON.stringify({ schema: 1, builds: [{ ...entry, commit: 'f'.repeat(40), state: 'built', date: '2026-11-15', note: '' }] })}'; else echo '{"schema":1,"builds":[]}'; fi;;
*) echo 'unexpected mutating Git invocation' >&2; exit 99;;
esac
`, { mode: 0o755 });
    const result = spawnSync('bash', [fileURLToPath(script), entry.tag, '--previous-map', 'b'.repeat(40), '--dry-run'], { encoding: 'utf8', env: { ...process.env, PATH: `${temp}:${process.env.PATH}`, HOME: temp, SCENARIO: scenario } });
    if (['clean', 'dirty-script'].includes(scenario)) { assert.equal(result.status, 0, result.stderr); assert.match(result.stdout, /chrome_public_bundle/); assert.match(result.stdout, /AndroidReleaseX64|--gates/); }
    else { assert.notEqual(result.status, 0); assert.equal(result.stdout, ''); assert.match(result.stderr, scenario === 'dirty' ? /clean/ : scenario === 'untagged' ? /tag/ : /ledger.*commit/i); }
    assert.deepEqual(fs.readdirSync(temp).sort(), ['blanc-release', 'git', 'ps', 'uname']);
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});
test('fixture build retries after guard refusal and records both release artifacts', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'release-build-'));
  const write = (file, content, executable = false) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content, executable ? { mode: 0o755 } : {}); };
  try {
    const bin = path.join(temp, 'bin');
    const source = path.join(temp, 'fixture');
    fs.mkdirSync(path.join(temp, 'blanc-release'));
    write(path.join(bin, 'uname'), '#!/bin/sh\ncase "$1" in -s) echo Linux;; -m) echo x86_64;; esac\n', true);
    write(path.join(bin, 'ps'), '#!/bin/sh\nexit 0\n', true);
    write(path.join(bin, 'git'), `#!/bin/sh
if [ "$2" = "$HOME/chromium-android/src" ]; then
  case "$3" in rev-parse) echo '${'c'.repeat(40)}';; status) printf "$FIXTURE_CHROMIUM_STATUS";; *) exit 96;; esac; exit 0
fi
[ "$2" = "$HOME/blanc-release" ] || exit 99
shift 2
case "$1" in
status|fetch|checkout) exit 0;;
rev-parse) case "$3" in '${'b'.repeat(40)}^{commit}') echo '${'b'.repeat(40)}';; *) echo '${entry.commit}';; esac;;
archive) cat "$HOME/source.tar";;
show) case "$2" in
*:chromium/android/release/ledger.json) echo '{"schema":1,"builds":[]}';;
*:chromium/source-map-android.json) echo '{"upstream":"${'c'.repeat(40)}","upstreamFiles":{}}';;
*:chromium/source-map.json) echo '{"canonicalSha256":{}}';;
*:chromium/android/args/*) echo 'is_debug = false';;
*) exit 98;; esac;;
*) exit 97;; esac
`, true);
    write(path.join(source, 'chromium/tools/apply.py'), 'print("fixture source applied")\n');
    write(path.join(source, 'chromium/tools/build.mjs'), `import fs from 'node:fs'; import path from 'node:path';
if (process.env.FIXTURE_REFUSE) { console.error('No pinned environment'); process.exit(1); }
const out = path.join(process.argv[2], 'out', process.argv.find(a => a.startsWith('--out=')).slice(6));
fs.mkdirSync(path.join(out, 'gen/blanc/android/org/chromium/blanc'), {recursive:true});
fs.writeFileSync(path.join(out, 'gen/blanc/android/org/chromium/blanc/BlancRelease.java'), 'VERSION = "1.0.0-beta.1"');
fs.mkdirSync(path.join(out, 'apks'), {recursive:true}); fs.writeFileSync(path.join(out, 'apks', out.endsWith('X64') ? 'ChromePublic.apk' : 'ChromePublic.aab'), 'fixture artifact');\n`);
    for (const template of ['release-arm64.gn', 'release-x64.gn']) write(path.join(source, 'chromium/android/args', template), 'is_debug = false\n');
    write(path.join(source, 'chromium/source-map-android.json'), JSON.stringify({ upstream: 'c'.repeat(40), upstreamFiles: { 'chrome/android/BUILD.gn': 'f'.repeat(64) } }));
    write(path.join(temp, 'depot_tools/gn'), '#!/bin/sh\necho "$@" >> "$HOME/gn-calls"\n', true);
    assert.equal(spawnSync('tar', ['-cf', path.join(temp, 'source.tar'), '-C', source, '.']).status, 0);
    write(path.join(temp, 'blanc-assets/zxing/core-3.5.3.jar'), 'fixture jar');
    write(path.join(temp, 'blanc-assets/blocker/engine.js'), 'fixture blocker');
    for (const out of ['AndroidRelease', 'AndroidReleaseX64']) {
      write(path.join(temp, 'chromium-android/src/out', out, 'build.ninja'), 'fixture');
      write(path.join(temp, 'chromium-android/src/out', out, '.blanc-build-environment.json'), '{}');
    }
    const env = { ...process.env, HOME: temp, PATH: `${bin}:${process.env.PATH}` };
    const args = [fileURLToPath(script), entry.tag, '--previous-map', 'b'.repeat(40), '--gates'];
    const stray = spawnSync('bash', args, { encoding: 'utf8', env: { ...env, FIXTURE_CHROMIUM_STATUS: ' M chrome/android/BUILD.gn\\n M chrome/browser/left-over.cc\\n' } });
    assert.notEqual(stray.status, 0); assert.match(stray.stderr, /changes Blanc doesn't apply: chrome\/browser\/left-over\.cc/);
    fs.rmSync(path.join(temp, 'blanc-evidence'), { recursive: true, force: true });
    const refused = spawnSync('bash', args, { encoding: 'utf8', env: { ...env, FIXTURE_REFUSE: '1' } });
    assert.notEqual(refused.status, 0); assert.match(refused.stderr, /No pinned environment/);
    // The refused run already wrote both outputs' arguments. GN still runs again: a changed BUILD.gn
    // (a patch) needs regeneration with unchanged arguments, or the build guard stops the release.
    fs.rmSync(path.join(temp, 'gn-calls'), { force: true });
    const result = spawnSync('bash', args, { encoding: 'utf8', env });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(fs.readFileSync(path.join(temp, 'gn-calls'), 'utf8').trim().split('\n').map(line => path.basename(line.replace(/^gen /, ''))), ['AndroidRelease', 'AndroidReleaseX64']);
    const record = JSON.parse(fs.readFileSync(path.join(temp, 'blanc-evidence/android/release', entry.tag, 'build.json')));
    assert.equal(record.upstream, 'c'.repeat(40));
    assert.equal(record.appliedOver, 'b'.repeat(40)); assert.equal(record.aab.bytes, 16); assert.match(record.gatesApk.sha256, /^[a-f0-9]{64}$/);
    const duplicate = spawnSync('bash', args, { encoding: 'utf8', env });
    assert.notEqual(duplicate.status, 0); assert.match(duplicate.stderr, /build record already exists/);
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});

test('the Chromium checkout may differ from upstream only in the files Blanc applies', async () => {
  const { unexpectedChromiumChanges } = await import(moduleURL);
  const managed = new Set(['chrome/android/BUILD.gn', 'chrome/browser/x.cc']);
  assert.deepEqual(unexpectedChromiumChanges(' M chrome/android/BUILD.gn\n M chrome/browser/x.cc\n', managed), []);
  assert.deepEqual(unexpectedChromiumChanges(' M chrome/android/BUILD.gn\n M chrome/browser/debug.cc\nD  content/y.cc\n', managed),
    ['chrome/browser/debug.cc', 'content/y.cc']);
  assert.deepEqual(unexpectedChromiumChanges('R  chrome/a.cc -> chrome/browser/x.cc\n', managed), ['chrome/a.cc']);
  assert.deepEqual(unexpectedChromiumChanges('', managed), []);
  // As the git helper returns it: trimmed, so the first line has lost its leading space.
  assert.deepEqual(unexpectedChromiumChanges('M chrome/android/BUILD.gn\n M chrome/browser/debug.cc', managed), ['chrome/browser/debug.cc']);
});

// The build guard pins each output's arguments. A release writes its version into them, so the
// second release (1.0.0-beta.2) stopped before compiling: "Build inputs changed: argsSha256".
test('a new version moves the pinned arguments only when nothing but the version changed', async () => {
  const { releaseArgs, pinForNewVersion } = await import(moduleURL);
  const crypto = await import('node:crypto');
  const sha = text => crypto.createHash('sha256').update(text).digest('hex');
  const template = 'is_official_build = true\nblanc_channel = "release"\n';
  const pin = { host: 'linux x64', ndk: 'r28', argsSha256: sha(releaseArgs(template, '1.0.0-beta.1', 1)) };
  const next = releaseArgs(template, '1.0.0-beta.2', 2);
  assert.match(next, /android_override_version_name = "1\.0\.0-beta\.2"\nandroid_override_version_code = "2"\n$/);
  assert.deepEqual(pinForNewVersion(pin, template, 2, next), { host: 'linux x64', ndk: 'r28', argsSha256: sha(next) });
  // The previous build never reached the ledger (dropped before upload): its arguments still count.
  const dropped = { ...pin, argsSha256: sha(releaseArgs(template, '1.0.0-beta.2', 3)) };
  const fourth = releaseArgs(template, '1.0.0-beta.2', 4);
  assert.equal(pinForNewVersion(dropped, template, 4, fourth).argsSha256, sha(fourth));
  // The template changed too: that is a real arguments change, and the guard must stop it.
  assert.equal(pinForNewVersion(pin, template + 'symbol_level = 1\n', 2, releaseArgs(template + 'symbol_level = 1\n', '1.0.0-beta.2', 2)), null);
  // The pin isn't any earlier version's arguments (someone edited args.gn by hand).
  assert.equal(pinForNewVersion({ ...pin, argsSha256: sha('other') }, template, 2, next), null);
  // Already this version's arguments: nothing to move.
  assert.equal(pinForNewVersion({ ...pin, argsSha256: sha(next) }, template, 2, next), null);
  // The first release has no earlier version.
  assert.equal(pinForNewVersion(pin, template, 1, releaseArgs(template, '1.0.0-beta.1', 1)), null);
  assert.equal(pinForNewVersion({}, template, 2, next), null);
  // After a stable release the pin holds a stable name's arguments; the ledger's names count as earlier versions.
  const stablePin = { ...pin, argsSha256: sha(releaseArgs(template, '1.0.0', 6)) };
  const beta = releaseArgs(template, '1.1.0-beta.1', 7);
  assert.equal(pinForNewVersion(stablePin, template, 7, beta), null);
  assert.equal(pinForNewVersion(stablePin, template, 7, beta, ['1.0.0-beta.5', '1.0.0']).argsSha256, sha(beta));
});

// A stable release (1.0.0) follows the betas in the same code sequence; a malformed tag never reaches Git.
for (const [tag, ok] of [['android-v1.0.0-6', true], ['android-v1.1.0-beta.1-6', true], ['android-v1.0.0-beta-6', false], ['android-v1.0-6', false]]) test(`release build preflight ${ok ? 'accepts' : 'refuses'} ${tag}`, () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'release-tag-'));
  try {
    fs.mkdirSync(path.join(temp, 'blanc-release'));
    fs.writeFileSync(path.join(temp, 'uname'), '#!/bin/sh\ncase "$1" in -s) echo Linux;; -m) echo x86_64;; esac\n', { mode: 0o755 });
    fs.writeFileSync(path.join(temp, 'ps'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    const builds = [1, 2, 3, 4, 5].map(code => ({ versionCode: code, versionName: `1.0.0-beta.${code}`, tag: `android-v1.0.0-beta.${code}-${code}`, commit: 'c'.repeat(40), state: 'uploaded', date: '2026-11-22', note: '' }));
    fs.writeFileSync(path.join(temp, 'git'), `#!/bin/sh
shift 2
case "$1" in
status) ;;
rev-parse) printf '%s\\n' '${entry.commit}';;
show) printf '%s\\n' '${JSON.stringify({ schema: 1, builds })}';;
*) exit 99;;
esac
`, { mode: 0o755 });
    const result = spawnSync('bash', [fileURLToPath(script), tag, '--previous-map', 'b'.repeat(40), '--dry-run'], { encoding: 'utf8', env: { ...process.env, PATH: `${temp}:${process.env.PATH}`, HOME: temp } });
    if (ok) { assert.equal(result.status, 0, result.stderr); assert.match(result.stdout, new RegExp(tag.replaceAll('.', '\\.'))); }
    else { assert.notEqual(result.status, 0); assert.match(result.stderr, /Usage/); }
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});

test('a release build and the nightly never change the Android checkout at the same time', async () => {
  const { withAndroidLock } = await import(moduleURL);
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'android-lock-'));
  try {
    fs.mkdirSync(path.join(home, 'chromium-android'));
    assert.equal(withAndroidLock(home, () => assert.throws(() => withAndroidLock(home, () => 1), /in use/) ?? 'held'), 'held');
    assert.equal(withAndroidLock(home, () => 2), 2, 'released after the first holder finished');
    assert.throws(() => withAndroidLock(home, () => { throw new Error('build failed'); }), /build failed/);
    assert.equal(fs.existsSync(path.join(home, 'chromium-android/.blanc-android.lock')), false, 'released after a failure');
  } finally { fs.rmSync(home, { recursive: true, force: true }); }
});
