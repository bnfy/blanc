import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { launchPackagedOverCdp } from './support/packaged-cdp.mjs';

const adblockManifest = JSON.parse(
  fs.readFileSync(path.resolve('adblock/sources/pinned.json'), 'utf8')
);
const adblockCacheFile = `adblock-engine.v3.${adblockManifest.combinedSha256.slice(0, 16)}.bin`;

const defaultExecutable = process.platform === 'darwin'
  ? path.resolve('dist/mac-arm64/Blanc.app/Contents/MacOS/Blanc')
  : null;
const executablePath = process.env.BLANC_PACKAGED_EXECUTABLE || defaultExecutable;
if (!executablePath || !fs.existsSync(executablePath)) {
  throw new Error(
    'Packaged Blanc executable not found. Set BLANC_PACKAGED_EXECUTABLE or build dist/mac-arm64 first.'
  );
}

const poll = async (read, predicate, message, timeoutMs = 15_000) => {
  const deadline = Date.now() + timeoutMs;
  let value;
  while (Date.now() < deadline) {
    value = await read();
    if (predicate(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.fail(`${message}; last value: ${JSON.stringify(value)}`);
};

const readIslandChrome = async (app) => {
  const page = app.pages().find((candidate) => candidate.url() === 'blanc-chrome://index/');
  if (!page) return null;
  return page.evaluate(() => {
    const pill = document.getElementById('islandPill');
    if (!pill) return { readyState: document.readyState, pill: null };
    const rect = pill.getBoundingClientRect();
    const style = getComputedStyle(pill);
    return {
      readyState: document.readyState,
      pill: {
        width: rect.width,
        height: rect.height,
        display: style.display,
        visibility: style.visibility,
      },
    };
  });
};

const withPackagedApp = async ({ label, env = {}, launchArgs = [], prepare }, run) => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), `blanc-${label}-`));
  let app;
  try {
    await prepare?.(userDataDir);
    app = await launchPackagedOverCdp({
      executablePath,
      args: [`--user-data-dir=${userDataDir}`, ...launchArgs],
      env: { ...process.env, BLANC_TEST: '0', ...env },
    });
    await poll(
      () => readIslandChrome(app),
      (state) => state?.readyState === 'complete'
        && state.pill?.display !== 'none'
        && state.pill?.visibility !== 'hidden'
        && state.pill?.width > 0
        && state.pill?.height > 0,
      'packaged chrome document did not render a visible Island'
    );
    await run({ app, userDataDir });
  } finally {
    if (app) await app.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
};

const readStartPage = async (app) => {
  const page = app.pages().find((candidate) => candidate.url().startsWith('blanc://newtab'));
  if (!page) return null;
  return page.evaluate(() => ({
    // The six-step onboarding dialog replaced the privacy card (2026-08-16);
    // privacy consent is its step 5.
    privacyHidden: document.getElementById('onboardDialog')?.hidden,
    startupHidden: document.getElementById('startupCard')?.hidden,
    startupActionsHidden: document.getElementById('startupActions')?.hidden,
    startupTitle: document.getElementById('startupTitle')?.textContent,
    suggestions: document.getElementById('obSuggestions')?.getAttribute('aria-checked') === 'true',
    usagePing: document.getElementById('obPing')?.getAttribute('aria-checked') === 'true'
  }));
};

const executeOnStartPage = async (app, source) => {
  const page = app.pages().find((candidate) => candidate.url().startsWith('blanc://newtab'));
  if (!page) throw new Error('new-tab WebContentsView disappeared');
  return page.evaluate((javascript) => globalThis.eval(javascript), source);
};

/**
 * The three documents F37's cold-launch contract spans, read together so one
 * poll observes a single coherent moment: the chrome strip, the island
 * overlay, and the start page in the active tab.
 */
const readColdLaunchIsland = async (app) => {
  const chrome = app.pages().find((candidate) => candidate.url() === 'blanc-chrome://index/');
  const overlay = app.pages().find((candidate) => candidate.url() === 'blanc-chrome://overlay/');
  const start = app.pages().find((candidate) => candidate.url().startsWith('blanc://newtab'));
  if (!chrome || !overlay || !start) {
    // A startup tab that is not the blank page leaves no start page to read.
    // Report every document instead, or the timeout says only "null" and
    // reads as "the app never launched".
    return { startUrl: null, documents: app.pages().map((candidate) => candidate.url()) };
  }
  return {
    startUrl: start.url(),
    // Placeholder mode is the chrome's own statement that the ACTIVE tab is
    // blank. A start page that merely exists — behind another tab, or in
    // another window — does not put the pill here.
    pillPlaceholder: await chrome.evaluate(
      () => document.getElementById('pillDomain')?.classList.contains('placeholder') ?? null,
    ),
    // '' before the overlay has ever been shown, and again after every hide.
    islandMode: await overlay.evaluate(() => document.body.dataset.mode || null),
    islandValue: await overlay.evaluate(
      () => document.getElementById('addressInput')?.value ?? null,
    ),
  };
};

await withPackagedApp({ label: 'packaged-first-run' }, async ({ app, userDataDir }) => {
  const initial = await poll(
    () => readStartPage(app),
    (state) => state?.privacyHidden === false,
    'fresh packaged profile did not show the privacy choices'
  );
  assert.equal(initial.suggestions, true, 'search suggestions should reflect their approved default');
  assert.equal(initial.usagePing, true, 'usage ping should reflect its approved default');
  assert.ok(
    !fs.existsSync(path.join(userDataDir, 'install.json')),
    'telemetry install id must not be created before consent'
  );

  await executeOnStartPage(app, `(async () => {
    // Walk to the privacy step, decline both choices, and skip out — skip
    // must persist the choices exactly as shown, same as Start browsing.
    // Continue's handler is async (the import step awaits), so yield a
    // microtask turn between clicks rather than spinning synchronously.
    const dialog = document.getElementById('onboardDialog');
    const next = document.getElementById('obNext');
    for (let i = 0; i < 8 && dialog.dataset.step !== '4'; i++) {
      next.click();
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    if (dialog.dataset.step !== '4') throw new Error('never reached the privacy step');
    if (document.getElementById('obSuggestions').getAttribute('aria-checked') === 'true') {
      document.getElementById('obSuggestions').click();
    }
    if (document.getElementById('obPing').getAttribute('aria-checked') === 'true') {
      document.getElementById('obPing').click();
    }
    document.getElementById('obSkip').click();
  })()`);
  await poll(
    () => readStartPage(app),
    (state) => state?.privacyHidden === true,
    'saved privacy choices did not dismiss first-run UI'
  );

  const settings = JSON.parse(
    fs.readFileSync(path.join(userDataDir, 'settings.json'), 'utf8')
  );
  assert.equal(settings.onboardingVersion, 1);
  assert.equal(settings.searchSuggestions, false);
  assert.equal(settings.usagePing, false);
  assert.ok(
    !fs.existsSync(path.join(userDataDir, 'install.json')),
    'declining telemetry must not mint an install id'
  );
  await poll(
    () => readStartPage(app),
    (state) => state?.startupHidden === true,
    'cold-online blocker initialization did not release browsing',
    60_000
  );
});

// F37 — the blank tab's typing affordance, on the tab the process opened for
// itself rather than one the test made. The acceptance scenario reconstructs
// its starting state through the test hook, so it would keep passing if the
// startup tab stopped being blank or something started opening the island on
// the way in; this observes the real thing, and in the form users get it —
// packaged, where type-to-open.js is served from inside the asar and the
// test hook does not exist (main.js gates it on !app.isPackaged), so the
// three chrome documents are read directly.
//
// The other half of that startup contract — that page content, not the
// island, holds focus — is not observable from here. See the note at the
// keystroke below, and cold-launch-smoke.mjs.
await withPackagedApp({
  label: 'packaged-blank-tab-affordance',
  prepare: async (userDataDir) => {
    // A returning user's cold launch, which is the only one this contract can
    // hold for: the first-run dialog is modal, and type-to-open deliberately
    // refuses to fire behind a modal (newtab.js checks for an open
    // [role=dialog][aria-modal=true]).
    //
    // usagePing is declined because this is a PACKAGED launch and a complete
    // onboarding marker releases the launch ping — an unattended test run
    // must not report itself to the production telemetry endpoint as an
    // active user. Everything else stays at its default, blocking included,
    // so the startup navigation gate is installed exactly as it is in a real
    // launch.
    fs.writeFileSync(
      path.join(userDataDir, 'settings.json'),
      JSON.stringify({ onboardingVersion: 1, usagePing: false }),
    );
  },
}, async ({ app }) => {
  const cold = await poll(
    () => readColdLaunchIsland(app),
    (state) => state?.pillPlaceholder === true,
    'the cold-launch startup tab did not present a blank island',
  );
  // 1. The tab the process opened for itself is blank.
  assert.equal(cold.startUrl, 'blanc://newtab/', 'the startup tab must be the blank start page');
  // 2. Nothing has opened the island on the way in. This is the precondition
  //    that makes the typing assertion below mean anything: Cmd/Ctrl+T passes
  //    focusAddress: true and would open the island itself.
  assert.equal(cold.islandMode, null, 'a cold launch must leave the island closed');

  // 3. Typing lands somewhere, which is what the caret promises: a real key
  //    event through the page's own listener, the blanc: preload bridge,
  //    main's validator and the overlay — every hop in its packaged form,
  //    including type-to-open.js being served out of the asar.
  //
  //    Which VIEW holds focus is deliberately not asserted here, and this
  //    keystroke does not prove it: a CDP key event goes straight to its
  //    target's widget rather than being routed by focus, and in a renderer
  //    document.hasFocus() reports window activation, so all three documents
  //    read as focused. Both were measured against a build with focusContent
  //    flipped to false and were identical to the correct build's, so an
  //    assertion on either would be decoration. Focus is truthful only in the
  //    browser process, which a packaged build does not expose — it is
  //    asserted on an unpackaged cold launch in cold-launch-smoke.mjs.
  const start = app.pages().find((candidate) => candidate.url().startsWith('blanc://newtab'));
  await start.keyboard.press('g');
  await poll(
    () => readColdLaunchIsland(app),
    (state) => state?.islandMode === 'panel' && state.islandValue === 'g',
    'typing on the cold-launched blank tab did not open the island with that character',
  );
});

await withPackagedApp({
  label: 'packaged-filter-retry',
  launchArgs: ['https://example.com/queued-for-retry'],
  env: {
    BLANC_TEST: '1',
    BLANC_TEST_ADBLOCK_FAILURE: 'once',
  },
  prepare: async (userDataDir) => {
    fs.writeFileSync(path.join(userDataDir, adblockCacheFile), 'corrupt cache');
  },
}, async ({ app, userDataDir }) => {
  await poll(
    () => readStartPage(app),
    (state) => state?.startupActionsHidden === false,
    'one-shot filter failure did not expose Retry',
    30_000
  );
  await executeOnStartPage(app, `document.getElementById('startupRetry').click();`);
  await poll(
    () => readStartPage(app),
    (state) => state?.startupHidden === true,
    'Retry did not rebuild blocking and release startup',
    60_000
  );
  await poll(
    () => app.pages().map((candidate) => candidate.url()),
    (urls) => urls.includes('https://example.com/queued-for-retry'),
    'queued navigation was not released after successful Retry'
  );
  const settings = JSON.parse(
    fs.readFileSync(path.join(userDataDir, 'settings.json'), 'utf8')
  );
  assert.equal(settings.adblockEnabled, true, 'successful Retry must keep blocking enabled');
});

await withPackagedApp({
  label: 'packaged-filter-failure',
  launchArgs: ['https://example.com/queued-at-startup'],
  env: {
    BLANC_TEST: '1',
    BLANC_TEST_ADBLOCK_FAILURE: 'always',
  },
  prepare: async (userDataDir) => {
    // A corrupt cache must fall back to the verified bundled snapshot. The
    // exact packaged-only gate then simulates a deterministic initialization
    // failure without changing the machine's network settings.
    fs.writeFileSync(path.join(userDataDir, adblockCacheFile), 'corrupt cache');
  },
}, async ({ app, userDataDir }) => {
  const failed = await poll(
    () => readStartPage(app),
    (state) => state?.startupActionsHidden === false,
    'corrupt-cache/offline startup did not expose recovery actions',
    30_000
  );
  assert.equal(failed.startupHidden, false);
  assert.equal(failed.startupTitle, 'Blocking could not start.');

  await executeOnStartPage(
    app,
    `document.getElementById('startupContinue').click();`
  );
  await poll(
    () => readStartPage(app),
    (state) => state?.startupHidden === true,
    'Continue without blocking did not release the startup gate'
  );
  await poll(
    () => app.pages().map((candidate) => candidate.url()),
    (urls) => urls.includes('https://example.com/queued-at-startup'),
    'queued command-line navigation was not released after the explicit decision'
  );

  const settingsPath = path.join(userDataDir, 'settings.json');
  const settings = await poll(
    () => fs.existsSync(settingsPath)
      ? JSON.parse(fs.readFileSync(settingsPath, 'utf8'))
      : null,
    (value) => value?.adblockEnabled === false,
    'Continue without blocking did not persist the effective setting'
  );
  assert.equal(settings.adblockEnabled, false);
});

console.log(`packaged-first-run-smoke OK: ${executablePath}`);
