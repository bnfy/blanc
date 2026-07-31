const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const { _electron } = require('playwright');
const { BeforeAll, AfterAll, Before, setDefaultTimeout } = require('@cucumber/cucumber');
const fixtures = require('./fixtures-server');
const ctx = require('./context');
const { browserDataRoot } = require('../../../src/main/browser-data-import');

// Launching Electron + first evaluate is slow; give scenarios generous headroom.
setDefaultTimeout(60_000);

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
let userDataDir;
let fixturesHandle;
let browserHomeDir;
let savedClipboard = null;

async function launchApp() {
  const electronApp = await _electron.launch({
    args: [REPO_ROOT, `--user-data-dir=${userDataDir}`],
    env: {
      ...process.env,
      BLANC_TEST: '1',
      BLANC_TEST_BROWSER_HOME: browserHomeDir,
    },
  });

  // Wait for whenReady to have installed the test hook.
  await electronApp.evaluate(
    () => new Promise((resolve) => {
      const t = setInterval(() => {
        if (globalThis.__blanc) { clearInterval(t); resolve(); }
      }, 50);
    })
  );
  return electronApp;
}

BeforeAll({ timeout: 120_000 }, async () => {
  fixturesHandle = await fixtures.start();
  ctx.fixturesBase = fixturesHandle.base;

  // Isolated, throwaway profile so no prior session/history/settings leaks in.
  userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-acceptance-'));
  browserHomeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-browser-home-'));
  const chromeRoot = browserDataRoot('chrome', {
    platform: process.platform,
    homeDir: browserHomeDir,
    env: { ...process.env, LOCALAPPDATA: browserHomeDir },
  });
  const profileDir = path.join(chromeRoot, 'Default');
  fs.mkdirSync(profileDir, { recursive: true });
  fs.writeFileSync(
    path.join(chromeRoot, 'Local State'),
    JSON.stringify({ profile: { info_cache: { Default: { name: 'Acceptance profile' } } } })
  );
  fs.writeFileSync(path.join(profileDir, 'Bookmarks'), JSON.stringify({
    roots: {
      bookmark_bar: {
        type: 'folder',
        name: 'Bookmarks bar',
        children: [
          {
            type: 'url',
            name: 'Migration one',
            url: 'https://migration-one.example/',
            date_added: '13370000000000000',
          },
          {
            type: 'folder',
            name: 'Reading',
            children: [
              {
                type: 'url',
                name: 'Migration two',
                url: 'https://migration-two.example/',
                date_added: '13371000000000000',
              },
              { type: 'url', name: 'Browser internals', url: 'chrome://settings/' },
            ],
          },
        ],
      },
      other: {
        type: 'folder',
        name: 'Other bookmarks',
        children: [
          { type: 'url', name: 'Migration three', url: 'https://migration-three.example/' },
        ],
      },
    },
  }));

  ctx.app = await launchApp();
  // F28-1 exercises a genuine process relaunch against this same profile,
  // rather than a renderer reload or an in-memory persistence proxy.
  ctx.relaunch = async () => {
    if (ctx.app) await ctx.app.close();
    ctx.app = await launchApp();
  };

  // The F19 scenarios write the REAL system clipboard — save the developer's
  // clipboard now and restore it in AfterAll so a local run doesn't clobber it.
  savedClipboard = await ctx.app
    .evaluate(() => globalThis.__blanc.readClipboardText())
    .catch(() => null);
});

Before(async function () {
  ctx.tabByName = {};
  ctx.activeExpectedUrl = null;
  ctx.lastNewTabId = null;
  ctx.enteredInput = null;
  ctx.addressMenuItems = null;
  ctx.addressMenuFieldText = null;
  await ctx.app.evaluate(() => globalThis.__blanc.reset());
});

AfterAll(async () => {
  if (ctx.app && savedClipboard !== null) {
    await ctx.app
      .evaluate((_electron, text) => globalThis.__blanc.setClipboardText(text), savedClipboard)
      .catch(() => {});
  }
  if (ctx.app) await ctx.app.close();
  ctx.app = null;
  ctx.relaunch = null;
  if (fixturesHandle) await fixturesHandle.close();
  if (userDataDir) fs.rmSync(userDataDir, { recursive: true, force: true });
  if (browserHomeDir) fs.rmSync(browserHomeDir, { recursive: true, force: true });
});
