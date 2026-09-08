import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';
import { launchPackagedOverCdp } from './support/packaged-cdp.mjs';

const execFileAsync = promisify(execFile);
const pkg = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8'));
const defaultExecutable = process.platform === 'darwin'
  ? path.resolve('dist/mac-arm64/Blanc.app/Contents/MacOS/Blanc')
  : process.platform === 'win32'
    ? path.resolve('dist/win-unpacked', `${pkg.productName}.exe`)
    : process.platform === 'linux'
      ? path.resolve('dist', `${pkg.productName}-${pkg.version}.AppImage`)
      : null;
const executablePath = process.env.BLANC_PACKAGED_EXECUTABLE || defaultExecutable;
if (!executablePath || !fs.existsSync(executablePath)) {
  throw new Error(
    'Packaged Blanc executable not found. Set BLANC_PACKAGED_EXECUTABLE or build the current platform first.'
  );
}

const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-packaged-tab-handoff-'));
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const poll = async (read, predicate, message, timeoutMs = 20_000) => {
  const deadline = Date.now() + timeoutMs;
  let value;
  while (Date.now() < deadline) {
    value = await read();
    if (predicate(value)) return value;
    await delay(100);
  }
  assert.fail(`${message}; last value: ${JSON.stringify(value)}`);
};

const readSheet = async (app) => {
  const sheet = app.pages().find((page) => page.url() === 'blanc://tab-handoff/');
  if (!sheet) return { urls: app.pages().map((page) => page.url()) };
  return sheet.evaluate(() => ({
    readyState: document.readyState,
    summary: document.getElementById('summary')?.textContent ?? '',
    error: document.getElementById('error')?.textContent ?? '',
    errorHidden: document.getElementById('error')?.hidden ?? null,
    acceptDisabled: document.getElementById('accept')?.disabled ?? null,
  }));
};

const readTabs = async (app) => {
  const chrome = app.pages().find((page) => page.url() === 'blanc-chrome://index/');
  if (!chrome) return null;
  return chrome.evaluate(() => window.browserAPI.getAllTabs());
};

const configureLinuxProtocol = async (env) => {
  const extractDir = path.join(runtimeRoot, 'appimage-extract');
  fs.mkdirSync(extractDir, { recursive: true });
  await execFileAsync(executablePath, ['--appimage-extract'], { cwd: extractDir, env });
  const extractedRoot = path.join(extractDir, 'squashfs-root');
  const desktopName = fs.readdirSync(extractedRoot).find((name) => name.endsWith('.desktop'));
  assert.ok(desktopName, 'AppImage must contain a desktop entry');
  const desktop = fs.readFileSync(path.join(extractedRoot, desktopName), 'utf8');
  const mimeTypes = desktop.match(/^MimeType=(.*)$/m)?.[1].split(';').filter(Boolean) ?? [];
  assert.ok(
    mimeTypes.includes('x-scheme-handler/blanc-import'),
    'AppImage desktop metadata must register blanc-import',
  );

  const applicationsDir = path.join(env.XDG_DATA_HOME, 'applications');
  fs.mkdirSync(applicationsDir, { recursive: true });
  // Ubuntu's generic xdg-open backend does not parse a quoted executable in
  // Exec= consistently. Point a no-space test-local symlink at the exact
  // AppImage instead of weakening the test with shell evaluation.
  const registeredExecutable = path.join(runtimeRoot, 'Blanc.AppImage');
  fs.symlinkSync(executablePath, registeredExecutable);
  const registeredName = 'me.bnfy.blanc-tab-handoff-test.desktop';
  const registered = desktop
    .replace(/^Name=.*$/m, 'Name=Blanc Tab Handoff Protocol Test')
    .replace(/^Exec=.*$/m, `Exec=${registeredExecutable} %U`);
  fs.writeFileSync(path.join(applicationsDir, registeredName), registered);
  await execFileAsync('update-desktop-database', [applicationsDir], { env });
  await execFileAsync(
    'xdg-mime',
    ['default', registeredName, 'x-scheme-handler/blanc-import'],
    { env },
  );
  const { stdout } = await execFileAsync(
    'xdg-mime',
    ['query', 'default', 'x-scheme-handler/blanc-import'],
    { env },
  );
  assert.equal(stdout.trim(), registeredName, 'xdg-mime did not retain the isolated handler');
};

const invokeInstalledProtocol = async (deepLink, env) => {
  if (process.platform === 'win32') {
    const { stdout } = await execFileAsync(
      'reg.exe',
      ['query', 'HKEY_CURRENT_USER\\Software\\Classes\\blanc-import\\shell\\open\\command', '/ve'],
      { env },
    );
    assert.match(stdout, /blanc\.exe/i, 'installer registry handler must target Blanc.exe');
    assert.match(stdout, /%1/, 'installer registry handler must forward the opaque URL');
    await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', 'Start-Process -FilePath $env:BLANC_TEST_PROTOCOL_URL'],
      { env: { ...env, BLANC_TEST_PROTOCOL_URL: deepLink } },
    );
    return;
  }
  if (process.platform === 'linux') {
    await execFileAsync('xdg-open', [deepLink], { env });
    return;
  }
  throw new Error(`No installed protocol invoker for ${process.platform}`);
};

const id = randomBytes(16).toString('base64url');
const key = randomBytes(32).toString('base64url');
const deepLink = `blanc-import://tabs?v=1&id=${id}&key=${key}`;
const launchArgs = ['--host-resolver-rules=MAP tabs.blancbrowser.com 127.0.0.1'];
const isolatedEnv = { ...process.env, BLANC_TEST: '0' };
let userDataDir;

if (process.platform === 'darwin') {
  userDataDir = path.join(runtimeRoot, 'profile');
  launchArgs.unshift(`--user-data-dir=${userDataDir}`);
} else if (process.platform === 'win32') {
  isolatedEnv.APPDATA = path.join(runtimeRoot, 'AppData', 'Roaming');
  isolatedEnv.LOCALAPPDATA = path.join(runtimeRoot, 'AppData', 'Local');
  userDataDir = path.join(isolatedEnv.APPDATA, pkg.productName);
} else if (process.platform === 'linux') {
  isolatedEnv.XDG_CONFIG_HOME = path.join(runtimeRoot, 'config');
  isolatedEnv.XDG_DATA_HOME = path.join(runtimeRoot, 'share');
  userDataDir = path.join(isolatedEnv.XDG_CONFIG_HOME, pkg.productName);
  await configureLinuxProtocol(isolatedEnv);
} else {
  throw new Error(`Packaged tab-handoff protocol smoke is unsupported on ${process.platform}.`);
}

fs.mkdirSync(userDataDir, { recursive: true });
fs.writeFileSync(
  path.join(userDataDir, 'settings.json'),
  JSON.stringify({
    adblockEnabled: false,
    onboardingVersion: 1,
    searchSuggestions: false,
    usagePing: false,
  }, null, 2),
);

let app;
try {
  app = await launchPackagedOverCdp({
    executablePath,
    // Exercise the production-pinned origin without allowing this private
    // acceptance run to contact or consume a production relay record.
    args: launchArgs,
    env: isolatedEnv,
    launchViaOpen: process.platform === 'darwin',
    // macOS uses a cold LaunchServices delivery. -n plus the explicit app
    // path prevents another installed Blanc with the stable bundle identifier
    // from receiving the synthetic URL.
    openUrls: process.platform === 'darwin' ? [deepLink] : [],
  });

  if (process.platform !== 'darwin') {
    await poll(
      () => readTabs(app),
      (state) => Array.isArray(state?.tabs) && state.tabs.length > 0,
      'packaged Blanc did not finish startup before installed-protocol invocation',
    );
    assert.equal(
      app.pages().some((page) => page.url() === 'blanc://tab-handoff/'),
      false,
      'tab-handoff sheet should not exist before installed-protocol invocation',
    );
    await invokeInstalledProtocol(deepLink, isolatedEnv);
  }

  const offline = await poll(
    () => readSheet(app),
    (state) => state.readyState === 'complete'
      && state.errorHidden === false
      && /could not reach/i.test(state.error),
    'LaunchServices did not deliver the handoff to the packaged utility sheet',
    25_000,
  );
  assert.equal(offline.summary, 'The tab handoff is unavailable.');
  assert.equal(offline.acceptDisabled, true);

  const tabs = await poll(
    () => readTabs(app),
    (state) => Array.isArray(state?.tabs),
    'packaged Blanc did not expose its ordinary tab state',
  );
  assert.equal(
    tabs.tabs.some((tab) => String(tab.url).startsWith('blanc-import:')),
    false,
    'the handoff protocol must never be routed through ordinary tab navigation',
  );

  console.log(`packaged-tab-handoff-protocol-smoke OK on ${process.platform}`);
} finally {
  if (app) await app.close().catch(() => {});
  fs.rmSync(runtimeRoot, { recursive: true, force: true });
}
