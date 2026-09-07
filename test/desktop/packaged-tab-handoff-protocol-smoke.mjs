import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { launchPackagedOverCdp } from './support/packaged-cdp.mjs';

if (process.platform !== 'darwin') {
  throw new Error('The LaunchServices tab-handoff smoke is macOS-only.');
}

const defaultExecutable = path.resolve('dist/mac-arm64/Blanc.app/Contents/MacOS/Blanc');
const executablePath = process.env.BLANC_PACKAGED_EXECUTABLE || defaultExecutable;
if (!fs.existsSync(executablePath)) {
  throw new Error(
    'Packaged Blanc executable not found. Set BLANC_PACKAGED_EXECUTABLE or build dist/mac-arm64 first.'
  );
}

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-packaged-tab-handoff-'));
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
  const id = randomBytes(16).toString('base64url');
  const key = randomBytes(32).toString('base64url');
  const deepLink = `blanc-import://tabs?v=1&id=${id}&key=${key}`;
  app = await launchPackagedOverCdp({
    executablePath,
    args: [
      `--user-data-dir=${userDataDir}`,
      // Exercise the production-pinned origin without allowing this private
      // acceptance run to contact or consume a production relay record.
      '--host-resolver-rules=MAP tabs.blancbrowser.com 127.0.0.1',
    ],
    env: { ...process.env, BLANC_TEST: '0' },
    launchViaOpen: true,
    // -n plus an explicit application path prevents another installed Blanc
    // with the same stable bundle identifier from receiving this test URL.
    openUrls: [deepLink],
  });

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

  const tabs = await readTabs(app);
  assert.equal(
    tabs.tabs.some((tab) => String(tab.url).startsWith('blanc-import:')),
    false,
    'the handoff protocol must never be routed through ordinary tab navigation',
  );

  console.log('packaged-tab-handoff-protocol-smoke OK on darwin');
} finally {
  if (app) await app.close().catch(() => {});
  fs.rmSync(userDataDir, { recursive: true, force: true });
}
