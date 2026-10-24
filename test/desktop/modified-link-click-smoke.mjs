import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { _electron } from 'playwright';
import testHookCall from './support/test-hook-call.js';
import poll from './support/poll.js';

// Native modifier/button events exercise Electron's deferred background-tab
// contents (#468), including document sandbox/referrer inheritance, profile
// sessions, foreground focus, and recreation of restricted tab contents.
const { callTestHook } = testHookCall;
const { waitForValue } = poll;
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-modified-click-'));
const profile = path.join(root, 'profile');
const uncaught = path.join(root, 'uncaught.log');
fs.mkdirSync(`${profile}-Dev`);
fs.writeFileSync(path.join(`${profile}-Dev`, 'settings.json'), JSON.stringify({
  onboardingVersion: 1, adblockEnabled: false, usagePing: false, searchSuggestions: false,
}));
const requests = new Map();
const policies = [
  { name: 'default', referrerPolicy: '', referrer: 'source', storage: 'allowed' },
  { name: 'origin', referrerPolicy: 'origin', referrer: 'origin', storage: 'allowed' },
  { name: 'no-referrer', referrerPolicy: 'no-referrer', referrer: '', storage: 'allowed' },
  { name: 'sandbox', sandbox: 'allow-scripts allow-popups', referrer: '', storage: 'SecurityError' },
  { name: 'sandbox-escape', sandbox: 'allow-scripts allow-popups allow-popups-to-escape-sandbox',
    referrer: '', storage: 'allowed' },
];
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://fixture.test');
  const policy = policies.find((candidate) => candidate.name === url.searchParams.get('policy'));
  requests.set(req.url, req.headers.referer ?? '');
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8',
    ...(policy?.sandbox ? { 'Content-Security-Policy': `sandbox ${policy.sandbox}` } : {}),
  });
  res.end(url.pathname === '/source'
    ? '<!doctype html><a id="link" href="/target" target="_blank">Open target</a>'
    : `<!doctype html><p id="target">Target loaded</p><script>
      window.clickResult = { referrer: document.referrer };
      try { localStorage.setItem('click-marker', 'ok'); window.clickResult.storage = 'allowed'; }
      catch (error) { window.clickResult.storage = error.name; }
    </script>`);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const { ELECTRON_RUN_AS_NODE: ignored, ...env } = process.env;
const modifier = process.platform === 'darwin' ? 'meta' : 'control';
const clicks = [
  { label: 'modified left-click', button: 'left', modifiers: [modifier], background: true },
  { label: 'middle-click', button: 'middle', modifiers: [], background: true },
  { label: 'modified Shift+left-click', button: 'left', modifiers: [modifier, 'shift'], background: false },
  { label: 'Shift+middle-click', button: 'middle', modifiers: ['shift'], background: false },
];
let app;
// app.process() throws once Playwright disposes an exited app, so keep the
// ChildProcess captured at launch (see ublock-origin.mjs).
let appProcess;
let caseCount = 0;
let recoveryCount = 0;
let failed = false;
/** Teardown: close Blanc and wait for its process to exit, killing it if
 * closing stalls, so a failed check's error is printed rather than lost. */
async function stopApp() {
  const running = () => appProcess?.exitCode === null && appProcess.signalCode === null;
  if (!running()) return;
  const exited = new Promise((resolve) => appProcess.once('exit', resolve));
  const deadline = (ms) => new Promise((resolve) => setTimeout(resolve, ms).unref());
  await Promise.race([app.close().catch(() => {}), deadline(15_000)]);
  if (running()) appProcess.kill();
  await Promise.race([exited, deadline(5_000)]);
}
async function documentResult(id, label) {
  return waitForValue(() => callTestHook(app, 'workspacePageScript', [id, 'window.clickResult']),
    (result) => !!result?.storage, `${label} document behavior`);
}
try {
  app = await _electron.launch({
    chromiumSandbox: true,
    args: [path.resolve('.'), `--user-data-dir=${profile}`],
    env: { ...env, BLANC_TEST: '1', BLANC_TEST_UNCAUGHT_LOG: uncaught },
  });
  appProcess = app.process();
  await app.firstWindow();
  await waitForValue(() => callTestHook(app, 'startupReady'), Boolean, 'startup', 30_000);
  await callTestHook(app, 'groupActiveByName', ['Click source']);
  const primary = (await callTestHook(app, 'windowRuntimes'))[0];
  const named = await callTestHook(app, 'createProfileWindow', ['Click test']);
  assert.equal(named.ok, true);
  const namedRuntime = (await callTestHook(app, 'windowRuntimes')).find((runtime) => runtime.id === named.runtimeId);
  const contexts = [
    { runtimeId: primary.id, profileId: primary.profileId, groupId: primary.groups[0].id },
    { runtimeId: namedRuntime.id, profileId: namedRuntime.profileId, groupId: null },
  ];
  for (const context of contexts) {
    for (const isPrivate of [false, true]) {
      for (const policy of policies) {
        for (const [index, click] of clicks.entries()) {
          const label = `${context.profileId}/${isPrivate ? 'private' : 'regular'}/${policy.name}/${click.label}`;
          const sourceUrl = `${origin}/source?policy=${policy.name}`;
          const sourceId = await callTestHook(app, 'openTabInWindow', [context.runtimeId, sourceUrl, {
            private: isPrivate, groupId: context.groupId,
          }]);
          const sourceWcId = await callTestHook(app, 'workspacePageIdentity', [sourceId]);
          const targetUrl = `${origin}/target?case=${context.profileId}-${isPrivate}-${policy.name}-${index}`;
          const point = await app.evaluate(async ({ webContents }, { id, targetUrl, referrerPolicy }) => {
            const wc = webContents.fromId(id);
            await new Promise((resolve) => {
              if (!wc.isLoading()) resolve();
              else wc.once('did-stop-loading', resolve);
            });
            return wc.executeJavaScript(`(() => {
              const link = document.getElementById('link');
              link.href = ${JSON.stringify(targetUrl)};
              link.referrerPolicy = ${JSON.stringify(referrerPolicy)};
              const rect = link.getBoundingClientRect();
              return { x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2) };
            })()`);
          }, { id: sourceWcId, targetUrl, referrerPolicy: policy.referrerPolicy ?? '' });
          const before = await callTestHook(app, 'windowRuntimes');
          await app.evaluate(({ webContents, BrowserWindow }, { id, point, click }) => {
            const wc = webContents.fromId(id);
            BrowserWindow.fromWebContents(wc)?.focus();
            wc.focus();
            const input = { ...point, button: click.button, modifiers: click.modifiers, clickCount: 1 };
            wc.sendInputEvent({ ...input, type: 'mouseDown' });
            wc.sendInputEvent({ ...input, type: 'mouseUp' });
          }, { id: sourceWcId, point, click });
          const after = await waitForValue(() => callTestHook(app, 'windowRuntimes'), (runtimes) => {
            const runtime = runtimes.find((candidate) => candidate.id === context.runtimeId);
            const child = runtime?.tabs.find((tab) => tab.url === targetUrl);
            return child && runtime.activeTabId === (click.background ? sourceId : child.id);
          }, `${label} tab and focus`, 10_000);
          assert.equal(after.length, before.length, `${label} creates a tab rather than a window`);
          const owner = after.find((runtime) => runtime.id === context.runtimeId);
          const child = owner.tabs.find((tab) => tab.url === targetUrl);
          for (const runtime of after) {
            const old = before.find((candidate) => candidate.id === runtime.id);
            assert.equal(runtime.tabs.length, old.tabs.length + (runtime.id === owner.id ? 1 : 0),
              `${label} opens exactly one tab in its source window`);
          }
          const childWcId = await callTestHook(app, 'workspacePageIdentity', [child.id]);
          await waitForValue(() => app.evaluate(({ webContents }, id) => {
            const wc = webContents.fromId(id);
            return wc && !wc.isLoading() && wc.getURL();
          }, childWcId), (url) => url === targetUrl, `${label} destination loaded`);
          assert.equal(await callTestHook(app, 'workspacePageScript', [child.id, 'document.getElementById("target")?.textContent']),
            'Target loaded', `${label} actually navigates`);
          const result = await documentResult(child.id, label);
          const expectedReferrer = policy.referrer === 'source' ? sourceUrl
            : policy.referrer === 'origin' ? `${origin}/` : '';
          assert.equal(result.referrer, expectedReferrer, `${label} document referrer obeys policy`);
          assert.equal(requests.get(new URL(targetUrl).pathname + new URL(targetUrl).search), expectedReferrer,
            `${label} HTTP Referer obeys policy`);
          assert.equal(result.storage, policy.storage, `${label} inherits document sandbox restrictions`);
          const state = await callTestHook(app, 'state');
          // A link child opens ungrouped, where a plain new tab goes: last in
          // its window's tab order, even when its source is grouped.
          assert.equal(state.tabs.find((tab) => tab.id === child.id).groupId, null,
            `${label} opens ungrouped`);
          assert.equal(owner.tabOrder.at(-1), child.id, `${label} lands last, like a plain new tab`);
          const childSession = await callTestHook(app, 'profileTabSession', [child.id]);
          assert.equal(childSession.profileId, context.profileId);
          assert.equal(childSession.private, isPrivate);
          assert.equal(childSession.persistent, !isPrivate);
          assert.equal(childSession.matchesProfileSession, true);
          assert.equal(childSession.isolatedFromPersonal, true);
          assert.equal(await callTestHook(app, 'workspacePageScript', [sourceId, 'location.href']), sourceUrl,
            `${label} leaves its source document intact`);
          let cleanupIds = [child.id];
          if (context.runtimeId === primary.id && !isPrivate && policy.name === 'sandbox' && index === 1) {
            await callTestHook(app, 'activateTab', [child.id]);
            await callTestHook(app, 'groupTabByName', [child.id, 'Sandbox recovery']);
            // Electron 44.9 can't rebuild a page-opened tab with its opener's
            // sandbox, so Blanc refuses the copy (document-policy.js).
            assert.equal((await callTestHook(app, 'tabMenuItem', [child.id, 'duplicate'])).enabled, false,
              'Duplicate is disabled for a page-opened tab');
            await callTestHook(app, 'duplicateActive');
            const copies = (await callTestHook(app, 'windowRuntimes'))
              .find((runtime) => runtime.id === context.runtimeId).tabs.filter((tab) => tab.url === targetUrl);
            assert.equal(copies.length, 1, 'no unrestricted copy is made');
            recoveryCount++;
            await callTestHook(app, 'closeGroupByName', ['Sandbox recovery']);
            await callTestHook(app, 'reopenClosedInWindow', [context.runtimeId]);
            const restored = (await callTestHook(app, 'windowRuntimes'))
              .find((runtime) => runtime.id === context.runtimeId).tabs.filter((tab) => tab.url === targetUrl);
            assert.equal(restored.length, 1);
            for (const tab of restored) {
              await callTestHook(app, 'activateTab', [tab.id]);
              const shown = await waitForValue(() => callTestHook(app, 'workspacePageScript', [tab.id, 'location.href']),
                (href) => typeof href === 'string' && href.startsWith('blanc://error/'), 'quiet group reopen shows the inert page');
              assert.equal(new URL(shown).searchParams.get('kind'), 'inert');
              assert.equal(new URL(shown).searchParams.get('url'), targetUrl);
              recoveryCount++;
            }
            cleanupIds = restored.map((tab) => tab.id);
          }
          for (const id of [...cleanupIds, sourceId]) {
            await callTestHook(app, 'closeTabInWindow', [context.runtimeId, id]);
          }
          caseCount++;
        }
      }
    }
  }
  console.log(`modified-link-click OK on ${process.platform}: ${caseCount} click/sandbox/referrer cases, ${recoveryCount} restricted-tab rebuilds refused or inert`);
} catch (error) {
  failed = true;
  throw error;
} finally {
  await stopApp();
  await new Promise((resolve) => server.close(resolve));
  const error = fs.existsSync(uncaught) ? fs.readFileSync(uncaught, 'utf8') : '';
  // Windows can keep a child process's cache file open briefly after Blanc
  // exits. Cleanup never replaces an earlier failure; it fails only a pass.
  try {
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  } catch (cleanupError) {
    if (!failed && !error) throw cleanupError;
    console.error(`left ${root} behind: ${cleanupError.code ?? cleanupError.message}`);
  }
  if (failed && error) console.error(`uncaught main-process errors:\n${error}`);
  if (!failed) assert.equal(error, '', 'no uncaught main-process errors');
}
