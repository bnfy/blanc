'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  onePasswordAppCandidates,
  findOnePasswordApp,
  pathExists,
  launchEnvironment,
  openOnePasswordApp,
} = require('../../src/main/onepassword-app');

const WINDOWS_ENV = {
  LOCALAPPDATA: 'C:\\Users\\alice\\AppData\\Local',
  ProgramFiles: 'C:\\Program Files',
  'ProgramFiles(x86)': 'C:\\Program Files (x86)',
};

test('each supported platform has fixed 1Password app locations', () => {
  assert.deepEqual(onePasswordAppCandidates({ platform: 'darwin', env: {} }),
    ['/Applications/1Password.app']);
  assert.deepEqual(onePasswordAppCandidates({ platform: 'win32', env: WINDOWS_ENV }), [
    'C:\\Users\\alice\\AppData\\Local\\1Password\\app\\8\\1Password.exe',
    'C:\\Program Files\\1Password\\app\\8\\1Password.exe',
    'C:\\Program Files (x86)\\1Password\\app\\8\\1Password.exe',
  ]);
  // The Snap is absent: SDK 0.5.0 cannot load the IPC library from it.
  assert.deepEqual(onePasswordAppCandidates({ platform: 'linux', env: {} }),
    ['/opt/1Password/1password']);
  assert.deepEqual(onePasswordAppCandidates({ platform: 'freebsd', env: {} }), []);
});

test('Windows ignores missing or relative install roots from the environment', () => {
  assert.deepEqual(onePasswordAppCandidates({
    platform: 'win32',
    env: { LOCALAPPDATA: 'relative\\dir', ProgramFiles: 'C:\\Program Files' },
  }), ['C:\\Program Files\\1Password\\app\\8\\1Password.exe']);
});

test('detection returns the first existing location and treats errors as absent', () => {
  const seen = [];
  const found = findOnePasswordApp({
    platform: 'win32',
    env: WINDOWS_ENV,
    exists: (candidate) => {
      seen.push(candidate);
      if (candidate.startsWith('C:\\Users')) throw new Error('EACCES');
      return candidate.startsWith('C:\\Program Files\\');
    },
  });
  assert.equal(found, 'C:\\Program Files\\1Password\\app\\8\\1Password.exe');
  assert.equal(seen.length, 2);
  assert.equal(findOnePasswordApp({ platform: 'linux', env: {}, exists: () => false }), null);
});

// #701: 1Password's MSIX package (its MSIX installer and Microsoft Store
// listing) installs under WindowsApps, which users can't list. Its fixed
// handle is the per-package app execution alias.
const ALIASES = 'C:\\Users\\alice\\AppData\\Local\\Microsoft\\WindowsApps';

test('Windows adds the MSIX alias for any Agilebits.1Password package after the classic locations', () => {
  const listed = [];
  const candidates = onePasswordAppCandidates({
    platform: 'win32',
    env: WINDOWS_ENV,
    listDir: (dir) => {
      listed.push(dir);
      return [
        '1Password.exe', // the global alias any package can claim
        'Agilebits.1Password_amwd9z03whsfe',
        'Agilebits.1Password_gh85et3mt782r', // an earlier publisher id
        'Agilebits.1PasswordBeta_amwd9z03whsfe',
        'Agilebits.1Password_tooshort',
        'Lookalike.1Password_amwd9z03whsfe',
      ];
    },
  });
  assert.deepEqual(listed, [ALIASES]);
  assert.deepEqual(candidates, [
    'C:\\Users\\alice\\AppData\\Local\\1Password\\app\\8\\1Password.exe',
    'C:\\Program Files\\1Password\\app\\8\\1Password.exe',
    'C:\\Program Files (x86)\\1Password\\app\\8\\1Password.exe',
    `${ALIASES}\\Agilebits.1Password_amwd9z03whsfe\\1Password.exe`,
    `${ALIASES}\\Agilebits.1Password_gh85et3mt782r\\1Password.exe`,
  ]);
});

test('an unreadable or unusable alias folder adds no MSIX candidates', () => {
  const classic = onePasswordAppCandidates({ platform: 'win32', env: WINDOWS_ENV });
  assert.deepEqual(onePasswordAppCandidates({
    platform: 'win32',
    env: WINDOWS_ENV,
    listDir: () => { throw new Error('ENOENT'); },
  }), classic);
  assert.deepEqual(onePasswordAppCandidates({
    platform: 'win32',
    env: { LOCALAPPDATA: 'relative\\dir' },
    listDir: () => assert.fail('a relative LOCALAPPDATA is never listed'),
  }), []);
});

test('detection finds the MSIX alias when no classic install exists', () => {
  const alias = `${ALIASES}\\Agilebits.1Password_amwd9z03whsfe\\1Password.exe`;
  assert.equal(findOnePasswordApp({
    platform: 'win32',
    env: WINDOWS_ENV,
    listDir: () => ['Agilebits.1Password_amwd9z03whsfe'],
    exists: (candidate) => candidate === alias,
  }), alias);
});

// An app execution alias is a reparse point Windows won't open as a file, so
// a stat through it fails and fs.existsSync reports it missing. Detection
// checks the entry itself, the way a link that can't be followed still is.
test('default detection counts an entry that exists even when it cannot be followed', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-1p-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const link = path.join(dir, '1Password.exe');
  try {
    fs.symlinkSync(path.join(dir, 'missing-target'), link);
  } catch (error) {
    if (error.code !== 'EPERM') throw error;
    t.skip('this Windows account cannot create symlinks');
    return;
  }
  assert.equal(fs.existsSync(link), false, 'the stat-based check misses it');
  assert.equal(pathExists(link), true);
  assert.equal(pathExists(path.join(dir, 'absent')), false);
});

test('main uses the default, alias-aware detection', () => {
  const main = fs.readFileSync(path.join(__dirname, '../../src/main/main.js'), 'utf8');
  const calls = main.match(/findOnePasswordApp\([^)]*\)/g) ?? [];
  assert.ok(calls.length >= 2, 'main detects the app for the hint and for Open 1Password');
  for (const call of calls) assert.equal(call, 'findOnePasswordApp()');
});

test('Linux starts the detected binary detached with no arguments', () => {
  const calls = [];
  const child = { on: () => child, unref: () => calls.push('unref') };
  const opened = openOnePasswordApp({
    platform: 'linux',
    appPath: '/opt/1Password/1password',
    shell: { openPath: () => assert.fail('xdg-open would not run the binary') },
    spawn: (file, args, options) => { calls.push({ file, args, options }); return child; },
    env: { HOME: '/home/alice', DISPLAY: ':0', LD_LIBRARY_PATH: '/tmp/.mount_Blanc/usr/lib' },
    cwd: '/home/alice',
  });
  assert.equal(opened, true);
  assert.deepEqual(calls, [
    {
      file: '/opt/1Password/1password',
      args: [],
      options: {
        cwd: '/home/alice', detached: true, stdio: 'ignore', env: { HOME: '/home/alice', DISPLAY: ':0' },
      },
    },
    'unref',
  ]);
});

test('the Linux launch drops AppImage, loader and Electron overrides only', () => {
  assert.deepEqual(launchEnvironment({
    HOME: '/home/alice',
    PATH: '/usr/bin',
    XAUTHORITY: '/run/user/1000/xauth',
    WAYLAND_DISPLAY: 'wayland-0',
    LANG: 'fr_FR.UTF-8',
    LD_LIBRARY_PATH: '/tmp/.mount_Blanc/usr/lib',
    LD_PRELOAD: '/tmp/evil.so',
    APPDIR: '/tmp/.mount_Blanc',
    APPIMAGE: '/home/alice/Blanc.AppImage',
    ARGV0: 'Blanc.AppImage',
    OWD: '/home/alice',
    ELECTRON_RUN_AS_NODE: '1',
  }), {
    HOME: '/home/alice',
    PATH: '/usr/bin',
    XAUTHORITY: '/run/user/1000/xauth',
    WAYLAND_DISPLAY: 'wayland-0',
    LANG: 'fr_FR.UTF-8',
  });
});

test('the Linux launch strips AppImage mount entries from search-path lists', () => {
  assert.deepEqual(launchEnvironment({
    APPDIR: '/tmp/.mount_BlancX',
    PATH: '/tmp/.mount_BlancX:/tmp/.mount_BlancX/usr/sbin:/home/alice/bin:/usr/bin',
    XDG_DATA_DIRS: './share/:/tmp/.mount_BlancX/usr/share:/usr/local/share/:/usr/share/',
    GSETTINGS_SCHEMA_DIR: '/tmp/.mount_BlancX/usr/share/glib-2.0/schemas',
  }), {
    PATH: '/home/alice/bin:/usr/bin',
    XDG_DATA_DIRS: '/usr/local/share/:/usr/share/',
  });
  // A sibling directory that merely shares the mount's prefix is kept.
  assert.deepEqual(launchEnvironment({ PATH: '/tmp/.mount_BlancXY/bin', APPDIR: '/tmp/.mount_BlancX' }),
    { PATH: '/tmp/.mount_BlancXY/bin' });
});

test('macOS and Windows open the detected app through the shell', async () => {
  for (const [platform, appPath] of [
    ['darwin', '/Applications/1Password.app'],
    ['win32', 'C:\\Program Files\\1Password\\app\\8\\1Password.exe'],
  ]) {
    const opened = [];
    assert.equal(openOnePasswordApp({
      platform,
      appPath,
      shell: { openPath: async (value) => { opened.push(value); return ''; } },
      spawn: () => assert.fail('the shell launches the app here'),
    }), true);
    assert.deepEqual(opened, [appPath]);
  }
});

test('nothing opens when no app was detected', () => {
  assert.equal(openOnePasswordApp({
    platform: 'linux',
    appPath: null,
    shell: { openPath: () => assert.fail('nothing to open') },
    spawn: () => assert.fail('nothing to start'),
  }), false);
});
