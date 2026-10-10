'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// 1Password's MSIX package (its MSIX installer and Microsoft Store listing)
// installs under WindowsApps, which users can't list and whose folder name
// carries the version. Its fixed handle is the per-package app execution
// alias. The publisher-id suffix has changed between 1Password releases, so
// any Agilebits.1Password package counts (#701).
const MSIX_ALIAS_FOLDER = /^Agilebits\.1Password_[0-9a-z]{13}$/i;

// Where the 1Password desktop app installs on each supported platform. This
// only drives Settings' soft "installed" hint and its Open 1Password button:
// Verify (an authenticated SDK call) stays the authoritative check, so a
// missed custom install location degrades to a hint, never a broken fill.
function onePasswordAppCandidates({
  platform = process.platform, env = process.env, listDir = () => [],
} = {}) {
  if (platform === 'darwin') return ['/Applications/1Password.app'];
  if (platform === 'win32') {
    const roots = [
      env.LOCALAPPDATA,
      env.ProgramFiles,
      env['ProgramFiles(x86)'],
    ].filter((root) => typeof root === 'string' && path.win32.isAbsolute(root));
    const candidates = roots.map((root) => path.win32.join(root, '1Password', 'app', '8', '1Password.exe'));
    if (typeof env.LOCALAPPDATA === 'string' && path.win32.isAbsolute(env.LOCALAPPDATA)) {
      const aliases = path.win32.join(env.LOCALAPPDATA, 'Microsoft', 'WindowsApps');
      let names = [];
      try {
        names = listDir(aliases);
      } catch {
        // An unreadable alias folder adds nothing.
      }
      for (const name of names) {
        if (MSIX_ALIAS_FOLDER.test(name)) candidates.push(path.win32.join(aliases, name, '1Password.exe'));
      }
    }
    return candidates;
  }
  // The deb, rpm and tarball installs. The Snap is deliberately absent: pinned
  // SDK 0.5.0 cannot load 1Password's IPC library from it, so reporting it as
  // installed would promise a fill that always fails.
  if (platform === 'linux') return ['/opt/1Password/1password'];
  return [];
}

// lstat, not fs.existsSync: on Windows existsSync also stats through reparse
// points, and an app execution alias refuses that open
// (ERROR_CANT_ACCESS_FILE), so the MSIX alias would read as missing.
function pathExists(candidate) {
  return fs.lstatSync(candidate, { throwIfNoEntry: false }) !== undefined;
}

function findOnePasswordApp({
  platform, env, exists = pathExists, listDir = fs.readdirSync,
} = {}) {
  for (const candidate of onePasswordAppCandidates({ platform, env, listDir })) {
    try {
      if (exists(candidate)) return candidate;
    } catch {
      // An unreadable location is treated as absent.
    }
  }
  return null;
}

// Blanc's own launch context must not leak into 1Password, itself an Electron
// app: an AppImage runtime exports its mount point and prepends paths inside it
// to search-path lists, and Electron/loader overrides would change how
// 1Password starts. Search-path entries inside the mount, or relative ones,
// are removed; the user's own entries are kept.
const SEARCH_PATH_LISTS = ['PATH', 'XDG_DATA_DIRS', 'GSETTINGS_SCHEMA_DIR'];

function launchEnvironment(source = process.env) {
  const mount = typeof source.APPDIR === 'string' && source.APPDIR ? source.APPDIR : null;
  const insideMount = (entry) => mount !== null
    && (entry === mount || entry.startsWith(`${mount.replace(/\/+$/, '')}/`));
  const env = {};
  for (const [name, value] of Object.entries(source)) {
    if (/^(?:LD_|ELECTRON_)/.test(name) || ['APPDIR', 'APPIMAGE', 'ARGV0', 'OWD'].includes(name)) continue;
    if (SEARCH_PATH_LISTS.includes(name) && typeof value === 'string') {
      const kept = value.split(':').filter((entry) => path.posix.isAbsolute(entry) && !insideMount(entry));
      if (kept.length) env[name] = kept.join(':');
      continue;
    }
    env[name] = value;
  }
  return env;
}

// Opens only a path findOnePasswordApp() returned — a fixed install location,
// never page- or user-supplied input, and with no arguments. macOS and Windows
// launch it through the shell; Linux would hand an executable to xdg-open,
// which opens it as a file rather than running it, so the binary is started
// directly and detached from Blanc, from the home directory so it never holds
// Blanc's working directory (possibly inside an AppImage mount) open.
function openOnePasswordApp({
  platform = process.platform, appPath, shell, spawn, env = process.env, cwd = os.homedir(),
}) {
  if (typeof appPath !== 'string' || !appPath) return false;
  if (platform === 'linux') {
    const child = spawn(appPath, [], {
      cwd, detached: true, stdio: 'ignore', env: launchEnvironment(env),
    });
    child.on?.('error', () => {});
    child.unref?.();
    return true;
  }
  shell.openPath(appPath).catch(() => {});
  return true;
}

module.exports = {
  onePasswordAppCandidates,
  findOnePasswordApp,
  pathExists,
  launchEnvironment,
  openOnePasswordApp,
};
