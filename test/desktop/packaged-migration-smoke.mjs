import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { launchPackagedOverCdp } from './support/packaged-cdp.mjs';

const stableExecutable = process.env.BLANC_STABLE_EXECUTABLE;
const candidateExecutable =
  process.env.BLANC_CANDIDATE_EXECUTABLE ||
  path.resolve('dist/mac-arm64/Blanc.app/Contents/MacOS/Blanc');

for (const [label, executable] of [
  ['BLANC_STABLE_EXECUTABLE', stableExecutable],
  ['BLANC_CANDIDATE_EXECUTABLE', candidateExecutable],
]) {
  if (!executable || !fs.existsSync(executable)) {
    throw new Error(`${label} does not point to a packaged Blanc executable`);
  }
}

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-stable-migration-'));
const favoriteUrl = 'https://example.com/favorite';
const sessionUrls = ['https://example.com/', 'https://www.wikipedia.org/'];
let app;

const writeJson = (name, value) => fs.writeFileSync(
  path.join(userDataDir, name),
  JSON.stringify(value, null, 2)
);

// Blanc 1.0.3 predates the privileged blanc-chrome:// scheme and renders its
// packaged chrome from file://…/src/renderer/index.html. The migration gate
// starts with that public build, then hands the same profile to the candidate,
// so it must recognize both trusted chrome locations.
const isChromePage = (page) => {
  const url = page.url();
  if (url === 'blanc-chrome://index/') return true;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'file:' && parsed.pathname.endsWith('/src/renderer/index.html');
  } catch {
    return false;
  }
};

const launch = async (executablePath) => {
  app = await launchPackagedOverCdp({
    executablePath,
    args: [`--user-data-dir=${userDataDir}`],
    env: { ...process.env, BLANC_TEST: '0' },
  });
};

const waitForRestoredUrls = async () => {
  const deadline = Date.now() + 15_000;
  let urls = [];
  while (Date.now() < deadline) {
    urls = app.pages().map((candidate) => candidate.url());
    if (sessionUrls.every((expected) => urls.includes(expected))) return urls;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.fail(`session URLs were not restored; saw ${JSON.stringify(urls)}`);
};

const waitForQuietRestore = async ({ label, expectQuiet, wakeQuiet }) => {
  const deadline = Date.now() + 15_000;
  let state = null;
  while (Date.now() < deadline) {
    const chrome = app.pages().find(isChromePage);
    if (chrome) {
      state = await chrome.evaluate(() => window.browserAPI.getAllTabs());
      if (sessionUrls.every((expected) =>
        state.tabs.some((tab) => tab.url === expected))) {
        const quiet = state.tabs.find((tab) => tab.url === sessionUrls[0]);
        if (expectQuiet) {
          assert.equal(quiet.asleep, true, `${label} inactive restored tab should begin quiet`);
        }
        if (wakeQuiet) {
          await chrome.evaluate((id) => window.browserAPI.switchTab(id), quiet.id);
          await waitForRestoredUrls();
        }
        return state;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.fail(`${label} tab model did not restore session URLs; saw ${JSON.stringify(state)}`);
};

try {
  const now = Date.now();
  writeJson('settings.json', {
    searchEngine: 'brave',
    searchSuggestions: false,
    adblockEnabled: false,
    homePage: '',
    theme: 'dark',
    appIcon: 'paper',
    adblockExceptions: ['example.com'],
    usagePing: false,
  });
  writeJson('session.json', {
    urls: sessionUrls,
    activeIndex: 1,
    groups: [{ id: 'migration-group', name: 'research', collapsed: false }],
    groupIds: ['migration-group', 'migration-group'],
    pinned: [true, false],
  });
  writeJson('bookmarks.json', {
    items: [{
      id: 'migration-favorite',
      url: favoriteUrl,
      title: 'Migration favorite',
      favicon: null,
      addedAt: now,
      updatedAt: now,
      folder: 'press',
    }],
    tombstones: [],
  });
  writeJson('history.json', {
    entries: [{
      url: 'https://example.com/history',
      title: 'Migration history',
      visitedAt: now,
    }],
  });

  // Launch the real public Stable first so the fixture is proven acceptable
  // to that build, then hand the exact same profile to the candidate. Current
  // Stable is pre-Quiet-Tabs, so inspect its authoritative chrome model rather
  // than requiring every tab to have a live CDP page. Do not change selection
  // here: the candidate must receive the exact profile written by Stable.
  await launch(stableExecutable);
  await waitForQuietRestore({ label: 'stable', expectQuiet: false, wakeQuiet: false });
  await app.close();
  app = null;

  await launch(candidateExecutable);
  // Current Blanc restores inactive tabs as quiet records, so they have no
  // CDP page until activated. Assert the privileged chrome's authoritative
  // tab model first, then activate the quiet record and prove it wakes to the
  // saved URL instead of weakening the migration check to the one live tab.
  await waitForQuietRestore({ label: 'candidate', expectQuiet: true, wakeQuiet: true });

  const settings = JSON.parse(
    fs.readFileSync(path.join(userDataDir, 'settings.json'), 'utf8')
  );
  assert.equal(settings.searchEngine, 'brave');
  assert.equal(settings.searchSuggestions, false);
  assert.equal(settings.usagePing, false);
  assert.equal(
    settings.onboardingVersion,
    1,
    'legacy profile should skip first-run without resetting saved choices'
  );

  const bookmarks = JSON.parse(
    fs.readFileSync(path.join(userDataDir, 'bookmarks.json'), 'utf8')
  );
  assert.ok(bookmarks.items.some((item) => item.url === favoriteUrl));

  const history = JSON.parse(
    fs.readFileSync(path.join(userDataDir, 'history.json'), 'utf8')
  );
  assert.ok(history.entries.some((entry) => entry.title === 'Migration history'));

  console.log(
    `packaged-migration-smoke OK: ${path.basename(path.resolve(stableExecutable, '../../..'))} -> candidate`
  );
} finally {
  if (app) await app.close();
  fs.rmSync(userDataDir, { recursive: true, force: true });
}
