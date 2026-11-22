// The N-to-N+1 proof for Blanc Beta on Windows (W3 Task D2), on a runner:
// Electron Blanc as people have it, Blanc's updater, then beta N; the updater
// is woken and asks https://blanc.day/update/win/v4, which offers what the
// update server's release.json names. With --expect=VERSION the beta must
// become that version (installed, registered, launching); with
// --expect-refused the package on offer must be refused and N keep working.
// With --online=VERSION (Task E1) only Blanc's updater setup runs, tagged for
// the beta as the online installer is, and it must install that version from
// blanc.day by itself. Either way Electron Blanc is untouched.
//
//   node chromium/tests/windows-update-proof.mjs CANDIDATE_N RESULTS SHIPPING_INSTALLER (--expect=V | --expect-refused | --online=V)
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn, spawnSync, execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {updaterNames, clientsKey, updaterFolder, installTag} from '../windows/updater-check.mjs';

const [candidateFolder, resultsFolder, shippingInstaller, mode, ...extra] = process.argv.slice(2);
// Online mode only: --setup=PATH runs that setup (a repacked or signed one)
// instead of the candidate's; --tagged gives it no tag on the command line, so
// it must read its own (the signed, tagged online installer).
const setupOption = extra.find(o => o.startsWith('--setup='))?.slice('--setup='.length) ?? null;
const tagged = extra.includes('--tagged');
// The release's staging gate (W3 Task E1): Chromium's test setup, whose updater
// reads overrides.json, pointed at the staging update server instead of
// blanc.day. Same keys, same packages; only the address differs.
const staging = extra.find(o => o.startsWith('--staging='))?.slice('--staging='.length) ?? null;
if (staging && !/^https:\/\/[a-z0-9.-]+\.workers\.dev$/.test(staging)) throw Error(`--staging must be a workers.dev address: ${staging}`);
if (extra.some(o => !o.startsWith('--setup=') && o !== '--tagged' && !o.startsWith('--staging='))) throw Error(`Unknown option: ${extra.join(' ')}`);
if (staging && setupOption) throw Error('--staging installs with the test setup, which reads overrides.json; --setup does not apply.');
const defaultSetup = staging ? 'UpdaterSetup_test.exe' : 'UpdaterSetup.exe';
const expect = mode?.startsWith('--expect=') ? mode.slice('--expect='.length) : null;
const online = mode?.startsWith('--online=') ? mode.slice('--online='.length) : null;
if (!candidateFolder || !resultsFolder || !shippingInstaller || !(expect || online || mode === '--expect-refused'))
  throw Error('Usage: windows-update-proof.mjs CANDIDATE_N RESULTS SHIPPING_INSTALLER (--expect=V | --expect-refused | --online=V)');
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
const record = {candidate: candidate.id, from: candidate.version, mode: online ? `online ${online}` : expect ? `expect ${expect}` : 'expect refused', checks: {}, details: {}};
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
let relay = null;
try {
  // A clean runner: no beta and no Blanc updater before this proof.
  record.checks.cleanStart = !fs.existsSync(application) && !fs.existsSync(folder) && regValues(clientsKey(names)) === null;
  execFileSync(path.resolve(shippingInstaller), ['/S'], {stdio: 'ignore', timeout: 300000});
  for (let t = 0; t < 60 && !fs.existsSync(electronExe); t++) await pause(1000);
  await pause(3000); spawnSync('taskkill.exe', ['/F', '/T', '/IM', 'Blanc.exe'], {stdio: 'ignore'});
  const electronBefore = electronState();

  // A Windows profile normally has HKCU\\...\\CurrentVersion\\Run, which the
  // updater's setup writes its startup entry into; a fresh runner profile
  // may not, and setup then rolls back (error 75044). Record it and create it.
  const runKey = 'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
  record.details.runKeyExisted = spawnSync('reg.exe', ['query', runKey], {stdio: 'ignore'}).status === 0;
  spawnSync('reg.exe', ['add', runKey, '/f'], {stdio: 'ignore'});
  if (staging) {
    // The test updater accepts only a localhost update address
    // (external_constants_override.cc CheckURL), so a local relay carries its
    // update checks to the staging server unchanged (tests/lib/update-relay.mjs).
    const portFile = path.join(os.tmpdir(), `blanc-update-relay-${process.pid}.port`);
    fs.rmSync(portFile, {force: true});
    relay = spawn(process.execPath, [fileURLToPath(new URL('./lib/update-relay.mjs', import.meta.url)), staging, portFile], {stdio: 'ignore'});
    for (let t = 0; t < 30 && !fs.existsSync(portFile); t++) await pause(500);
    if (!fs.existsSync(portFile)) throw Error('The update relay did not start.');
    const relayUrl = `http://127.0.0.1:${fs.readFileSync(portFile, 'utf8').trim()}`;
    // overrides.json sits in the folder above the updater's install folder.
    fs.mkdirSync(path.dirname(folder), {recursive: true});
    fs.writeFileSync(path.join(path.dirname(folder), 'overrides.json'), JSON.stringify({url: [`${relayUrl}/update/win/v4`]}));
    record.details.staging = staging;
    record.details.relay = relayUrl;
  }
  if (online) {
    // The online installer: the updater's setup, tagged for the beta, alone.
    const tag = installTag(names);
    const setupFile = setupOption ? path.resolve(setupOption) : path.join(directory, defaultSetup);
    record.details.tag = tagged ? 'read from the file' : tag;
    record.details.setupFile = path.basename(setupFile);
    const setup = spawnSync(setupFile, [...(tagged ? [] : [`--install=${tag}`]), '--silent', '--enable-logging'], {timeout: 900000});
    record.details.installed = {setupExit: setup.status, pv: pv()};
    record.checks.updaterInstalled = setup.status === 0 && !!updaterExe();
    for (const deadline = Date.now() + 10 * 60000; Date.now() < deadline && pv() !== online;) await pause(5000);
    record.checks.versionIsExpected = pv() === online;
    record.checks.installedFolderPresent = fs.existsSync(path.join(application, online, 'chrome.dll'));
    // The installed bytes, so a release can bind this proof to its own signed files.
    const hash = file => fs.existsSync(file) ? crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') : null;
    record.details.installedSha256 = {exe: hash(path.join(application, 'chrome.exe')), dll: hash(path.join(application, online, 'chrome.dll'))};
    record.details.launch = await launches(online);
    record.checks.launches = record.details.launch.running === true;
    record.checks.electronUntouched = JSON.stringify(electronState()) === JSON.stringify(electronBefore);
    throw {online: true};
  }
  const setup = spawnSync(setupOption ? path.resolve(setupOption) : path.join(directory, defaultSetup), ['--install', '--silent', '--enable-logging'], {timeout: 300000});
  const install = spawnSync(path.join(directory, 'mini_installer.exe'), ['--do-not-launch-chrome', '--verbose-logging'], {timeout: 600000});
  record.details.installed = {setupExit: setup.status, installerExit: install.status, pv: pv()};
  record.checks.startsAtN = setup.status === 0 && install.status === 0 && pv() === candidate.version;

  // Wake the updater: it registers the beta, asks blanc.day, and installs any
  // offered package in the background. Wait for its verdict.
  const exe = updaterExe();
  if (!exe) throw new Error(`Blanc's updater did not install (UpdaterSetup exit ${setup.status})`);
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
} catch (error) { if (!error?.online) { failure = error; record.error = String(error.stack || error); } }
finally {
  relay?.kill();
  const log = path.join(folder, 'updater.log');
  if (fs.existsSync(log) && !fs.existsSync(path.join(out, 'updater.log'))) fs.copyFileSync(log, path.join(out, 'updater.log'));
  const exe = updaterExe();
  if (exe) spawnSync(exe, ['--uninstall'], {timeout: 300000});
}
record.pass = !failure && Object.values(record.checks).length > 0 && Object.values(record.checks).every(v => v === true);
fs.writeFileSync(path.join(out, 'update-proof.json'), JSON.stringify(record, null, 2) + '\n');
console.log(JSON.stringify(record, null, 2));
if (!record.pass) process.exitCode = 1;
