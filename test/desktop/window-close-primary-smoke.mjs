import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { _electron } from 'playwright';
import poll from './support/poll.js';
import testHookCall from './support/test-hook-call.js';

// Closing the primary window on Windows or Linux while another window stays
// open. That close removes the primary like any window that is not the last
// (F32-1): its pages are destroyed, it leaves the saved session, and it must
// not come back. Before the October 2026 fix, the runtime and its pages stayed
// in memory, the next ordinary session save wrote them back, and Quit
// (Ctrl+Q) restored the closed window on the next launch. A launch that
// restores only a secondary window must not save the unused primary either,
// or the following launch opens an extra, empty window.
//
// macOS keeps the primary for Dock reopen instead, so this runs on Windows
// and Linux, or on a Mac with `--simulate-platform=linux`, which overrides
// `process.platform` in the running main process after startup.

const { waitForValue } = poll;
const { callTestHook } = testHookCall;
const repo = path.resolve('.');
const simulated = process.argv.find((a) => a.startsWith('--simulate-platform='))?.split('=')[1];
const platform = simulated ?? process.platform;
if (platform === 'darwin') {
  console.log('window-close-primary: skipped on macOS (the primary close is a Dock close there)');
  process.exit(0);
}
const { ELECTRON_RUN_AS_NODE: ignored, ...env } = process.env;

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-window-close-primary-'));
const userData = path.join(root, 'profile');
const profile = `${userData}-Dev`;
const uncaughtLog = path.join(root, 'uncaught.log');
const sessionFile = path.join(profile, 'session.json');
fs.mkdirSync(profile);
fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify({
  onboardingVersion: 1, adblockEnabled: false, usagePing: false, searchSuggestions: false,
}));

const server = http.createServer((request, response) => {
  const name = new URL(request.url, 'http://127.0.0.1').pathname.slice(1) || 'page';
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  response.end(`<!doctype html><title>${name}</title><p>${name}</p>`);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const pageUrl = (name) => `http://127.0.0.1:${server.address().port}/${name}`;

const launch = async (label) => {
  const app = await _electron.launch({
    chromiumSandbox: true,
    args: [repo, `--user-data-dir=${userData}`],
    env: { ...env, BLANC_TEST: '1', BLANC_TEST_UNCAUGHT_LOG: uncaughtLog },
  });
  await app.firstWindow();
  await waitForValue(() => callTestHook(app, 'startupReady'), Boolean, `${label} startup`, 30_000);
  if (simulated) {
    await app.evaluate((_electron, value) => {
      Object.defineProperty(process, 'platform', { value, configurable: true });
    }, simulated);
  }
  return app;
};

const runtimes = (app) => callTestHook(app, 'windowRuntimes');
const openPage = async (app, runtimeId, name) => {
  const url = pageUrl(name);
  await callTestHook(app, 'openTabInWindow', [runtimeId, url]);
  await waitForValue(
    () => runtimes(app),
    (rows) => rows.find((row) => row.id === runtimeId)?.tabs.some((tab) => tab.url === url),
    `${name} to open`,
    10_000,
  );
  return url;
};
const savedIds = (session) => (session?.windows ?? []).map((entry) => entry.id);
const savedUrls = (session, id) => session?.windows?.find((entry) => entry.id === id)?.urls ?? [];
const livePages = (app, urls) => app.evaluate(({ webContents }, targets) =>
  webContents.getAllWebContents()
    .filter((contents) => !contents.isDestroyed() && targets.includes(contents.getURL()))
    .map((contents) => contents.getURL()), urls);
const quit = async (app) => {
  const exited = new Promise((resolve) => app.process().once('exit', resolve));
  await app.evaluate(({ app: electronApp }) => electronApp.quit());
  return exited;
};
const assertNoUncaught = (label) => {
  const log = fs.existsSync(uncaughtLog) ? fs.readFileSync(uncaughtLog, 'utf8').trim() : '';
  assert.equal(log, '', `${label}: main process threw`);
};

let app;
try {
  // Launch 1: primary with pages A (background) and B (active), secondary S
  // with page C. Close the primary with its own close, then keep browsing in S.
  app = await launch('first launch');
  const pageA = await openPage(app, 'primary', 'primary-a');
  const pageB = await openPage(app, 'primary', 'primary-b');
  const secondaryId = await callTestHook(app, 'openNewWindow');
  await waitForValue(() => runtimes(app), (rows) => rows.find((row) => row.id === secondaryId)?.attached,
    'secondary window', 10_000);
  const pageC = await openPage(app, secondaryId, 'secondary-c');
  await waitForValue(
    () => callTestHook(app, 'persistedSessionData'),
    (session) => savedUrls(session, 'primary').includes(pageA) && savedUrls(session, secondaryId).includes(pageC),
    'both windows in session.json',
    10_000,
  );
  await waitForValue(() => livePages(app, [pageA, pageB]), (pages) => pages.length === 2,
    'both primary pages to be live before the close', 10_000);

  // Native ids are allocated in creation order: the primary first.
  const [primaryWindowId] = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()
    .filter((w) => w.isVisible() && w.webContents.getURL() === 'blanc-chrome://index/')
    .map((w) => w.id).sort((a, b) => a - b));
  await app.evaluate(({ BrowserWindow, webContents }, { id, urls }) => {
    const owned = webContents.getAllWebContents().filter((wc) => urls.includes(wc.getURL()));
    globalThis.__primaryCloseLivePages = null;
    // Observe before Blanc's closed handler: cleaning up there is too late
    // for native focus teardown. Both active and detached pages must be gone.
    BrowserWindow.fromId(id).prependOnceListener('closed', () => {
      globalThis.__primaryCloseLivePages = owned.filter((wc) => !wc.isDestroyed()).length;
    });
    BrowserWindow.fromId(id).close();
  }, { id: primaryWindowId, urls: [pageA, pageB] });
  await waitForValue(() => runtimes(app), (rows) => !rows.find((row) => row.id === 'primary')?.attached,
    'primary window to close', 10_000);
  assert.equal(app.process().exitCode, null, 'Blanc keeps running with the secondary window open');
  assert.equal(await app.evaluate(() => globalThis.__primaryCloseLivePages), 0,
    'primary pages finish destruction before their native window closes');

  await waitForValue(() => livePages(app, [pageA, pageB]), (live) => live.length === 0,
    'the closed primary window\'s pages to be destroyed', 10_000);
  const primaryAfter = (await runtimes(app)).find((row) => row.id === 'primary');
  assert.deepEqual(primaryAfter?.tabs ?? [], [], 'the closed primary keeps no tabs in memory');

  const pageD = await openPage(app, secondaryId, 'secondary-d');
  const live = await waitForValue(
    () => callTestHook(app, 'persistedSessionData'),
    (session) => savedUrls(session, secondaryId).includes(pageD),
    'secondary page D in session.json',
    10_000,
  );
  assert.deepEqual(savedIds(live), [secondaryId],
    `later saves keep the closed primary out: ${JSON.stringify(live.windows)}`);

  assert.equal(await quit(app), 0, 'Quit exits cleanly');
  app = null;
  assertNoUncaught('first launch');
  const afterQuit = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
  assert.deepEqual(savedIds(afterQuit), [secondaryId],
    `Quit saves only the open window: ${JSON.stringify(afterQuit.windows)}`);
  assert.ok([pageC, pageD].every((url) => savedUrls(afterQuit, secondaryId).includes(url)));

  // Launch 2: only S comes back. Quitting again must not save the unused
  // primary as an empty window.
  app = await launch('second launch');
  const restored = await waitForValue(() => runtimes(app),
    (rows) => rows.find((row) => row.id === secondaryId)?.attached, 'restored secondary', 10_000);
  assert.equal(restored.find((row) => row.id === 'primary')?.attached ?? false, false,
    'the closed primary window does not come back');
  assert.ok([pageC, pageD].every((url) => restored.find((row) => row.id === secondaryId).tabs.some((tab) => tab.url === url)),
    `the open window's tabs come back: ${JSON.stringify(restored)}`);
  assert.equal(await quit(app), 0, 'second Quit exits cleanly');
  app = null;
  assertNoUncaught('second launch');
  const afterSecondQuit = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
  assert.deepEqual(savedIds(afterSecondQuit), [secondaryId],
    `an unused primary is not saved as an empty window: ${JSON.stringify(afterSecondQuit.windows)}`);
  console.log(`window-close-primary: ok (${platform}${simulated ? ', simulated' : ''})`);
} finally {
  try {
    if (app && app.process().exitCode === null) await app.close();
  } catch {}
  server.close();
  fs.rmSync(root, { recursive: true, force: true });
}
