// What a person sees when they run Blanc Beta's online installer (W3 Task E1
// branding): the setup runs as from a double-click (no --silent), and the
// desktop is captured every 2 s for a minute: splash, progress, completion.
// The unsigned setup takes its tag on the command line; with --tagged (a
// signed, tagged setup) it reads its own.
// Once the install window shows its logo, its taskbar icon must be its plain
// app icon (owner, 2026-11-21: "plain Sunrise"), read by
// chromium/windows/installer-window-icon.ps1; otherwise the check fails.
//
//   node chromium/tests/windows-installer-capture.mjs CANDIDATE RESULTS [--setup=PATH] [--tagged] [--dark]
import fs from 'node:fs';
import path from 'node:path';
import {spawn, spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {desktopCapture} from './lib/windows-desktop.mjs';
import {updaterNames, installTag} from '../windows/updater-check.mjs';
import {iconVerdict} from './lib/installer-icon.mjs';

const [candidateFolder, resultsFolder, ...options] = process.argv.slice(2);
if (!candidateFolder || !resultsFolder) throw Error('Usage: windows-installer-capture.mjs CANDIDATE RESULTS [--setup=PATH] [--tagged] [--dark]');
if (process.platform !== 'win32') throw Error('The installer capture runs on Windows');
const out = path.resolve(resultsFolder);
if (fs.existsSync(out)) throw Error('Refusing to overwrite earlier results');
fs.mkdirSync(out, {recursive: true});
const setupFile = path.resolve(options.find(o => o.startsWith('--setup='))?.slice('--setup='.length) ?? path.join(candidateFolder, 'UpdaterSetup.exe'));
const tagged = options.includes('--tagged'), dark = options.includes('--dark');
const names = updaterNames(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'blanc/branding/win-beta/updater.gni'), 'utf8'));
const pause = ms => new Promise(r => setTimeout(r, ms));
const personalize = 'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize';
// As in the proof: the updater's setup needs HKCU's Run key.
spawnSync('reg.exe', ['add', 'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Run', '/f'], {stdio: 'ignore'});
if (dark) spawnSync('reg.exe', ['add', personalize, '/v', 'AppsUseLightTheme', '/t', 'REG_DWORD', '/d', '0', '/f'], {stdio: 'ignore'});
const child = spawn(setupFile, [...(tagged ? [] : [`--install=${installTag(names)}`]), '--enable-logging'], {detached: true, stdio: 'ignore'});
const shots = [];
const probe = fileURLToPath(new URL('../windows/installer-window-icon.ps1', import.meta.url));
const iconFolder = path.join(out, 'icon');
let icon = null;
for (let i = 0; i < 30; i++) {
  await pause(2000);
  const file = path.join(out, `shot-${String(i).padStart(2, '0')}.png`);
  if (desktopCapture(file)) shots.push(path.basename(file));
  if (!icon && spawnSync('pwsh', ['-NoProfile', '-File', probe, '-Out', iconFolder], {stdio: 'inherit'}).status === 0)
    icon = JSON.parse(fs.readFileSync(path.join(iconFolder, 'icon.json'), 'utf8').replace(/^\uFEFF/, ''));
}
for (const image of ['UpdaterSetup.exe', path.basename(setupFile), 'updater.exe', 'chrome.exe'])
  spawnSync('taskkill.exe', ['/F', '/T', '/IM', image], {stdio: 'ignore'});
const verdict = iconVerdict(icon);
const record = {setup: path.basename(setupFile), tagged, dark, exited: child.exitCode, shots, icon, iconVerdict: verdict};
fs.writeFileSync(path.join(out, 'capture.json'), JSON.stringify(record, null, 2) + '\n');
console.log(JSON.stringify(record));
if (!verdict.ok) { console.error(`Installer icon: ${verdict.reason}`); process.exitCode = 1; }
