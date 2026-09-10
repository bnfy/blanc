import { _electron } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import testHookCall from './support/test-hook-call.js';
import poll from './support/poll.js';
import { encryptHandoff } from '../../cloudflare/tab-import-worker/src/model.js';
import browserDataImport from '../../src/main/browser-data-import.js';
import sessionFixture from '../support/chromium-session-fixture.js';

const { callTestHook } = testHookCall;
const { waitForValue } = poll;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-tab-handoff-'));
const envelopes = new Map();
const claims = new Map();
const pageLoads = new Map();
const delayedClaims = new Map();

const server = http.createServer((request, response) => {
  const origin = `http://127.0.0.1:${server.address().port}`;
  const url = new URL(request.url, origin);
  const claim = url.pathname.match(/^\/v1\/handoffs\/([A-Za-z0-9_-]{22})\/claim$/);
  if (request.method === 'POST' && claim) {
    const id = claim[1];
    const envelope = envelopes.get(id);
    claims.set(id, (claims.get(id) ?? 0) + 1);
    if (!envelope) {
      response.writeHead(404, { 'Content-Type': 'application/json' });
      response.end('{"error":"unavailable"}');
      return;
    }
    envelopes.delete(id);
    const finish = () => {
      response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify(envelope));
    };
    if (delayedClaims.has(id)) delayedClaims.set(id, finish);
    else finish();
    return;
  }
  if (request.method === 'GET' && url.pathname.startsWith('/page/')) {
    pageLoads.set(url.pathname, (pageLoads.get(url.pathname) ?? 0) + 1);
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(`<!doctype html><title>${url.pathname}</title><p>tab import smoke</p>`);
    return;
  }
  response.writeHead(404);
  response.end('not found');
});

const listen = () => new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
const closeServer = () => new Promise((resolve) => {
  if (!server.listening) return resolve();
  server.close(resolve);
});
const deepLinkFor = (handoff) => `blanc-import://tabs?v=1&id=${handoff.id}&key=${handoff.key}`;
// Page titles and wake completion can change independently while another
// window imports; ownership, order, selection, and membership must not.
const windowIdentity = (window) => ({
  id: window.id, profileId: window.profileId, activeTabId: window.activeTabId,
  tabs: window.tabs.map(({ id, url, private: isPrivate, pinned, groupId }) =>
    ({ id, url, private: isPrivate, pinned, groupId })),
});

let app;
try {
  await listen();
  const relayOrigin = `http://127.0.0.1:${server.address().port}`;
  const browserHome = path.join(profile, 'source-browser');
  const chromeRoot = browserDataImport.browserDataRoot('chrome', {
    platform: process.platform, homeDir: browserHome,
    env: { ...process.env, LOCALAPPDATA: browserHome },
  });
  const sourceSessions = path.join(chromeRoot, 'Profile 2', 'Sessions');
  fs.mkdirSync(sourceSessions, { recursive: true });
  fs.writeFileSync(path.join(chromeRoot, 'Local State'), JSON.stringify({
    profile: { info_cache: { 'Profile 2': { name: 'Merge fixture' } } },
  }));
  const localUrls = [`${relayOrigin}/page/local-one`, `${relayOrigin}/page/local-two`];
  fs.writeFileSync(path.join(sourceSessions, 'Session_100'), sessionFixture.createChromiumSession({
    activeWindowId: 1,
    windows: [{ id: 1, tabs: [
      { id: 1, url: localUrls[0], title: 'Local one', groupName: 'project', pinned: true },
      { id: 2, url: localUrls[1], title: 'Local two', groupName: 'project' },
    ] }],
  }));
  const first = await encryptHandoff({
    v: 1,
    sourceBrowser: 'safari',
    tabs: [
      { url: `${relayOrigin}/page/one#keep`, title: 'One', active: false },
      { url: `${relayOrigin}/page/two`, title: 'Two', active: true },
      { url: `${relayOrigin}/page/three`, title: 'Three', active: false },
    ],
  });
  const second = await encryptHandoff({
    v: 1,
    sourceBrowser: 'firefox',
    tabs: [{ url: `${relayOrigin}/page/four`, title: 'Four', active: true }],
  });
  const wrongKeyTarget = await encryptHandoff({
    v: 1,
    sourceBrowser: 'chrome',
    tabs: [{ url: `${relayOrigin}/page/five`, title: 'Five', active: true }],
  });
  const unrelatedKey = await encryptHandoff({
    v: 1,
    sourceBrowser: 'edge',
    tabs: [{ url: `${relayOrigin}/page/six`, title: 'Six', active: true }],
  });
  envelopes.set(first.id, first.envelope);
  envelopes.set(second.id, second.envelope);
  envelopes.set(wrongKeyTarget.id, wrongKeyTarget.envelope);

  const { ELECTRON_RUN_AS_NODE: _ignored, ...cleanEnv } = process.env;
  void _ignored;
  app = await _electron.launch({
    args: [path.resolve('.'), `--user-data-dir=${profile}`, deepLinkFor(first)],
    env: {
      ...cleanEnv,
      BLANC_TEST: '1',
      BLANC_TEST_TAB_IMPORT_RELAY: relayOrigin,
      BLANC_TEST_BROWSER_HOME: browserHome,
    },
  });
  await app.firstWindow();
  await waitForValue(
    () => callTestHook(app, 'startupReady'),
    Boolean,
    'startup',
    30_000,
  );

  const ready = await waitForValue(
    () => callTestHook(app, 'tabHandoffState'),
    (state) => state.pending?.state === 'ready' && state.claimInFlight === false,
    'cold-start tab handoff review',
    10_000,
  );
  assert.equal(ready.pending.sourceBrowser, 'safari');
  assert.equal(ready.pending.profileName, 'Personal');
  const originalWindow = ready.windows[0];
  const originalTabs = originalWindow.tabs;
  assert.ok(originalTabs.length > 0, 'cold-start blank tab is retained');
  assert.deepEqual(ready.pending.tabs.map((tab) => [tab.title, tab.domain, tab.active]), [
    ['One', '127.0.0.1', false],
    ['Two', '127.0.0.1', true],
    ['Three', '127.0.0.1', false],
  ]);

  // A second invocation while review is pending must focus the existing
  // sheet without consuming the second relay record.
  assert.equal(await callTestHook(app, 'queueTabHandoff', [deepLinkFor(second)]), true);
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.equal(claims.get(second.id) ?? 0, 0);

  const accepted = await callTestHook(app, 'acceptTabHandoff');
  assert.equal(accepted.ok, true);
  assert.equal(accepted.runtimeId, originalWindow.id);
  assert.equal((await callTestHook(app, 'acceptTabHandoff')).ok, false, 'accept is one-shot');
  const imported = await waitForValue(
    () => callTestHook(app, 'tabHandoffState'),
    (state) => state.windows.find((window) => window.id === accepted.runtimeId)
      ?.tabs.filter((tab) => accepted.tabIds.includes(tab.id))
      .every((tab) => tab.active ? tab.live && !tab.asleep : !tab.live && tab.asleep),
    'one live imported tab and quiet background tabs',
    10_000,
  );
  const importedWindow = imported.windows.find((window) => window.id === accepted.runtimeId);
  assert.equal(imported.windows.length, ready.windows.length);
  assert.deepEqual(importedWindow.tabs.slice(0, originalTabs.length).map((tab) => tab.id), originalTabs.map((tab) => tab.id));
  const importedTabs = importedWindow.tabs.filter((tab) => accepted.tabIds.includes(tab.id));
  assert.deepEqual(importedTabs.map((tab) => tab.url), [
    `${relayOrigin}/page/one#keep`,
    `${relayOrigin}/page/two`,
    `${relayOrigin}/page/three`,
  ]);
  assert.equal(importedTabs.filter((tab) => tab.live).length, 1);
  assert.equal(importedWindow.tabs.find((tab) => tab.active)?.url, `${relayOrigin}/page/two`);
  assert.equal(importedWindow.tabs.every((tab) => !tab.private && !tab.pinned && tab.groupId === null), true);
  assert.equal(pageLoads.get('/page/two'), 1);
  assert.equal(pageLoads.get('/page/one') ?? 0, 0);
  assert.equal(pageLoads.get('/page/three') ?? 0, 0);

  const session = await callTestHook(app, 'persistedSessionData');
  const persisted = session.windows.find((window) => window.id === accepted.runtimeId);
  assert.deepEqual(persisted.urls, importedWindow.tabs.map((tab) => tab.url));
  assert.equal(persisted.activeIndex, originalTabs.length + 1);

  // Retrying the still-valid second link after the first review completes is
  // claimable, and Cancel removes it without opening another window.
  await waitForValue(
    () => callTestHook(app, 'tabHandoffState'),
    (state) => state.claimInFlight === false && state.flushable === true,
    'tab handoff queue to become idle',
  );
  assert.equal(await callTestHook(app, 'queueTabHandoff', [deepLinkFor(second)]), true);
  await waitForValue(
    () => callTestHook(app, 'tabHandoffState'),
    (state) => state.pending?.state === 'ready',
    'running-app tab handoff review',
    10_000,
  );
  assert.equal(claims.get(second.id), 1);
  const beforeCancel = (await callTestHook(app, 'tabHandoffState')).windows.length;
  assert.deepEqual(await callTestHook(app, 'cancelTabHandoff'), { ok: true });
  const afterCancel = await callTestHook(app, 'tabHandoffState');
  assert.equal(afterCancel.pending.state, 'empty');
  assert.equal(afterCancel.windows.length, beforeCancel);

  const wrongKeyLink = `blanc-import://tabs?v=1&id=${wrongKeyTarget.id}&key=${unrelatedKey.key}`;
  assert.equal(await callTestHook(app, 'queueTabHandoff', [wrongKeyLink]), true);
  const wrongKey = await waitForValue(
    () => callTestHook(app, 'tabHandoffState'),
    (state) => state.pending?.state === 'error',
    'wrong-key handoff error',
    10_000,
  );
  assert.match(wrongKey.pending.message, /could not verify/i);
  assert.equal(claims.get(wrongKeyTarget.id), 1);
  await callTestHook(app, 'cancelTabHandoff');

  // A canceled retrieval must not swallow the next link while its response
  // is still pending, and must never paint its old result into the new sheet.
  const makeHandoff = async (title) => {
    const handoff = await encryptHandoff({ v: 1, sourceBrowser: 'firefox', tabs: [
      { url: `${relayOrigin}/page/${title}`, title, active: true },
    ] });
    envelopes.set(handoff.id, handoff.envelope);
    return handoff;
  };
  const slow = await makeHandoff('slow');
  const replacement = await makeHandoff('replacement');
  const third = await makeHandoff('third');
  delayedClaims.set(slow.id, null);
  await callTestHook(app, 'queueTabHandoff', [deepLinkFor(slow)]);
  await waitForValue(() => delayedClaims.get(slow.id), Boolean, 'deferred claim received');
  await callTestHook(app, 'cancelTabHandoff');
  await callTestHook(app, 'queueTabHandoff', [deepLinkFor(replacement)]);
  assert.equal((await callTestHook(app, 'tabHandoffState')).pending.state, 'waiting');
  await callTestHook(app, 'queueTabHandoff', [deepLinkFor(third)]);
  assert.equal(claims.get(replacement.id) ?? 0, 0);
  assert.equal(claims.get(third.id) ?? 0, 0);
  delayedClaims.get(slow.id)();
  delayedClaims.delete(slow.id);
  const replacementReady = await waitForValue(
    () => callTestHook(app, 'tabHandoffState'),
    (state) => state.pending?.state === 'ready',
    'replacement review after canceled retrieval',
  );
  assert.equal(replacementReady.pending.tabs[0].title, 'replacement');
  assert.equal(claims.get(replacement.id), 1);
  assert.equal(claims.get(third.id) ?? 0, 0);
  await callTestHook(app, 'cancelTabHandoff');

  const slowCanceled = await makeHandoff('slow-canceled');
  delayedClaims.set(slowCanceled.id, null);
  await callTestHook(app, 'queueTabHandoff', [deepLinkFor(slowCanceled)]);
  await waitForValue(() => delayedClaims.get(slowCanceled.id), Boolean, 'second deferred claim received');
  await callTestHook(app, 'cancelTabHandoff');
  await callTestHook(app, 'queueTabHandoff', [deepLinkFor(third)]);
  assert.equal((await callTestHook(app, 'tabHandoffState')).pending.state, 'waiting');
  await callTestHook(app, 'cancelTabHandoff');
  delayedClaims.get(slowCanceled.id)();
  delayedClaims.delete(slowCanceled.id);
  await waitForValue(() => callTestHook(app, 'tabHandoffState'), (state) => !state.claimInFlight, 'canceled queue idle');
  assert.equal((await callTestHook(app, 'tabHandoffState')).pending.state, 'empty');
  assert.equal(claims.get(third.id) ?? 0, 0);

  // Both entry paths coexist in one running app. Replacing either review
  // cancels only that review; the richer local flow still preserves pins and
  // source groups, while the handoff appends ungrouped tabs to that window.
  await callTestHook(app, 'focusWindow');
  const stagedLocal = await callTestHook(app, 'applyTabImportFixture', ['merge-existing', { stage: 'review' }]);
  assert.equal(stagedLocal.ok, true);
  assert.deepEqual(stagedLocal.dom.groupNames, ['project']);
  const interop = await makeHandoff('interop');
  await callTestHook(app, 'queueTabHandoff', [deepLinkFor(interop)]);
  await waitForValue(() => callTestHook(app, 'tabHandoffState'), (state) => state.pending.state === 'ready', 'handoff replaces local review');
  assert.equal((await callTestHook(app, 'getTabImportSessionProjection')).error, 'session-unavailable');
  await callTestHook(app, 'openTabImport');
  assert.equal((await callTestHook(app, 'tabHandoffState')).pending.state, 'empty');
  await waitForValue(() => callTestHook(app, 'utilitySurface'), (surface) => surface.ready && surface.url === 'blanc://tab-import/', 'local review replaces handoff');
  const localApplied = await callTestHook(app, 'applyTabImportFixture', ['merge-existing', { directApply: true }]);
  assert.equal(localApplied.applied, true);
  assert.equal(localApplied.broadcastCount, 1);
  const localState = await callTestHook(app, 'state');
  const localTabs = localState.tabOrder.map((id) => localState.tabs.find((tab) => tab.id === id)).filter((tab) => localUrls.includes(tab.url));
  assert.deepEqual(localTabs.map((tab) => tab.url), localUrls);
  assert.equal(localTabs[0].pinned, true);
  assert.equal(localTabs[0].groupId, localTabs[1].groupId);
  assert.equal(localState.groups.find((group) => group.id === localTabs[0].groupId).name, 'project');
  assert.equal(localTabs[1].asleep, true);
  assert.equal(localTabs[1].webContentsId, null);
  assert.equal(pageLoads.get('/page/local-two') ?? 0, 0);
  const afterLocal = await makeHandoff('after-local');
  await callTestHook(app, 'queueTabHandoff', [deepLinkFor(afterLocal)]);
  await waitForValue(() => callTestHook(app, 'tabHandoffState'), (state) => state.pending.state === 'ready', 'handoff after local apply');
  const secondAccepted = await callTestHook(app, 'acceptTabHandoff');
  assert.equal(secondAccepted.ok, true);
  const afterBoth = await callTestHook(app, 'tabHandoffState');
  assert.equal(secondAccepted.runtimeId, originalWindow.id);
  const mergedWindow = afterBoth.windows.find((window) => window.id === secondAccepted.runtimeId);
  const appended = mergedWindow.tabs.at(-1);
  assert.equal(appended.groupId, null);
  assert.equal(appended.pinned, false);
  const localAfter = await callTestHook(app, 'state');
  assert.deepEqual(localAfter.tabOrder, [...localState.tabOrder, ...secondAccepted.tabIds]);
  assert.deepEqual(localAfter.groups, localState.groups);
  assert.equal(mergedWindow.tabs.find((tab) => tab.id === localTabs[0].id).pinned, true);

  // A named-profile review owns its destination even after another window
  // gains focus. Exercise the actual page/preload/IPC acceptance bridge.
  const named = await callTestHook(app, 'createProfileWindow', ['Handoff test']);
  assert.equal(named.ok, true);
  const namedHandoff = await makeHandoff('named-current');
  await callTestHook(app, 'queueTabHandoff', [deepLinkFor(namedHandoff)]);
  const namedReady = await waitForValue(() => callTestHook(app, 'tabHandoffState'),
    (state) => state.pending.state === 'ready', 'named-profile review');
  assert.equal(namedReady.pending.profileName, 'Handoff test');
  const reviewContentsId = await waitForValue(() => app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows().find((win) => win.getTitle().includes('Handoff test'));
    return window?.contentView.children.find((view) => view.webContents?.getURL() === 'blanc://tab-handoff/')?.webContents.id;
  }), Boolean, 'named profile review document');
  const reviewDom = (script) => app.evaluate(({ webContents }, { id, script }) =>
    webContents.fromId(id).executeJavaScript(script), { id: reviewContentsId, script });
  await waitForValue(() => reviewDom('!document.getElementById("accept").disabled'), Boolean, 'review ready for acceptance');
  assert.equal(await reviewDom('document.getElementById("newWindow").checked'), false);
  assert.equal(await reviewDom('document.getElementById("accept").textContent'), 'Open in this window');
  await reviewDom('document.getElementById("newWindow").click()');
  assert.equal(await reviewDom('document.getElementById("accept").textContent'), 'Open in new window');
  assert.match(await reviewDom('document.getElementById("summary").textContent'), /a new Handoff test window/);
  await reviewDom('document.getElementById("newWindow").click()');
  await callTestHook(app, 'focusWindow');
  const namedAccepted = await reviewDom('window.bowserPages.tabHandoff.accept()');
  assert.equal(namedAccepted.ok, true);
  assert.equal(namedAccepted.runtimeId, named.runtimeId);
  const namedAfter = await callTestHook(app, 'tabHandoffState');
  assert.equal(namedAfter.windows.length, namedReady.windows.length);
  assert.equal(namedAfter.windows.find((window) => window.id === named.runtimeId).tabs.at(-1).url,
    `${relayOrigin}/page/named-current`);
  assert.deepEqual(windowIdentity(namedAfter.windows.find((window) => window.id === originalWindow.id)),
    windowIdentity(namedReady.windows.find((window) => window.id === originalWindow.id)));

  const explicitNew = await makeHandoff('explicit-new');
  await callTestHook(app, 'queueTabHandoff', [deepLinkFor(explicitNew)]);
  const beforeNew = await waitForValue(() => callTestHook(app, 'tabHandoffState'),
    (state) => state.pending.state === 'ready', 'explicit new-window review');
  assert.equal((await callTestHook(app, 'acceptTabHandoff', ['unexpected'])).error, 'invalid-destination');
  assert.equal((await callTestHook(app, 'tabHandoffState')).pending.state, 'ready');
  const newAccepted = await callTestHook(app, 'acceptTabHandoff', ['new-window']);
  assert.equal(newAccepted.ok, true);
  assert.notEqual(newAccepted.runtimeId, named.runtimeId);
  const afterNew = await callTestHook(app, 'tabHandoffState');
  assert.equal(afterNew.windows.length, beforeNew.windows.length + 1);
  const newWindow = afterNew.windows.find((window) => window.id === newAccepted.runtimeId);
  assert.equal(newWindow.profileId, named.profile.id);
  assert.deepEqual(newWindow.tabs.map((tab) => tab.url), [`${relayOrigin}/page/explicit-new`]);
  assert.deepEqual(afterNew.windows.filter((window) => window.id !== newAccepted.runtimeId).map(windowIdentity),
    beforeNew.windows.map(windowIdentity));

  await closeServer();
  assert.equal(await callTestHook(app, 'queueTabHandoff', [deepLinkFor(unrelatedKey)]), true);
  const offline = await waitForValue(
    () => callTestHook(app, 'tabHandoffState'),
    (state) => state.pending?.state === 'error',
    'offline relay error',
    10_000,
  );
  assert.match(offline.pending.message, /could not reach/i);
  await callTestHook(app, 'cancelTabHandoff');

  console.log(`tab-handoff-smoke OK on ${process.platform}`);
} finally {
  for (const finish of delayedClaims.values()) finish?.();
  if (app) await app.close().catch(() => {});
  await closeServer().catch(() => {});
  fs.rmSync(profile, { recursive: true, force: true });
  fs.rmSync(`${profile}-Dev`, { recursive: true, force: true });
}
