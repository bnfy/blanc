// The N-to-N+1 proof for Blanc Beta on Windows (W3 Task D2), on a runner:
// Electron Blanc as people have it, Blanc's updater, then beta N; the updater
// is woken and asks https://blanc.day/update/win/v4, which offers what the
// update server's release.json names. With --expect=VERSION the beta must
// become that version (installed, registered, launching); with
// --expect-refused the package on offer must be refused and N keep working.
// Either way Electron Blanc is untouched.
//
//   node chromium/tests/windows-update-proof.mjs CANDIDATE_N RESULTS SHIPPING_INSTALLER (--expect=V | --expect-refused)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn, spawnSync, execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {updaterNames, clientsKey, updaterFolder} from '../windows/updater-check.mjs';

const [candidateFolder, resultsFolder, shippingInstaller, mode] = process.argv.slice(2);
const expect = mode?.startsWith('--expect=') ? mode.slice('--expect='.length) : null;
if (!candidateFolder || !resultsFolder || !shippingInstaller || !(expect || mode === '--expect-refused'))
  throw Error('Usage: windows-update-proof.mjs CANDIDATE_N RESULTS SHIPPING_INSTALLER (--expect=V | --expect-refused)');
if (process.platform !== 'win32') throw Error('The update proof runs on Windows');
const directory = path.resolve(candidateFolder), out = path.resolve(resultsFolder);
if (fs.existsSync(out)) throw Error('Refusing to overwrite earlier results');
fs.mkdirSync(out, {recursive: true});
const candidate = JSON.parse(fs.readFileSync(path.join(directory, 'candidate.json'), 'utf8'));
if (candidate.channel !== 'beta') throw Error('The update proof is for a beta candidate');
const names = updaterNames(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'blanc/branding/win-beta/updater.gni'), 'utf8'));
const local = process.env.LOCALAPPDATA, folder = updaterFolder(local, names);
const application = path.join(local, 'Blanc Beta', 'Application');
const electronExe = path.join(local, 'Programs', 'Blanc', 'Blanc.exe');
const record = {candidate: candidate.id, from: candidate.version, mode: expect ? `expect ${expect}` : 'expect refused', checks: {}, details: {}};
const pause = ms => new Promise(r => setTimeout(r, ms));
const regValues = key => {
  const r = spawnSync('reg.exe', ['query', key], {encoding: 'utf8'});
  if (r.status !== 0) return null;
  const values = {};
  for (const line of r.stdout.split(/\r?\n/)) { const m = /^\s{4}(.*?)\s{4}REG_\w+\s{4}?(.*)$/.exec(line); if (m) values[m[1]] = m[2]; }
  return values;
};
const pv = () => regValues(clientsKey(names))?.pv ?? null;
const updaterExe = () => fs.existsSync(folder) ? fs.readdirSync(folder).filter(n => /^\d+(\.\d+)+$/.test(n))
  .map(v => path.join(folder, v, 'updater.exe')).find(f => fs.existsSync(f)) ?? null : null;
const electronState = () => ({exe: fs.existsSync(electronExe),
  progId: regValues('HKEY_CURRENT_USER\\Software\\Classes\\BlancURL\\shell\\open\\command'),
  registered: regValues('HKEY_CURRENT_USER\\Software\\RegisteredApplications')?.Blanc ?? null});
async function launches(version) {
  const exe = path.join(application, 'chrome.exe');
  if (!fs.existsSync(exe) || !fs.existsSync(path.join(application, version, 'chrome.dll'))) return {running: false, missing: true};
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-proof-launch-'));
  const child = spawn(exe, [`--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', 'about:blank'], {detached: true, stdio: 'ignore'});
  await pause(15000);
  const running = child.exitCode === null;
  spawnSync('taskkill.exe', ['/F', '/T', '/PID', String(child.pid)], {stdio: 'ignore'});
  await pause(2000);
  return {running};
}

let failure = null;
try {
  execFileSync(path.resolve(shippingInstaller), ['/S'], {stdio: 'ignore', timeout: 300000});
  for (let t = 0; t < 60 && !fs.existsSync(electronExe); t++) await pause(1000);
  await pause(3000); spawnSync('taskkill.exe', ['/F', '/T', '/IM', 'Blanc.exe'], {stdio: 'ignore'});
  const electronBefore = electronState();

  const setup = spawnSync(path.join(directory, 'UpdaterSetup.exe'), ['--install', '--enable-logging'], {timeout: 300000});
  const install = spawnSync(path.join(directory, 'mini_installer.exe'), ['--do-not-launch-chrome', '--verbose-logging'], {timeout: 600000});
  record.details.installed = {setupExit: setup.status, installerExit: install.status, pv: pv()};
  record.checks.startsAtN = setup.status === 0 && install.status === 0 && pv() === candidate.version;

  // Wake the updater: it registers the beta, asks blanc.day, and installs any
  // offered package in the background. Wait for its verdict.
  const exe = updaterExe();
  spawnSync(exe, ['--wake', '--enable-logging'], {timeout: 300000});
  const target = expect ?? candidate.version;
  const deadline = Date.now() + (expect ? 15 : 5) * 60000;
  while (Date.now() < deadline && pv() === candidate.version && expect) await pause(5000);
  if (!expect) await pause(120000);
  const log = fs.existsSync(path.join(folder, 'updater.log')) ? fs.readFileSync(path.join(folder, 'updater.log'), 'utf8') : '';
  record.details.after = {pv: pv(), versions: fs.existsSync(application) ? fs.readdirSync(application).filter(n => /^\d/.test(n)) : []};
  record.details.updaterLog = log.split(/\r?\n/).filter(l => /blanc\.day|crx|CRX|install|Install|error|ERROR|verif/.test(l)).slice(-60);
  fs.writeFileSync(path.join(out, 'updater.log'), log);
  record.checks.versionIsExpected = pv() === target;
  record.details.launch = await launches(target);
  record.checks.launches = record.details.launch.running === true;
  if (expect) record.checks.updatedFolderPresent = fs.existsSync(path.join(application, expect, 'chrome.dll'));
  else record.checks.refusalLogged = /verif|signature|kErrorRequiredProofMissing|CRX_VERIFIER|crx/i.test(log) && /error|fail/i.test(log);
  record.checks.electronUntouched = JSON.stringify(electronState()) === JSON.stringify(electronBefore);
} catch (error) { failure = error; record.error = String(error.stack || error); }
finally {
  const exe = updaterExe();
  if (exe) spawnSync(exe, ['--uninstall'], {timeout: 300000});
}
record.pass = !failure && Object.values(record.checks).length > 0 && Object.values(record.checks).every(v => v === true);
fs.writeFileSync(path.join(out, 'update-proof.json'), JSON.stringify(record, null, 2) + '\n');
console.log(JSON.stringify(record, null, 2));
if (!record.pass) process.exitCode = 1;
