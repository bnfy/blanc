import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { _electron } from 'playwright';
import testHookCall from './support/test-hook-call.js';
import poll from './support/poll.js';

const { callTestHook } = testHookCall;
const { waitForValue } = poll;
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-web-store-guard-'));
const userDataDir = path.join(root, 'profile');
const profile = `${userDataDir}-Dev`;
fs.mkdirSync(profile);
fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify({
  onboardingVersion: 1,
  adblockEnabled: false,
  usagePing: false,
  searchSuggestions: false,
}));
const uncaughtLog = path.join(root, 'uncaught.log');
const { ELECTRON_RUN_AS_NODE: ignored, ...env } = process.env;
const storeUrl = 'https://chromewebstore.google.com/detail/example/abcdefghijklmnop';
let app;
try {
  app = await _electron.launch({
    args: [path.resolve('.'), `--user-data-dir=${userDataDir}`],
    env: { ...env, BLANC_TEST: '1', BLANC_TEST_UNCAUGHT_LOG: uncaughtLog },
  });
  await app.firstWindow();
  await waitForValue(() => callTestHook(app, 'startupReady'), Boolean, 'startup release');
  const before = await callTestHook(app, 'state');
  await callTestHook(app, 'navigateTab', [before.activeTabId, storeUrl]).catch(() => false);

  const state = await waitForValue(() => callTestHook(app, 'state'), (candidate) => {
    const active = candidate.tabs.find((tab) => tab.id === candidate.activeTabId);
    return active?.url.startsWith('blanc://error/?kind=chrome-web-store');
  }, 'Web Store navigation replaced by local error page');
  const active = state.tabs.find((tab) => tab.id === state.activeTabId);
  const page = await waitForValue(async () => (await app.windows()).find((candidate) =>
    candidate.url() === active.url), Boolean, 'local Web Store explanation page');
  assert.equal(await page.locator('#errorTitle').textContent(), 'Chrome Web Store is temporarily unavailable');
  assert.match(await page.locator('#errorDetail').textContent(), /prevent a browser crash/);
  assert.equal(await page.locator('#retryLink').isVisible(), false);
  assert.equal(await app.evaluate(({ app }) => app.isReady()), true, 'browser process remains alive');
  console.log('chrome-web-store-guard-smoke PASS: unsafe document blocked before load; local explanation rendered; browser process alive');
} finally {
  if (app) await app.close();
  const errors = fs.existsSync(uncaughtLog) ? fs.readFileSync(uncaughtLog, 'utf8').trim() : '';
  fs.rmSync(root, { recursive: true, force: true });
  assert.equal(errors, '', 'No uncaught main-process exceptions');
}
