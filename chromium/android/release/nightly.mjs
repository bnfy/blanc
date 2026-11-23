// The Android nightly, run on the build server by its systemd timer (01:00 US Eastern) from the
// ~/blanc-nightly clone at main's tip (nightly.sh). It applies that commit to the shared checkout,
// builds out/AndroidNightlyX64 through the build guard, runs the release gate on the APK, and records
// the night in ~/blanc-evidence/android/nightly/<stamp>/result.json; LAST-PASS names the newest pass.
// A night never signs, tags or uploads anything, and its name (0.0.0-nightly) can't be released.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { competingBuild, processListArgs } from '../../tools/build.mjs';
import { applyToCheckout, appliedFile, archive, withAndroidLock } from './record.mjs';
import { nightVerdict, nightlyArgs, skipReason } from './nightly-rules.mjs';

const OUT = 'AndroidNightlyX64';
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${path.basename(command)} failed: ${result.stderr || result.status}`);
  return result.stdout?.trim() ?? '';
}
const readText = file => { try { return fs.readFileSync(file, 'utf8').trim(); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } };
const stampOf = iso => iso.slice(0, 16).replace(/[-:]/g, '').replace('T', '-');

function main() {
  if (os.platform() !== 'linux' || os.arch() !== 'x64') throw new Error('the Android nightly runs only on the x86-64 Linux build server');
  const home = os.homedir(), clone = path.join(home, 'blanc-nightly'), src = path.join(home, 'chromium-android/src');
  const records = path.join(home, 'blanc-evidence/android/nightly');
  const startedAt = new Date().toISOString(), dir = path.join(records, stampOf(startedAt));
  fs.mkdirSync(dir, { recursive: true });
  const result = { schema: 1, startedAt, sourceCommit: null, verdict: 'fail' };
  const finish = () => { result.finishedAt = new Date().toISOString(); fs.writeFileSync(path.join(dir, 'result.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' }); };
  try {
    check(!run('git', ['-C', clone, 'status', '--porcelain']), 'the nightly clone must be clean');
    const commit = run('git', ['-C', clone, 'rev-parse', '--verify', 'HEAD^{commit}']);
    result.sourceCommit = commit;
    const lastStamp = readText(path.join(records, 'LAST-PASS'));
    const lastPass = lastStamp ? JSON.parse(fs.readFileSync(path.join(records, lastStamp, 'result.json'), 'utf8')) : null;
    const previous = readText(appliedFile(home));
    const reason = skipReason({
      desktopLock: fs.existsSync(path.join(home, 'chromium-desktop/.blanc-checkout.lock')),
      sisoRunning: competingBuild(run('ps', processListArgs())),
      androidLock: fs.existsSync(path.join(home, 'chromium-android/.blanc-android.lock')),
      startedAt, unchangedSinceLastPass: lastPass?.sourceCommit === commit, appliedUnknown: !/^[a-f0-9]{40}$/.test(previous ?? ''),
    });
    if (reason) { result.verdict = 'skip'; result.skip = reason; return; }
    withAndroidLock(home, () => {
      const attempt = path.join(dir, 'attempt'), exported = path.join(attempt, 'source');
      fs.mkdirSync(attempt);
      archive(clone, commit, exported);
      applyToCheckout({ clone, previous, exported, attempt, src, home, commit });
      const out = path.join(src, 'out', OUT);
      // A cold output is prepared once by hand (README, "The nightly"); the night never records an environment.
      check(fs.existsSync(path.join(out, '.blanc-build-environment.json')), `${OUT} has no pinned build environment; prepare it by hand first`);
      fs.writeFileSync(path.join(out, 'args.gn'), nightlyArgs(fs.readFileSync(path.join(exported, 'chromium/android/args/release-x64.gn'), 'utf8')));
      run(path.join(home, 'depot_tools/gn'), ['gen', out], { cwd: src, stdio: 'inherit' });
      run('nice', ['-n', '10', process.execPath, path.join(exported, 'chromium/tools/build.mjs'), src, '--lane=android', `--out=${OUT}`, '--build'], { stdio: 'inherit' });
    });
    const apk = path.join(dir, 'ChromePublic.apk');
    fs.copyFileSync(path.join(src, 'out', OUT, 'apks/ChromePublic.apk'), apk);
    result.apkSHA256 = crypto.createHash('sha256').update(fs.readFileSync(apk)).digest('hex');
    // The gate vouches for the clone's own commit (it refuses a dirty runner tree).
    spawnSync('bash', [path.join(clone, 'chromium/tests/android/release-gate.sh'), apk, path.join(dir, 'gate')],
      { cwd: clone, stdio: 'inherit', env: { ...process.env, ANDROID_SERIAL: process.env.ANDROID_SERIAL ?? 'emulator-5556' } });
    const gate = JSON.parse(readText(path.join(dir, 'gate/release-gate.json')) ?? 'null');
    result.gate = gate && { verdict: gate.verdict, results: gate.results };
    result.verdict = nightVerdict({ buildOk: true, apkSHA256: result.apkSHA256, gate });
  } catch (error) {
    result.error = error.message;
  } finally {
    finish();
    if (result.verdict === 'pass') fs.writeFileSync(path.join(records, 'LAST-PASS'), path.basename(dir) + '\n');
    console.log(`Android nightly ${path.basename(dir)}: ${result.verdict}${result.skip ? ` (${result.skip})` : result.error ? ` (${result.error})` : ''}`);
  }
}
function check(value, message) { if (!value) throw new Error(message); }

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  try { main(); } catch (error) { console.error(`Android nightly: ${error.message}`); process.exitCode = 1; }
}
