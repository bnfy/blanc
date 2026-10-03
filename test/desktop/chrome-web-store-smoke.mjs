import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { _electron } from 'playwright';
import hook from './support/test-hook-call.js';
import polling from './support/poll.js';
import runtime from '../../scripts/preflight-electron-runtime.js';
const { callTestHook: call } = hook;
const { waitForValue: wait } = polling;
const expected = runtime.verifyElectronRuntime().locked;
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-web-store-'));
const uncaught = path.join(root, 'uncaught.log');
const listing = 'https://chromewebstore.google.com/category/extensions';
const detail = 'https://chromewebstore.google.com/detail/1password-%E2%80%93-password-manager/aeblfdkhhhdcdjpifhhbdiojplfjncoa';
const server = http.createServer((req, res) => {
  if (req.url === '/redirect') { res.writeHead(302, { Location: detail }); res.end(); return; }
  res.setHeader('Content-Type', 'text/html');
  res.end(`<!doctype html><title>Store link</title><a id="store" target="_blank" href="${detail}">Web Store</a>`);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const { ELECTRON_RUN_AS_NODE: ignored, ...env } = process.env;
void ignored;
const profile = (name, restored = false) => {
  const userData = path.join(root, name);
  fs.mkdirSync(`${userData}-Dev`);
  fs.writeFileSync(path.join(`${userData}-Dev`, 'settings.json'), JSON.stringify({ onboardingVersion: 1, adblockEnabled: false, usagePing: false, searchSuggestions: false }));
  if (restored) fs.writeFileSync(path.join(`${userData}-Dev`, 'session.json'), JSON.stringify({ urls: [listing], activeIndex: 0 }));
  return userData;
};
let app, cases = 0;
const launch = async userData => {
  const result = await _electron.launch({ args: [path.resolve('.'), `--user-data-dir=${userData}`], env: { ...env, BLANC_TEST: '1', BLANC_TEST_UNCAUGHT_LOG: uncaught }, chromiumSandbox: true });
  await result.firstWindow();
  assert.equal(await result.evaluate(() => process.versions.electron), expected);
  await wait(() => call(result, 'startupReady'), Boolean, 'startup', 30_000);
  return result;
};
const loaded = async (id, label) => {
  const wcId = await call(app, 'workspacePageIdentity', [id]);
  const result = await wait(() => app.evaluate(async ({ webContents }, id) => {
    const wc = webContents.fromId(id);
    if (!wc || wc.isLoadingMainFrame()) return null;
    if (new URL(wc.getURL()).hostname !== 'chromewebstore.google.com') return null;
    return wc.executeJavaScript('({ api: typeof window.chrome?.webstorePrivate, title: document.title, body: document.body.innerText.length, origin: location.origin, url: location.href })');
  }, wcId), value => value?.body > 100 && value.title, label, 45_000);
  assert.match(result.title, /Chrome Web Store/, `${label}: real Store document`);
  if (result.url.includes('aeblfdkhhhdcdjpifhhbdiojplfjncoa')) assert.match(result.title, /1Password/);
  assert.equal(result.api, 'undefined', `${label}: unsupported API absent`);
  assert.equal(result.origin, 'https://chromewebstore.google.com');
  assert.equal(await app.evaluate(({ app }) => app.isReady()), true);
  cases++;
};
try {
  app = await launch(profile('direct'));
  const primary = (await call(app, 'windowRuntimes'))[0];
  let id = await call(app, 'openTabInWindow', [primary.id, listing, {}]);
  await loaded(id, 'Personal listing');
  id = await call(app, 'openTabInWindow', [primary.id, `${origin}/redirect`, {}]);
  await loaded(id, 'redirect to detail');
  await call(app, 'openTabInWindow', [primary.id, `${origin}/link`, {}]);
  const page = await wait(async () => (await app.windows()).find(page => page.url() === `${origin}/link`), Boolean, 'popup link');
  const beforePopup = (await call(app, 'windowRuntimes')).find(window => window.id === primary.id).tabs.length;
  await page.locator('#store').click();
  const popup = await wait(() => call(app, 'windowRuntimes'), windows => {
    const window = windows.find(window => window.id === primary.id);
    return window?.tabs.length === beforePopup + 1 && window.tabs.at(-1)?.url.includes('aeblfdkhhhdcdjpifhhbdiojplfjncoa');
  }, 'one actual Store popup tab', 45_000);
  id = popup.find(window => window.id === primary.id).tabs.at(-1).id;
  await loaded(id, 'popup detail');
  id = await call(app, 'openTabInWindow', [primary.id, listing, { private: true }]);
  await loaded(id, 'Personal private listing');
  const named = await call(app, 'createProfileWindow', ['Store test']);
  assert.equal(named.ok, true);
  id = await call(app, 'openTabInWindow', [named.runtimeId, listing, {}]);
  await loaded(id, 'named profile listing');
  id = await call(app, 'openTabInWindow', [named.runtimeId, detail, { private: true }]);
  await loaded(id, 'named private detail');
  await app.close(); app = null;
  app = await launch(profile('restored', true));
  const restored = await call(app, 'state');
  await loaded(restored.activeTabId, 'restored quiet Store tab');
  assert.equal(fs.existsSync(uncaught) ? fs.readFileSync(uncaught, 'utf8') : '', '');
  console.log(`Web Store browsing PASS: ${cases} real-page paths, unsupported API absent, no uncaught exceptions; Electron ${expected}`);
} finally {
  if (app) await app.close();
  await new Promise(resolve => server.close(resolve));
  fs.rmSync(root, { recursive: true, force: true });
}
