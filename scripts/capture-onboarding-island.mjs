// Render the real, unmodified quiet Island into light/dark onboarding assets.
// Run from the repository root. Uses only a disposable profile and local fixtures.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { _electron } from 'playwright';
import sharp from 'sharp';
import poll from '../test/desktop/support/poll.js';
const { waitForValue } = poll;
const root = process.cwd();
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-island-capture-'));
const profile = path.join(temp, 'profile');
fs.mkdirSync(`${profile}-Dev`);
fs.writeFileSync(path.join(`${profile}-Dev`, 'settings.json'), JSON.stringify({
  onboardingVersion: 1, presentationDefaultsResetVersion: 1,
  searchSuggestions: false, usagePing: false, theme: 'light',
}));
const { ELECTRON_RUN_AS_NODE: ignored, ...env } = process.env;
const digest = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const manifest = {
  version: JSON.parse(fs.readFileSync('package.json', 'utf8')).version,
  state: 'Quiet ordinary HTTPS page, three tabs, no pending downloads or contextual activity.',
  fixture: 'Blanc website URL and bundled favicon; page responses fulfilled locally. No user data.',
  treatment: 'Only document/strip backgrounds made transparent; no Island DOM, geometry, colors or icons modified. Uniform scaling in onboarding.',
  sources: Object.fromEntries(['src/renderer/index.html', 'src/renderer/styles.css', 'src/renderer/renderer.js'].map(file => [file, digest(file)])),
  captures: [],
};
let app;
try {
  app = await _electron.launch({ args: [root, `--user-data-dir=${profile}`], env: { ...env, BLANC_TEST: '0' } });
  await app.firstWindow();
  const chrome = await waitForValue(async () => app.windows().find(page => page.url() === 'blanc-chrome://index/'), Boolean, 'chrome');
  await waitForValue(() => chrome.evaluate(() => window.browserAPI.getAllTabs()),
    state => state.tabs.length === 1 && state.tabs[0].url === 'blanc://newtab/' && !state.tabs[0].isLoading,
    'initial tab restoration');
  const icon = fs.readFileSync('src/renderer/pages/sunrise-favicon-mark.png').toString('base64');
  await app.context().route('https://blancbrowser.com/**', route => route.fulfill({
    contentType: 'text/html', body: `<!doctype html><title>Blanc</title><link rel="icon" href="data:image/png;base64,${icon}"><p>Local capture fixture</p>`,
  }));
  await app.evaluate(({ BrowserWindow, webContents }) => {
    BrowserWindow.getAllWindows()[0].setContentSize(1280, 800);
    webContents.getAllWebContents().forEach(wc => wc.setBackgroundThrottling(false));
  });
  await chrome.evaluate(async () => {
    // The initial Start Page plus these two ordinary pages make three real dots.
    await window.browserAPI.createTab('https://blancbrowser.com/about');
    await window.browserAPI.createTab('https://blancbrowser.com/');
  });
  await chrome.waitForFunction(() => document.querySelectorAll('#pillDots .island-dot').length === 3
    && document.getElementById('pillDomain').textContent === 'blancbrowser.com'
    && document.getElementById('pillFavicon').classList.contains('has-icon')
    && !document.getElementById('pillShield').hidden
    && document.querySelector('#pillActions button').dataset.mode === 'reload', null, { timeout: 30000 }).catch(async error => {
      console.error(await chrome.evaluate(() => ({
        dots: document.querySelectorAll('#pillDots .island-dot').length,
        domain: document.getElementById('pillDomain').textContent,
        favicon: document.getElementById('pillFavicon').className,
        shieldHidden: document.getElementById('pillShield').hidden,
        mode: document.querySelector('#pillActions button').dataset.mode,
      })));
      console.error(app.windows().map(page => page.url()));
      throw error;
    });
  // Omit the page behind the pill, retaining the real translucent surface/shadow.
  await chrome.addStyleTag({ content: 'html, body, #chrome, #strip { background: transparent !important; }' });
  await chrome.emulateMedia({ reducedMotion: 'reduce' });
  await chrome.mouse.move(0, 300);
  for (const theme of ['light', 'dark']) {
    await app.evaluate(({ nativeTheme }, theme) => { nativeTheme.themeSource = theme; }, theme);
    await chrome.emulateMedia({ colorScheme: theme });
    await chrome.evaluate(() => document.fonts.ready);
    const geometry = await chrome.locator('#islandPill').evaluate(pill => {
      const rect = pill.getBoundingClientRect();
      const visible = element => getComputedStyle(element).display !== 'none' && !element.hidden;
      return {
        x: rect.x, y: rect.y, width: rect.width, height: rect.height,
        transform: getComputedStyle(pill).transform,
        zoom: getComputedStyle(pill).zoom,
        controls: [...pill.querySelectorAll('button')].filter(visible).map(el => el.getAttribute('aria-label')),
      };
    });
    assert.equal(geometry.transform, 'none');
    assert.ok(Math.abs(geometry.height - 44) < 0.1, 'the real quiet Island is 44px high');
    for (const control of ['Back', 'Forward', 'New tab', 'Reload', 'Favorite this page', 'Close tab']) {
      assert.ok(geometry.controls.includes(control), `missing ${control}`);
    }
    const clip = {
      x: Math.floor(geometry.x - 10), y: Math.max(0, Math.floor(geometry.y - 10)),
      width: Math.ceil(geometry.width + 20), height: 68,
    };
    const file = `src/renderer/pages/onboarding-island-${theme}.png`;
    await chrome.screenshot({ path: file, clip, omitBackground: true });
    const meta = await sharp(file).metadata();
    assert.ok(meta.hasAlpha, 'transparent capture');
    assert.equal((await sharp(file).stats()).channels[3].min, 0, 'capture retains transparent space around the Island');
    manifest.captures.push({ theme, file, width: meta.width, height: meta.height, sha256: digest(file), geometry });
  }
  fs.writeFileSync('docs/reddit-feedback-2026-10-02/island-capture.json', `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify(manifest));
} finally {
  await app?.close();
  fs.rmSync(temp, { recursive: true, force: true });
}
