// test/desktop/i18n-pseudo-sweep.mjs — npm run test:i18n:desktop [-- --include-pending]
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { _electron } from 'playwright';
import poll from './support/poll.js';
import sweep from './support/pseudo-sweep.js';

const { waitForValue } = poll;
const { classifyTextEntries, COLLECT } = sweep;
const includePending = process.argv.includes('--include-pending');
const scope = JSON.parse(fs.readFileSync('copy/i18n-scope.json', 'utf8')).files;
const allow = ['Blanc', 'Blanc Blocker', 'Blanc Patron', 'Patron', 'uBlock Origin', '1Password'];

const findPage = (app, prefix, label) =>
  waitForValue(async () => (await app.windows()).find((p) => p.url().startsWith(prefix)), Boolean, label);

// Each extraction phase adds its surfaces here (Phase recipe, step 7).
const CHROME_FILES = ['src/renderer/index.html', 'src/renderer/renderer.js', 'src/renderer/vertical-tabs.js', 'src/renderer/tab-drag.js'];
const SURFACES = [
  {
    name: 'chrome strip',
    files: CHROME_FILES,
    open: ({ chrome }) => chrome,
  },
  {
    name: 'vertical tabs rail',
    files: CHROME_FILES,
    open: async ({ chrome }) => {
      await chrome.evaluate(() => window.browserAPI.setTabLayout('vertical'));
      await chrome.waitForFunction(() => !document.getElementById('verticalTabsRail').hidden);
      return chrome;
    },
  },
  {
    name: 'start page',
    files: ['src/renderer/pages/newtab.html', 'src/renderer/pages/newtab.js', 'src/renderer/pages/onboarding.js'],
    open: ({ app }) => findPage(app, 'blanc://newtab/', 'new tab'),
  },
  {
    name: 'settings',
    files: ['src/renderer/pages/settings.html', 'src/renderer/pages/settings.js', 'src/renderer/pages/settings-language-model.js'],
    open: async ({ app, chrome }) => {
      await chrome.evaluate(() => window.browserAPI.createTab('blanc://settings/'));
      return findPage(app, 'blanc://settings', 'settings sheet');
    },
  },
];

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-pseudo-sweep-'));
const profile = path.join(root, 'profile');
fs.mkdirSync(`${profile}-Dev`);
fs.writeFileSync(path.join(`${profile}-Dev`, 'settings.json'), JSON.stringify({
  onboardingVersion: 1, presentationDefaultsResetVersion: 1, adblockEnabled: false, usagePing: false,
  searchSuggestions: false, uiLanguage: 'en-XA',
}));
const { ELECTRON_RUN_AS_NODE: _ignored, ...env } = process.env;
let app;
const failures = [];
try {
  app = await _electron.launch({ chromiumSandbox: true, args: [path.resolve('.'), `--user-data-dir=${profile}`],
    env: { ...env, BLANC_TEST: '1', BLANC_TEST_LOCALE_STATUS: 'en-XA=selectable', BLANC_TEST_UNCAUGHT_LOG: path.join(root, 'uncaught.log') } });
  const chrome = await findPage(app, 'blanc-chrome://index/', 'chrome strip');
  const state = await app.evaluate(() => globalThis.__blanc.i18nState());
  assert.equal(state.locale, 'en-XA', 'the sweep runs in the pseudo-locale');
  for (const surface of SURFACES) {
    const pending = surface.files.filter((f) => scope[f]?.state !== 'guarded');
    if (pending.length && !includePending) { console.log(`skip ${surface.name} (pending: ${pending.join(', ')})`); continue; }
    const page = await surface.open({ app, chrome });
    await page.waitForLoadState('domcontentloaded');
    const offending = classifyTextEntries(await page.evaluate(`(() => {${COLLECT}})()`), { allow });
    if (offending.length) failures.push(`${surface.name}:\n    ${offending.join('\n    ')}`);
    else console.log(`ok   ${surface.name}`);
  }
} finally {
  await app?.close().catch(() => {});
  fs.rmSync(root, { recursive: true, force: true });
}
if (failures.length) {
  console.error(`Untranslated text in the pseudo-locale:\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log('i18n pseudo sweep OK');
