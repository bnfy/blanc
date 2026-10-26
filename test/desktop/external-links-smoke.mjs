// Real Electron lifecycle coverage. Packaged LaunchServices/WindowServer proof
// lives separately in packaged-external-links-smoke.mjs (no packaged test hook).
import { _electron } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import testHookCall from './support/test-hook-call.js';
import poll from './support/poll.js';
import { inMainTurn } from './support/main-turn.js';

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
const localHtmlPath = path.join(root, 'LaunchServices document.html');
fs.writeFileSync(localHtmlPath, '<!doctype html><title>LaunchServices document</title><main>Local document</main>');
const localHtmlUrl = pathToFileURL(fs.realpathSync(localHtmlPath)).href;
const { ELECTRON_RUN_AS_NODE: ignored, ...env } = process.env;
const uncaughtLog = path.join(root, 'uncaught.log');
let app;
try {
  app = await _electron.launch({ chromiumSandbox: true,
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
    const beforeLocal = await read();
    const prevented = await app.evaluate(({ app }, filePath) => {
      let value = false;
      app.emit('open-file', { preventDefault() { value = true; } }, filePath);
      return value;
    }, localHtmlPath);
    assert.equal(prevented, true);
    const afterLocal = await selected(localHtmlUrl);
    assert.equal(afterLocal.tabs.length, beforeLocal.tabs.length + 1);
    console.log('external-links local HTML document PASS');

    for (const mode of ['hidden', 'minimized', 'hidden-minimized']) {
      if (mode.includes('minimized')) {
        await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()
          .find((window) => window.webContents.getURL() !== 'blanc-chrome://display-capture-helper/').minimize());
        // Hiding during the native minimize animation can cancel that
        // transition. Establish each precondition before requesting the next.
        await waitForValue(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()
          .find((window) => window.webContents.getURL() !== 'blanc-chrome://display-capture-helper/').isMinimized()), Boolean, 'native minimize completed');
      }
      if (mode.includes('hidden')) await app.evaluate(({ app }) => app.hide());
      await waitForValue(() => app.evaluate(({ app, BrowserWindow }) => {
        const window = BrowserWindow.getAllWindows()
          .find((candidate) => candidate.webContents.getURL() !== 'blanc-chrome://display-capture-helper/');
        return { hidden: app.isHidden(), minimized: window.isMinimized() };
      }), (s) => (!mode.includes('hidden') || s.hidden)
        && (!mode.includes('minimized') || s.minimized), `prepare ${mode}`);
      const before = await read();
      await deliver(`${origin}/${mode}`);
      const after = await selected(`${origin}/${mode}`);
      assert.equal(after.tabs.length, before.tabs.length + 1);
      await waitForValue(() => app.evaluate(({ app, BrowserWindow }) => {
        const window = BrowserWindow.getAllWindows()
          .find((candidate) => candidate.webContents.getURL() !== 'blanc-chrome://display-capture-helper/');
        return {
          hidden: app.isHidden(), active: app.isActive(),
          minimized: window.isMinimized(), focused: window.isFocused(),
        };
      }), (s) => !s.hidden && s.active && !s.minimized && s.focused, `restore ${mode}`);
      console.log(`external-links ${mode} PASS`);
    }
    await inMainTurn(app, ({ BrowserWindow }) => BrowserWindow.getAllWindows()
      .find((window) => window.webContents.getURL() !== 'blanc-chrome://display-capture-helper/').close());
    await waitForValue(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()
      .some((window) => window.webContents.getURL() !== 'blanc-chrome://display-capture-helper/')),
    (exists) => !exists, 'last browser window closed');
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
        await inMainTurn(app, ({ BrowserWindow }) => BrowserWindow.getAllWindows()
          .find((window) => window.webContents.getURL() !== 'blanc-chrome://display-capture-helper/').close());
        await waitForValue(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()
          .some((window) => window.webContents.getURL() !== 'blanc-chrome://display-capture-helper/')),
        (exists) => !exists, 'close browser window before delayed chrome');
        const before = await read();
        const url = `${origin}/cancel-during-chrome-${mode}`;
        await deliver(url);
        await waitForValue(() => app.evaluate(() => !!globalThis.releaseExternalLinkChrome),
          Boolean, 'chrome request held');
        assert.equal((await read()).tabs.length, before.tabs.length, 'URL waits for chrome readiness');
        await app.evaluate(({ app, BrowserWindow }, mode) => {
          const window = BrowserWindow.getAllWindows()
            .find((candidate) => candidate.webContents.getURL() !== 'blanc-chrome://display-capture-helper/');
          if (mode === 'hidden') app.hide();
          else window.minimize();
        }, mode);
        const nativeState = () => app.evaluate(({ app, BrowserWindow }) => {
          const window = BrowserWindow.getAllWindows()
            .find((candidate) => candidate.webContents.getURL() !== 'blanc-chrome://display-capture-helper/');
          return { hidden: app.isHidden(), minimized: window.isMinimized() };
        });
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
  console.log('external-links second-instance batch PASS');

  // F60: rules route a link from another app to a profile or Space.
  const linkRoutes = (routes) => app.evaluate((_electron, { root, routes }) => {
    const require = process.getBuiltinModule('module').createRequire(`${root}/package.json`);
    const settings = require('./src/main/settings');
    return routes ? settings.setLinkRoutes(routes) : settings.getSettings().linkRoutes;
  }, { root: path.resolve('.'), routes });
  const local = `http://localhost:${server.address().port}`;
  const workId = profile.profile.id;
  const rule = (id, kind, value, destination) => ({
    id, match: { kind, value }, destination: { spaceId: null, private: false, ...destination },
  });
  const holder = (routed, url) => routed.find((rt) => rt.tabs.some((tab) => tab.url === url));
  const delivered = (url) => waitForValue(() => callTestHook(app, 'windowRuntimes'),
    (routed) => !!holder(routed, url), `routed ${url}`);

  // The work window was used last; a rule still sends this link to Personal.
  assert.equal((await linkRoutes([rule('personal', 'domain', 'localhost', { profileId: 'default' })])).ok, true);
  await deliver(`${local}/route-personal`);
  let routed = await delivered(`${local}/route-personal`);
  assert.equal(holder(routed, `${local}/route-personal`).profileId, 'default');
  console.log('external-links route to profile PASS');

  // A rule whose profile is gone is skipped: the link opens as it does today.
  const beforeGone = await callTestHook(app, 'windowRuntimes');
  assert.equal((await linkRoutes([
    rule('gone', 'contains', '/route-gone', { profileId: 'profile_gone' }),
  ])).ok, true);
  await deliver(`${local}/route-gone`);
  routed = await delivered(`${local}/route-gone`);
  assert.equal(routed.length, beforeGone.length, 'a skipped rule opens no window');
  assert.notEqual(holder(routed, `${local}/route-gone`).profileId, 'profile_gone');

  // Deleting a profile removes its rules; its links then fall through.
  const doomed = await callTestHook(app, 'createProfileWindow', ['Routing doomed']);
  assert.equal(doomed.ok, true);
  await linkRoutes([
    rule('doomed', 'contains', '/route-doomed', { profileId: doomed.profile.id }),
    rule('keep', 'contains', '/route-keep', { profileId: workId }),
  ]);
  assert.equal((await callTestHook(app, 'deleteProfile', [doomed.profile.id, 'Routing doomed'])).ok, true);
  await waitForValue(() => linkRoutes(), (routes) => routes.length === 1 && routes[0].id === 'keep', 'rules of the deleted profile removed');
  await deliver(`${local}/route-doomed`);
  routed = await delivered(`${local}/route-doomed`);
  assert.notEqual(holder(routed, `${local}/route-doomed`).profileId, doomed.profile.id);
  console.log('external-links deleted profile falls through PASS');

  // A Space that isn't showing opens in a new window of its profile.
  const spaces = await callTestHook(app, 'createProfileWindow', ['Routing spaces']);
  assert.equal(spaces.ok, true);
  const spacesId = spaces.profile.id;
  const spacesWindow = { id: spaces.runtimeId };
  const saved = await waitForValue(() => callTestHook(app, 'workspaceActionInWindow', [spacesWindow.id, 'save', 'Routed space']),
    (result) => result?.ok, 'save the Space');
  const spaceId = saved.workspace.id;
  // Switching away waits for the Start Page to finish loading.
  await waitForValue(() => callTestHook(app, 'workspaceActionInWindow', [spacesWindow.id, 'create', 'Routing elsewhere']),
    (result) => result?.ok, 'switch the window to another Space');
  routed = await callTestHook(app, 'windowRuntimes');
  assert.equal(routed.some((rt) => rt.workspaceId === spaceId && rt.attached && !rt.resident), false, 'the Space is not showing');
  const windowIds = new Set(routed.map((rt) => rt.id));
  await linkRoutes([rule('space', 'contains', '/route-space', { profileId: spacesId, spaceId })]);
  await deliver(`${local}/route-space`);
  routed = await delivered(`${local}/route-space`);
  const spaceWindow = holder(routed, `${local}/route-space`);
  assert.equal(windowIds.has(spaceWindow.id), false, 'the Space opened in a new window');
  assert.equal(spaceWindow.profileId, spacesId);
  assert.equal(spaceWindow.workspaceId, spaceId);
  assert.equal(spaceWindow.attached, true);
  assert.equal(spaceWindow.tabs.find((tab) => tab.url === `${local}/route-space`).id, spaceWindow.activeTabId);
  assert.equal(routed.find((rt) => rt.id === spacesWindow.id).workspaceId !== spaceId, true, 'the current window is not switched');
  console.log('external-links route to a Space that is not open PASS');

  // The same Space, now showing, takes the next link in that window.
  await deliver(`${local}/route-space/again`);
  routed = await delivered(`${local}/route-space/again`);
  assert.equal(holder(routed, `${local}/route-space/again`).id, spaceWindow.id);

  // A profile with no window open gets a new window holding just the link.
  for (const rt of routed.filter((candidate) => candidate.profileId === spacesId && candidate.attached)) {
    assert.equal(await callTestHook(app, 'closeWindowRuntime', [rt.id]), true);
  }
  await waitForValue(() => callTestHook(app, 'windowRuntimes'),
    (all) => !all.some((rt) => rt.profileId === spacesId && rt.attached), 'profile windows closed');
  await linkRoutes([rule('profile-window', 'contains', '/route-new-window', { profileId: spacesId })]);
  await deliver(`${local}/route-new-window`);
  routed = await delivered(`${local}/route-new-window`);
  const newWindow = holder(routed, `${local}/route-new-window`);
  assert.equal(newWindow.profileId, spacesId);
  assert.equal(newWindow.attached, true);
  assert.deepEqual(newWindow.tabs.map((tab) => tab.url), [`${local}/route-new-window`]);
  assert.equal(newWindow.activeTabId, newWindow.tabs[0].id);
  console.log('external-links route to a profile with no window PASS');
  await linkRoutes([]);
  console.log('external-links-smoke PASS: cold launch, hidden/minimized restore, readiness cancellation, windowless reopen, profile routing, second-instance batch, link routing rules');
} finally {
  if (app) await app.close();
  await new Promise((resolve) => server.close(resolve));
  const errors = fs.existsSync(uncaughtLog) ? fs.readFileSync(uncaughtLog, 'utf8').trim() : '';
  fs.rmSync(root, { recursive: true, force: true });
  assert.equal(errors, '', 'No uncaught main-process exceptions');
}
