// Real Electron lifecycle coverage. Packaged LaunchServices/WindowServer proof
// lives separately in packaged-external-links-smoke.mjs (no packaged test hook).
import { _electron } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import testHookCall from './support/test-hook-call.js';
import poll from './support/poll.js';

const { callTestHook } = testHookCall;
const { waitForValue } = poll;
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-external-lifecycle-'));
const userDataDir = path.join(root, 'profile');
fs.mkdirSync(`${userDataDir}-Dev`);
fs.writeFileSync(path.join(`${userDataDir}-Dev`, 'settings.json'), JSON.stringify({
  onboardingVersion: 1, adblockEnabled: false, usagePing: false, searchSuggestions: false,
}));
const server = http.createServer((_req, res) => {
  res.end('<!doctype html><title>External lifecycle</title><main>External lifecycle</main>');
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const { ELECTRON_RUN_AS_NODE: ignored, ...env } = process.env;
const uncaughtLog = path.join(root, 'uncaught.log');
let app;
try {
  app = await _electron.launch({
    args: [path.resolve('.'), `--user-data-dir=${userDataDir}`, `${origin}/cold-start`],
    env: { ...env, BLANC_TEST: '1', BLANC_TEST_UNCAUGHT_LOG: uncaughtLog },
  });
  await app.firstWindow();
  await waitForValue(() => callTestHook(app, 'startupReady'), Boolean, 'startup release');
  const read = () => callTestHook(app, 'state');
  const selected = (url) => waitForValue(read, (state) => state.tabs.some((tab) =>
    tab.id === state.activeTabId && tab.url === url), `selected ${url}`);
  await selected(`${origin}/cold-start`);
  const deliver = (url) => app.evaluate(({ app }, url) => {
    app.emit('open-url', { preventDefault() {} }, url);
  }, url);
  if (process.platform === 'darwin') {
    for (const mode of ['hidden', 'minimized', 'hidden-minimized']) {
      if (mode.includes('minimized')) {
        await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].minimize());
        // Hiding during the native minimize animation can cancel that
        // transition. Establish each precondition before requesting the next.
        await waitForValue(() => app.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()[0].isMinimized()), Boolean, 'native minimize completed');
      }
      if (mode.includes('hidden')) await app.evaluate(({ app }) => app.hide());
      await waitForValue(() => app.evaluate(({ app, BrowserWindow }) => ({
        hidden: app.isHidden(), minimized: BrowserWindow.getAllWindows()[0].isMinimized(),
      })), (s) => (!mode.includes('hidden') || s.hidden)
        && (!mode.includes('minimized') || s.minimized), `prepare ${mode}`);
      const before = await read();
      await deliver(`${origin}/${mode}`);
      const after = await selected(`${origin}/${mode}`);
      assert.equal(after.tabs.length, before.tabs.length + 1);
      await waitForValue(() => app.evaluate(({ app, BrowserWindow }) => ({
        hidden: app.isHidden(), active: app.isActive(),
        minimized: BrowserWindow.getAllWindows()[0].isMinimized(),
        focused: BrowserWindow.getAllWindows()[0].isFocused(),
      })), (s) => !s.hidden && s.active && !s.minimized && s.focused, `restore ${mode}`);
      console.log(`external-links ${mode} PASS`);
    }
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
    await waitForValue(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length),
      (count) => count === 0, 'last window closed');
    // No app.activate event accompanies this injection: URL handling itself
    // must create chrome and flush the queued URL exactly once.
    const before = await read();
    await deliver(`${origin}/closed`);
    const after = await selected(`${origin}/closed`);
    assert.equal(after.tabs.length, before.tabs.length + 1);

    // Hold only the recreated chrome document so a later user hide/minimize
    // deterministically lands between delivery and native-window readiness.
    await app.evaluate(({ session, net }, root) => {
      const require = process.getBuiltinModule('module').createRequire(`${root}/package.json`);
      const { createChromeProtocolHandler } = require('./src/main/chrome-protocol');
      const original = createChromeProtocolHandler({ net });
      const chrome = session.fromPartition('blanc-chrome');
      chrome.protocol.unhandle('blanc-chrome');
      chrome.protocol.handle('blanc-chrome', async (request) => {
        if (request.url === 'blanc-chrome://index/') {
          await new Promise((resolve) => { globalThis.releaseExternalLinkChrome = resolve; });
        }
        return original(request);
      });
    }, path.resolve('.'));
    try {
      for (const mode of ['hidden', 'minimized']) {
        await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
        await waitForValue(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length),
          (count) => count === 0, 'close before delayed chrome');
        const before = await read();
        const url = `${origin}/cancel-during-chrome-${mode}`;
        await deliver(url);
        await waitForValue(() => app.evaluate(() => !!globalThis.releaseExternalLinkChrome),
          Boolean, 'chrome request held');
        assert.equal((await read()).tabs.length, before.tabs.length, 'URL waits for chrome readiness');
        await app.evaluate(({ app, BrowserWindow }, mode) => {
          if (mode === 'hidden') app.hide();
          else BrowserWindow.getAllWindows()[0].minimize();
        }, mode);
        const nativeState = () => app.evaluate(({ app, BrowserWindow }) => ({
          hidden: app.isHidden(), minimized: BrowserWindow.getAllWindows()[0].isMinimized(),
        }));
        await waitForValue(nativeState, (s) => mode === 'hidden' ? s.hidden : s.minimized,
          `user ${mode} during initialization`);
        await app.evaluate(() => {
          globalThis.releaseExternalLinkChrome();
          delete globalThis.releaseExternalLinkChrome;
        });
        const after = await waitForValue(read, (state) => state.tabs.some((tab) => tab.url === url),
          'canceled activation still delivers the URL');
        assert.equal(after.tabs.length, before.tabs.length + 1);
        assert.equal(after.activeTabId, before.activeTabId, 'Canceled handoff must not change selection');
        await new Promise((resolve) => setTimeout(resolve, 2_200));
        const state = await nativeState();
        assert.equal(mode === 'hidden' ? state.hidden : state.minimized, true,
          'Chrome readiness and later callbacks must respect the newer user action');
        console.log(`external-links cancel during chrome ${mode} PASS`);
        // A fresh link, including one delivered while already hidden or
        // minimized, grants new permission to reveal the receiving window.
        await deliver(`${url}/new-handoff`);
        await selected(`${url}/new-handoff`);
        await waitForValue(nativeState, (s) => !s.hidden && !s.minimized, 'new handoff restores normally');
      }
    } finally {
      await app.evaluate(({ session, net }, root) => {
        globalThis.releaseExternalLinkChrome?.();
        delete globalThis.releaseExternalLinkChrome;
        const require = process.getBuiltinModule('module').createRequire(`${root}/package.json`);
        const { setupChromeProtocol } = require('./src/main/chrome-protocol');
        const chrome = session.fromPartition('blanc-chrome');
        chrome.protocol.unhandle('blanc-chrome');
        setupChromeProtocol({ session: chrome, net });
      }, path.resolve('.'));
    }
  }
  const profile = await callTestHook(app, 'createProfileWindow', ['External links work']);
  assert.equal(profile.ok, true);
  await app.evaluate(({ app }) => app.emit('activate', {}, true));
  await deliver(`${origin}/work`);
  const runtimes = await waitForValue(() => callTestHook(app, 'windowRuntimes'), (runtimes) =>
    runtimes.some((rt) => rt.tabs.some((tab) => tab.url === `${origin}/work`)), 'profile URL delivery');
  const receiver = runtimes.find((rt) => rt.tabs.some((tab) => tab.url === `${origin}/work`));
  assert.notEqual(receiver.profileId, 'personal');
  assert.equal(receiver.tabs.find((tab) => tab.url === `${origin}/work`).id, receiver.activeTabId);
  // Windows/Linux second-instance handoff opens all URLs and selects the last.
  await app.evaluate(({ app }, urls) => app.emit('second-instance', {}, ['Blanc', ...urls]),
    [`${origin}/batch-a`, `${origin}/batch-b`]);
  const final = await waitForValue(() => callTestHook(app, 'windowRuntimes'), (runtimes) =>
    runtimes.some((rt) => rt.id === receiver.id && rt.tabs.some((tab) =>
      tab.id === rt.activeTabId && tab.url === `${origin}/batch-b`)), 'selected batch in receiving profile');
  const batchReceiver = final.find((rt) => rt.id === receiver.id);
  assert.equal(batchReceiver.tabs.filter((tab) => tab.url === `${origin}/batch-a`).length, 1);
  assert.equal(batchReceiver.tabs.filter((tab) => tab.url === `${origin}/batch-b`).length, 1);
  console.log('external-links-smoke PASS: cold launch, hidden/minimized restore, readiness cancellation, windowless reopen, profile routing, second-instance batch');
} finally {
  if (app) await app.close();
  await new Promise((resolve) => server.close(resolve));
  const errors = fs.existsSync(uncaughtLog) ? fs.readFileSync(uncaughtLog, 'utf8').trim() : '';
  fs.rmSync(root, { recursive: true, force: true });
  assert.equal(errors, '', 'No uncaught main-process exceptions');
}
