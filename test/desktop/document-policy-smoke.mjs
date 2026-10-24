import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { _electron } from 'playwright';
import testHookCall from './support/test-hook-call.js';
import poll from './support/poll.js';

// Inherited document policy on the exact Electron runtime
// (src/main/document-policy.js). A page-opened tab keeps its opener's
// HTML/CSP sandbox only in the WebContents Electron built for it, so every
// path that would give it a fresh one must refuse or keep the tab inert.
// Covered for an opaque sandbox, a same-origin sandbox (a restriction origin
// can't show: forms), a page-opened child of an unsandboxed page, and an
// ordinary tab as the control that still duplicates, rests and reopens.
const { callTestHook } = testHookCall;
const { waitForValue } = poll;
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-document-policy-'));
const profile = path.join(root, 'profile');
const userData = `${profile}-Dev`;
const uncaught = path.join(root, 'uncaught.log');
fs.mkdirSync(userData);
fs.writeFileSync(path.join(userData, 'settings.json'), JSON.stringify({
  onboardingVersion: 1, adblockEnabled: false, usagePing: false, searchSuggestions: false,
}));

const HOUR = 60 * 60 * 1000;
const variants = [
  { name: 'opaque', sandbox: 'allow-scripts allow-popups', restricted: true, storage: 'SecurityError' },
  { name: 'same-origin', sandbox: 'allow-same-origin allow-scripts allow-popups', restricted: true, storage: 'allowed' },
  { name: 'unsandboxed', sandbox: null, restricted: false, storage: 'allowed' },
];
const formHits = new Set();
const pageHits = new Map();
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://fixture.test');
  pageHits.set(req.url, (pageHits.get(req.url) ?? 0) + 1);
  if (url.pathname === '/favicon.ico') {
    res.writeHead(404);
    res.end();
    return;
  }
  // Targets are built here from fixed-shape parameters, never taken from the
  // request as a URL: /source links to it, /redirect sends there.
  const targetPath = () => {
    const safe = (value) => (/^[a-z-]{1,40}$/.test(value ?? '') ? value : 'none');
    return `/target?${new URLSearchParams({ v: safe(url.searchParams.get('v')), tag: safe(url.searchParams.get('tag')) })}`;
  };
  if (url.pathname === '/redirect') {
    res.writeHead(302, { Location: targetPath() });
    res.end();
    return;
  }
  if (url.pathname === '/form-hit') {
    formHits.add(url.searchParams.get('n'));
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('ok');
    return;
  }
  const variant = variants.find((candidate) => candidate.name === url.searchParams.get('v'));
  const headers = { 'Content-Type': 'text/html; charset=utf-8' };
  // Only the source document is sandboxed; the target inherits it as a popup.
  if (url.pathname === '/source' && variant?.sandbox) headers['Content-Security-Policy'] = `sandbox ${variant.sandbox}`;
  res.writeHead(200, headers);
  // The archive cases use a page with no frame or form, which the Archive's
  // unsaved-work probe would otherwise count against it.
  const plain = url.searchParams.get('tag') === 'archive';
  res.end(url.pathname === '/source'
    ? `<!doctype html><a id="link" href="${targetPath()}" target="_blank">Open target</a>`
    : plain
      ? `<!doctype html><title>Policy target</title><p id="target">Target loaded</p><script>
        window.probe = { nonce: 'plain' };
        try { localStorage.setItem('policy-marker', 'ok'); window.probe.storage = 'allowed'; }
        catch (error) { window.probe.storage = error.name; }
      </script>`
      : `<!doctype html><title>Policy target</title><p id="target">Target loaded</p>
      <iframe name="sink"></iframe><form id="f" method="post" target="sink"></form>
      <script>
        const nonce = Math.random().toString(36).slice(2);
        window.probe = { nonce };
        try { localStorage.setItem('policy-marker', 'ok'); window.probe.storage = 'allowed'; }
        catch (error) { window.probe.storage = error.name; }
        const form = document.getElementById('f');
        // No field is filled in, so Quiet Tabs doesn't count the page as edited.
        form.action = '/form-hit?n=' + nonce;
        form.submit();
      </script>`);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const { ELECTRON_RUN_AS_NODE: ignored, ...env } = process.env;

let app;
let appProcess;
let checks = 0;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function launch() {
  app = await _electron.launch({
    chromiumSandbox: true,
    args: [path.resolve('.'), `--user-data-dir=${profile}`],
    env: { ...env, BLANC_TEST: '1', BLANC_TEST_UNCAUGHT_LOG: uncaught },
  });
  appProcess = app.process();
  await app.firstWindow();
  await waitForValue(() => callTestHook(app, 'startupReady'), Boolean, 'startup', 30_000);
}

async function quit() {
  await callTestHook(app, 'workspaceAction', ['flush']).catch(() => {});
  await app.close();
}

const tabsNow = async () => (await callTestHook(app, 'windowRuntimes'))[0].tabs;
// Read from main: page script can stall while a document is being replaced.
async function hrefOf(id) {
  const wcId = await callTestHook(app, 'workspacePageIdentity', [id]);
  if (!wcId) return null;
  return app.evaluate(({ webContents }, wc) => webContents.fromId(wc)?.getURL() ?? null, wcId);
}

/** Middle-click the source page's link and return the page-opened child. */
async function openChild(variant, tag) {
  const query = new URLSearchParams({ v: variant.name, tag });
  const sourceId = await callTestHook(app, 'openTab', [`${origin}/source?${query}`]);
  const sourceWcId = await callTestHook(app, 'workspacePageIdentity', [sourceId]);
  const targetUrl = `${origin}/target?${query}`;
  const point = await app.evaluate(async ({ webContents }, id) => {
    const wc = webContents.fromId(id);
    await new Promise((resolve) => { if (!wc.isLoading()) resolve(); else wc.once('did-stop-loading', resolve); });
    return wc.executeJavaScript(`(() => {
      const rect = document.getElementById('link').getBoundingClientRect();
      return { x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2) };
    })()`);
  }, sourceWcId);
  await app.evaluate(({ webContents, BrowserWindow }, { id, point }) => {
    const wc = webContents.fromId(id);
    BrowserWindow.fromWebContents(wc)?.focus();
    wc.focus();
    const input = { ...point, button: 'middle', modifiers: [], clickCount: 1 };
    wc.sendInputEvent({ ...input, type: 'mouseDown' });
    wc.sendInputEvent({ ...input, type: 'mouseUp' });
  }, { id: sourceWcId, point });
  const child = await waitForValue(async () => (await tabsNow()).find((tab) => tab.url === targetUrl),
    Boolean, `${variant.name}/${tag} child opened`, 10_000);
  await callTestHook(app, 'closeTab', [sourceId]);
  return { id: child.id, url: targetUrl };
}

/** Kill a tab's renderer. On Linux, forcefullyCrashRenderer() only asks the
 * renderer to crash itself, which GitHub's Ubuntu runner never does, so kill
 * the WebContents' own renderer process there, as Blanc's renderer-discard.js does. */
async function crashRenderer(wcId) {
  await app.evaluate(({ webContents }, id) => {
    const wc = webContents.fromId(id);
    const pid = wc.getOSProcessId();
    if (process.platform === 'linux' && pid > 0) process.kill(pid, 'SIGKILL');
    else wc.forcefullyCrashRenderer();
  }, wcId);
}

/** The live document's restrictions: storage, and whether its form reached the server. */
async function probe(id, label) {
  const result = await waitForValue(() => callTestHook(app, 'workspacePageScript', [id, 'window.probe']),
    (value) => !!value?.nonce && !!value.storage, `${label} probe`);
  // A sent form arrives within moments; a sandboxed one never does.
  const sent = await waitForValue(() => formHits.has(result.nonce), Boolean, `${label} form`, 2_000)
    .then(() => true, () => false);
  return { storage: result.storage, formSent: sent };
}

async function assertDocumentPolicy(id, variant, label) {
  await callTestHook(app, 'activateTab', [id]);
  const result = await probe(id, label);
  assert.equal(result.storage, variant.storage, `${label}: storage`);
  assert.equal(result.formSent, !variant.restricted, `${label}: form submission`);
  checks++;
}

async function assertInert(id, url, label) {
  await callTestHook(app, 'activateTab', [id]);
  const href = await waitForValue(() => hrefOf(id),
    (value) => typeof value === 'string' && value.startsWith('blanc://error/'), `${label} shows the inert page`);
  const params = new URL(href).searchParams;
  assert.equal(params.get('kind'), 'inert', `${label}: inert mode`);
  assert.equal(params.get('url'), url, `${label}: keeps the real address`);
  // Once the page's script has run, Retry is gone and Copy link is there.
  await waitForValue(() => callTestHook(app, 'workspacePageScript', [id,
    `({ retry: !!document.getElementById('retryLink'), copy: !!document.getElementById('copyLink'),
      title: document.getElementById('errorTitle')?.textContent, href: location.href })`]),
  (value) => value?.retry === false && value.copy === true, `${label}: offers no way to load the page`);
  checks++;
}

async function assertLoads(id, url, label) {
  await callTestHook(app, 'activateTab', [id]);
  await waitForValue(() => hrefOf(id), (value) => value === url, `${label} loads its page`);
  checks++;
}

/** The Archive never takes a tab that is still loading. */
const settled = (id, label) => waitForValue(async () => (await callTestHook(app, 'state')).tabs
  ?.find((tab) => tab.id === id), (tab) => tab && !tab.loading, `${label} settled`, 10_000);

/** The inert view never leaves Blanc's page: not through its New Tab link
 * (and a favorite from there), a main-process load, a redirect, or history. */
async function assertInertLocked(id, url, label) {
  const wcId = await callTestHook(app, 'workspacePageIdentity', [id]);
  const inertHref = await hrefOf(id);
  const before = new Set((await tabsNow()).map((tab) => tab.id));
  await callTestHook(app, 'workspacePageScript', [id,
    "setTimeout(() => document.getElementById('safetyLink').click(), 0); true"]);
  const opened = await waitForValue(async () => (await tabsNow()).find((tab) => !before.has(tab.id)),
    Boolean, `${label}: New Tab opens beside it`);
  assert.equal(await hrefOf(id), inertHref, `${label}: New Tab leaves the inert view alone`);
  // Going to the page from that new tab (a favorite, or its address) loads
  // there, never in the inert view.
  await waitForValue(() => hrefOf(opened.id), (value) => value?.startsWith('blanc://newtab'), `${label}: new tab ready`);
  await callTestHook(app, 'navigateTab', [opened.id, url]);
  await waitForValue(() => hrefOf(opened.id), (value) => value === url, `${label}: the page opens in the new tab`);
  assert.equal(await hrefOf(id), inertHref, `${label}: the favorite never reaches the inert view`);
  await callTestHook(app, 'closeTab', [opened.id]);
  // A main-process load of the page, directly or through a redirect.
  // The request never leaves the browser, and the explanation comes back.
  const path = (value) => value.slice(origin.length);
  for (const target of [url, `${origin}/redirect${new URL(url).search}`]) {
    const hitsBefore = pageHits.get(path(target)) ?? 0;
    await app.evaluate(({ webContents }, { wcId, target }) => webContents.fromId(wcId)
      .loadURL(target).catch(() => {}), { wcId, target });
    await sleep(500);
    assert.equal(pageHits.get(path(target)) ?? 0, hitsBefore, `${label}: ${target} was never requested`);
    await waitForValue(() => hrefOf(id), (value) => value === inertHref, `${label}: explanation back after ${target}`);
  }
  // Reload and Back stay on Blanc's page too.
  await app.evaluate(({ webContents }, wcId) => { webContents.fromId(wcId).reload(); }, wcId);
  await waitForValue(() => hrefOf(id), (value) => value === inertHref, `${label}: reload`);
  // Look-alikes of the explanation page: another internal page behind a
  // credentials prefix, and an ordinary error page whose Retry would load it.
  for (const target of ['blanc://error@newtab/', `blanc://error/?url=${encodeURIComponent(url)}&code=-105`]) {
    await app.evaluate(({ webContents }, { wcId, target }) => webContents.fromId(wcId)
      .loadURL(target).catch(() => {}), { wcId, target });
    await waitForValue(() => hrefOf(id), (value) => value === inertHref, `${label}: ${target} put back`, 10_000);
  }
  // A crash of the inert view recovers to the explanation, not the crash page.
  await crashRenderer(wcId);
  await waitForValue(() => hrefOf(id), (value) => value === inertHref, `${label}: crash recovers inert`, 20_000);
  await waitForValue(() => callTestHook(app, 'workspacePageScript', [id,
    "!document.getElementById('retryLink') && !!document.getElementById('copyLink')"]),
  (value) => value === true, `${label}: recovered page offers no Retry`, 10_000);
  // Back and Forward: the cancelled attempts' entries are cleared once the
  // page is back, and stepping through history never requests the page.
  const hitsBefore = pageHits.get(path(url)) ?? 0;
  await app.evaluate(({ webContents }, wcId) => {
    const nav = webContents.fromId(wcId).navigationHistory;
    if (nav.canGoBack()) nav.goBack();
  }, wcId);
  await sleep(500);
  await waitForValue(() => hrefOf(id), (value) => value === inertHref, `${label}: Back`);
  assert.equal(pageHits.get(path(url)) ?? 0, hitsBefore, `${label}: Back never requested the page`);
  await waitForValue(() => app.evaluate(({ webContents }, wcId) => webContents.fromId(wcId)
    .navigationHistory.getAllEntries().map((entry) => entry.url), wcId),
  (entries) => entries.every((entry) => entry.startsWith('blanc://error')), `${label}: history holds only Blanc's page`);
  checks++;
}

const restoredWithUrl = async (url, label) => waitForValue(async () => (await tabsNow()).find((tab) => tab.url === url),
  Boolean, `${label} restored`);

try {
  await launch();
  await callTestHook(app, 'setTabArchive', ['12h']);

  // The ordinary control: a tab Blanc opened itself.
  const ordinaryUrl = `${origin}/target?v=ordinary`;
  const ordinary = await callTestHook(app, 'openTab', [ordinaryUrl]);
  await assertDocumentPolicy(ordinary, { storage: 'allowed', restricted: false }, 'ordinary');
  assert.equal((await callTestHook(app, 'tabMenuItem', [ordinary, 'duplicate'])).enabled, true);
  await callTestHook(app, 'activateTab', [ordinary]);
  await callTestHook(app, 'duplicateActive');
  const copies = (await tabsNow()).filter((tab) => tab.url === ordinaryUrl);
  assert.equal(copies.length, 2, 'an ordinary tab duplicates');
  await assertLoads(copies.find((tab) => tab.id !== ordinary).id, ordinaryUrl, 'ordinary duplicate');
  await callTestHook(app, 'closeTab', [copies.find((tab) => tab.id !== ordinary).id]);
  await callTestHook(app, 'activateTab', [(await callTestHook(app, 'newTab'))]);
  assert.equal(await callTestHook(app, 'sleepTab', [ordinary]), true, 'ordinary: quiet');
  await assertLoads(ordinary, ordinaryUrl, 'ordinary after quiet');

  // Positive control for the archive path: an ordinary tab archives and restores.
  const archiveControlUrl = `${origin}/target?v=ordinary&tag=archive`;
  const archiveControl = await callTestHook(app, 'openTab', [archiveControlUrl]);
  await waitForValue(() => hrefOf(archiveControl), (value) => value === archiveControlUrl, 'archive control loaded');
  await callTestHook(app, 'activateTab', [ordinary]);
  await settled(archiveControl, 'archive control');
  for (const tab of await tabsNow()) await callTestHook(app, 'setTabViewedSince', [tab.id, 0]);
  await callTestHook(app, 'setTabViewedSince', [archiveControl, 13 * HOUR]);
  await callTestHook(app, 'setArchiveGraceUntil', [0]);
  const controlSweep = await callTestHook(app, 'runArchiveSweep');
  assert.deepEqual(controlSweep.archived, [archiveControl], 'ordinary: archived');
  const controlEntry = (await callTestHook(app, 'archiveEntries')).find((item) => item.url === archiveControlUrl);
  assert.ok(await callTestHook(app, 'restoreArchived', [controlEntry.id]));
  const controlBack = await restoredWithUrl(archiveControlUrl, 'ordinary unarchived');
  await assertLoads(controlBack.id, archiveControlUrl, 'ordinary unarchived');
  await callTestHook(app, 'closeTab', [controlBack.id]);

  for (const variant of variants) {
    // Baseline: the child Electron built carries the opener's sandbox.
    const child = await openChild(variant, 'base');
    await assertDocumentPolicy(child.id, variant, `${variant.name} child`);

    // Duplicate and Quiet are refused for every page-opened tab.
    assert.equal((await callTestHook(app, 'tabMenuItem', [child.id, 'duplicate'])).enabled, false,
      `${variant.name}: Duplicate disabled`);
    // Quiet is offered only for a background tab.
    await callTestHook(app, 'activateTab', [ordinary]);
    // Quiet is offered only for a background tab.
    await callTestHook(app, 'activateTab', [ordinary]);
    assert.equal((await callTestHook(app, 'tabMenuItem', [child.id, 'quiet'])).enabled, false,
      `${variant.name}: Quiet disabled`);
    const before = (await tabsNow()).length;
    await callTestHook(app, 'activateTab', [child.id]);
    await callTestHook(app, 'duplicateActive');
    assert.equal((await tabsNow()).length, before, `${variant.name}: no copy is made`);
    checks++;

    // Tab crash and Retry stay in the same WebContents.
    const wcId = await callTestHook(app, 'workspacePageIdentity', [child.id]);
    // Record the renderer's death in main, so a failure says whether the
    // crash happened or Blanc's recovery stalled.
    await app.evaluate(({ webContents }, id) => {
      globalThis.__policyCrash = null;
      webContents.fromId(id).once('render-process-gone', (_event, details) => {
        globalThis.__policyCrash = details?.reason ?? 'gone';
      });
    }, wcId);
    await crashRenderer(wcId);
    const reason = await waitForValue(() => app.evaluate(() => globalThis.__policyCrash), Boolean,
      `${variant.name} renderer gone`, 20_000);
    await waitForValue(() => hrefOf(child.id), (value) => typeof value === 'string'
      && value.startsWith('blanc://error/') && new URL(value).searchParams.get('kind') !== 'inert',
    `${variant.name} crash page after the renderer was ${reason}`, 20_000);
    // The person's Retry: the link on the page. Clicked after the script
    // returns, so the navigation can't stall the call.
    await callTestHook(app, 'workspacePageScript', [child.id,
      "setTimeout(() => document.getElementById('retryLink').click(), 0); true"]);
    await waitForValue(() => hrefOf(child.id), (value) => value === child.url, `${variant.name} retry`);
    await assertDocumentPolicy(child.id, variant, `${variant.name} after crash and Retry`);

    // A forced rest (any path that discards the view) wakes inert.
    await callTestHook(app, 'activateTab', [ordinary]);
    // quietTab may still refuse (its edit probe fails safe on a sandboxed
    // document); then the live, restricted view simply stays. When it does
    // rest, waking must show the inert page.
    const rested = await callTestHook(app, 'sleepTab', [child.id]);
    if (!variant.sandbox) assert.equal(rested, true, `${variant.name}: forced quiet`);
    if (rested) await assertInert(child.id, child.url, `${variant.name} woken`);
    else await assertDocumentPolicy(child.id, variant, `${variant.name} after a refused quiet`);
    await callTestHook(app, 'closeTab', [child.id]);

    // Reopen Closed Tab: a page-opened tab is never held, so it comes back inert.
    const closed = await openChild(variant, 'closed');
    await callTestHook(app, 'closeTab', [closed.id]);
    const summary = (await callTestHook(app, 'closedEntriesSummary')).find((entry) => entry.url === closed.url);
    assert.equal(summary?.held, false, `${variant.name}: not held`);
    await callTestHook(app, 'reopenClosed');
    const reopened = await restoredWithUrl(closed.url, `${variant.name} reopened`);
    await assertInert(reopened.id, closed.url, `${variant.name} reopened`);
    await assertInertLocked(reopened.id, closed.url, `${variant.name} reopened`);
    await callTestHook(app, 'closeTab', [reopened.id]);

    // A closed split reopens inert beside an ordinary pane that loads.
    const splitChild = await openChild(variant, 'split');
    const partnerUrl = `${origin}/target?v=ordinary&tag=split-${variant.name}`;
    const partner = await callTestHook(app, 'openTab', [partnerUrl]);
    assert.ok(await callTestHook(app, 'makeSplit', [splitChild.id, [partner]]), `${variant.name}: split made`);
    await callTestHook(app, 'runTabMenuItem', [splitChild.id, 'close-split']);
    await callTestHook(app, 'reopenClosed');
    const splitBack = await restoredWithUrl(splitChild.url, `${variant.name} split reopened`);
    await assertInert(splitBack.id, splitChild.url, `${variant.name} split reopened`);
    const partnerBack = await restoredWithUrl(partnerUrl, `${variant.name} split partner`);
    await assertLoads(partnerBack.id, partnerUrl, `${variant.name} split partner`);
    await callTestHook(app, 'runTabMenuItem', [splitBack.id, 'close-split']);

    // Tab Archive: a page-opened tab restores inert.
    const archived = await openChild(variant, 'archive');
    await callTestHook(app, 'activateTab', [ordinary]);
    await settled(archived.id, `${variant.name} archive candidate`);
    for (const tab of await tabsNow()) await callTestHook(app, 'setTabViewedSince', [tab.id, 0]);
    await callTestHook(app, 'setTabViewedSince', [archived.id, 13 * HOUR]);
    await callTestHook(app, 'setArchiveGraceUntil', [0]);
    const sweep = await callTestHook(app, 'runArchiveSweep');
    // Like Quiet, the sweep's edit probe fails safe on a sandboxed document,
    // so a live sandboxed tab may stay put. The unsandboxed child must go.
    if (!variant.sandbox) assert.deepEqual(sweep.archived, [archived.id], `${variant.name}: archived`);
    if (sweep.archived.includes(archived.id)) {
      const entry = (await callTestHook(app, 'archiveEntries')).find((item) => item.url === archived.url);
      assert.ok(await callTestHook(app, 'restoreArchived', [entry.id]));
      const unarchived = await restoredWithUrl(archived.url, `${variant.name} unarchived`);
      await assertInert(unarchived.id, archived.url, `${variant.name} unarchived`);
      await callTestHook(app, 'closeTab', [unarchived.id]);
    } else {
      await callTestHook(app, 'activateTab', [archived.id]);
      const left = await waitForValue(() => callTestHook(app, 'workspacePageScript', [archived.id, 'window.probe']),
        (value) => !!value?.storage, `${variant.name} left unarchived`);
      assert.equal(left.storage, variant.storage, `${variant.name} left unarchived: storage`);
      checks++;
      await callTestHook(app, 'closeTab', [archived.id]);
    }
  }

  // Tab sync never publishes a page-opened tab.
  const kept = await openChild(variants[1], 'kept');
  const synced = (await callTestHook(app, 'sessionSyncSnapshot')).tabs.map((tab) => tab.url);
  assert.ok(synced.includes(ordinaryUrl), 'an ordinary tab syncs');
  assert.ok(!synced.includes(kept.url), 'a page-opened tab stays on this device');
  checks++;

  // A Space records the stamp and the mark.
  assert.ok(await callTestHook(app, 'workspaceAction', ['save', 'Document policy']));
  await callTestHook(app, 'workspaceAction', ['flush']);
  const spaces = JSON.parse(fs.readFileSync(path.join(userData, 'workspaces.json'), 'utf8'));
  const space = spaces.workspaces.find((candidate) => candidate.urls?.includes(kept.url));
  assert.equal(space?.documentPolicy, 1, 'the Space is stamped');
  assert.equal(space.inheritsDocumentPolicy[space.urls.indexOf(kept.url)], true);
  assert.equal(space.inheritsDocumentPolicy[space.urls.indexOf(ordinaryUrl)], false);
  checks++;

  // Relaunch: the page-opened tab restores inert, the ordinary tab loads.
  await quit();
  const sessionPath = path.join(userData, 'session.json');
  const saved = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
  const savedWindow = saved.windows.find((candidate) => candidate.urls.includes(kept.url));
  assert.equal(savedWindow.documentPolicy, 1, 'the session window is stamped');
  assert.equal(savedWindow.inheritsDocumentPolicy[savedWindow.urls.indexOf(kept.url)], true);
  assert.equal('documentPolicy' in saved, false, 'the rollback mirror never gets the stamp');
  await launch();
  const relaunched = (await restoredWithUrl(kept.url, 'relaunch')).id;
  await assertInert(relaunched, kept.url, 'relaunch');
  await assertInertLocked(relaunched, kept.url, 'relaunch');
  await assertLoads((await restoredWithUrl(ordinaryUrl, 'relaunch control')).id, ordinaryUrl, 'relaunch control');

  // A stamped record with a malformed mark restores inert, even the control.
  await quit();
  const malformed = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
  for (const windowEntry of malformed.windows) {
    windowEntry.inheritsDocumentPolicy = windowEntry.urls.map((url) => {
      if (url === ordinaryUrl) return 'yes';
      return url === kept.url;
    });
  }
  fs.writeFileSync(sessionPath, JSON.stringify(malformed));
  await launch();
  await assertInert((await restoredWithUrl(ordinaryUrl, 'malformed')).id, ordinaryUrl, 'malformed mark');
  await assertInert((await restoredWithUrl(kept.url, 'marked again')).id, kept.url, 'a mark survives a second relaunch');

  // Legacy (unstamped) records keep restoring as before: the accepted risk (4a).
  await quit();
  const legacy = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
  for (const windowEntry of legacy.windows) {
    delete windowEntry.documentPolicy;
    delete windowEntry.inheritsDocumentPolicy;
    if (!windowEntry.urls.includes(kept.url)) windowEntry.urls.push(kept.url);
  }
  fs.writeFileSync(sessionPath, JSON.stringify(legacy));
  await launch();
  await assertLoads((await restoredWithUrl(kept.url, 'legacy')).id, kept.url, 'legacy record (4a)');

  console.log(`document-policy OK on ${process.platform}: ${checks} checks across ${variants.length} page-opened variants and an ordinary control`);
} finally {
  if (app && appProcess?.exitCode === null) await app.close().catch(() => {});
  await new Promise((resolve) => server.close(resolve));
  const error = fs.existsSync(uncaught) ? fs.readFileSync(uncaught, 'utf8') : '';
  fs.rmSync(root, { recursive: true, force: true });
  assert.equal(error, '', 'no uncaught main-process errors');
}
