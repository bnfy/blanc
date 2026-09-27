// Dev-only design-review tool: photographs every utility sheet on a throwaway
// test profile. Usage: node test/desktop/surface-captures.mjs --out <dir>
// macOS only (screencapture -l or view rendering, sips, ImageMagick). A Blanc window opens and closes while
// it runs. Images are downscaled to 1024px wide so review sets stay small.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { _electron } from 'playwright';
import testHookCall from './support/test-hook-call.js';
import poll from './support/poll.js';

const { callTestHook } = testHookCall;
const { waitForValue } = poll;
if (process.platform !== 'darwin') throw new Error('surface-captures needs macOS screencapture');
const outIndex = process.argv.indexOf('--out');
const outDir = path.resolve(outIndex > 0 ? process.argv[outIndex + 1] : 'surface-captures');
fs.mkdirSync(outDir, { recursive: true });

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-surface-captures-'));
const userDataDir = path.join(root, 'profile');
const profile = `${userDataDir}-Dev`;
fs.mkdirSync(profile);
fs.mkdirSync(path.join(root, 'browser-home'));
const write = (name, value) => fs.writeFileSync(path.join(profile, name), JSON.stringify(value));
const now = Date.now();
const DAY = 86_400_000;
write('settings.json', { onboardingVersion: 1, usagePing: false, searchSuggestions: false });
write('history.json', {
  entries: [
    ['https://news.ycombinator.com/', 'Hacker News', 0.1],
    ['https://github.com/bnfy/blanc', 'bnfy/blanc: A little less browser', 0.2],
    ['https://developer.mozilla.org/en-US/docs/Web/CSS', 'CSS: Cascading Style Sheets | MDN', 0.3],
    ['https://www.nytimes.com/', 'The New York Times', 1.2],
    ['https://en.wikipedia.org/wiki/Sunrise', 'Sunrise - Wikipedia', 1.4],
    ['https://www.youtube.com/watch?v=abc', 'A very long video title that keeps going to test how rows truncate in the history list - YouTube', 3.1],
  ].map(([url, title, daysAgo]) => ({ url, title, visitedAt: Math.round(now - daysAgo * DAY) })),
  siteIcons: [],
});
const download = (i, filename, state, totalBytes) => ({
  id: `seed-${i}`, url: `https://downloads.example.com/${filename}`, filename,
  savePath: `/Users/demo/Downloads/${filename}`, state,
  receivedBytes: state === 'completed' ? totalBytes : Math.floor(totalBytes / 3), totalBytes,
  startedAt: now - i * 3_600_000, finishedAt: now - i * 3_600_000 + 20_000, private: false,
});
write('downloads.json', { items: [
  download(1, 'annual-report-2026.pdf', 'completed', 2_400_000),
  download(2, 'Blanc-1.22.0-arm64.dmg', 'completed', 148_000_000),
  download(3, 'holiday-photos.zip', 'cancelled', 88_000_000),
  download(4, 'invoice_0931.pdf', 'interrupted', 310_000),
  download(5, 'a-really-long-file-name-that-keeps-going-for-layout-testing-final.tar.gz', 'completed', 5_000_000),
] });

const { ELECTRON_RUN_AS_NODE: ignored, ...env } = process.env;
void ignored;
const app = await _electron.launch({
  args: [path.resolve('.'), `--user-data-dir=${userDataDir}`],
  // An empty browser home: Bring Your Tabs must never list the real browsers
  // and profile names on the machine that runs this.
  env: { ...env, BLANC_TEST: '1', BLANC_TEST_BROWSER_HOME: path.join(root, 'browser-home') },
});
const call = (method, ...args) => callTestHook(app, method, args);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
try {
  // Same readiness gate as the acceptance hooks: the call bridge and the
  // blocker-gated workspace restore both exist before any hook runs.
  await waitForValue(
    () => app.evaluate(() => Boolean(globalThis.__blancCall && globalThis.__blanc?.startupReady?.())),
    Boolean,
    'startup',
  );
  for (const [url, title] of [['https://github.com/', 'GitHub'], ['https://news.ycombinator.com/', 'Hacker News'],
    ['https://developer.mozilla.org/', 'MDN Web Docs'], ['https://www.nytimes.com/', 'The New York Times']]) {
    await call('seedFavorite', url, title);
  }
  const windowNumber = await app.evaluate(({ BrowserWindow }) =>
    Number(BrowserWindow.getAllWindows().find((w) => w.isVisible()).getMediaSourceId().split(':')[1]));
  // Window capture needs an unlocked, awake display. When macOS refuses it,
  // fall back to Blanc rendering its own views (strip, tab, sheet, overlay)
  // and stack them in their real z-order and bounds.
  const layersDir = path.join(root, 'layers');
  fs.mkdirSync(layersDir);
  const composite = async (file) => {
    const { width, layers } = await app.evaluate(async ({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows().find((w) => w.isVisible());
      const [contentWidth, contentHeight] = win.getContentSize();
      const out = [];
      const add = async (wc, bounds) => {
        if (!wc || wc.isDestroyed()) return;
        const image = await wc.capturePage();
        if (!image.isEmpty()) out.push({ png: image.toPNG().toString('base64'), ...bounds });
      };
      await add(win.webContents, { x: 0, y: 0, width: contentWidth, height: contentHeight });
      for (const view of win.contentView.children) {
        if (view.webContents) await add(view.webContents, view.getBounds());
      }
      return { width: contentWidth, layers: out };
    });
    const args = [];
    let scale = 1;
    layers.forEach((layer, i) => {
      const layerFile = path.join(layersDir, `${i}.png`);
      fs.writeFileSync(layerFile, Buffer.from(layer.png, 'base64'));
      if (i === 0) {
        scale = Number(execFileSync('magick', ['identify', '-format', '%w', layerFile]).toString()) / width;
        args.push(layerFile);
      } else {
        args.push(layerFile, '-geometry', `+${Math.round(layer.x * scale)}+${Math.round(layer.y * scale)}`, '-composite');
      }
    });
    execFileSync('magick', [...args, file]);
  };
  const shot = async (name) => {
    const file = path.join(outDir, `${name}.png`);
    try {
      execFileSync('screencapture', [`-l${windowNumber}`, '-o', '-x', file], { stdio: 'ignore' });
    } catch {
      await composite(file);
    }
    execFileSync('sips', ['-Z', '1024', file], { stdio: 'ignore' });
  };
  const setScheme = (scheme) => app.evaluate(async ({ webContents, nativeTheme }, value) => {
    nativeTheme.themeSource = value;
    for (const wc of webContents.getAllWebContents()) {
      try {
        if (!wc.debugger.isAttached()) wc.debugger.attach('1.3');
        await wc.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value }] });
      } catch { /* a view without a debugger target keeps its scheme */ }
    }
  }, scheme);
  const inSheet = (script) => app.evaluate(async ({ webContents }, code) => {
    const id = globalThis.__blanc.utilitySheetContentsId();
    return id ? webContents.fromId(id).executeJavaScript(code) : null;
  }, script);
  const viaSheet = async (url) => {
    await call('openFavoritesSheet');
    await sleep(900);
    await inSheet(`location.href = ${JSON.stringify(url)}; 0`);
  };
  const open = {
    settings: () => call('openSettings'),
    bookmarks: () => call('openFavoritesSheet'),
    history: () => viaSheet('blanc://history/'),
    downloads: () => call('openDownloads'),
    shortcuts: () => viaSheet('blanc://shortcuts/'),
    'tab-import': () => call('openTabImport'),
  };
  for (const [width, height] of [[1280, 800], [640, 480]]) {
    await call('setWindowContentSize', width, height);
    await sleep(800);
    for (const scheme of ['light', 'dark']) {
      for (const [sheet, openSheet] of Object.entries(open)) {
        await call('closeUtilitySurface');
        await sleep(300);
        await openSheet();
        await sleep(1400);
        await call('closeOverlay'); // a blank tab's Island panel must not cover the sheet
        await setScheme(scheme);
        await sleep(400);
        const steps = await inSheet(`(() => { const p = document.querySelector('body.sheet .page');
          return Math.min(6, Math.max(1, Math.ceil(p.scrollHeight / Math.max(200, p.clientHeight - 80)))); })()`);
        for (let i = 0; i < (steps ?? 0); i += 1) {
          await inSheet(`(() => { const p = document.querySelector('body.sheet .page'); p.scrollTop = ${i} * (p.clientHeight - 80); return 0; })()`);
          await sleep(300);
          await shot(`${sheet}-${scheme}-${width}x${height}-${String(i + 1).padStart(2, '0')}`);
        }
      }
    }
  }
  await call('closeUtilitySurface');
  console.log(`surface-captures: wrote ${fs.readdirSync(outDir).length} files to ${outDir}`);
} finally {
  await app.close();
  fs.rmSync(root, { recursive: true, force: true });
}
