// Dark websites (F42) against the shipping app: first-paint darkening, strict
// CSP, live Settings/theme changes, /dark-site, private-tab choices staying
// out of settings, the stylesheet fetch refusing private addresses, and the
// shield popover's Dark website switch.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { _electron } from 'playwright';
import testHookCall from './support/test-hook-call.js';
import poll from './support/poll.js';
import focus from './support/popup-focus-trace.js';
const { callTestHook } = testHookCall;
const { waitForValue, clickWhenSettled } = poll;

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-dark-websites-'));
const profile = path.join(root, 'profile');
fs.mkdirSync(`${profile}-Dev`);
fs.writeFileSync(path.join(`${profile}-Dev`, 'settings.json'), JSON.stringify({
  onboardingVersion: 1, presentationDefaultsResetVersion: 1, theme: 'dark',
  usagePing: false, searchSuggestions: false, darkWebsites: true,
}));

// Records the body colour seen by the page's first script, before any later
// work, to prove there is no white first paint.
const early = '<script>window.__earlyBg = getComputedStyle(document.body).backgroundColor;</script>';
const pages = {
  '/plain': `<!doctype html><title>Plain</title><style>body{background:#fff;color:#111}.card{background:#f4f4f4}</style><body>${early}<div class="card" id="card">card</div></body>`,
  '/csp': '<!doctype html><title>CSP</title><link rel="stylesheet" href="/csp.css"><body><div class="card" id="card">strict CSP</div></body>',
  '/csp.css': 'body{background:#fff;color:#111}.card{background:#f4f4f4}',
  '/private-css': '<!doctype html><title>Private CSS</title><link rel="stylesheet" href="__OTHER__/other.css"><body><div class="xcard" id="xcard">cross-origin</div></body>',
};
const server = http.createServer((req, res) => {
  const body = pages[req.url];
  if (!body) { res.writeHead(404); res.end(); return; }
  const headers = { 'Content-Type': req.url.endsWith('.css') ? 'text/css' : 'text/html' };
  if (req.url === '/csp') headers['Content-Security-Policy'] = "default-src 'self'; style-src 'self'; script-src 'self'";
  res.writeHead(200, headers);
  res.end(body.replace('__OTHER__', otherOrigin));
});
let otherRequests = 0;
const other = http.createServer((_req, res) => {
  otherRequests += 1;
  res.writeHead(200, { 'Content-Type': 'text/css' });
  res.end('body{background:#fff}.xcard{background:#f4f4f4}');
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
await new Promise((resolve) => other.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const otherOrigin = `http://127.0.0.1:${other.address().port}`;

const luminance = (rgb) => {
  const [r, g, b] = String(rgb).match(/[\d.]+/g).map(Number);
  const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const isDark = (v) => luminance(v) < 0.1;
const isLight = (v) => luminance(v) > 0.8;

const { ELECTRON_RUN_AS_NODE: ignored, ...env } = process.env;
let app;
try {
  app = await _electron.launch({ chromiumSandbox: true, args: [path.resolve('.'), `--user-data-dir=${profile}`], env: { ...env, BLANC_TEST: '1' } });
  await waitForValue(() => app.evaluate(() => globalThis.__blanc?.startupReady()), Boolean, 'startup ready', 30000);
  const chrome = await waitForValue(async () => (await app.windows()).find((p) => p.url() === 'blanc-chrome://index/'), Boolean, 'chrome');
  await app.evaluate(({ webContents }) => webContents.getAllWebContents().forEach((wc) => wc.setBackgroundThrottling(false)));
  const bg = (tabId, selector = 'body') => callTestHook(app, 'executeTab', [tabId, `getComputedStyle(document.querySelector(${JSON.stringify(selector)})).backgroundColor`]);
  const settingsNow = () => callTestHook(app, 'darkWebsitesSettings');
  const darkSite = () => chrome.evaluate(() => window.browserAPI.toggleDarkSiteOnActiveSite());

  // 1. A white page is dark from its first script, and the engine is hidden.
  const tabId = await callTestHook(app, 'openTab', [`${origin}/plain`]);
  await waitForValue(() => bg(tabId), isDark, 'plain page darkened', 10000);
  assert.ok(isDark(await callTestHook(app, 'executeTab', [tabId, 'window.__earlyBg'])), 'dark at first paint');
  assert.ok(isDark(await bg(tabId, '#card')));
  assert.equal(await callTestHook(app, 'executeTab', [tabId, 'typeof window.__blancDarkWebsites + typeof window.DarkReader + typeof window.__blancDarkWebsitesBridge']), 'undefinedundefinedundefined');

  // 2. A strict-CSP page is darkened too.
  const cspTab = await callTestHook(app, 'openTab', [`${origin}/csp`]);
  await waitForValue(() => bg(cspTab, '#card'), isDark, 'CSP page darkened', 10000);

  // 3. A stylesheet on a private address is never fetched for the engine:
  // the server sees only the page's own request, and the rules that sheet
  // sets stay as drawn while Dark Reader's fallback darkens the root.
  const privateCss = await callTestHook(app, 'openTab', [`${origin}/private-css`]);
  await waitForValue(() => bg(privateCss, 'html'), isDark, 'page root darkened', 10000);
  await new Promise((resolve) => setTimeout(resolve, 1500));
  assert.ok(isLight(await bg(privateCss, '#xcard')), 'private-address stylesheet left unread');
  assert.equal(otherRequests, 1, 'only the page itself requested the private-address stylesheet');

  // 4. /dark-site keeps the site as drawn, live, and saves it.
  await callTestHook(app, 'activateTab', [tabId]);
  assert.deepEqual(await darkSite(), { hostname: '127.0.0.1', darkened: false });
  await waitForValue(() => bg(tabId), isLight, 'site restored by /dark-site', 6000);
  assert.deepEqual((await settingsNow()).darkWebsitesExceptions, ['127.0.0.1']);
  assert.deepEqual(await darkSite(), { hostname: '127.0.0.1', darkened: true });
  await waitForValue(() => bg(tabId), isDark, 'site darkened again', 6000);
  assert.deepEqual((await settingsNow()).darkWebsitesExceptions, []);

  // 5. Blanc's light theme leaves every page as drawn, live.
  await chrome.evaluate(() => window.browserAPI.cycleTheme('light'));
  await waitForValue(() => bg(tabId), isLight, 'light theme restores page', 6000);
  await chrome.evaluate(() => window.browserAPI.cycleTheme('dark'));
  await waitForValue(() => bg(tabId), isDark, 'dark theme darkens page', 6000);

  // 6. A private tab's /dark-site choice is not written to settings.
  const privateTab = await callTestHook(app, 'openTab', [`${origin}/plain`, { private: true }]);
  await waitForValue(() => bg(privateTab), isDark, 'private tab darkened', 10000);
  assert.deepEqual(await darkSite(), { hostname: '127.0.0.1', darkened: false });
  await waitForValue(() => bg(privateTab), isLight, 'private tab restored', 6000);
  assert.deepEqual(await settingsNow(), { darkWebsites: true, darkWebsitesExceptions: [] });
  assert.ok(isDark(await bg(tabId)), 'normal tab unaffected by the private choice');

  // 7. The Settings toggle turns it off and on again, live.
  await callTestHook(app, 'openSettings');
  const sheet = await waitForValue(async () => (await app.windows()).find((p) => p.url().startsWith('blanc://settings')), Boolean, 'settings sheet');
  await sheet.waitForSelector('#darkWebsites', { state: 'attached' });
  assert.equal(await sheet.$eval('#darkWebsites', (el) => el.checked), true);
  await sheet.click('#darkWebsitesSetting .toggle');
  await waitForValue(() => bg(tabId), isLight, 'Settings off restores page', 6000);
  assert.equal(await sheet.$eval('#darkWebsitesExceptionsBlock', (el) => el.hidden), true);
  await sheet.click('#darkWebsitesSetting .toggle');
  await waitForValue(() => bg(tabId), isDark, 'Settings on darkens page', 6000);
  await sheet.fill('#darkExceptionInput', 'https://www.Example.com/path');
  await sheet.click('#darkExceptionAdd');
  await waitForValue(async () => (await settingsNow()).darkWebsitesExceptions, (v) => JSON.stringify(v) === '["example.com"]', 'site added from Settings, normalized', 4000);
  await sheet.keyboard.press('Escape');

  // 8. The shield popover's Dark website switch is /dark-site for this site.
  await callTestHook(app, 'activateTab', [tabId]);
  await focus.focusFixtureWindow(app);
  await clickWhenSettled(chrome.locator('#pillShield'), 'Island shield');
  const overlay = await waitForValue(async () => (await app.windows()).find((p) => p.url() === 'blanc-chrome://overlay/'), Boolean, 'shield overlay');
  const darkToggle = overlay.locator('#shieldPopDarkToggle');
  await darkToggle.waitFor({ state: 'visible' });
  assert.equal(await darkToggle.getAttribute('aria-checked'), 'true');
  assert.equal(await overlay.locator('#shieldPopDarkNote').isHidden(), true, 'no light-theme note while Blanc is dark');
  await clickWhenSettled(darkToggle, 'Dark website switch');
  await waitForValue(() => bg(tabId), isLight, 'site restored from the shield popover', 6000);
  await waitForValue(() => darkToggle.getAttribute('aria-checked'), (v) => v === 'false', 'switch reads off');
  assert.equal(await overlay.locator('#shieldPopDarkOnOff').innerText(), 'off');
  assert.deepEqual((await settingsNow()).darkWebsitesExceptions, ['example.com', '127.0.0.1']);
  await clickWhenSettled(darkToggle, 'Dark website switch');
  await waitForValue(() => bg(tabId), isDark, 'site darkened from the shield popover', 6000);
  await waitForValue(() => darkToggle.getAttribute('aria-checked'), (v) => v === 'true', 'switch reads on');
  assert.deepEqual((await settingsNow()).darkWebsitesExceptions, ['example.com']);
  // While Blanc is light the switch keeps its meaning and says when it applies.
  await chrome.evaluate(() => window.browserAPI.cycleTheme('light'));
  await waitForValue(() => overlay.locator('#shieldPopDarkNote').isVisible(), Boolean, 'light-theme note shown', 6000);
  assert.equal(await darkToggle.getAttribute('aria-checked'), 'true');

  console.log(JSON.stringify({ ok: true, profile: root }));
} finally {
  await app?.close().catch(() => {});
  server.close();
  other.close();
}
