// Disposable install-check fixtures. The shipping AppImage's own Start Page,
// profile and clean browser exit are the evidence for the two x64 launches.
import assert from 'node:assert/strict';
import {execFileSync, spawn} from 'node:child_process';
import {createHash, randomBytes} from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import {connect, waitFor} from './cdp.mjs';

const shippingVersion = '1.51.0';
// docs/release-incidents/2026-11-18-v1.51.0.md, public asset digest.
const appImageHash = 'd3f3816365d7cc53d11e6d84300d4b89d377e37e63f6582483081e784f442892';
const schema = 'chrome_libsecret_os_crypt_password_v2';
// v1.51.0 package.json productName; Electron 45.2.1
// ElectronBrowserMainParts::PostCreateMainMessageLoop passes GetName() as
// Config.application_name. Its libsecret backend stores that case-sensitive value.
const applications = ['Blanc', 'chromium'];
const aptSources = '/etc/apt/sources.list.d';
const googleFixtures = {
  '/etc/apt/sources.list.d/google-chrome.list': 'deb [arch=amd64] https://dl.google.com/linux/chrome/deb/ stable main\n',
  '/etc/apt/sources.list.d/google-chrome.sources': 'Types: deb\nURIs: https://dl.google.com/linux/chrome/deb/\nSuites: stable\nComponents: main\nEnabled: no\n',
  '/etc/yum.repos.d/google-chrome.repo': '[google-chrome]\nname=Google Chrome\nbaseurl=https://dl.google.com/linux/chrome/rpm/stable/$basearch\nenabled=0\ngpgcheck=1\n',
};
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const run = (cmd, args, options = {}) => execFileSync(cmd, args, {encoding: 'utf8', timeout: 30000, ...options});
const config = name => path.join(process.env.XDG_CONFIG_HOME, name);

// The RPM installer re-armors the key and can add its own Comment header.
export function assertEnrolledKey(installed, owner, rpm) {
  const packets = file => execFileSync('gpg', ['--no-options', '--batch', '--dearmor'], {input: fs.readFileSync(file)});
  assert.ok((rpm ? packets(installed) : fs.readFileSync(installed)).equals(packets(owner)), 'Wrong enrolled key');
}

// Bound memory when hashing candidate archives and browser packages.
export function hashFile(file) {
  const hash = createHash('sha256');
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  const fd = fs.openSync(file, 'r');
  try {
    let size;
    while ((size = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0) hash.update(buffer.subarray(0, size));
    return hash.digest('hex');
  } finally { fs.closeSync(fd); }
}

export function googleRepoSnapshot(root = '/') {
  const apt = path.join(root, aptSources);
  const names = fs.existsSync(apt) ? fs.readdirSync(apt) : [];
  const snapshot = {};
  for (const name of names.filter(name => /\.(?:sources|list)$/.test(name))) {
    const bytes = fs.readFileSync(path.join(apt, name));
    if (/^google-chrome(?:-[\w-]+)?\./.test(name) ||
        /https?:\/\/dl(?:-ssl)?\.google\.com\/linux\/chrome(?:-[\w-]+)?\/deb\b/.test(bytes.toString('utf8'))) {
      snapshot[path.posix.join(aptSources, name)] = sha(bytes);
    }
  }
  const yum = '/etc/yum.repos.d/google-chrome.repo';
  if (fs.existsSync(path.join(root, yum))) snapshot[yum] = sha(fs.readFileSync(path.join(root, yum)));
  return snapshot;
}

// dbus-run-session and all services it activates must see the disposable home.
export function sessionEnvironment(home, parent = process.env) {
  fs.mkdirSync(home, {mode: 0o700});
  const runtime = path.join(home, 'runtime');
  fs.mkdirSync(runtime, {mode: 0o700});
  const env = {...parent, HOME: home, XDG_CONFIG_HOME: path.join(home, '.config'), XDG_DATA_HOME: path.join(home, '.local/share'),
    XDG_CACHE_HOME: path.join(home, '.cache'), XDG_STATE_HOME: path.join(home, '.local/state'), XDG_RUNTIME_DIR: runtime,
    XDG_CURRENT_DESKTOP: 'GNOME', GSETTINGS_BACKEND: 'keyfile', LC_ALL: 'C'};
  for (const key of ['DBUS_SESSION_BUS_ADDRESS', 'DBUS_STARTER_ADDRESS', 'DBUS_STARTER_BUS_TYPE', 'GNOME_KEYRING_CONTROL',
    'CHROME_CONFIG_HOME', 'CHROME_USER_DATA_DIR', 'CHROME_DESKTOP', 'BROWSER']) delete env[key];
  fs.mkdirSync(env.XDG_CONFIG_HOME, {mode: 0o700});
  return env;
}

export function profileDigest(dir) {
  const hash = createHash('sha256');
  function walk(folder) {
    for (const name of fs.readdirSync(folder).sort()) {
      const file = path.join(folder, name);
      const stat = fs.lstatSync(file);
      let value;
      if (stat.isSymbolicLink()) value = ['link', fs.readlinkSync(file)];
      else if (stat.isFile()) value = ['file', sha(fs.readFileSync(file))];
      else if (stat.isDirectory()) value = ['directory'];
      else throw Error('Unexpected profile entry: ' + file);
      hash.update(JSON.stringify([path.relative(dir, file), ...value]) + '\n');
      if (stat.isDirectory()) walk(file);
    }
  }
  walk(dir);
  return hash.digest('hex');
}

export function defaultBrowser() {
  return run('xdg-settings', ['get', 'default-web-browser']).trim();
}
export function seedDefaultBrowser() {
  run('xdg-settings', ['set', 'default-web-browser', 'chromium.desktop']);
  assert.equal(defaultBrowser(), 'chromium.desktop');
}

function keyringDigest(application) {
  const value = run('secret-tool', ['lookup', 'application', application, 'xdg:schema', schema]);
  assert.ok(value.length, 'No disposable keyring item for ' + application);
  return sha(value);
}

export function seedSnapshot() {
  return {
    appimageProfile: profileDigest(config('Blanc')),
    chromiumProfile: profileDigest(config('chromium')),
    keyring: applications.map(keyringDigest),
    defaultBrowser: defaultBrowser(),
    googleRepoFiles: googleRepoSnapshot(),
  };
}

// An unprivileged extract-and-run cannot install the AppImage's setuid sandbox
// helper. Ubuntu restricts user namespaces, so stage that exact helper for the
// shipping control only. The root-owned input is rehashed before extraction.
function prepareShippingHelper(file, tmp, trusted) {
  const image = path.join(trusted, 'shipping.AppImage');
  run('sudo', ['-n', 'install', '-m', '0644', file, image]);
  assert.equal(run('sudo', ['-n', 'sha256sum', image]).split(' ')[0], appImageHash);
  const offset = run(file, ['--appimage-offset']).trim();
  assert.match(offset, /^[1-9]\d*$/);
  const payload = path.join(trusted, 'payload');
  run('sudo', ['-n', 'unsquashfs', '-no-progress', '-no-xattrs', '-o', offset, '-dest', payload, image, 'chrome-sandbox']);
  const helper = path.join(payload, 'chrome-sandbox');
  run('sudo', ['-n', 'chown', 'root:root', payload, helper]);
  run('sudo', ['-n', 'chmod', '4755', helper]);
  run('sudo', ['-n', 'chmod', '0755', payload, trusted]);
  assert.ok(fs.lstatSync(helper).isFile() && fs.statSync(helper).uid === 0);

  // The shipped AppRun supports extraction without starting Electron. Prime its
  // private cache, then let the actual AppImage runtime launch the browser.
  run(file, [], {env: {...process.env, TMPDIR: tmp, APPIMAGE_EXTRACT_AND_RUN: '1', NO_CLEANUP: '1', APPIMAGE_EXIT_AFTER_INSTALL: '1'}, timeout: 120000});
  const caches = fs.readdirSync(tmp).filter(name => name.startsWith('appimage_extracted_'));
  assert.equal(caches.length, 1);
  const unprivileged = path.join(tmp, caches[0], 'chrome-sandbox');
  assert.equal(run('sha256sum', [unprivileged]).split(' ')[0], run('sha256sum', [helper]).split(' ')[0]);
  fs.unlinkSync(unprivileged);
  fs.symlinkSync(helper, unprivileged);
}

export async function launchAppImage(file, log) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-appimage-'));
  let trusted;
  try {
    if (/^ID="?ubuntu"?$/m.test(fs.readFileSync('/etc/os-release', 'utf8'))) {
      trusted = run('sudo', ['-n', 'mktemp', '-d', '/opt/blanc-shipping-XXXXXXXX']).trim();
      prepareShippingHelper(file, tmp, trusted);
    }
    await openShippingWindow(file, log, tmp);
  } finally {
    if (trusted) run('sudo', ['-n', 'rm', '-rf', '--', trusted]);
    fs.rmSync(tmp, {recursive: true, force: true});
  }
}

async function openShippingWindow(file, log, tmp) {
  const profile = config('Blanc');
  // Electron's public AppImage rehearsal connects on a TCP port. Only the
  // installed fork is required to publish DevToolsActivePort in its data dir.
  const listener = net.createServer();
  await new Promise((resolve, reject) => listener.once('error', reject).listen(0, '127.0.0.1', resolve));
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  const base = 'http://127.0.0.1:' + port;
  const fd = fs.openSync(log, 'wx');
  const child = spawn(file, ['--remote-debugging-address=127.0.0.1', '--remote-debugging-port=' + port, '--disable-gpu',
    '--proxy-server=http://127.0.0.1:9', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost'], {
    stdio: ['ignore', fd, fd], detached: true,
    env: {...process.env, TMPDIR: tmp, APPIMAGE_EXTRACT_AND_RUN: '1', APPIMAGE_SILENT_INSTALL: '1'},
  });
  fs.closeSync(fd);
  let spawnError;
  child.once('error', error => {spawnError = error;});
  try {
    const ready = async () => {
      if (spawnError || child.exitCode !== null || child.signalCode) return {exited: true};
      const targets = await fetch(base + '/json/list').then(r => r.json());
      const start = targets.find(t => t.url.startsWith('blanc://newtab/'));
      if (start) return {start};
    };
    const {start} = await waitFor(ready, Boolean, 'shipping Start Page', 90000);
    assert.ok(start, 'Shipping AppImage did not start: ' + (spawnError?.message ?? child.signalCode ?? child.exitCode));
    // A relaunch restores shipping's saved session, which can close the first
    // Start Page target, so read the version from whichever one is live.
    const startVersion = async () => {
      const targets = await fetch(base + '/json/list').then(r => r.json());
      let last;
      for (const target of targets.filter(t => t.type === 'page' && t.url.startsWith('blanc://newtab/'))) {
        let page;
        try {
          page = await connect(target);
          last = await page.eval("document.getElementById('version')?.textContent");
          if (last === 'v' + shippingVersion) return last;
        } catch (error) {
          last = error.message;
        } finally {
          page?.close();
        }
      }
      return last;
    };
    await waitFor(startVersion, v => v === 'v' + shippingVersion, 'shipping version');
    // Use shipping's real Quit accelerator, as in ecs-production-updater-linux.mjs.
    const [window] = run('xdotool', ['search', '--onlyvisible', '--class', '^[Bb]lanc$']).trim().split(/\s+/);
    assert.match(window, /^\d+$/);
    run('xdotool', ['windowfocus', '--sync', window, 'key', '--clearmodifiers', 'ctrl+q']);
    await waitFor(() => child.exitCode, code => code === 0, 'shipping AppImage exit');
    assert.ok(fs.statSync(path.join(profile, 'Local State')).isFile(), 'Missing shipping profile');
  } finally {
    if (child.pid && child.exitCode === null && !child.signalCode) {
      try {process.kill(-child.pid, 'SIGKILL');} catch {}
    }
  }
}

export async function seedInstallHome(arch, scratch, results) {
  assert.notEqual(process.getuid(), 0);
  assert.equal(process.env.XDG_CONFIG_HOME, path.join(process.env.HOME, '.config'));
  // The caller started a fresh bus and unlocked a throwaway collection.
  const secrets = applications.map(() => randomBytes(16).toString('base64'));
  for (const [i, application] of applications.entries()) {
    run('secret-tool', ['store', '--label=' + application + ' fixture Safe Storage', 'application', application, 'xdg:schema', schema],
      {input: secrets[i]});
    assert.equal(keyringDigest(application), sha(secrets[i]));
  }
  const apps = path.join(process.env.XDG_DATA_HOME, 'applications');
  fs.mkdirSync(apps, {recursive: true});
  fs.writeFileSync(path.join(apps, 'chromium.desktop'),
    '[Desktop Entry]\nName=Chromium Fixture\nType=Application\nExec=/bin/true %U\nCategories=Network;WebBrowser;\nMimeType=text/html;x-scheme-handler/http;x-scheme-handler/https;\n');
  const chromium = config('chromium');
  fs.mkdirSync(path.join(chromium, 'Default'), {recursive: true});
  fs.writeFileSync(path.join(chromium, 'Local State'), '{"profile":{"last_used":"Default"}}\n');
  fs.writeFileSync(path.join(chromium, 'Default', 'Preferences'), '{"profile":{"name":"Chromium fixture"}}\n');
  const existing = googleRepoSnapshot();
  const hasChromeAptSource = Object.keys(existing).some(file => path.dirname(file) === aptSources);
  for (const [file, body] of Object.entries(googleFixtures)) {
    if (Object.hasOwn(existing, file) || (path.dirname(file) === aptSources && hasChromeAptSource)) continue;
    run('sudo', ['-n', 'install', '-d', path.dirname(file)]);
    run('sudo', ['-n', 'tee', file], {input: body});
  }
  let appImage;
  if (arch === 'x64') {
    const name = 'Blanc-' + shippingVersion + '.AppImage';
    appImage = path.join(scratch, name);
    run('curl', ['--fail', '--location', '--silent', '--show-error', '--retry', '3', '--output', appImage,
      'https://github.com/bnfy/blanc/releases/download/v' + shippingVersion + '/' + name], {timeout: 300000});
    assert.equal(run('sha256sum', [appImage]).split(' ')[0], appImageHash);
    fs.chmodSync(appImage, 0o755);
    await launchAppImage(appImage, path.join(results, 'shipping-before.log'));
  } else {
    fs.mkdirSync(config('Blanc'), {recursive: true});
    fs.writeFileSync(config('Blanc/settings.json'), '{"theme":"system"}\n');
    fs.writeFileSync(config('Blanc/bookmarks.json'), '[{"title":"Shipping fixture","url":"https://shipping.invalid/"}]\n');
  }
  seedDefaultBrowser();
  const baseline = seedSnapshot();
  assert.deepEqual(baseline.keyring, secrets.map(sha));
  return {baseline, appImage};
}
