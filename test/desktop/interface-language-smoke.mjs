// test/desktop/interface-language-smoke.mjs — binds spec/acceptance/interface-language.feature.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { _electron } from 'playwright';
import poll from './support/poll.js';

const { waitForValue } = poll;
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-interface-language-'));
const { ELECTRON_RUN_AS_NODE: _ignored, ...baseEnv } = process.env;
const findPage = (app, prefix, label) =>
  waitForValue(async () => (await app.windows()).find((p) => p.url().startsWith(prefix)), Boolean, label);

function profileWith(name, settings) {
  const profile = path.join(root, name);
  fs.mkdirSync(`${profile}-Dev`, { recursive: true });
  fs.writeFileSync(path.join(`${profile}-Dev`, 'settings.json'), JSON.stringify({
    onboardingVersion: 1, presentationDefaultsResetVersion: 1, adblockEnabled: false, usagePing: false,
    searchSuggestions: false, ...settings,
  }));
  return profile;
}
const storedSettings = (profile) => JSON.parse(fs.readFileSync(path.join(`${profile}-Dev`, 'settings.json'), 'utf8'));

async function withApp(profile, { preferred, german = true }, run) {
  const app = await _electron.launch({ chromiumSandbox: true, args: [path.resolve('.'), `--user-data-dir=${profile}`], env: {
    ...baseEnv, BLANC_TEST: '1', BLANC_TEST_SYSTEM_LANGUAGES: preferred,
    ...(german ? { BLANC_TEST_LOCALE_STATUS: 'de=selectable' } : {}),
    BLANC_TEST_UNCAUGHT_LOG: path.join(root, 'uncaught.log'),
  } });
  try {
    await app.evaluate(() => new Promise((resolve) => {
      const timer = setInterval(() => { if (globalThis.__blanc?.startupReady?.()) { clearInterval(timer); resolve(); } }, 50);
    }));
    return await run(app);
  } finally {
    await app.close().catch(() => {});
  }
}
const locale = (app) => app.evaluate(() => globalThis.__blanc.i18nState().locale);
const chromeLang = async (app) => (await findPage(app, 'blanc-chrome://index/', 'chrome')).evaluate(() => document.documentElement.lang);

const seen = [];
const server = http.createServer((req, res) => {
  if (req.url === '/') seen.push(req.headers['accept-language']); // ignore /favicon.ico
  res.end('<title>ok</title>ok');
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const pageUrl = `http://127.0.0.1:${server.address().port}/`;

try {
  // F44-1
  await withApp(profileWith('f44-1', { uiLanguage: 'system' }), { preferred: 'de-DE' }, async (app) => {
    assert.equal(await locale(app), 'de');
    assert.equal(await chromeLang(app), 'de');
  });
  console.log('ok F44-1');

  // F44-2
  await withApp(profileWith('f44-2', { uiLanguage: 'en' }), { preferred: 'de-DE' }, async (app) => {
    assert.equal(await locale(app), 'en');
    assert.equal(await chromeLang(app), 'en');
  });
  console.log('ok F44-2');

  // F44-3
  const p3 = profileWith('f44-3', { uiLanguage: 'system' });
  await withApp(p3, { preferred: 'en-US' }, async (app) => {
    assert.equal(await locale(app), 'en');
    const chrome = await findPage(app, 'blanc-chrome://index/', 'chrome');
    await chrome.evaluate(() => window.browserAPI.createTab('blanc://settings/'));
    const sheet = await findPage(app, 'blanc://settings', 'settings');
    await sheet.waitForSelector('#uiLanguage');
    await sheet.selectOption('#uiLanguage', 'de');
    await sheet.waitForSelector('#uiLanguageRelaunch:not([hidden])');
  });
  assert.equal(storedSettings(p3).uiLanguage, 'de');
  await withApp(p3, { preferred: 'en-US' }, async (app) => assert.equal(await locale(app), 'de'));
  console.log('ok F44-3');

  // F44-4
  const p4 = profileWith('f44-4', { uiLanguage: 'fr' });
  await withApp(p4, { preferred: 'de-DE' }, async (app) => {
    assert.deepEqual(await app.evaluate(() => globalThis.__blanc.i18nState()).then((s) => [s.locale, s.source]), ['en', 'unavailable']);
  });
  assert.equal(storedSettings(p4).uiLanguage, 'fr');
  console.log('ok F44-4');

  // F44-5
  for (const uiLanguage of ['en', 'de']) {
    await withApp(profileWith(`f44-5-${uiLanguage}`, { uiLanguage }), { preferred: 'de-DE' }, async (app) => {
      const chrome = await findPage(app, 'blanc-chrome://index/', 'chrome');
      await chrome.evaluate((url) => window.browserAPI.createTab(url), pageUrl);
      await waitForValue(async () => seen.length >= (uiLanguage === 'en' ? 1 : 2), Boolean, 'page request');
    });
  }
  assert.equal(seen[0], seen[1], `Accept-Language changed: ${seen[0]} vs ${seen[1]}`);
  console.log('ok F44-5');
} finally {
  server.close();
  fs.rmSync(root, { recursive: true, force: true });
}
console.log('interface-language smoke OK');
