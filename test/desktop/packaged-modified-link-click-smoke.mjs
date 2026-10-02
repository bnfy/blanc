import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { launchPackagedOverCdp } from './support/packaged-cdp.mjs';
import poll from './support/poll.js';

// Exercise native Chromium input inside the hardened packaged application.
// Use the shipping chrome IPC surface, never main-process test hooks or Node
// inspection (the production NodeCliInspect fuse remains disabled).
const { waitForValue } = poll;
const executablePath = process.env.BLANC_PACKAGED_EXECUTABLE;
assert.ok(executablePath && fs.existsSync(executablePath), 'set BLANC_PACKAGED_EXECUTABLE to the packaged app');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-packaged-click-'));
const profile = path.join(root, 'profile');
fs.mkdirSync(profile);
fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify({
  onboardingVersion: 1, adblockEnabled: false, usagePing: false, searchSuggestions: false,
}));
const policies = [
  { name: 'default', referrerPolicy: '', referrer: 'source', storage: 'allowed' },
  { name: 'origin', referrerPolicy: 'origin', referrer: 'origin', storage: 'allowed' },
  { name: 'no-referrer', referrerPolicy: 'no-referrer', referrer: '', storage: 'allowed' },
  { name: 'sandbox', sandbox: 'allow-scripts allow-popups', referrer: '', storage: 'SecurityError' },
  { name: 'sandbox-escape', sandbox: 'allow-scripts allow-popups allow-popups-to-escape-sandbox',
    referrer: '', storage: 'allowed' },
];
const requests = new Map();
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://fixture.test');
  const policy = policies.find((candidate) => candidate.name === url.searchParams.get('policy'));
  requests.set(req.url, req.headers.referer ?? '');
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8',
    ...(policy?.sandbox ? { 'Content-Security-Policy': `sandbox ${policy.sandbox}` } : {}),
  });
  res.end(url.pathname === '/source'
    ? '<!doctype html><a id="link" target="_blank" href="/target">Open target</a>'
    : `<!doctype html><p id="target">Target loaded</p><script>
      window.clickResult = { referrer: document.referrer };
      try { localStorage.setItem('click-marker', 'ok'); window.clickResult.storage = 'allowed'; }
      catch (error) { window.clickResult.storage = error.name; }
    </script>`);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
const clicks = [
  { label: 'modified left-click', button: 'left', modifiers: [modifier], background: true },
  { label: 'middle-click', button: 'middle', modifiers: [], background: true },
  { label: 'modified Shift+left-click', button: 'left', modifiers: [modifier, 'Shift'], background: false },
  { label: 'Shift+middle-click', button: 'middle', modifiers: ['Shift'], background: false },
];
const { ELECTRON_RUN_AS_NODE: ignored, ...env } = process.env;
let app;
let chrome;
let caseCount = 0;
let recoveryCount = 0;
const readTabs = () => chrome.evaluate(() => window.browserAPI.getAllTabs());
const pages = () => app.browser.contexts().flatMap((context) => context.pages());
const pageAt = (url) => waitForValue(() => Promise.resolve(pages().find((page) => page.url() === url)),
  Boolean, `packaged page at ${url}`, 20_000);
try {
  app = await launchPackagedOverCdp({
    executablePath, args: [`--user-data-dir=${profile}`], env: { ...env, BLANC_TEST: '0' },
  });
  chrome = await pageAt('blanc-chrome://index/');
  await chrome.waitForFunction(() => typeof window.browserAPI?.getAllTabs === 'function');
  // Preload exposes IPC before chrome's did-finish-load startup selection.
  // Finish that selection before arranging the source of a background click.
  await chrome.waitForLoadState('load');
  await waitForValue(readTabs, (state) => state.tabs.some((tab) =>
    tab.id === state.activeTabId && tab.url === 'blanc://newtab/' && !tab.isLoading),
  'initial packaged tab is ready');
  for (const isPrivate of [false, true]) {
    for (const policy of policies) {
      for (const [index, click] of clicks.entries()) {
        const label = `${isPrivate ? 'private' : 'regular'}/${policy.name}/${click.label}`;
        const targetUrl = `${origin}/target?case=${isPrivate}-${policy.name}-${index}`;
        const sourceUrl = `${origin}/source?policy=${policy.name}&case=${isPrivate}-${index}`;
        const sourceId = await chrome.evaluate(({ url, isPrivate }) => window.browserAPI.createTab(url, {
          private: isPrivate,
        }), { url: sourceUrl, isPrivate });
        const source = await pageAt(sourceUrl);
        await source.locator('#link').waitFor();
        await source.locator('#link').evaluate((link, { targetUrl, referrerPolicy }) => {
          link.href = targetUrl;
          link.referrerPolicy = referrerPolicy;
        }, { targetUrl, referrerPolicy: policy.referrerPolicy ?? '' });
        await chrome.evaluate((id) => window.browserAPI.groupTabByName(id, 'Packaged clicks'), sourceId);
        await chrome.evaluate((id) => window.browserAPI.switchTab(id), sourceId);
        const before = await waitForValue(readTabs, (state) => state.activeTabId === sourceId,
          `${label} source is active`);
        const sourceGroup = before.tabs.find((tab) => tab.id === sourceId).groupId;
        assert.ok(sourceGroup, `${label} source is grouped`);
        const windowCount = pages().filter((page) => page.url() === 'blanc-chrome://index/').length;
        await source.locator('#link').click({ button: click.button, modifiers: click.modifiers });
        const after = await waitForValue(readTabs, (state) => {
          const child = state.tabs.find((tab) => tab.url === targetUrl);
          return child && state.activeTabId === (click.background ? sourceId : child.id);
        }, `${label} tab and focus`, 20_000);
        const children = after.tabs.filter((tab) => tab.url === targetUrl);
        assert.equal(children.length, 1, `${label} creates one destination tab`);
        assert.equal(after.tabs.length, before.tabs.length + 1, `${label} creates exactly one tab`);
        assert.equal(pages().filter((page) => page.url() === 'blanc-chrome://index/').length, windowCount,
          `${label} does not create another native window`);
        const child = children[0];
        assert.equal(child.private, isPrivate, `${label} retains the private mode`);
        assert.equal(child.groupId, sourceGroup, `${label} retains the source group`);
        const target = await pageAt(targetUrl);
        await target.waitForFunction(() => !!window.clickResult?.storage);
        const result = await target.evaluate(() => window.clickResult);
        const expectedReferrer = policy.referrer === 'source' ? sourceUrl
          : policy.referrer === 'origin' ? `${origin}/` : '';
        assert.equal(result.referrer, expectedReferrer, `${label} document referrer`);
        assert.equal(requests.get(new URL(targetUrl).pathname + new URL(targetUrl).search), expectedReferrer,
          `${label} HTTP Referer`);
        assert.equal(result.storage, policy.storage, `${label} document sandbox`);
        assert.equal(await source.evaluate(() => location.href), sourceUrl, `${label} preserves the source`);
        let cleanupIds = [child.id];
        if (!isPrivate && policy.name === 'sandbox' && index === 1) {
          await chrome.evaluate((id) => window.browserAPI.groupTabByName(id, 'Packaged recovery'), child.id);
          const duplicateId = await chrome.evaluate((id) => window.browserAPI.duplicateTab(id), child.id);
          await chrome.evaluate((id) => window.browserAPI.switchTab(id), duplicateId);
          const duplicate = await waitForValue(() => Promise.resolve(pages().find((page) =>
            page !== target && page.url() === targetUrl)), Boolean, 'sandboxed duplicate page');
          await duplicate.waitForFunction(() => !!window.clickResult?.storage);
          assert.equal(await duplicate.evaluate(() => window.clickResult.storage), 'SecurityError');
          recoveryCount++;
          const grouped = await readTabs();
          const recoveryGroup = grouped.tabs.find((tab) => tab.id === child.id).groupId;
          await chrome.evaluate((id) => window.browserAPI.closeGroup(id), recoveryGroup);
          const closed = await readTabs();
          const entry = closed.closed.find((entry) => entry.tabCount === 2);
          assert.ok(entry, 'group closure records both restricted tabs');
          await chrome.evaluate((id) => window.browserAPI.reopenClosedEntry(id), entry.id);
          const restored = (await readTabs()).tabs.filter((tab) => tab.url === targetUrl);
          assert.equal(restored.length, 2);
          for (const tab of restored) {
            await chrome.evaluate((id) => window.browserAPI.switchTab(id), tab.id);
            await waitForValue(readTabs, (state) => state.activeTabId === tab.id
              && state.tabs.find((candidate) => candidate.id === tab.id)?.asleep === false,
            'reopened quiet tab wakes');
          }
          const restoredPages = await waitForValue(() => Promise.resolve(pages().filter((page) =>
            page.url() === targetUrl)), (pages) => pages.length === 2, 'two rebuilt sandboxed pages');
          for (const page of restoredPages) {
            await page.waitForFunction(() => !!window.clickResult?.storage);
            assert.equal(await page.evaluate(() => window.clickResult.storage), 'SecurityError');
            recoveryCount++;
          }
          cleanupIds = restored.map((tab) => tab.id);
        }
        for (const id of [...cleanupIds, sourceId]) {
          await chrome.evaluate((id) => window.browserAPI.closeTab(id), id);
        }
        await chrome.evaluate(() => window.browserAPI.clearClosedEntries());
        caseCount++;
      }
    }
  }
  assert.doesNotMatch(app.output(), /options\.webContents must be a WebContents|uncaughtException/,
    'no main-process modified-click error');
  console.log(`packaged-modified-link-click OK on ${process.platform}: ${caseCount} regular/private click, sandbox, referrer, group and focus cases; ${recoveryCount} restricted-tab recreations`);
} finally {
  if (app) await app.close();
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(root, { recursive: true, force: true });
}
