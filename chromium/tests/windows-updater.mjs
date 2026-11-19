// Blanc's updater with the Windows beta (W3 Task B2), on a runner: the
// updater installs per user from UpdaterSetup.exe, the beta's installer
// registers its version under the updater's company key (patch 0101), never
// Google Update's, and the updater, woken, takes the beta into its own records.
// The update check itself (blanc.day's server) is Part C's.
//
//   node chromium/tests/windows-updater.mjs CANDIDATE_FOLDER RESULTS_FOLDER
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {updaterNames, clientsKey, updaterFolder, registeredApps} from '../windows/updater-check.mjs';

const [candidateFolder, resultsFolder] = process.argv.slice(2);
if (!candidateFolder || !resultsFolder) throw Error('Usage: windows-updater.mjs CANDIDATE_FOLDER RESULTS_FOLDER');
if (process.platform !== 'win32') throw Error('The updater check runs on Windows');
const directory = path.resolve(candidateFolder), out = path.resolve(resultsFolder);
if (fs.existsSync(out)) throw Error('Refusing to overwrite earlier results');
fs.mkdirSync(out, {recursive: true});
const candidate = JSON.parse(fs.readFileSync(path.join(directory, 'candidate.json'), 'utf8'));
if (candidate.channel !== 'beta') throw Error('The updater check is for a beta candidate');
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const names = updaterNames(fs.readFileSync(path.join(repo, 'blanc/branding/win-beta/updater.gni'), 'utf8'));
const local = process.env.LOCALAPPDATA, folder = updaterFolder(local, names);
const record = {candidate: candidate.id, names, checks: {}, details: {}};

function regValues(key) {
  const r = spawnSync('reg.exe', ['query', key], {encoding: 'utf8'});
  if (r.status !== 0) return null;
  const values = {};
  for (const line of r.stdout.split(/\r?\n/)) { const m = /^\s{4}(.*?)\s{4}REG_\w+\s{4}?(.*)$/.exec(line); if (m) values[m[1]] = m[2]; }
  return values;
}
const updaterExe = () => {
  if (!fs.existsSync(folder)) return null;
  const versions = fs.readdirSync(folder).filter(name => /^\d+(\.\d+)+$/.test(name));
  return versions.map(v => path.join(folder, v, 'updater.exe')).find(f => fs.existsSync(f)) ?? null;
};
const tail = (file, pattern, n = 30) => fs.existsSync(file)
  ? fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(l => pattern.test(l)).slice(-n) : [];

let failure = null;
try {
  // 1. The updater, per user (no --system), from its setup program.
  // A Windows profile normally has HKCU\\...\\CurrentVersion\\Run, which the
  // updater's setup writes its startup entry into; a fresh runner profile
  // may not, and setup then rolls back (error 75044). Record it and create it.
  const runKey = 'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
  record.details.runKeyExisted = spawnSync('reg.exe', ['query', runKey], {stdio: 'ignore'}).status === 0;
  spawnSync('reg.exe', ['add', runKey, '/f'], {stdio: 'ignore'});
  const setup = spawnSync(path.join(directory, 'UpdaterSetup.exe'), ['--install', '--silent', '--enable-logging'], {timeout: 300000});
  record.details.setupExit = setup.status;
  const exe = updaterExe();
  record.details.updater = exe;
  record.checks.updaterInstalled = setup.status === 0 && !!exe;

  // 2. The beta, per user, not launched.
  const install = spawnSync(path.join(directory, 'mini_installer.exe'), ['--do-not-launch-chrome', '--verbose-logging'], {timeout: 600000});
  record.details.installerExit = install.status;
  record.checks.betaInstalled = install.status === 0;
  const clients = regValues(clientsKey(names));
  record.details.clients = clients;
  record.checks.registeredUnderBlancUpdater = clients?.pv === candidate.version;
  const google = `HKEY_CURRENT_USER\\Software\\Google\\Update\\Clients\\${names.browserAppId}`;
  record.checks.notUnderGoogleUpdate = regValues(google) === null;

  // 3. Woken, the updater takes the beta into its records.
  if (exe) {
    const wake = spawnSync(exe, ['--wake', '--enable-logging'], {timeout: 300000});
    record.details.wakeExit = wake.status;
  }
  const prefs = path.join(folder, 'prefs.json');
  const apps = fs.existsSync(prefs) ? registeredApps(fs.readFileSync(prefs, 'utf8')) : [];
  record.details.registeredApps = apps;
  record.checks.updaterTakesTheBeta = apps.includes(names.browserAppId.toLowerCase());
  record.details.updaterLog = tail(path.join(folder, 'updater.log'), /blanc\.day|legacy|Registering app|update check|ERROR/i);
} catch (error) { failure = error; record.error = String(error.stack || error); }
finally {
  // Best effort: leave the runner as it was.
  // Whatever version is installed now (the updater may have moved it).
  const application = path.join(local, 'Blanc Beta', 'Application');
  for (const version of fs.existsSync(application) ? fs.readdirSync(application).filter(n => /^\d/.test(n)) : []) {
    const installed = path.join(application, version, 'Installer', 'setup.exe');
    if (fs.existsSync(installed)) spawnSync(installed, ['--uninstall', '--force-uninstall'], {timeout: 300000});
  }
  const exe = updaterExe();
  if (exe) spawnSync(exe, ['--uninstall'], {timeout: 300000});
}
const required = ['updaterInstalled', 'betaInstalled', 'registeredUnderBlancUpdater', 'notUnderGoogleUpdate', 'updaterTakesTheBeta'];
record.pass = !failure && required.every(name => record.checks[name] === true);
fs.writeFileSync(path.join(out, 'updater.json'), JSON.stringify(record, null, 2) + '\n');
console.log(JSON.stringify(record, null, 2));
if (!record.pass) process.exitCode = 1;
