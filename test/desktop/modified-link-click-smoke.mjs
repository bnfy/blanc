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
let caseCount = 0;
let recoveryCount = 0;
async function documentResult(id, label) {
  return waitForValue(() => callTestHook(app, 'workspacePageScript', [id, 'window.clickResult']),
    (result) => !!result?.storage, `${label} document behavior`);
}
try {
  app = await _electron.launch({
    args: [path.resolve('.'), `--user-data-dir=${profile}`],
    env: { ...env, BLANC_TEST: '1', BLANC_TEST_UNCAUGHT_LOG: uncaught },
  });
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
          assert.equal(state.tabs.find((tab) => tab.id === child.id).groupId, context.groupId);
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
            await callTestHook(app, 'duplicateActive');
            const copies = (await callTestHook(app, 'windowRuntimes'))
              .find((runtime) => runtime.id === context.runtimeId).tabs.filter((tab) => tab.url === targetUrl);
            assert.equal(copies.length, 2);
            const duplicate = copies.find((tab) => tab.id !== child.id);
            assert.equal((await documentResult(duplicate.id, 'duplicate')).storage, 'SecurityError');
            recoveryCount++;
            await callTestHook(app, 'closeGroupByName', ['Sandbox recovery']);
            await callTestHook(app, 'reopenClosedInWindow', [context.runtimeId]);
            const restored = (await callTestHook(app, 'windowRuntimes'))
              .find((runtime) => runtime.id === context.runtimeId).tabs.filter((tab) => tab.url === targetUrl);
            assert.equal(restored.length, 2);
            for (const tab of restored) {
              await callTestHook(app, 'activateTab', [tab.id]);
              assert.equal((await documentResult(tab.id, 'quiet group reopen')).storage, 'SecurityError');
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
  console.log(`modified-link-click OK on ${process.platform}: ${caseCount} click/sandbox/referrer cases, ${recoveryCount} restricted-tab recreations`);
} finally {
  if (app && app.process().exitCode === null) await app.close();
  await new Promise((resolve) => server.close(resolve));
  const error = fs.existsSync(uncaught) ? fs.readFileSync(uncaught, 'utf8') : '';
  fs.rmSync(root, { recursive: true, force: true });
  assert.equal(error, '', 'no uncaught main-process errors');
}
