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
const stableExpectsQuiet = process.env.BLANC_STABLE_EXPECTS_QUIET === '1';

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
const workspaceId = 'migration_workspace';
const workspaceName = 'Migration workspace';
let app;

const writeJson = (name, value) => fs.writeFileSync(
  path.join(userDataDir, name),
  JSON.stringify(value, null, 2)
);

// Older public Blanc builds predate the privileged blanc-chrome:// scheme and
// render packaged chrome from file://…/src/renderer/index.html. The migration
// gate starts with a real public build, then hands the same profile to the
// candidate, so it recognizes both trusted chrome locations.
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
        const group = state.groups.find((entry) => entry.name === 'research');
        assert.ok(group, `${label} should preserve the saved tab group`);
        assert.ok(
          sessionUrls.every((url) => state.tabs.find((tab) => tab.url === url)?.groupId === group.id),
          `${label} should preserve tab membership in the saved group`,
        );
        assert.equal(
          state.tabs.find((tab) => tab.url === sessionUrls[0])?.pinned,
          true,
          `${label} should preserve the pinned tab`,
        );
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
    version: 2,
    activeWindowId: 'primary',
    windows: [{
      id: 'primary',
      profileId: 'default',
      workspaceId,
      urls: sessionUrls,
      activeIndex: 1,
      groups: [{ id: 'migration-group', name: 'research', collapsed: false }],
      groupIds: ['migration-group', 'migration-group'],
      pinned: [true, false],
      meta: sessionUrls.map((url) => ({ title: url, favicon: null })),
    }],
    // The flat rollback mirror remains present so an older public baseline can
    // open and rewrite the profile without understanding v2-only fields.
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
  writeJson('workspaces.json', {
    version: 1,
    workspaces: [{
      id: workspaceId,
      name: workspaceName,
      profileId: 'default',
      createdAt: now,
      updatedAt: now,
      urls: sessionUrls,
      activeIndex: 1,
      groups: [{ id: 'migration-group', name: 'research', collapsed: false }],
      groupIds: ['migration-group', 'migration-group'],
      pinned: [true, false],
      meta: sessionUrls.map((url) => ({ title: url, favicon: null })),
    }],
  });

  // Launch the real public Stable first so the fixture is proven acceptable
  // to that build, then hand the exact same profile to the candidate. Inspect
  // its authoritative chrome model rather than requiring every tab to have a
  // live CDP page. The optional expectation lets a current public baseline
  // prove quiet restore without blocking older migration investigations. Do
  // not change selection here: the candidate must receive the exact profile
  // written by Stable.
  await launch(stableExecutable);
  await waitForQuietRestore({
    label: 'stable',
    expectQuiet: stableExpectsQuiet,
    wakeQuiet: false,
  });
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

  const workspaces = JSON.parse(
    fs.readFileSync(path.join(userDataDir, 'workspaces.json'), 'utf8')
  );
  const migratedWorkspace = workspaces.workspaces.find((entry) => entry.id === workspaceId);
  assert.ok(migratedWorkspace, 'saved Named Workspace should survive the public-to-candidate handoff');
  assert.equal(migratedWorkspace.name, workspaceName);
  assert.deepEqual(migratedWorkspace.urls, sessionUrls);

  console.log(
    `packaged-migration-smoke OK: ${path.basename(path.resolve(stableExecutable, '../../..'))} -> candidate`
  );
} finally {
  if (app) await app.close();
  fs.rmSync(userDataDir, { recursive: true, force: true });
}
