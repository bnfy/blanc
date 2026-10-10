'use strict';

const os = require('node:os');
const path = require('node:path');

// Where the 1Password desktop app installs on each supported platform. This
// only drives Settings' soft "installed" hint and its Open 1Password button:
// Verify (an authenticated SDK call) stays the authoritative check, so a
// missed custom install location degrades to a hint, never a broken fill.
function onePasswordAppCandidates({ platform = process.platform, env = process.env } = {}) {
  if (platform === 'darwin') return ['/Applications/1Password.app'];
  if (platform === 'win32') {
    const roots = [
      env.LOCALAPPDATA,
      env.ProgramFiles,
      env['ProgramFiles(x86)'],
    ].filter((root) => typeof root === 'string' && path.win32.isAbsolute(root));
    return roots.map((root) => path.win32.join(root, '1Password', 'app', '8', '1Password.exe'));
  }
  // The deb, rpm and tarball installs. The Snap is deliberately absent: pinned
  // SDK 0.5.0 cannot load 1Password's IPC library from it, so reporting it as
  // installed would promise a fill that always fails.
  if (platform === 'linux') return ['/opt/1Password/1password'];
  return [];
}

function findOnePasswordApp({ platform, env, exists } = {}) {
  for (const candidate of onePasswordAppCandidates({ platform, env })) {
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
  launchEnvironment,
  openOnePasswordApp,
};
