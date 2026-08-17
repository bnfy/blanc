const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const { _electron } = require('playwright');
const { BeforeAll, AfterAll, Before, setDefaultTimeout } = require('@cucumber/cucumber');
const fixtures = require('./fixtures-server');
const ctx = require('./context');
const { callTestHook } = require('./test-hook-call');
const { browserDataRoot } = require('../../../src/main/browser-data-import');

// Launching Electron + first evaluate is slow; give scenarios generous headroom.
setDefaultTimeout(60_000);

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
let userDataDir;
let fixturesHandle;
let secureFixturesHandle;
let secureSpkiHash = null;
let browserHomeDir;
let savedClipboard = null;
let uncaughtLogPath;

function mainProcessExceptionsSinceLaunch(electronApp) {
  if (!uncaughtLogPath || !fs.existsSync(uncaughtLogPath)) return '';
  const contents = fs.readFileSync(uncaughtLogPath, 'utf8');
  return contents.slice(electronApp.__blancUncaughtOffset ?? 0).trim();
}

function assertNoMainProcessExceptions(electronApp) {
  const failures = mainProcessExceptionsSinceLaunch(electronApp);
  if (failures) throw new Error(`Electron main-process exception:\n${failures}`);
}

async function closeApp(electronApp) {
  if (!electronApp) return;
  try {
    await electronApp.close();
  } catch (error) {
    // A fatal main-process exception may close Playwright's target before the
    // explicit close completes. Prefer the captured application stack when it
    // exists; otherwise preserve the original close failure.
    assertNoMainProcessExceptions(electronApp);
    throw error;
  }
  assertNoMainProcessExceptions(electronApp);
}

async function launchApp() {
  const electronApp = await _electron.launch({
    // insecure.test maps to loopback at the resolver so the F12-7 scenario can
    // load a genuinely non-loopback-HOSTNAMED page offline: the connection
    // model classifies by hostname, and every fixtures-server URL is
    // 127.0.0.1 (i.e. 'local', never 'http').
    args: [
      REPO_ROOT,
      `--user-data-dir=${userDataDir}`,
      // Both names map to loopback at the resolver, so scheme-classified
      // pages load offline: the connection model reads HOSTNAMES, and every
      // plain fixtures-server URL is 127.0.0.1 (i.e. 'local', never 'http').
      '--host-resolver-rules=MAP insecure.test 127.0.0.1, MAP secure.test 127.0.0.1',
      // Trust EXACTLY the throwaway per-run fixture cert, by SPKI hash —
      // Chromium's scoped testing flag, not a blanket ignore. Every other
      // certificate error keeps its normal handling.
      `--ignore-certificate-errors-spki-list=${secureSpkiHash}`,
    ],
    env: {
      ...process.env,
      BLANC_TEST: '1',
      BLANC_TEST_BROWSER_HOME: browserHomeDir,
      BLANC_TEST_UNCAUGHT_LOG: uncaughtLogPath,
    },
  });
  electronApp.__blancUncaughtOffset = fs.existsSync(uncaughtLogPath)
    ? fs.statSync(uncaughtLogPath).size
    : 0;

  // Wait for whenReady to have installed the test hook and completed the
  // blocker-gated workspace restore. Returning while persistence is still
  // suspended lets the first scenario mutate an in-memory workspace that
  // cannot yet reach session.json.
  await electronApp.evaluate(
    () => new Promise((resolve) => {
      const t = setInterval(() => {
        if (globalThis.__blancCall && globalThis.__blanc?.startupReady?.()) {
          clearInterval(t);
          resolve();
        }
      }, 50);
    })
  );
  return electronApp;
}

BeforeAll({ timeout: 120_000 }, async () => {
  fixturesHandle = await fixtures.start();
  ctx.fixturesBase = fixturesHandle.base;

  // Mint a throwaway self-signed cert for secure.test and pin its SPKI at
  // launch, so F12-8 can assert a real https-committed page fully offline.
  const certDir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-fixture-cert-'));
  const keyPath = path.join(certDir, 'key.pem');
  const certPath = path.join(certDir, 'cert.pem');
  execFileSync('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-keyout', keyPath, '-out', certPath,
    '-days', '2', '-nodes', '-subj', '/CN=secure.test',
    '-addext', 'subjectAltName=DNS:secure.test',
  ], { stdio: 'pipe' });
  const spkiDer = execFileSync('sh', ['-c',
    `openssl x509 -in '${certPath}' -pubkey -noout | openssl pkey -pubin -outform der | openssl dgst -sha256 -binary | base64`,
  ]);
  secureSpkiHash = spkiDer.toString().trim();
  secureFixturesHandle = await fixtures.startSecure({
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath),
  });
  ctx.secureFixturesBase = `https://secure.test:${secureFixturesHandle.port}`;

  // Isolated, throwaway profile so no prior session/history/settings leaks in.
  userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-acceptance-'));
  uncaughtLogPath = path.join(userDataDir, 'main-process-uncaught.log');
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
    if (ctx.app) await closeApp(ctx.app);
    ctx.app = await launchApp();
  };

  // The F19 scenarios write the REAL system clipboard — save the developer's
  // clipboard now and restore it in AfterAll so a local run doesn't clobber it.
  savedClipboard = await callTestHook(ctx.app, 'readClipboardText').catch(() => null);
});

Before(async function () {
  if (ctx.app) assertNoMainProcessExceptions(ctx.app);
  ctx.tabByName = {};
  ctx.activeExpectedUrl = null;
  ctx.lastNewTabId = null;
  ctx.enteredInput = null;
  ctx.addressMenuItems = null;
  ctx.addressMenuFieldText = null;
  await callTestHook(ctx.app, 'reset');
});

AfterAll(async () => {
  let closeFailure = null;
  if (ctx.app && savedClipboard !== null) {
    await callTestHook(ctx.app, 'setClipboardText', [savedClipboard])
      .catch(() => {});
  }
  if (ctx.app) {
    try {
      await closeApp(ctx.app);
    } catch (error) {
      closeFailure = error;
    }
  }
  ctx.app = null;
  ctx.relaunch = null;
  if (fixturesHandle) await fixturesHandle.close();
  if (secureFixturesHandle) await secureFixturesHandle.close();
  if (userDataDir) fs.rmSync(userDataDir, { recursive: true, force: true });
  if (browserHomeDir) fs.rmSync(browserHomeDir, { recursive: true, force: true });
  if (closeFailure) throw closeFailure;
});
