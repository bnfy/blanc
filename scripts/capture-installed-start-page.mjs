import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { launchPackagedOverCdp } from '../test/desktop/support/packaged-cdp.mjs';

if (process.platform !== 'darwin') throw new Error('The installed-public capture helper currently requires macOS.');

const run = promisify(execFile);
const executablePath = path.resolve(process.env.BLANC_PACKAGED_EXECUTABLE
  || '/Applications/Blanc.app/Contents/MacOS/Blanc');
const appPath = executablePath.slice(0, executablePath.lastIndexOf('.app/') + 4);
const expectedVersion = process.env.BLANC_CAPTURE_VERSION || '1.21.0';
const outputDirectory = path.resolve(process.env.BLANC_CAPTURE_OUTPUT_DIR
  || 'site/public/feature-captures');
const layouts = ['ledger', 'billboard', 'shelf', 'tally'];

assert.ok(fs.existsSync(executablePath) && appPath.endsWith('.app'), 'An installed Blanc.app executable is required.');
const plist = path.join(appPath, 'Contents/Info.plist');
const version = (await run('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleShortVersionString', plist])).stdout.trim();
const build = (await run('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleVersion', plist])).stdout.trim();
assert.equal(version, expectedVersion, `Installed Blanc must be ${expectedVersion}; found ${version}`);

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-installed-start-page-'));
const writeJson = (name, value) => fs.writeFileSync(path.join(profile, `${name}.json`), JSON.stringify(value, null, 2));
const now = Date.now();
const favorites = [
  ['mdn', 'https://developer.mozilla.org/', 'MDN Web Docs'],
  ['github', 'https://github.com/', 'GitHub'],
  ['hacker-news', 'https://news.ycombinator.com/', 'Hacker News'],
  ['verge', 'https://www.theverge.com/', 'The Verge'],
  ['notion', 'https://www.notion.so/', 'Notion'],
  ['youtube', 'https://www.youtube.com/', 'YouTube'],
];
const history = favorites.flatMap(([id, url, title], siteIndex) =>
  Array.from({ length: favorites.length - siteIndex }, (_, visitIndex) => ({
    url,
    title,
    visitedAt: now - ((siteIndex * 10 + visitIndex) * 60_000),
  }))
);
const urls = [
  'blanc://newtab/',
  'https://developer.mozilla.org/en-US/docs/Web/API',
  'https://github.com/explore',
  'https://www.theverge.com/tech',
  'https://news.ycombinator.com/',
];
const groups = [
  { id: 'capture-research', name: 'research', collapsed: false },
  { id: 'capture-reading', name: 'reading', collapsed: false },
];
const groupIds = [null, 'capture-research', 'capture-research', 'capture-reading', 'capture-reading'];
const pinned = urls.map(() => false);
const meta = [
  { title: 'Start Page', favicon: null },
  { title: 'Web APIs | MDN', favicon: null },
  { title: 'Explore GitHub', favicon: null },
  { title: 'Technology', favicon: null },
  { title: 'Hacker News', favicon: null },
];
const sessionEntry = {
  id: 'primary',
  profileId: 'default',
  workspaceId: null,
  urls,
  activeIndex: 0,
  groups,
  groupIds,
  pinned,
  meta,
};

writeJson('settings', {
  onboardingVersion: 1,
  migrationChecklistDismissed: true,
  adblockEnabled: false,
  searchSuggestions: false,
  usagePing: false,
  newtabLayout: 'billboard',
  presentationDefaultsResetVersion: 1,
});
writeJson('bookmarks', {
  items: favorites.slice(0, 4).map(([id, url, title], index) => ({
    id: `capture-${id}`,
    url,
    title,
    favicon: null,
    addedAt: now - ((index + 1) * 60_000),
    updatedAt: now - ((index + 1) * 60_000),
    folder: null,
  })),
  tombstones: [],
});
writeJson('history', { entries: history, siteIcons: [] });
const monday = new Date();
monday.setHours(0, 0, 0, 0);
monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
const days = [148, 180, 0, 0, 0, 0, 0];
writeJson('adblock-stats', { weekStart: monday.getTime(), blocked: days.reduce((sum, value) => sum + value, 0), days });
writeJson('session', {
  version: 2,
  activeWindowId: sessionEntry.id,
  windows: [sessionEntry],
  urls,
  activeIndex: 0,
  groups,
  groupIds,
  pinned,
});

const poll = async (read, accept, label) => {
  const deadline = Date.now() + 30_000;
  let value;
  while (Date.now() < deadline) {
    value = await read();
    if (accept(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`${label}; last observation: ${String(value)}`);
};

const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
let app;
try {
  app = await launchPackagedOverCdp({
    executablePath,
    args: [`--user-data-dir=${profile}`],
    env: { ...process.env, BLANC_TEST: '0' },
    launchViaOpen: true,
  });
  // CDP can attach while Blanc is still replacing its bootstrap page with
  // the restored session. Let that handoff settle before retaining a Page.
  await new Promise((resolve) => setTimeout(resolve, 2_000));
  const startPage = await poll(
    async () => app.pages().find((page) => !page.isClosed() && page.url().startsWith('blanc://newtab/')),
    Boolean,
    'installed Start Page did not appear',
  );
  await startPage.setViewportSize({ width: 1440, height: 900 });
  await startPage.locator('#favoritesList .fav').first().waitFor({ state: 'attached' });
  await startPage.locator('#groupsList .group-row').first().waitFor({ state: 'attached' });
  await startPage.locator('#bbFavorites .bb-site').first().waitFor({ state: 'visible' });
  fs.mkdirSync(outputDirectory, { recursive: true });

  for (const layout of layouts) {
    await startPage.locator(`[data-layout-pick="${layout}"]`).click();
    await startPage.waitForFunction((name) => document.body.dataset.layout === name, layout);
    await startPage.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const file = path.join(outputDirectory, `${layout}-v${expectedVersion}.png`);
    await startPage.screenshot({ path: file, animations: 'disabled' });
    process.stdout.write(`Captured ${layout} to ${file} (${sha256(file)})\n`);
  }

  await startPage.locator('#mahjongLink').click();
  const mahjong = await poll(
    async () => app.pages().find((page) => page.url().startsWith('blanc://mahjong/')),
    Boolean,
    'standalone Mahjong did not open',
  );
  await mahjong.locator('#mjBoard .mj-tile').first().waitFor({ state: 'visible' });
  await mahjong.setViewportSize({ width: 1440, height: 900 });
  const mahjongFile = path.join(outputDirectory, `mahjong-v${expectedVersion}.png`);
  await mahjong.screenshot({ path: mahjongFile, animations: 'disabled' });
  process.stdout.write(`Captured Mahjong to ${mahjongFile} (${sha256(mahjongFile)})\n`);
  process.stdout.write(`Captured installed Blanc ${version} (${build}) Start Page set.\n`);
} finally {
  await app?.close().catch(() => {});
  fs.rmSync(profile, { recursive: true, force: true });
}
