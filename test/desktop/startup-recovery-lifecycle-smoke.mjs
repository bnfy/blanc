import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { _electron } from 'playwright';
import testHookCall from './support/test-hook-call.js';
import poll from './support/poll.js';
import workspace from '../../src/main/session-workspace.js';

const { callTestHook } = testHookCall;
const { waitForValue } = poll;
const { buildSaveShape } = workspace;
const repo = path.resolve('.');
const { ELECTRON_RUN_AS_NODE: ignored, ...env } = process.env;

async function withRecovery(windows, check) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-recovery-lifecycle-'));
  const userData = path.join(root, 'profile');
  const profile = `${userData}-Dev`;
  fs.mkdirSync(profile);
  const write = (name, value) => fs.writeFileSync(path.join(profile, name), JSON.stringify(value));
  write('settings.json', { onboardingVersion: 1, adblockEnabled: false, usagePing: false, searchSuggestions: false });
  write('profiles.json', { version: 1, profiles: [
    { id: 'default', name: 'Personal', createdAt: 0 },
    { id: 'profile_work', name: 'Work', createdAt: 0 },
  ] });
  write('session.json', buildSaveShape(windows, {}, { activeWindowId: 'primary' }));
  write('crash-ledger.json', { version: 1, currentRun: { startedAt: 1 }, recoveryPending: true, events: [] });
  const uncaughtLog = path.join(root, 'uncaught.log');
  let app;
  try {
    app = await _electron.launch({ args: [repo, `--user-data-dir=${userData}`],
      env: { ...env, BLANC_TEST: '1', BLANC_TEST_UNCAUGHT_LOG: uncaughtLog } });
    const page = await recoveryPage(app);
    await check(app, page, profile);
  } finally {
    if (app) await app.close();
    const errors = fs.existsSync(uncaughtLog) ? fs.readFileSync(uncaughtLog, 'utf8').trim() : '';
    fs.rmSync(root, { recursive: true, force: true });
    assert.equal(errors, '', 'No uncaught main-process exceptions');
  }
}

async function recoveryPage(app) {
  const page = await waitForValue(async () => (await app.windows()).find((p) => p.url() === 'blanc://newtab/'), Boolean, 'recovery page');
  await page.waitForFunction(() => window.bowserPages?.start);
  await waitForValue(() => page.evaluate(async () => (await window.bowserPages.start.data()).recovery.required), Boolean, 'recovery pending');
  return page;
}

async function ready(app) {
  await waitForValue(() => callTestHook(app, 'startupReady'), Boolean, 'startup released');
}

// Hold chrome deterministically so native window closure races restoration,
// rather than relying on an arbitrary delay or a slow machine.
async function holdNextChrome(app) {
  await app.evaluate(({ app, session, net }, repo) => {
    const require = process.getBuiltinModule('module').createRequire(`${repo}/package.json`);
    const { createChromeProtocolHandler } = require('./src/main/chrome-protocol');
    const original = createChromeProtocolHandler({ net });
    const chrome = session.fromPartition('blanc-chrome');
    chrome.protocol.unhandle('blanc-chrome');
    let first = true;
    chrome.protocol.handle('blanc-chrome', async (request) => {
      if (request.url === 'blanc-chrome://index/' && first) {
        first = false;
        await new Promise((resolve) => { globalThis.releaseRecoveryTestChrome = resolve; });
      }
      return original(request);
    });
    app.once('browser-window-created', (_event, window) => { globalThis.recoveryTestWindow = window; });
  }, repo);
}

if (process.platform === 'darwin') {
  await withRecovery([{ id: 'primary', profileId: 'profile_work', urls: ['https://example.test/work'], activeIndex: 0 }], async (app, page, profile) => {
    const closedId = await app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      const id = window.id;
      window.close();
      return id;
    });
    await waitForValue(() => app.evaluate(({ BrowserWindow }, id) => BrowserWindow.fromId(id) === null, closedId), Boolean, 'recovery window closed');
    await app.evaluate(({ app }) => app.emit('activate'));
    page = await recoveryPage(app);
    const personal = (await callTestHook(app, 'windowRuntimes')).find((r) => r.id === 'primary');
    const originalTabId = personal.tabs[0].id;
    await page.locator('#recoveryRestore').click();
    await ready(app);
    const rows = await callTestHook(app, 'windowRuntimes');
    const retained = rows.find((r) => r.tabs.some((tab) => tab.id === originalTabId));
    assert.equal(retained.profileId, 'default', 'Existing Personal tab keeps its window identity');
    const work = rows.find((r) => r.profileId === 'profile_work');
    assert.ok(work?.attached, 'Saved Work window restored separately');
    assert.equal(work.title, 'Work — Blanc');
    assert.equal(work.tabs.length, 1);
    assert.equal(work.tabs[0].url, 'https://example.test/work');
    for (const id of [originalTabId, work.tabs[0].id]) {
      const session = await callTestHook(app, 'profileTabSession', [id]);
      assert.equal(session.matchesProfileSession, true);
      assert.equal(session.isolatedFromPersonal, true);
    }
    // Persistence must retain the separated identities on the next restart.
    await waitForValue(() => JSON.parse(fs.readFileSync(path.join(profile, 'session.json'), 'utf8')),
      (saved) => saved.windows?.some((w) => w.id === work.id), 'separated session persisted');
    const saved = JSON.parse(fs.readFileSync(path.join(profile, 'session.json'), 'utf8'));
    assert.deepEqual(saved.windows.find((w) => w.profileId === 'profile_work').urls, ['https://example.test/work']);
    assert.ok(saved.windows.some((w) => w.profileId === 'default'));
    assert.equal(saved.activeWindowId, work.id, 'Saved focused window follows the replacement runtime');
    console.log('PASS: Dock recovery keeps Personal and Work sessions separate');
  });
}

await withRecovery([
  { id: 'primary', urls: ['https://example.test/primary'], activeIndex: 0 },
  { id: 'secondary', urls: ['https://example.test/secondary'], activeIndex: 0 },
], async (app, page, profile) => {
  await holdNextChrome(app); // Secondary is created first; primary was focused.
  await page.locator('#recoveryRestore').click();
  await waitForValue(() => app.evaluate(() => !!globalThis.releaseRecoveryTestChrome), Boolean, 'secondary chrome held');
  await app.evaluate(() => globalThis.recoveryTestWindow.close());
  await ready(app);
  const rows = await callTestHook(app, 'windowRuntimes');
  const state = await callTestHook(app, 'state');
  const ownedIds = new Set(rows.flatMap((r) => r.tabs.map((tab) => tab.id)));
  assert.ok(state.tabs.every((tab) => ownedIds.has(tab.id)), 'No orphan tabs restored into a discarded runtime');
  assert.equal(state.tabs.some((tab) => tab.url === 'https://example.test/secondary'), false);
  assert.ok(state.tabs.some((tab) => tab.url === 'https://example.test/primary'));
  await waitForValue(() => JSON.parse(fs.readFileSync(path.join(profile, 'session.json'), 'utf8')),
    (saved) => saved.windows?.length === 1, 'closed window omitted from persistence');
  await app.evaluate(() => globalThis.releaseRecoveryTestChrome());
  console.log('PASS: Closing a saved secondary window cancels its restoration');
});

if (process.platform === 'darwin') {
  await withRecovery([{ id: 'primary', urls: ['https://example.test/primary'], activeIndex: 0 }], async (app, page) => {
    await holdNextChrome(app);
    await page.locator('#recoveryRestore').click();
    await waitForValue(() => app.evaluate(() => !!globalThis.releaseRecoveryTestChrome), Boolean, 'primary chrome held');
    await app.evaluate(() => globalThis.recoveryTestWindow.close());
    await ready(app);
    const rows = await callTestHook(app, 'windowRuntimes');
    const primary = rows.find((r) => r.id === 'primary');
    assert.equal(primary.attached, false);
    const restored = (await callTestHook(app, 'state')).tabs.find((tab) => tab.url === 'https://example.test/primary');
    assert.ok(restored);
    assert.equal(restored.asleep, true, 'Dock-closed primary retains quiet tabs without loading invisibly');
    assert.equal(primary.activeTabId, restored.id);
    await app.evaluate(() => globalThis.releaseRecoveryTestChrome());
    await app.evaluate(({ app }) => app.emit('activate'));
    await waitForValue(() => callTestHook(app, 'windowRuntimes'),
      (rows) => rows.some((r) => r.id === 'primary' && r.attached && r.activeTabId === restored.id), 'primary reattached with restored tab');
    await waitForValue(() => callTestHook(app, 'state'),
      (state) => state.tabs.some((tab) => tab.id === restored.id && !tab.asleep), 'selected tab wakes on Dock reopen');
    console.log('PASS: Dock-closed primary preserves restoration and wakes only on reopen');
  });
}
