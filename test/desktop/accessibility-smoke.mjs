import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { createRequire } from 'node:module';
import { _electron } from 'playwright';

const require = createRequire(import.meta.url);
const axeSource = require('axe-core').source;
const repoRoot = path.resolve(import.meta.dirname, '..', '..');
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-accessibility-'));
const failures = [];

const poll = async (read, predicate, message, timeoutMs = 10_000) => {
  const deadline = Date.now() + timeoutMs;
  let value;
  while (Date.now() < deadline) {
    value = await read();
    if (predicate(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.fail(`${message}; last value: ${JSON.stringify(value)}`);
};

const urls = (app) => app.evaluate(({ webContents }) =>
  webContents.getAllWebContents().map((candidate) => candidate.getURL())
);

const waitForUrl = (app, prefix) => poll(
  () => urls(app),
  (items) => items.some((url) => url.startsWith(prefix)),
  `accessibility surface did not load: ${prefix}`
);

const runOnSurface = (app, prefix, source) => app.evaluate(
  async ({ webContents }, args) => {
    const target = webContents.getAllWebContents()
      .find((candidate) => candidate.getURL().startsWith(args.prefix));
    if (!target) throw new Error(`missing WebContents for ${args.prefix}`);
    return target.executeJavaScript(args.source);
  },
  { prefix, source }
);

const focusState = (app, prefix) => runOnSurface(app, prefix, `(() => {
  const active = document.activeElement;
  return {
    id: active?.id ?? '',
    tag: active?.tagName?.toLowerCase() ?? '',
    text: active?.textContent?.trim().slice(0, 80) ?? '',
  };
})()`);

const waitForHook = (app, method, predicate, message) => poll(
  () => app.evaluate((_electron, name) => globalThis.__blanc[name](), method),
  predicate,
  message
);

const assertReflow = async (app, { name, prefix }) => {
  await app.evaluate(({ webContents }, urlPrefix) => {
    const target = webContents.getAllWebContents()
      .find((candidate) => candidate.getURL().startsWith(urlPrefix));
    if (!target) throw new Error(`missing WebContents for ${urlPrefix}`);
    target.setZoomFactor(2);
  }, prefix);
  try {
    const metrics = await runOnSurface(app, prefix, `(() => {
      const page = document.querySelector('.page');
      return {
        viewport: window.innerWidth,
        documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        pageOverflow: page ? page.scrollWidth - page.clientWidth : 0,
      };
    })()`);
    if (metrics.documentOverflow > 1 || metrics.pageOverflow > 1) {
      failures.push(`${name} does not reflow at 200% zoom: ${JSON.stringify(metrics)}`);
    }
  } finally {
    await app.evaluate(({ webContents }, urlPrefix) => {
      const target = webContents.getAllWebContents()
        .find((candidate) => candidate.getURL().startsWith(urlPrefix));
      target?.setZoomFactor(1);
    }, prefix);
  }
};

const audit = async (app, { name, prefix, focus }) => {
  await waitForUrl(app, prefix);
  await runOnSurface(app, prefix, axeSource);
  const result = await runOnSurface(app, prefix, `(async () => {
    const result = await axe.run(document, {
      runOnly: {
        type: 'tag',
        values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'],
      },
    });
    return result.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      help: violation.help,
      nodes: violation.nodes.map((node) => ({
        target: node.target.join(' '),
        html: node.html,
        failure: node.failureSummary,
      })),
    }));
  })()`);

  if (focus) {
    const active = await focusState(app, prefix);
    if (active.id !== focus) {
      failures.push(`${name} should initially focus #${focus}, got ${JSON.stringify(active)}`);
    }
  }

  if (result.length) {
    const details = result.map((violation) => {
      const nodes = violation.nodes.map((node) =>
        `    ${node.target}: ${node.failure}\n      ${node.html}`
      ).join('\n');
      return `  [${violation.impact ?? 'unknown'}] ${violation.id}: ${violation.help}\n${nodes}`;
    }).join('\n');
    failures.push(`${name} has ${result.length} accessibility violation(s):\n${details}`);
  } else {
    console.log(`accessibility OK: ${name}`);
  }
};

let app;
try {
  app = await _electron.launch({
    args: [repoRoot, `--user-data-dir=${userDataDir}`],
    env: {
      ...process.env,
      BLANC_TEST: '1',
      BLANC_TEST_BROWSER_HOME: userDataDir,
    },
  });
  await app.firstWindow();
  await app.evaluate(() => new Promise((resolve) => {
    const timer = setInterval(() => {
      if (globalThis.__blanc) {
        clearInterval(timer);
        resolve();
      }
    }, 50);
  }));
  await app.evaluate(() => globalThis.__blanc.reset());
  await poll(
    () => app.evaluate(() => globalThis.__blanc.state()),
    (state) => {
      const active = state.tabs.find((tab) => tab.id === state.activeTabId);
      return active?.loadedUrl.startsWith('blanc://newtab/') && active.loading === false;
    },
    'new-tab accessibility surface did not settle after reset'
  );

  const newtabPrefix = 'blanc://newtab/';
  await audit(app, { name: 'new tab', prefix: newtabPrefix });

  // Exercise the real three-step first-run renderer state even though the
  // BLANC_TEST harness marks first run complete at process startup.
  await app.evaluate(() => globalThis.__blanc.showTestFirstRunMigration());
  await waitForHook(
    app,
    'readFirstRunMigrationDom',
    (state) => state?.privacyHidden === false && state.privacyStepHidden === false,
    'first-run privacy step did not render'
  );
  await audit(app, { name: 'first-run privacy', prefix: newtabPrefix, focus: 'privacyContinue' });
  await app.evaluate(() => globalThis.__blanc.clickFirstRunPrivacyContinue());
  await waitForHook(
    app,
    'readFirstRunMigrationDom',
    (state) => state?.migrationStepHidden === false,
    'first-run migration step did not render'
  );
  const migrationState = await app.evaluate(() => globalThis.__blanc.readFirstRunMigrationDom());
  await audit(app, {
    name: 'first-run migration',
    prefix: newtabPrefix,
    focus: migrationState.migrationHidden ? 'migrationContinue' : 'migrationSource',
  });
  await app.evaluate(() => globalThis.__blanc.clickFirstRunMigrationContinue());
  await waitForHook(
    app,
    'readFirstRunMigrationDom',
    (state) => state?.setupStepHidden === false,
    'first-run layout step did not render'
  );
  await audit(app, { name: 'first-run layout', prefix: newtabPrefix, focus: 'onboardingLayoutIsland' });
  await app.evaluate(() => globalThis.__blanc.clickFirstRunFinish());
  await waitForHook(
    app,
    'readFirstRunMigrationDom',
    (state) => state?.privacyHidden === true,
    'first-run card did not dismiss'
  );

  // The two file:// documents need an exact suffix because both chrome and
  // overlay share the same scheme and directory.
  const fileSurface = async (suffix, source) => app.evaluate(
    async ({ webContents }, args) => {
      const target = webContents.getAllWebContents()
        .find((candidate) => candidate.getURL().endsWith(args.suffix));
      if (!target) throw new Error(`missing WebContents ending in ${args.suffix}`);
      return target.executeJavaScript(args.source);
    },
    { suffix, source }
  );
  const auditFileSurface = async ({ name, suffix, focus, disabledDocumentRules = [] }) => {
    await poll(
      () => urls(app),
      (items) => items.some((url) => url.endsWith(suffix)),
      `accessibility surface did not load: ${suffix}`
    );
    await fileSurface(suffix, axeSource);
    const ruleOverrides = Object.fromEntries(
      disabledDocumentRules.map((rule) => [rule, { enabled: false }])
    );
    const violations = await fileSurface(suffix, `(async () => {
      const result = await axe.run(document, {
        runOnly: {
          type: 'tag',
          values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'],
        },
        // Only these two file:// documents are partial application surfaces,
        // not standalone pages. Their toolbar/dialog/search roles are audited;
        // full blanc:// pages keep the document H1/main rules enabled above.
        rules: ${JSON.stringify(ruleOverrides)},
      });
      return result.violations.map((violation) => ({
        id: violation.id,
        impact: violation.impact,
        help: violation.help,
        nodes: violation.nodes.map((node) => ({
          target: node.target.join(' '),
          html: node.html,
          failure: node.failureSummary,
        })),
      }));
    })()`);
    if (focus) {
      const active = await fileSurface(suffix, `document.activeElement?.id ?? ''`);
      if (active !== focus) {
        failures.push(`${name} should initially focus #${focus}, got #${active}`);
      }
    }
    if (violations.length) {
      failures.push(`${name} accessibility violations:\n${JSON.stringify(violations, null, 2)}`);
    } else {
      console.log(`accessibility OK: ${name}`);
    }
  };

  await auditFileSurface({
    name: 'chrome strip',
    suffix: '/src/renderer/index.html',
    disabledDocumentRules: ['page-has-heading-one'],
  });

  // Build a representative grouped workspace so dynamic tab actions, group
  // headers, and vertical-tab roving controls are all present in the audit.
  await app.evaluate(() => {
    const first = globalThis.__blanc.openTab('blanc://newtab/?audit=work-one');
    globalThis.__blanc.setTabPresentation(first, { title: 'Work one' });
    globalThis.__blanc.groupActiveByName('work');
    const second = globalThis.__blanc.openTab('blanc://newtab/?audit=work-two');
    globalThis.__blanc.setTabPresentation(second, { title: 'Work two' });
    globalThis.__blanc.groupActiveByName('work');
    globalThis.__blanc.pinTab(second);
    globalThis.__blanc.setTabLayout('vertical');
  });
  await poll(
    () => fileSurface('/src/renderer/index.html', `document.documentElement.dataset.tabLayout`),
    (layout) => layout === 'vertical',
    'vertical tabs did not render for accessibility audit'
  );
  await auditFileSurface({
    name: 'vertical tab rail',
    suffix: '/src/renderer/index.html',
    disabledDocumentRules: ['page-has-heading-one'],
  });
  await app.evaluate(() => globalThis.__blanc.setTabLayout('island'));
  await poll(
    () => fileSurface('/src/renderer/index.html', `document.documentElement.dataset.tabLayout`),
    (layout) => layout === 'island',
    'grouped Island did not render for accessibility audit'
  );
  await auditFileSurface({
    name: 'grouped Island strip',
    suffix: '/src/renderer/index.html',
    disabledDocumentRules: ['page-has-heading-one'],
  });
  const dotTargets = await fileSurface('/src/renderer/index.html', `(() =>
    [...document.querySelectorAll('.island-dot')].map((dot) => {
      const bounds = dot.getBoundingClientRect();
      return {
        tag: dot.tagName,
        label: dot.getAttribute('aria-label') ?? '',
        width: bounds.width,
        height: bounds.height,
      };
    }))()`);
  const invalidDots = dotTargets.filter((dot) =>
    dot.tag !== 'BUTTON' || !dot.label || dot.width < 24 || dot.height < 24
  );
  if (invalidDots.length) {
    failures.push(`grouped Island has undersized or unnamed tab targets: ${JSON.stringify(invalidDots)}`);
  }

  await app.evaluate(() => globalThis.__blanc.openPanel());
  await auditFileSurface({
    name: 'Island panel',
    suffix: '/src/renderer/overlay.html',
    focus: 'addressInput',
    disabledDocumentRules: ['landmark-one-main', 'page-has-heading-one'],
  });
  await app.evaluate(() => globalThis.__blanc.closeOverlay());

  await app.evaluate(() => globalThis.__blanc.showPermissionPromptFixture());
  await waitForHook(
    app,
    'readPermissionPromptDom',
    (state) => state?.hidden === false && state.focus === 'permBlockBtn',
    'permission alertdialog did not render with keyboard focus'
  );
  await auditFileSurface({
    name: 'permission prompt',
    suffix: '/src/renderer/index.html',
    focus: 'permBlockBtn',
  });
  await app.evaluate(() => globalThis.__blanc.dismissPermissionPromptFixture());

  await app.evaluate(() => globalThis.__blanc.openPalette());
  await auditFileSurface({
    name: 'command palette',
    suffix: '/src/renderer/overlay.html',
    focus: 'addressInput',
    disabledDocumentRules: ['landmark-one-main', 'page-has-heading-one'],
  });
  const rowSemantics = await fileSurface('/src/renderer/overlay.html', `(() => ({
    rows: document.querySelectorAll('#islandList .island-row').length,
    inaccessible: [...document.querySelectorAll('#islandList .island-row')]
      .filter((row) => row.tagName !== 'BUTTON' && !row.querySelector(':scope > .row-main-action'))
      .length,
  }))()`);
  if (rowSemantics.inaccessible > 0) {
    failures.push(`command palette has ${rowSemantics.inaccessible}/${rowSemantics.rows} pointer-only rows`);
  }
  await app.evaluate(() => globalThis.__blanc.closeOverlay());

  await app.evaluate(() => {
    globalThis.__blanc.setActiveSiteSecurityFixture('secure');
    globalThis.__blanc.openPanel();
  });
  await poll(
    () => app.evaluate(() => globalThis.__blanc.readSiteInfoDom()),
    (state) => state?.buttonHidden === false,
    'site-information control did not render'
  );
  await app.evaluate(() => globalThis.__blanc.clickSiteInfoButton());
  await auditFileSurface({
    name: 'site information',
    suffix: '/src/renderer/overlay.html',
    disabledDocumentRules: ['landmark-one-main', 'page-has-heading-one'],
  });
  await app.evaluate(() => globalThis.__blanc.closeOverlay());

  await app.evaluate(() => globalThis.__blanc.startCredentialPick([
    { username: 'first@example.test', title: 'Example', host: 'example.test', vaultName: 'Personal' },
    { username: 'second@example.test', title: 'Example', host: 'example.test', vaultName: 'Work' },
  ]));
  await waitForHook(app, 'overlayRendererMode', (mode) => mode === 'credential-picker', 'credential picker did not render');
  await auditFileSurface({
    name: 'credential picker',
    suffix: '/src/renderer/overlay.html',
    disabledDocumentRules: ['landmark-one-main', 'page-has-heading-one'],
  });
  await app.evaluate(() => globalThis.__blanc.closeOverlay());
  await waitForHook(app, 'overlayRendererMode', (mode) => mode == null, 'credential picker did not close');

  await app.evaluate(() => globalThis.__blanc.startDisplaySharePick());
  await waitForHook(app, 'overlayRendererMode', (mode) => mode === 'display-share-picker', 'display-share picker did not render');
  await auditFileSurface({
    name: 'display-share picker',
    suffix: '/src/renderer/overlay.html',
    disabledDocumentRules: ['landmark-one-main', 'page-has-heading-one'],
  });
  await app.evaluate(() => globalThis.__blanc.closeOverlay());
  await waitForHook(app, 'overlayRendererMode', (mode) => mode == null, 'display-share picker did not close');

  await app.evaluate(() => globalThis.__blanc.setTheme('dark'));
  await poll(
    () => fileSurface('/src/renderer/index.html', `document.documentElement.dataset.appearance`),
    (appearance) => appearance === 'dark',
    'dark appearance did not reach browser chrome'
  );
  await auditFileSurface({
    name: 'dark browser chrome',
    suffix: '/src/renderer/index.html',
    disabledDocumentRules: ['page-has-heading-one'],
  });
  await app.evaluate(() => globalThis.__blanc.openPanel());
  await poll(
    () => fileSurface('/src/renderer/overlay.html', `document.documentElement.dataset.appearance`),
    (appearance) => appearance === 'dark',
    'dark appearance did not reach the Island overlay'
  );
  await auditFileSurface({
    name: 'dark Island panel',
    suffix: '/src/renderer/overlay.html',
    focus: 'addressInput',
    disabledDocumentRules: ['landmark-one-main', 'page-has-heading-one'],
  });
  await app.evaluate(() => globalThis.__blanc.closeOverlay());

  await app.evaluate(() => globalThis.__blanc.openTab('blanc://newtab/?private=1', { private: true }));
  await audit(app, { name: 'private new tab', prefix: 'blanc://newtab/?private=1' });
  await auditFileSurface({
    name: 'private browser chrome',
    suffix: '/src/renderer/index.html',
    disabledDocumentRules: ['page-has-heading-one'],
  });
  await app.evaluate(() => globalThis.__blanc.setTheme('system'));

  await app.evaluate(() => globalThis.__blanc.openFind());
  await auditFileSurface({
    name: 'find in page',
    suffix: '/src/renderer/overlay.html',
    focus: 'findInput',
    disabledDocumentRules: ['landmark-one-main', 'page-has-heading-one'],
  });
  await app.evaluate(() => globalThis.__blanc.closeOverlay());

  const utilityPages = [
    ['favorites', 'openFavoritesSheet', 'blanc://bookmarks/'],
    ['history', 'openHistory', 'blanc://history/'],
    ['downloads', 'openDownloads', 'blanc://downloads/'],
    ['settings', 'openSettings', 'blanc://settings/'],
    ['keyboard shortcuts', 'openShortcuts', 'blanc://shortcuts/'],
  ];
  await app.evaluate(() => globalThis.__blanc.setWindowContentSize(640, 480));
  for (const [name, method, prefix] of utilityPages) {
    await app.evaluate((_electron, action) => globalThis.__blanc[action](), method);
    await audit(app, { name: `${name} sheet`, prefix, focus: 'sheetTitle' });
    await assertReflow(app, { name: `${name} sheet`, prefix });
  }
  await app.evaluate(() => globalThis.__blanc.setWindowContentSize(1280, 800));

  await app.evaluate(() => globalThis.__blanc.showCertificateErrorFixture());
  await audit(app, { name: 'certificate error', prefix: 'blanc://error/' });

  // The auth document normally runs in a modal BrowserWindow. Loading it in a
  // test tab exercises the exact markup/CSS while avoiding a live 401 flow.
  await app.evaluate(() => globalThis.__blanc.openTab(
    'blanc://auth/?id=accessibility&host=example.test&realm=Members'
  ));
  await audit(app, { name: 'authentication dialog', prefix: 'blanc://auth/' });

  if (failures.length) {
    assert.fail(`Accessibility audit found ${failures.length} failing surface check(s):\n\n${failures.join('\n\n')}`);
  }
  console.log('accessibility-smoke OK');
} finally {
  if (app) await app.close();
  fs.rmSync(userDataDir, { recursive: true, force: true });
}
