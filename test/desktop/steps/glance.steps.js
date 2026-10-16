'use strict';

const assert = require('node:assert/strict');
const { Given, When, Then, After } = require('@cucumber/cucumber');
const ctx = require('../support/context');
const { overlayPage } = require('../support/overlay');
const { waitForValue } = require('../support/poll');
const { frontChromeWindow } = require('../support/tab-drag');

async function mainChromePage() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const page = ctx.app.windows().find((candidate) =>
      !candidate.isClosed() && candidate.url() === 'blanc-chrome://index/');
    if (page) {
      await page.waitForLoadState('domcontentloaded');
      return page;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('main chrome window never appeared');
}

// Glance scenarios change window-wide state (size, tab layout, rail width,
// the strip's platform, 1Password, the downloads indicator). Put it back after
// every one, also when a step failed midway, so a failure never leaks into
// the scenarios that follow.
After({ tags: '@glance' }, async function () {
  if (!ctx.app) return;
  const restore = async (work) => { try { await work(); } catch { /* the app may be gone */ } };
  await restore(async () => {
    if (!this.glanceRealPlatform) return;
    const chrome = await mainChromePage();
    await chrome.evaluate((real) => {
      document.documentElement.dataset.platform = real;
      document.querySelectorAll('#windowControls [data-glance-stand-in]').forEach((button) => button.remove());
    }, this.glanceRealPlatform);
    this.glanceRealPlatform = null;
  });
  if (this.glanceExtraWindowId) await restore(() => this.call('closeWindowRuntime', this.glanceExtraWindowId));
  await restore(() => this.call('setTabLayout', 'island'));
  await restore(() => this.call('setVerticalTabsWidth', 248));
  await restore(() => this.call('setWindowContentSize', 1200, 800));
  // A dragged divider would otherwise carry into the next scenario.
  await restore(() => this.call('resetGlanceRatio'));
  if (this.glanceOnePasswordOn) await restore(() => this.call('setOnePasswordConfig', false, ''));
  if (this.glanceDownloadsShown) {
    await restore(() => sendDownloadsActivity({ active: 0, hasRecent: false, receivedBytes: 0, totalBytes: 0, lastCompletedAt: null }));
  }
});

async function createGlanceTabs(world) {
  world.glanceMainUrl = world.fixtureUrl('glance-main');
  world.glanceReferenceUrl = world.fixtureUrl('glance-reference');
  world.glanceMainId = await world.call('openTab', world.glanceMainUrl);
  world.glanceReferenceId = await world.call('openTab', world.glanceReferenceUrl);
  await world.call('activateTab', world.glanceMainId, false);
  await world.waitForState((state) => {
    const main = state.tabs.find((tab) => tab.id === world.glanceMainId);
    const reference = state.tabs.find((tab) => tab.id === world.glanceReferenceId);
    // A title can arrive while Chromium is still loading. Quieting correctly
    // refuses a loading tab, so establish the fixture's eligibility first.
    return main?.title === 'glance-main' && reference?.title === 'glance-reference'
      && !main.isLoading && !reference.isLoading;
  });
}

/** Give a pane keyboard focus and wait until main has recorded it — the
 * state every follow-focus command reads on macOS, where the menu carries no
 * sender. */
// A busy desktop can take the window back between fronting it and the focus
// call, and the app's activation itself lands asynchronously: keep fronting
// and focusing until main records the pane as focused.
async function focusPane(world, tabId) {
  // The timeout message says whether the window itself held OS focus, which
  // tells an inactive window (the desktop's doing) from a routing bug.
  await waitForValue(async () => {
    const windowFocused = await world.call('focusWindow');
    assert.equal(await world.call('focusTabContents', tabId), true);
    const { focusedPaneTabId, tabs } = await world.state();
    const focusedContents = await world.call('focusedWebContentsId');
    const paneContents = tabs.find((tab) => tab.id === tabId)?.webContentsId;
    return {
      recorded: focusedPaneTabId,
      windowFocused,
      paneHoldsFocus: focusedContents === paneContents,
      paneReportsFocused: await ctx.app.evaluate(({ webContents }, id) =>
        webContents.fromId(id)?.isFocused() ?? null, paneContents),
    };
  }, (value) => value.recorded === tabId, `pane ${tabId} recorded as focused`);
}

/** The fixture page's own load counter (sessionStorage, +1 per load). */
async function loadCount(world, tabId) {
  try {
    return await world.call('workspacePageScript', tabId,
      "Number(sessionStorage.getItem('acceptance-load-count'))");
  } catch {
    return null;
  }
}

async function recordLoadCounts(world) {
  world.glanceLoadsBefore = {
    main: await loadCount(world, world.glanceMainId),
    reference: await loadCount(world, world.glanceReferenceId),
  };
}

async function cssColour(chrome, token) {
  return chrome.evaluate((name) => {
    const probe = document.createElement('span');
    probe.style.color = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    document.body.append(probe);
    const colour = getComputedStyle(probe).color;
    probe.remove();
    return colour;
  }, token);
}

Given('two ordinary tabs in one workspace for Glance', async function () {
  await createGlanceTabs(this);
});

Given('three ordinary tabs with one open in Glance', async function () {
  await createGlanceTabs(this);
  this.glanceReplacementUrl = this.fixtureUrl('glance-replacement');
  this.glanceReplacementId = await this.call('openTab', this.glanceReplacementUrl);
  await this.waitForState((state) =>
    state.tabs.find((tab) => tab.id === this.glanceReplacementId)?.title === 'glance-replacement');
  await this.call('activateTab', this.glanceMainId, false);
  assert.equal(await this.call('setGlance', this.glanceReferenceId), true);
  this.glanceOriginalMainId = this.glanceMainId;
});

Given('a quiet background tab eligible for Glance', async function () {
  await createGlanceTabs(this);
  assert.equal(await this.call('sleepTab', this.glanceReferenceId), true);
  const state = await this.waitForState((candidate) =>
    candidate.tabs.find((tab) => tab.id === this.glanceReferenceId)?.asleep === true);
  assert.equal(state.activeTabId, this.glanceMainId);
});

When('I open the reference tab in Glance', async function () {
  assert.equal(await this.call('setGlance', this.glanceReferenceId), true);
  await this.call('closeOverlay');
});

When('I summon Glance from its native keyboard shortcut', async function () {
  await waitForValue(
    () => this.call('glanceShortcutEnabled'),
    Boolean,
    'enabled Glance native-menu command'
  );
  assert.equal(await this.call('pressGlanceShortcut'), true);
});

Then('Glance shows a dedicated accessible local-tab picker', async function () {
  await waitForValue(
    () => this.call('overlayMode'),
    (mode) => mode === 'glance',
    'dedicated Glance picker mode'
  );
  const page = await overlayPage();
  await page.locator('#glancePicker:not([hidden])').waitFor();
  assert.equal(await page.locator('#panelAnchor').isVisible(), false, 'normal Island panel leaked into picker');
  assert.equal(await page.locator('#glancePickerInput').getAttribute('role'), 'combobox');
  assert.equal(await page.locator('#glancePickerInput').getAttribute('aria-controls'), 'glancePickerList');
  assert.equal(await page.locator('#glancePickerList').getAttribute('role'), 'listbox');
  assert.equal(await page.locator('#glancePickerInput').inputValue(), '');
  const pickerBox = await page.locator('#glancePicker').evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left,
      right: rect.right,
      top: rect.top,
      width: rect.width,
      viewportWidth: window.innerWidth,
    };
  });
  assert.ok(pickerBox.width <= 421, `picker was too wide: ${pickerBox.width}px`);
  assert.ok(pickerBox.left >= 12 && pickerBox.viewportWidth - pickerBox.right >= 12);
  assert.ok(pickerBox.top >= 50, `picker was not anchored below chrome: ${pickerBox.top}px`);
  assert.equal(
    await page.locator('#glancePickerInput').evaluate((element) => document.activeElement === element),
    true,
    'picker did not focus its filter field'
  );
  const labels = await page.locator('.glance-picker-option').evaluateAll((rows) =>
    rows.map((row) => row.getAttribute('aria-label')));
  assert.ok(
    labels.some((label) => label.includes('glance-reference')),
    `reference tab missing from picker labels: ${JSON.stringify(labels)}`
  );
  assert.ok(labels.every((label) => !label.includes('glance-main')), 'active main tab was selectable');
  assert.ok(!labels.some((label) => /remote|history|favorite|search/i.test(label)));
  assert.equal((await this.state()).glanceTabId, null);
});

When('I filter the Glance picker and choose the reference tab', async function () {
  const page = await overlayPage();
  await page.fill('#glancePickerInput', 'reference');
  const result = page.locator('.glance-picker-option');
  await result.first().waitFor();
  assert.equal(await result.count(), 1);
  assert.equal(await result.first().getAttribute('aria-selected'), 'true');
  assert.ok(await page.locator('#glancePickerInput').getAttribute('aria-activedescendant'));
  await page.press('#glancePickerInput', 'Enter');
  await this.waitForState((state) => state.glanceTabId === this.glanceReferenceId);
});

Then('the active page and Glance occupy separate dominant and reference panes', async function () {
  const state = await waitForValue(
    () => this.state(),
    (value) => value.glanceTabId === this.glanceReferenceId && value.glanceGeometry,
    'Glance geometry'
  );
  assert.equal(state.activeTabId, this.glanceMainId);
  assert.equal(state.glanceGeometry.direction, 'horizontal');
  assert.ok(state.glanceGeometry.primary.width > state.glanceGeometry.glanceContent.width);
  assert.equal(
    state.glanceGeometry.primary.x + state.glanceGeometry.primary.width +
      state.glanceGeometry.divider.width,
    state.glanceGeometry.glanceContent.x
  );
  assert.equal(state.glanceGeometry.glanceHeader.y, 0);
  assert.equal(state.glanceGeometry.glanceHeader.height, state.glanceGeometry.page.y);
  this.glanceInitialPrimaryWidth = state.glanceGeometry.primary.width;

  const chrome = await mainChromePage();
  const header = chrome.locator('#glanceHeader:not([hidden])');
  await header.waitFor();
  assert.equal(await header.getAttribute('role'), 'group');
  const promote = chrome.locator('#glancePromote');
  const promoteName = await promote.getAttribute('aria-label');
  assert.equal(promoteName, 'Make main — swap with the main page');
  assert.ok(promoteName.startsWith((await promote.locator('span').textContent()).trim()),
    'the accessible name begins with the visible words (label in name)');
  assert.equal(await promote.locator('svg path').getAttribute('d'),
    'M3.5 5.5h9M10 3l2.5 2.5L10 8M12.5 10.5h-9M6 8l-2.5 2.5L6 13',
    'the icon-only state draws the swap glyph, not the Forward chevron');
  assert.equal(await chrome.locator('#glanceChange').textContent(), 'Change');
  assert.equal(await chrome.locator('#glanceClose').getAttribute('aria-label'), 'Close Glance');
  const headerFlow = await header.evaluate((element) => {
    const copy = element.querySelector('.glance-copy').getBoundingClientRect();
    const eyebrow = element.querySelector('.glance-eyebrow').getBoundingClientRect();
    const identity = element.querySelector('.glance-tab-identity').getBoundingClientRect();
    const actions = element.querySelector('.glance-actions').getBoundingClientRect();
    const bounds = element.getBoundingClientRect();
    return {
      direction: getComputedStyle(element.querySelector('.glance-copy')).flexDirection,
      eyebrowCenter: eyebrow.top + eyebrow.height / 2,
      identityCenter: identity.top + identity.height / 2,
      copyRight: copy.right,
      actionsLeft: actions.left,
      actionsRight: actions.right,
      headerRight: bounds.right,
    };
  });
  assert.equal(headerFlow.direction, 'row');
  assert.ok(Math.abs(headerFlow.eyebrowCenter - headerFlow.identityCenter) <= 1);
  assert.ok(headerFlow.copyRight <= headerFlow.actionsLeft);
  assert.ok(headerFlow.actionsRight <= headerFlow.headerRight);

  // The horizontal header spans to the window's right edge, where Windows and
  // Linux draw the custom minimize/maximize/close cluster. Those controls
  // populate only off-macOS, so assert the stacking invariant itself: the
  // controls layer must beat the header layer or the header's opaque surface
  // swallows their clicks.
  const stacking = await chrome.evaluate(() => ({
    header: Number(getComputedStyle(document.getElementById('glanceHeader')).zIndex) || 0,
    controls: Number(getComputedStyle(document.getElementById('windowControls')).zIndex) || 0,
  }));
  assert.ok(
    stacking.controls > stacking.header,
    `window controls must stack above the Glance header (controls z ${stacking.controls}, header z ${stacking.header})`
  );
});

When('I focus the interactive Glance page', async function () {
  this.glanceRolesBeforeFocus = {
    activeTabId: (await this.state()).activeTabId,
    glanceTabId: (await this.state()).glanceTabId,
  };
  assert.equal(await this.call('focusTabContents', this.glanceReferenceId), true);
});

Then('the main and reference roles do not change', async function () {
  const state = await this.state();
  assert.equal(state.activeTabId, this.glanceRolesBeforeFocus.activeTabId);
  assert.equal(state.glanceTabId, this.glanceRolesBeforeFocus.glanceTabId);
});

When('I promote the Glance pane', async function () {
  const chrome = await mainChromePage();
  await chrome.locator('#glancePromote').click();
  await this.waitForState((state) => state.activeTabId === this.glanceReferenceId);
});

Then('the two visible tabs swap main and reference roles', async function () {
  const state = await this.state();
  assert.equal(state.activeTabId, this.glanceReferenceId);
  assert.equal(state.glanceTabId, this.glanceMainId);
});

When('I resize the Glance divider', async function () {
  // The ratio lives on the window runtime and survives scenario retries —
  // pin the starting point so the stepped expectations below are stable.
  await this.call('resetGlanceRatio');
  await this.waitForState((candidate) =>
    Math.round(candidate.glanceGeometry.ratio * 100) === 62);
  const state = await this.state();
  this.glanceWidthBeforeKeyboardResize = state.glanceGeometry.primary.width;
  const chrome = await mainChromePage();
  await chrome.locator('#glanceDivider').focus();
  await chrome.locator('#glanceDivider').press('Shift+ArrowLeft');
  await this.waitForState((candidate) =>
    candidate.glanceGeometry.primary.width < this.glanceWidthBeforeKeyboardResize
    && Math.round(candidate.glanceGeometry.ratio * 100) === 57);
  // Key repeat delivers keydowns faster than the main-process layout echo
  // returns. Two same-task keydowns must still step twice (57 → 53), not
  // recompute both steps from the same stale ratio.
  await chrome.evaluate(() => {
    const divider = document.getElementById('glanceDivider');
    for (let i = 0; i < 2; i += 1) {
      divider.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'ArrowLeft',
        bubbles: true,
        cancelable: true,
      }));
    }
  });
  await this.waitForState((candidate) =>
    Math.round(candidate.glanceGeometry.ratio * 100) === 53);
});

Then('the main pane remains larger than the reference pane', async function () {
  const state = await this.state();
  assert.ok(state.glanceGeometry.primary.width > state.glanceGeometry.glanceContent.width);
  assert.ok(state.glanceGeometry.primary.width < this.glanceInitialPrimaryWidth);
});

When('I close Glance', async function () {
  const state = await this.state();
  this.glanceSplitWidth = state.glanceGeometry.primary.width;
  const chrome = await mainChromePage();
  await chrome.locator('#glanceClose').click();
});

When('I choose Change and select the replacement tab', async function () {
  const chrome = await mainChromePage();
  await chrome.locator('#glanceChange').click();
  await waitForValue(() => this.call('overlayMode'), (mode) => mode === 'glance', 'change picker');
  const page = await overlayPage();
  await page.locator('#glancePicker:not([hidden])').waitFor();
  assert.equal(await page.locator('body').getAttribute('data-glance-purpose'), 'change');
  const pickerPosition = await page.locator('#glancePicker').evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      width: rect.width,
      rightGap: window.innerWidth - rect.right,
    };
  });
  assert.ok(pickerPosition.width <= 421, `change picker was too wide: ${pickerPosition.width}px`);
  assert.ok(pickerPosition.rightGap >= 23 && pickerPosition.rightGap <= 25);
  await page.fill('#glancePickerInput', 'replacement');
  await page.locator('.glance-picker-option').first().waitFor();
  assert.equal(await page.locator('.glance-picker-option').count(), 1);
  await page.press('#glancePickerInput', 'Enter');
  await this.waitForState((state) => state.glanceTabId === this.glanceReplacementId);
});

Then('only the Glance reference changes', async function () {
  const state = await this.state();
  assert.equal(state.activeTabId, this.glanceOriginalMainId);
  assert.equal(state.glanceTabId, this.glanceReplacementId);
});

When('I cancel the Change picker with Escape', async function () {
  const chrome = await mainChromePage();
  await chrome.locator('#glanceChange').click();
  await waitForValue(() => this.call('overlayMode'), (mode) => mode === 'glance', 'change picker');
  const page = await overlayPage();
  await page.locator('#glancePickerInput').press('Escape');
  await waitForValue(() => this.call('overlayMode'), (mode) => mode === null, 'dismissed change picker');
});

Then('focus returns to the Change control', async function () {
  const chrome = await mainChromePage();
  assert.equal(
    await chrome.locator('#glanceChange').evaluate((element) => document.activeElement === element),
    true
  );
});

When('I close the underlying Glance tab', async function () {
  const state = await this.state();
  this.glanceSplitWidth = state.glanceGeometry.primary.width;
  await this.call('closeTab', state.glanceTabId);
});

Then('the active page fills the browser page region', async function () {
  const state = await waitForValue(
    () => this.state(),
    (value) => value.glanceTabId === null,
    'Glance to close'
  );
  const active = state.tabs.find((tab) => tab.id === state.activeTabId);
  assert.ok(active.bounds.width > this.glanceSplitWidth);
});

When('I narrow the workspace below the side-by-side threshold', async function () {
  await this.call('setWindowContentSize', 700, 800);
});

Then('Glance has a labelled stacked header above its reference content', async function () {
  const state = await waitForValue(
    () => this.state(),
    (value) => value.glanceGeometry?.direction === 'vertical',
    'stacked Glance geometry'
  );
  const { divider, glanceHeader, glanceContent } = state.glanceGeometry;
  assert.equal(glanceHeader.height, 44);
  assert.equal(glanceHeader.y, divider.y + divider.height);
  assert.equal(glanceContent.y, glanceHeader.y + glanceHeader.height);

  const chrome = await mainChromePage();
  const header = chrome.locator('#glanceHeader:not([hidden])');
  await header.waitFor();
  assert.equal(await header.getAttribute('data-direction'), 'vertical');
  // Stacked, the main page is the full page width, so the Island is centred
  // over the whole page — not over 68% of it.
  const centring = await chrome.evaluate(() => {
    const strip = document.getElementById('strip');
    const pill = document.getElementById('islandPill').getBoundingClientRect();
    return {
      direction: strip.dataset.glanceDirection,
      primaryRight: parseFloat(getComputedStyle(strip).getPropertyValue('--glance-primary-right')),
      pillCenter: pill.left + pill.width / 2,
      headerPaddingRight: getComputedStyle(document.getElementById('glanceHeader')).paddingRight,
    };
  });
  const { page: pageBounds } = state.glanceGeometry;
  assert.equal(centring.direction, 'vertical');
  assert.equal(centring.primaryRight, pageBounds.x + pageBounds.width);
  const pageCenter = pageBounds.x + pageBounds.width / 2;
  assert.ok(Math.abs(centring.pillCenter - pageCenter) <= 2, `pill centre ${centring.pillCenter}, page centre ${pageCenter}`);
  assert.equal(centring.headerPaddingRight, '12px', 'stacked header keeps the plain 12px inset');
  assert.equal(await chrome.locator('#glanceChange').isVisible(), true);
  assert.equal(await chrome.locator('#glanceClose').isVisible(), true);
  const stackedHeader = await header.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const actions = element.querySelector('.glance-actions').getBoundingClientRect();
    return {
      actionsLeft: actions.left,
      actionsRight: actions.right,
      headerLeft: bounds.left,
      headerRight: bounds.right,
    };
  });
  assert.ok(stackedHeader.actionsLeft >= stackedHeader.headerLeft);
  assert.ok(stackedHeader.actionsRight <= stackedHeader.headerRight);
  await this.call('setWindowContentSize', 1200, 800);
});

When('quiet-tab housekeeping targets the visible reference', async function () {
  // Sweep-level exclusion: an idle-looking visible reference is not a
  // candidate.
  await this.call('setTabIdleSince', this.glanceReferenceId, 2 * 60 * 60 * 1000);
  await this.call('runSleepSweep');
  // Final-guard exclusion: even a direct discard request (the interleaved
  // sweep case — the tab became the reference after candidate selection)
  // must refuse.
  this.glanceDirectSleepResult = await this.call('sleepTab', this.glanceReferenceId);
});

Then('the Glance reference stays awake beside the main page', async function () {
  assert.equal(this.glanceDirectSleepResult, false, 'sleepTab discarded the visible Glance reference');
  const state = await this.state();
  const reference = state.tabs.find((tab) => tab.id === this.glanceReferenceId);
  assert.equal(reference.asleep, false);
  assert.equal(state.glanceTabId, this.glanceReferenceId);
  assert.equal(state.activeTabId, this.glanceMainId);
});

When('I open the Change picker and close the reference tab behind it', async function () {
  const chrome = await mainChromePage();
  await chrome.locator('#glanceChange').click();
  await waitForValue(() => this.call('overlayMode'), (mode) => mode === 'glance', 'change picker');
  await this.call('closeTab', this.glanceReferenceId);
  await this.waitForState((state) => state.glanceTabId === null);
});

When('I dismiss the orphaned Change picker with Escape', async function () {
  // OS-level focus is unreliable under the harness (evaluate calls steal app
  // focus), so observe main's focus-restore DECISION through the real
  // chrome:island-state contract the strip acts on.
  const chrome = await mainChromePage();
  await chrome.evaluate(() => {
    window.__glanceRestoreTriggerProbe = 'unset';
    window.browserAPI.onIslandState(({ restoreTrigger }) => {
      window.__glanceRestoreTriggerProbe = restoreTrigger;
    });
  });
  // Deliver Escape through sendInputEvent so it exercises the REAL cancel
  // path (main's before-input-event on the overlay). CDP-injected keys from
  // page.press bypass before-input-event and land in the overlay's reason-less
  // DOM fallback instead.
  await ctx.app.evaluate(({ webContents }) => {
    const overlay = webContents.getAllWebContents()
      .find((candidate) => candidate.getURL() === 'blanc-chrome://overlay/');
    if (!overlay) throw new Error('overlay webContents not found');
    overlay.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
    overlay.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
  });
  await waitForValue(() => this.call('overlayMode'), (mode) => mode === null, 'dismissed orphaned picker');
});

Then('keyboard focus is not stranded on the chrome strip', async function () {
  // The Change control the cancel path would restore focus to no longer
  // exists (Glance collapsed with its tab). A 'glance-change' restore trigger
  // would focus the chrome document and then a hidden button — stranding
  // keyboard users. Dismissal must fall through to page-content refocus.
  const chrome = await mainChromePage();
  const restoreTrigger = await waitForValue(
    () => chrome.evaluate(() => window.__glanceRestoreTriggerProbe),
    (value) => value !== 'unset',
    'the dismissal island-state broadcast'
  );
  assert.equal(restoreTrigger, null, 'cancel restored focus toward a control that no longer exists');
});

Then('the quiet reference wakes into Glance', async function () {
  const state = await this.waitForState((candidate) => {
    const tab = candidate.tabs.find((item) => item.id === this.glanceReferenceId);
    return candidate.glanceTabId === this.glanceReferenceId && tab && !tab.asleep && tab.bounds;
  });
  assert.equal(state.activeTabId, this.glanceMainId);
  assert.equal(state.glanceTabId, this.glanceReferenceId);
});

// --- Audio in the reference pane (Glance fixes, PR 1) ---

When('media starts playing in the reference pane', async function () {
  assert.equal(await this.call('simulateMediaStarted', this.glanceReferenceId), true);
});

When('media starts playing in the background replacement tab', async function () {
  assert.equal(await this.call('simulateMediaStarted', this.glanceReplacementId), true);
  const state = await this.state();
  const replacement = state.tabs.find((tab) => tab.id === this.glanceReplacementId);
  assert.equal(replacement.audioGuarded, true, 'a hidden tab that starts media is guarded');
});

Then('the reference pane is not muted as a background tab', async function () {
  const state = await this.waitForState((candidate) => {
    const reference = candidate.tabs.find((tab) => tab.id === candidate.glanceTabId);
    return reference && reference.audioGuarded === false;
  });
  assert.equal(state.activeTabId, this.glanceOriginalMainId ?? this.glanceMainId);
});

// --- Lifecycle: Move Tab to New Window (Glance fixes, PR 1) ---

When('I move the main page to a new window', async function () {
  const state = await this.state();
  this.glanceSplitWidth = state.glanceGeometry.primary.width;
  const runtimes = await this.call('windowRuntimes');
  this.glanceSourceRuntimeId = runtimes.find((runtime) => runtime.tabOrder.includes(this.glanceMainId)).id;
  this.glanceNewRuntimeId = await this.call('moveTabToNewWindow', this.glanceMainId);
  assert.ok(this.glanceNewRuntimeId, 'the main page was not adopted by a new window');
  assert.notEqual(this.glanceNewRuntimeId, this.glanceSourceRuntimeId);
});

Then('the reference is the only page of the original window', async function () {
  const source = await waitForValue(
    async () => (await this.call('windowRuntimes')).find((runtime) => runtime.id === this.glanceSourceRuntimeId),
    (runtime) => runtime && runtime.activeTabId === this.glanceReferenceId && runtime.glanceTabId === null,
    'the source window promoted the reference and closed Glance'
  );
  // The harness keeps one blank tab per scenario, so "only page" means the
  // reference stayed and the main page left.
  assert.ok(source.tabOrder.includes(this.glanceReferenceId));
  assert.ok(!source.tabOrder.includes(this.glanceMainId), 'the moved tab is still listed in the source window');
  const bounds = await this.call('tabBounds', this.glanceReferenceId);
  assert.ok(bounds && bounds.width > this.glanceSplitWidth, `reference still at split width: ${JSON.stringify(bounds)}`);
});

// --- Lifecycle: Close Group (Glance fixes, PR 1) ---

// Tab order [main, bystander, reference, fourth]: with the reference NOT the
// first survivor, a neighbour-at-anchor rule activates the bystander and
// leaves Glance open — the scenario fails for the right reason.
Given('four ordinary tabs with the third open in Glance', async function () {
  this.glanceMainId = await this.call('openTab', this.fixtureUrl('glance-main'));
  this.glanceBystanderId = await this.call('openTab', this.fixtureUrl('glance-bystander'));
  this.glanceReferenceId = await this.call('openTab', this.fixtureUrl('glance-reference'));
  this.glanceReplacementId = await this.call('openTab', this.fixtureUrl('glance-replacement'));
  await this.call('activateTab', this.glanceMainId, false);
  await this.waitForState((state) =>
    ['glance-main', 'glance-bystander', 'glance-reference', 'glance-replacement'].every((title) =>
      state.tabs.some((tab) => tab.title === title && !tab.isLoading)));
  assert.equal(await this.call('setGlance', this.glanceReferenceId), true);
  this.glanceSplitWidth = (await this.state()).glanceGeometry.primary.width;
});

Given('the main page and the fourth tab share a group', async function () {
  await this.call('groupTabByName', this.glanceMainId, 'Research');
  await this.call('groupTabByName', this.glanceReplacementId, 'Research');
  await this.waitForState((state) => state.groups.some((group) => group.name === 'research'));
});

Given('the main page and the reference share a group', async function () {
  await this.call('groupTabByName', this.glanceMainId, 'Research');
  await this.call('groupTabByName', this.glanceReferenceId, 'Research');
  await this.waitForState((state) => state.groups.some((group) => group.name === 'research'));
});

When('I close that group', async function () {
  await this.call('closeGroupByName', 'Research');
});

Then('the reference is the main page and Glance is closed', async function () {
  const state = await this.waitForState((candidate) =>
    candidate.activeTabId === this.glanceReferenceId && candidate.glanceTabId === null);
  assert.ok(state.tabOrder.includes(this.glanceBystanderId));
  assert.ok(state.tabOrder.includes(this.glanceReferenceId));
  assert.ok(!state.tabOrder.includes(this.glanceMainId) && !state.tabOrder.includes(this.glanceReplacementId));
  const bounds = await this.call('tabBounds', this.glanceReferenceId);
  assert.ok(bounds.width > this.glanceSplitWidth);
});

Then('the third tab is the main page and Glance is closed', async function () {
  const state = await this.waitForState((candidate) =>
    candidate.activeTabId === this.glanceReplacementId && candidate.glanceTabId === null);
  assert.ok(state.tabOrder.includes(this.glanceReplacementId));
  assert.ok(!state.tabOrder.includes(this.glanceMainId) && !state.tabOrder.includes(this.glanceReferenceId));
});

// --- Lifecycle: focus and announcements on close (Glance fixes, PR 1) ---

// Prove the precondition, so a harness that cannot observe focus fails here
// rather than passing the product assertion vacuously.
When('the reference pane holds keyboard focus', async function () {
  const reference = (await this.state()).tabs.find((tab) => tab.id === this.glanceReferenceId);
  // Same rule as focusPane: front and focus until the reference really holds
  // keyboard focus, not just once.
  await waitForValue(async () => {
    await frontChromeWindow(this);
    assert.equal(await this.call('focusTabContents', this.glanceReferenceId), true);
    return this.call('focusedWebContentsId');
  }, (id) => id === reference.webContentsId, 'reference pane focused before the close');
});

When('I close the main page tab', async function () {
  const state = await this.state();
  assert.equal(state.activeTabId, this.glanceMainId);
  await this.call('closeTab', this.glanceMainId);
});

Then('keyboard focus is on the main page', async function () {
  const state = await this.waitForState((candidate) => candidate.glanceTabId === null);
  const main = state.tabs.find((tab) => tab.id === this.glanceMainId);
  await waitForValue(
    () => this.call('focusedWebContentsId'),
    (id) => id === main.webContentsId,
    'focus handed to the main page after the reference closed'
  );
});

Then('the strip announces that the reference is now the main page', async function () {
  await this.waitForState((candidate) =>
    candidate.activeTabId === this.glanceReferenceId && candidate.glanceTabId === null);
  const chrome = await mainChromePage();
  await waitForValue(
    () => chrome.locator('#glanceStatus').textContent(),
    (text) => text === 'glance-reference is now the main page. Glance closed.',
    'main-closed announcement'
  );
});

// --- Lifecycle: wake cancellation and the orphaned picker (Glance fixes, PR 1) ---

Given('a quiet background tab that loads slowly', async function () {
  this.glanceMainUrl = this.fixtureUrl('glance-main');
  this.glanceReferenceUrl = `${this.fixtureUrl('glance-reference')}?hold=slow`;
  this.glanceMainId = await this.call('openTab', this.glanceMainUrl);
  this.glanceReferenceId = await this.call('openTab', this.glanceReferenceUrl);
  await this.call('activateTab', this.glanceMainId, false);
  await this.waitForState((state) => {
    const main = state.tabs.find((tab) => tab.id === this.glanceMainId);
    const reference = state.tabs.find((tab) => tab.id === this.glanceReferenceId);
    return main?.title === 'glance-main' && reference?.title === 'glance-reference'
      && !main.isLoading && !reference.isLoading;
  });
  assert.equal(await this.call('sleepTab', this.glanceReferenceId), true);
  await this.waitForState((candidate) =>
    candidate.tabs.find((tab) => tab.id === this.glanceReferenceId)?.asleep === true);
});

When('I choose the slow quiet tab and cancel with Escape before it wakes', async function () {
  const page = await overlayPage();
  await page.fill('#glancePickerInput', 'reference');
  await page.locator('.glance-picker-option').first().waitFor();
  await page.press('#glancePickerInput', 'Enter');
  await page.locator('#glancePickerInput[aria-busy="true"]').waitFor();
  // The real cancel path is main's before-input-event on the overlay.
  await ctx.app.evaluate(({ webContents }) => {
    const overlay = webContents.getAllWebContents()
      .find((candidate) => candidate.getURL() === 'blanc-chrome://overlay/');
    overlay.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
    overlay.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
  });
  await waitForValue(() => this.call('overlayMode'), (mode) => mode === null, 'picker cancelled mid-wake');
});

Then('Glance stays closed after the tab finishes loading', async function () {
  const state = await this.waitForState((candidate) => {
    const reference = candidate.tabs.find((tab) => tab.id === this.glanceReferenceId);
    return reference && !reference.asleep && !reference.isLoading;
  });
  assert.equal(state.glanceTabId, null, 'a cancelled wake still attached Glance');
  const chrome = await mainChromePage();
  await waitForValue(
    () => chrome.locator('#glanceStatus').textContent(),
    (text) => text === 'Didn’t open that tab in Glance',
    'cancelled-wake announcement'
  );
});

When('I open the Change picker and close Glance from the keyboard shortcut', async function () {
  const chrome = await mainChromePage();
  await chrome.evaluate(() => {
    window.__glanceRestoreTriggerProbe = 'unset';
    window.browserAPI.onIslandState(({ restoreTrigger }) => {
      window.__glanceRestoreTriggerProbe = restoreTrigger;
    });
  });
  await chrome.locator('#glanceChange').click();
  await waitForValue(() => this.call('overlayMode'), (mode) => mode === 'glance', 'change picker');
  assert.equal(await this.call('pressGlanceShortcut'), true);
});

Then('the picker is dismissed with Glance', async function () {
  await this.waitForState((state) => state.glanceTabId === null);
  await waitForValue(() => this.call('overlayMode'), (mode) => mode === null, 'picker dismissed by Close Glance');
});

// --- Divider pointer drag (Glance fixes, PR 1) ---

When('I drag the Glance divider {int} pixels to the left from inside its grip', async function (distance) {
  await this.call('resetGlanceRatio');
  await this.waitForState((candidate) => Math.round(candidate.glanceGeometry.ratio * 100) === 62);
  await frontChromeWindow(this);
  const chrome = await mainChromePage();
  const box = await chrome.locator('#glanceDivider').boundingBox();
  this.glanceDividerStartX = (await this.state()).glanceGeometry.divider.x;
  // 10px into the 12px grip: without grab-offset compensation the first move
  // snaps the divider's left edge to the pointer, i.e. 10px short.
  const x = box.x + box.width - 2;
  const y = box.y + box.height / 2;
  await chrome.mouse.move(x, y);
  await chrome.mouse.down();
  try {
    await chrome.mouse.move(x - distance / 2, y);
    await chrome.mouse.move(x - distance, y);
  } finally {
    await chrome.mouse.up();
  }
});

Then('the divider moved {int} pixels', async function (distance) {
  await waitForValue(
    () => this.state(),
    (state) => Math.abs((this.glanceDividerStartX - state.glanceGeometry.divider.x) - distance) <= 1,
    `divider ${distance}px left of where it started`
  );
});

// --- Windows/Linux window controls over the header (Glance fixes, PR 1) ---

// The controls are only populated off-macOS, so probe the stylesheet with a
// throwaway button inside #windowControls and read what the cascade gives it.
async function windowControlColours(chrome) {
  return chrome.evaluate(() => {
    const strip = document.getElementById('strip');
    const button = document.createElement('button');
    document.getElementById('windowControls').append(button);
    const probe = document.createElement('span');
    probe.style.color = getComputedStyle(document.documentElement).getPropertyValue('--text-dim').trim();
    document.body.append(probe);
    const hadTint = strip.classList.contains('tint-dark');
    strip.classList.add('tint-dark');
    const tinted = getComputedStyle(button).color;
    strip.classList.remove('tint-dark');
    const plain = getComputedStyle(button).color;
    if (hadTint) strip.classList.add('tint-dark');
    const result = { tinted, plain, dim: getComputedStyle(probe).color, direction: strip.dataset.glanceDirection };
    button.remove();
    probe.remove();
    return result;
  });
}

Then('window controls over the side-by-side header ignore the page tint', async function () {
  const chrome = await mainChromePage();
  const colours = await windowControlColours(chrome);
  assert.equal(colours.direction, 'horizontal');
  assert.equal(colours.tinted, colours.dim, 'a dark page tint turned the controls white over the neutral header');
  assert.equal(colours.plain, colours.dim);
});

Then('window controls follow the page tint while Glance is stacked', async function () {
  await this.waitForState((candidate) => candidate.glanceGeometry?.direction === 'vertical');
  const chrome = await mainChromePage();
  await chrome.locator('#glanceHeader[data-direction="vertical"]').waitFor();
  const colours = await windowControlColours(chrome);
  assert.equal(colours.direction, 'vertical');
  assert.equal(colours.tinted, 'rgba(245, 245, 245, 0.75)', 'stacked, the controls are over the page again and keep the tint rule');
  await this.call('setWindowContentSize', 1200, 800);
});

// --- Stacked Change picker (Glance fixes, PR 1) ---

When('I shrink the workspace to a small stacked window', async function () {
  await this.call('setWindowContentSize', 700, 520);
  await this.waitForState((candidate) => candidate.glanceGeometry?.direction === 'vertical');
});

When('I open the Change picker', async function () {
  const chrome = await mainChromePage();
  await chrome.locator('#glanceChange').click();
  await waitForValue(() => this.call('overlayMode'), (mode) => mode === 'glance', 'change picker');
});

Then('the Change picker is centred over the page with a visible list', async function () {
  const page = await overlayPage();
  await page.locator('#glancePicker:not([hidden])').waitFor();
  assert.equal(await page.locator('body').getAttribute('data-glance-purpose'), 'change-stacked');
  await page.locator('.glance-picker-option').first().waitFor();
  const layout = await page.locator('#glancePicker').evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const list = element.querySelector('#glancePickerList').getBoundingClientRect();
    const row = element.querySelector('.glance-picker-option').getBoundingClientRect();
    return { center: rect.left + rect.width / 2, viewport: window.innerWidth, listHeight: list.height, rowHeight: row.height, top: rect.top };
  });
  assert.ok(Math.abs(layout.center - layout.viewport / 2) <= 2, `picker centre ${layout.center} vs ${layout.viewport / 2}`);
  assert.ok(layout.listHeight >= 52 && layout.rowHeight >= 52, `list ${layout.listHeight}px, row ${layout.rowHeight}px`);
  assert.ok(layout.top >= 50, `picker not below the strip: ${layout.top}px`);
  await page.locator('#glancePickerInput').press('Escape');
  await waitForValue(() => this.call('overlayMode'), (mode) => mode === null, 'picker dismissed');
  await this.call('setWindowContentSize', 1200, 800);
});

// --- Single-tab empty state (Glance fixes, PR 1) ---

Given('a single ordinary tab for Glance', async function () {
  this.glanceMainId = await this.call('openTab', this.fixtureUrl('glance-main'));
  const state = await this.state();
  for (const id of state.tabOrder) if (id !== this.glanceMainId) await this.call('closeTab', id);
  await this.waitForState((candidate) =>
    candidate.tabOrder.length === 1 && candidate.activeTabId === this.glanceMainId);
  // The application menu rebuilds on a 100ms debounce after the last close;
  // let it land so the summon step reads the single-tab state, not a stale
  // two-tab menu.
  await new Promise((resolve) => setTimeout(resolve, 300));
});

Then('the picker says to open another tab', async function () {
  await waitForValue(() => this.call('overlayMode'), (mode) => mode === 'glance', 'picker with one tab');
  const page = await overlayPage();
  await page.locator('#glancePicker:not([hidden])').waitFor();
  assert.equal(await page.locator('.glance-picker-option').count(), 0);
  await page.locator('#glancePickerState:not([hidden])').waitFor();
  assert.equal(await page.locator('#glancePickerState').textContent(), 'Open another tab to use Glance');
  await page.locator('#glancePickerInput').press('Escape');
  await waitForValue(() => this.call('overlayMode'), (mode) => mode === null, 'picker dismissed');
});

// --- Drag-reorder live region (Glance fixes, PR 1) ---

Then('the drag live region is rendered while the panel is open', async function () {
  const page = await overlayPage();
  const rendered = await page.locator('#islandDragLive').evaluate((element) => {
    let node = element;
    while (node) {
      if (getComputedStyle(node).display === 'none') return false;
      node = node.parentElement;
    }
    return true;
  });
  assert.equal(rendered, true, '#islandDragLive sits inside a display:none ancestor, so reorder announcements are never spoken');
  await this.call('closeOverlay');
});

// --- Cancel, then choose again before the first wake lands (review fix) ---

Then("the strip's last Glance announcement is that the reference opened", async function () {
  // Let the FIRST (cancelled) wake land: the slow page is still loading when
  // the second choice attaches it.
  await this.waitForState((candidate) => {
    const reference = candidate.tabs.find((tab) => tab.id === this.glanceReferenceId);
    return reference && !reference.asleep && !reference.isLoading;
  });
  await new Promise((resolve) => setTimeout(resolve, 300));
  const chrome = await mainChromePage();
  assert.equal(
    await chrome.locator('#glanceStatus').textContent(),
    'glance-reference opened in Glance',
    'a stale cancellation announcement overwrote the open announcement'
  );
  assert.equal((await this.state()).glanceTabId, this.glanceReferenceId);
});

Then('the fresh picker stays clean after the first wake lands', async function () {
  const page = await overlayPage();
  await page.locator('#glancePicker:not([hidden])').waitFor();
  await this.waitForState((candidate) => {
    const reference = candidate.tabs.find((tab) => tab.id === this.glanceReferenceId);
    return reference && !reference.asleep && !reference.isLoading;
  });
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.equal(await this.call('overlayMode'), 'glance', 'the fresh picker was closed by the stale request');
  assert.equal(await page.locator('#glancePickerState').evaluate((element) => element.hidden), true,
    `stale error painted onto the fresh picker: ${await page.locator('#glancePickerState').textContent()}`);
  assert.equal((await this.state()).glanceTabId, null);
  await page.locator('#glancePickerInput').press('Escape');
  await waitForValue(() => this.call('overlayMode'), (mode) => mode === null, 'picker dismissed');
});

// --- The reference behaves like a page (Glance PR 2) ---

When('the reference pane is the focused pane', async function () {
  await focusPane(this, this.glanceReferenceId);
});

When('the main page is the focused pane', async function () {
  await focusPane(this, this.glanceMainId);
});

Then('the Glance header shows the reference has focus', async function () {
  const chrome = await mainChromePage();
  await chrome.locator('#glanceHeader.focused').waitFor();
  const eyebrow = await chrome.locator('#glanceEyebrow').evaluate((element) => getComputedStyle(element).color);
  const border = await chrome.locator('#glanceHeader').evaluate((element) => getComputedStyle(element).borderBottomColor);
  assert.equal(eyebrow, await cssColour(chrome, '--text'));
  assert.equal(border, await cssColour(chrome, '--text-dim'));
});

Then('the Glance header shows the main page has focus', async function () {
  const chrome = await mainChromePage();
  await waitForValue(
    () => chrome.locator('#glanceHeader').evaluate((element) => element.classList.contains('focused')),
    (focused) => focused === false,
    'focus cue cleared'
  );
  const eyebrow = await chrome.locator('#glanceEyebrow').evaluate((element) => getComputedStyle(element).color);
  assert.equal(eyebrow, await cssColour(chrome, '--text-dim'));
});

When('I press the {word} command', async function (command) {
  const state = await this.state();
  await recordLoadCounts(this);
  const target = state.focusedPaneTabId ?? state.activeTabId;
  assert.equal(await this.call('pressBrowserCommand', target, command), true);
});

// With the find bar focused the key reaches the overlay, not a page: on
// Windows/Linux it is routed from the overlay's webContents, on macOS the
// native menu handles it with no sender.
When('I press the close-tab command in the find bar', async function () {
  await waitForValue(() => this.call('overlayMode'), (mode) => mode === 'find', 'find capsule');
  const page = await overlayPage();
  await page.locator('#findInput').waitFor();
  await ctx.app.evaluate(({ Menu, webContents }) => {
    if (process.platform === 'darwin') {
      Menu.getApplicationMenu().getMenuItemById('browser-close-tab').click();
      return;
    }
    const overlay = webContents.getAllWebContents().find((wc) => wc.getURL() === 'blanc-chrome://overlay/');
    overlay.sendInputEvent({ type: 'keyDown', keyCode: 'W', modifiers: ['control'] });
    overlay.sendInputEvent({ type: 'keyUp', keyCode: 'W', modifiers: ['control'] });
  });
});

When('the replacement tab becomes the reference without a focus change', async function () {
  assert.equal(await this.call('setGlance', this.glanceReplacementId), true);
  await this.waitForState((state) => state.glanceTabId === this.glanceReplacementId);
});

Then('only the reference page reloaded', async function () {
  await waitForValue(() => loadCount(this, this.glanceReferenceId),
    (count) => count === this.glanceLoadsBefore.reference + 1, 'the reference reloaded');
  assert.equal(await loadCount(this, this.glanceMainId), this.glanceLoadsBefore.main, 'the main page reloaded too');
});

Then('only the main page reloaded', async function () {
  await waitForValue(() => loadCount(this, this.glanceMainId),
    (count) => count === this.glanceLoadsBefore.main + 1, 'the main page reloaded');
  assert.equal(await loadCount(this, this.glanceReferenceId), this.glanceLoadsBefore.reference);
});

Then('the reference tab is closed and the main page has focus', async function () {
  const state = await this.waitForState((candidate) =>
    candidate.glanceTabId === null && !candidate.tabs.some((tab) => tab.id === this.glanceReferenceId));
  assert.equal(state.activeTabId, this.glanceMainId);
  assert.equal(state.focusedPaneTabId, this.glanceMainId);
  const main = state.tabs.find((tab) => tab.id === this.glanceMainId);
  await waitForValue(() => this.call('focusedWebContentsId'), (id) => id === main.webContentsId,
    'focus handed to the main page');
});

Then('the main page tab is closed', async function () {
  await this.waitForState((state) => !state.tabs.some((tab) => tab.id === this.glanceMainId));
});

Then('the find capsule sits over the reference pane and searches it', async function () {
  await waitForValue(() => this.call('overlayMode'), (mode) => mode === 'find', 'find capsule');
  assert.equal(await this.call('findTabId'), this.glanceReferenceId);
  const { glanceGeometry } = await this.state();
  const bounds = await this.call('overlayViewBounds');
  assert.ok(bounds.x >= glanceGeometry.glanceContent.x, `capsule at x=${bounds.x}, reference starts at ${glanceGeometry.glanceContent.x}`);
  const page = await overlayPage();
  await page.locator('#findInput').fill('widget');
  await waitForValue(() => page.locator('#findCount').textContent(), (text) => text === '1/3',
    'match count from the reference');
});

Then('the find capsule is closed', async function () {
  await waitForValue(() => this.call('overlayMode'), (mode) => mode === null, 'find capsule closed with the swap');
});

Given('a main page and a reference on another site, both with history', async function () {
  const other = (name) => {
    const url = new URL(this.fixtureUrl(name));
    url.hostname = 'insecure.test';
    return url.toString();
  };
  this.glanceMainId = await this.call('openTab', this.fixtureUrl('glance-main'));
  this.glanceReferenceId = await this.call('openTab', other('glance-reference'));
  // Both first pages must commit before the second navigation, or Chromium
  // replaces the entry and there is nothing to go back to.
  await this.waitForState((state) => ['glance-main', 'glance-reference'].every((title) =>
    state.tabs.some((tab) => tab.title === title && !tab.isLoading)));
  await this.call('navigateTab', this.glanceMainId, this.fixtureUrl('glance-main-2'));
  await this.call('navigateTab', this.glanceReferenceId, other('glance-reference-2'));
  await this.call('activateTab', this.glanceMainId, false);
  await this.waitForState((state) => ['glance-main-2', 'glance-reference-2'].every((title) =>
    state.tabs.some((tab) => tab.title === title && !tab.isLoading && tab.canGoBack)));
  assert.equal(await this.call('setGlance', this.glanceReferenceId), true);
  this.glanceZoomBefore = {
    main: await this.call('zoomLevel', this.glanceMainId),
    reference: await this.call('zoomLevel', this.glanceReferenceId),
  };
});

Then('only the reference page is zoomed', async function () {
  await waitForValue(() => this.call('zoomLevel', this.glanceReferenceId),
    (level) => level > this.glanceZoomBefore.reference, 'reference zoomed in');
  assert.equal(await this.call('zoomLevel', this.glanceMainId), this.glanceZoomBefore.main);
  await this.call('pressBrowserCommand', this.glanceReferenceId, 'zoom-reset');
});

Then('only the reference page went back', async function () {
  const state = await this.waitForState((candidate) =>
    candidate.tabs.find((tab) => tab.id === this.glanceReferenceId)?.title === 'glance-reference');
  assert.equal(state.tabs.find((tab) => tab.id === this.glanceMainId).title, 'glance-main-2');
});

Given('1Password fill is configured and the Glance reference shows a login form', async function () {
  await this.call('setOnePasswordConfig', true, 'Acceptance Team');
  this.glanceOnePasswordOn = true;
  this.glanceMainId = await this.call('openTab', this.fixtureUrl('glance-main'));
  this.glanceReferenceId = await this.call('openTab', `${this.fixtureUrl('glance-reference')}?loginform=authoritative`);
  await this.call('activateTab', this.glanceMainId, false);
  await this.waitForState((state) => ['glance-main', 'glance-reference'].every((title) =>
    state.tabs.some((tab) => tab.title === title && !tab.isLoading)));
  assert.equal(await this.call('setGlance', this.glanceReferenceId), true);
});

async function fillTargetId(world) {
  return (await world.call('onePasswordTarget'))?.webContentsId ?? null;
}

Then('the 1Password fill targets the reference pane', async function () {
  const reference = (await this.state()).tabs.find((tab) => tab.id === this.glanceReferenceId);
  assert.equal(await fillTargetId(this), reference.webContentsId);
});

Then('the 1Password fill targets the main page', async function () {
  const main = (await this.state()).tabs.find((tab) => tab.id === this.glanceMainId);
  assert.equal(await fillTargetId(this), main.webContentsId);
});

Then('the Island shows the fill hint', async function () {
  const chrome = await mainChromePage();
  await chrome.locator('#pillFillHint:not([hidden])').waitFor();
});

Then('the Island hides the fill hint', async function () {
  const chrome = await mainChromePage();
  await chrome.locator('#pillFillHint[hidden]').waitFor({ state: 'attached' });
  await this.call('setOnePasswordConfig', false, '');
});

When('I draw the reload gesture in the reference pane', async function () {
  await recordLoadCounts(this);
  const original = await this.call('setMouseGestures', true);
  await this.call('setMouseGestures', true, { ...original.mapping, R: 'reload' });
  try {
    for (const input of [
      { type: 'mouseDown', x: 200, y: 200, button: 'right', clickCount: 1 },
      { type: 'mouseMove', x: 260, y: 200, button: 'right' },
      { type: 'mouseUp', x: 260, y: 200, button: 'right', clickCount: 1 },
    ]) assert.equal(await this.call('sendMouseInput', this.glanceReferenceId, input), true);
    await waitForValue(() => loadCount(this, this.glanceReferenceId),
      (count) => count !== this.glanceLoadsBefore.reference, 'gesture acted', 2000).catch(() => {});
  } finally {
    await this.call('setMouseGestures', original.enabled, original.mapping);
  }
});

async function referenceWithLink(world, opts = {}) {
  world.glanceMainId = await world.call('openTab', world.fixtureUrl('glance-main'));
  world.glanceReferenceId = await world.call('openTab',
    `${world.fixtureUrl('glance-reference')}?blanklink=glance-opened`, opts);
  await world.call('activateTab', world.glanceMainId, false);
  await world.waitForState((state) => ['glance-main', 'glance-reference'].every((title) =>
    state.tabs.some((tab) => tab.title === title && !tab.isLoading)));
  assert.equal(await world.call('setGlance', world.glanceReferenceId), true);
  world.glanceMainUrlBefore = (await world.state()).tabs.find((tab) => tab.id === world.glanceMainId).url;
}

Given('a Glance reference with a link that opens a new tab', async function () {
  await referenceWithLink(this);
});

Given('a private Glance reference with a link that opens a new tab', async function () {
  await referenceWithLink(this, { private: true });
});

When('I click that link in the reference pane', async function () {
  assert.equal(await this.call('clickInTab', this.glanceReferenceId, '#acceptance-blank'), true);
});

When('I click that link in the reference pane as a background tab', async function () {
  const modifier = (await ctx.app.evaluate(() => process.platform)) === 'darwin' ? 'meta' : 'control';
  assert.equal(await this.call('clickInTab', this.glanceReferenceId, '#acceptance-blank', [modifier]), true);
});

Then('the new tab is the reference and the old reference stays open', async function () {
  const state = await this.waitForState((candidate) => {
    const reference = candidate.tabs.find((tab) => tab.id === candidate.glanceTabId);
    return reference && reference.id !== this.glanceReferenceId && reference.title === 'glance-opened';
  });
  this.glanceOpenedId = state.glanceTabId;
  assert.equal(state.activeTabId, this.glanceMainId);
  assert.ok(state.tabOrder.includes(this.glanceReferenceId), 'the previous reference was closed');
});

Then('the main page is unchanged', async function () {
  const state = await this.state();
  assert.equal(state.activeTabId, this.glanceMainId);
  assert.equal(state.tabs.find((tab) => tab.id === this.glanceMainId).url, this.glanceMainUrlBefore);
});

Then('the new reference is private', async function () {
  const opened = (await this.state()).tabs.find((tab) => tab.id === this.glanceOpenedId);
  assert.equal(opened.private, true);
  assert.equal(opened.sessionKind, 'private');
});

Then('a background tab opened and Glance shows the same reference', async function () {
  const state = await this.waitForState((candidate) =>
    candidate.tabs.some((tab) => tab.title === 'glance-opened' && !tab.isLoading));
  assert.equal(state.glanceTabId, this.glanceReferenceId);
  assert.equal(state.activeTabId, this.glanceMainId);
});

Then("the Glance header's Back button is enabled", async function () {
  const chrome = await mainChromePage();
  await chrome.locator('#glanceBack:not([disabled])').waitFor();
  assert.equal(await chrome.locator('#glanceBack').getAttribute('aria-label'), 'Back');
});

Then("the Glance header's Back button is disabled", async function () {
  const chrome = await mainChromePage();
  await chrome.locator('#glanceBack[disabled]').waitFor();
});

When('I click Back in the Glance header', async function () {
  const chrome = await mainChromePage();
  await chrome.locator('#glanceBack').click();
});

When('I click Reload in the Glance header', async function () {
  await recordLoadCounts(this);
  const chrome = await mainChromePage();
  await chrome.locator('#glanceReload').click();
});

When('the reference starts a slow load', async function () {
  const url = new URL((await this.state()).tabs.find((tab) => tab.id === this.glanceReferenceId).url);
  url.searchParams.set('hold', 'slow');
  // Not awaited: navigateTab resolves only when the slow load finishes.
  this.call('navigateTab', this.glanceReferenceId, url.toString()).catch(() => {});
});

Then("the Glance header's Reload button reads Stop", async function () {
  const chrome = await mainChromePage();
  await chrome.locator('#glanceReload[data-mode="stop"]').waitFor();
  assert.equal(await chrome.locator('#glanceReload').getAttribute('aria-label'), 'Stop');
});

// A synthetic contextmenu reaches the strip's DOM handler but not main's
// native context-menu event, so this observes exactly what the strip hands
// main: the recorded tab id and whether the default menu was suppressed.
async function stripContextTarget(chrome, selector) {
  return chrome.evaluate((target) => {
    window.__blancCtxRowTabId = 'unset';
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    document.querySelector(target).dispatchEvent(event);
    const id = window.__blancCtxRowTabId;
    window.__blancCtxRowTabId = null;
    return { id, prevented: event.defaultPrevented };
  }, selector);
}

Then('a right-click on the Glance title addresses the reference tab', async function () {
  const chrome = await mainChromePage();
  await chrome.locator('#glanceHeader:not([hidden])').waitFor();
  const result = await stripContextTarget(chrome, '#glanceTitle');
  assert.equal(String(result.id), String(this.glanceReferenceId));
  assert.equal(result.prevented, false);
});

Then('a right-click on a Glance header button addresses no tab', async function () {
  const chrome = await mainChromePage();
  for (const selector of ['#glanceBack', '#glanceReload', '#glancePromote', '#glanceChange', '#glanceClose']) {
    const result = await stripContextTarget(chrome, selector);
    assert.equal(result.id, null, `${selector} addressed a tab`);
    assert.equal(result.prevented, true, `${selector} let a default menu through`);
  }
});

When('I search the page for {string}', async function (query) {
  await waitForValue(() => this.call('overlayMode'), (mode) => mode === 'find', 'find capsule');
  const page = await overlayPage();
  await page.locator('#findInput').fill(query);
  await waitForValue(() => page.locator('#findCount').textContent(), (text) => text === '1/3', 'matches on the first page');
});

Then('the find capsule is fresh and bound to the reference', async function () {
  await waitForValue(() => this.call('findTabId'), (id) => id === this.glanceReferenceId, 'capsule rebound to the reference');
  const page = await overlayPage();
  // A new pane is a new search: the previous query and its count do not
  // carry over, which also means the first page's highlights were cleared.
  await waitForValue(() => page.locator('#findInput').inputValue(), (value) => value === '', 'query cleared');
  assert.equal(await page.locator('#findCount').textContent(), '');
});

// macOS draws its traffic lights at the window's left edge, inside the main
// pane's strip. Without Glance the Island keeps 85px clear on each side; with
// Glance open it must keep the same clearance, in both layouts.
Then("a full-width Island stays clear of the window's traffic lights", async function () {
  if ((await ctx.app.evaluate(() => process.platform)) !== 'darwin') return 'skipped';
  const state = await waitForValue(() => this.state(), (value) => value.glanceGeometry, 'Glance geometry');
  const chrome = await mainChromePage();
  await chrome.locator('#strip.glance-open').waitFor();
  // A pill with many tabs grows to its maximum width; force that width with
  // a filler so the result does not depend on how many tabs the scenario has.
  const box = await chrome.evaluate(() => {
    const pill = document.getElementById('islandPill');
    const filler = document.createElement('span');
    filler.style.cssText = 'flex: 0 0 4000px; height: 1px';
    pill.append(filler);
    const rect = pill.getBoundingClientRect();
    filler.remove();
    return { left: rect.left, right: rect.right, direction: document.getElementById('strip').dataset.glanceDirection };
  });
  const { primary, page } = state.glanceGeometry;
  const paneRight = box.direction === 'horizontal' ? primary.x + primary.width : page.x + page.width;
  assert.ok(box.left >= 80, `${box.direction}: the Island starts ${box.left}px from the left edge, under the traffic lights`);
  assert.ok(paneRight - box.right >= 80, `${box.direction}: the Island is not centred (right gap ${paneRight - box.right}px)`);
  if (box.direction === 'vertical') await this.call('setWindowContentSize', 1200, 800);
});

// Windows and Linux draw minimize/maximize/close at the window's top-right
// (#windowControls, --window-controls-w). Side by side they sit over the
// Glance header; stacked they sit over the main page's strip. On macOS the
// strip is told it is Windows for the measurement, which is what the CSS keys on.
Then('a full-width Island stays clear of the Windows and Linux window controls', async function () {
  const state = await waitForValue(() => this.state(), (value) => value.glanceGeometry, 'Glance geometry');
  const chrome = await mainChromePage();
  await chrome.locator('#strip.glance-open').waitFor();
  const box = await chrome.evaluate(() => {
    const root = document.documentElement;
    const realPlatform = root.dataset.platform;
    if (realPlatform === 'darwin') root.dataset.platform = 'win32';
    const pill = document.getElementById('islandPill');
    const filler = document.createElement('span');
    filler.style.cssText = 'flex: 0 0 4000px; height: 1px';
    pill.append(filler);
    const rect = pill.getBoundingClientRect();
    const controls = parseFloat(getComputedStyle(root).getPropertyValue('--window-controls-w'));
    filler.remove();
    root.dataset.platform = realPlatform;
    return {
      left: rect.left, right: rect.right, controls,
      direction: document.getElementById('strip').dataset.glanceDirection,
      layout: root.dataset.tabLayout ?? 'island',
      uncentred: pill.classList.contains('uncentred'),
    };
  });
  const { primary, page } = state.glanceGeometry;
  const where = `${box.layout}/${box.direction}`;
  if (box.direction === 'horizontal') {
    // The controls are over the Glance header; the Island stays over the main pane.
    assert.ok(box.right <= primary.x + primary.width, `${where}: the Island runs past the main pane (${box.right}px)`);
  } else {
    const windowRight = page.x + page.width;
    assert.ok(windowRight - box.right >= box.controls,
      `${where}: the Island reaches under the window controls (right gap ${windowRight - box.right}px, controls ${box.controls}px)`);
    if (box.uncentred) {
      // Room was short: the Island gave up its centre line to stay clear of
      // the controls (renderer.js fitIslandDots), so it sits nearer the left.
      assert.ok(box.left - page.x >= 11.5, `${where}: the Island runs off the left edge (${box.left - page.x}px)`);
    } else {
      assert.ok(Math.abs((box.left - page.x) - (windowRight - box.right)) <= 2, `${where}: the Island is not centred over the page`);
    }
  }
});

// 640 x 800 is Blanc's minimum window. On macOS the strip is told it is
// Windows (what the stylesheet keys on), then the window is nudged so the
// strip re-fits the Island under those rules.
When('the window is as small as it goes with the Windows and Linux window controls', async function () {
  await this.call('setWindowContentSize', 640, 800);
  await this.waitForState((state) => state.glanceGeometry?.direction === 'vertical');
  const chrome = await mainChromePage();
  this.glanceRealPlatform = await chrome.evaluate(() => {
    const real = document.documentElement.dataset.platform;
    if (real === 'darwin') document.documentElement.dataset.platform = 'win32';
    return real;
  });
  await this.call('setWindowContentSize', 641, 800);
  await this.waitForState((state) => state.glanceGeometry?.page.width === 641);
  await new Promise((resolve) => setTimeout(resolve, 300));
});

When('I switch the Glance window to vertical tabs', async function () {
  await this.call('setTabLayout', 'vertical');
  const chrome = await mainChromePage();
  await chrome.waitForFunction(() => document.documentElement.dataset.tabLayout === 'vertical');
  await this.waitForState((state) => state.glanceGeometry?.direction === 'vertical');
});

Then('the Glance window returns to its usual layout', async function () {
  if (this.glanceRealPlatform) {
    const chrome = await mainChromePage();
    await chrome.evaluate((real) => {
      document.documentElement.dataset.platform = real;
      document.querySelectorAll('#windowControls [data-glance-stand-in]').forEach((button) => button.remove());
    }, this.glanceRealPlatform);
    this.glanceRealPlatform = null;
  }
  await this.call('setTabLayout', 'island');
  await this.call('setVerticalTabsWidth', 248);
  await this.call('setWindowContentSize', 1200, 800);
});

Given('twelve ordinary tabs with one open in Glance', async function () {
  const ids = [];
  for (let i = 1; i <= 12; i += 1) ids.push(await this.call('openTab', this.fixtureUrl(`glance-many-${i}`)));
  this.glanceMainId = ids[5];
  this.glanceReferenceId = ids[6];
  await this.call('activateTab', this.glanceMainId, false);
  await this.waitForState((state) => ids.every((id) => {
    const tab = state.tabs.find((candidate) => candidate.id === id);
    return tab && !tab.isLoading && tab.title.startsWith('glance-many');
  }));
  assert.equal(await this.call('setGlance', this.glanceReferenceId), true);
});

// The private chip widens the Island beyond its usual slim width; the
// divider's stop must account for whatever the Island is showing.
Given('twelve ordinary tabs and a private main page with one open in Glance', async function () {
  const ids = [];
  for (let i = 1; i <= 12; i += 1) ids.push(await this.call('openTab', this.fixtureUrl(`glance-many-${i}`)));
  this.glanceMainId = await this.call('openTab', this.fixtureUrl('glance-private-main'), { private: true });
  this.glanceReferenceId = ids[6];
  await this.call('activateTab', this.glanceMainId, false);
  await this.waitForState((state) => [...ids, this.glanceMainId].every((id) => {
    const tab = state.tabs.find((candidate) => candidate.id === id);
    return tab && !tab.isLoading && tab.title.startsWith('glance-');
  }));
  assert.equal(await this.call('setGlance', this.glanceReferenceId), true);
  const chrome = await mainChromePage();
  await chrome.locator('#pillPrivateChip:not([hidden])').waitFor();
});

When('I narrow the main pane to its smallest side-by-side width', async function () {
  // Wide enough to stay side by side even with the main pane's minimum; the
  // divider dragged all the way left settles at the smallest main pane.
  await this.call('setWindowContentSize', 1000, 800);
  await this.waitForState((state) => state.glanceGeometry?.direction === 'horizontal' && state.glanceGeometry.page.width === 1000);
  // Drag well past the stop; the divider settles at the smallest share allowed.
  await this.call('resizeGlance', { x: 0, y: 200 });
  const state = await this.waitForState((candidate) =>
    candidate.glanceGeometry.ratio === candidate.glanceGeometry.minRatio);
  // Side by side always leaves the reference a usable width.
  assert.ok(state.glanceGeometry.glanceContent.width >= 300, `reference ${state.glanceGeometry.glanceContent.width}px`);
});

Then('every Island control stays inside the Island', async function () {
  const chrome = await mainChromePage();
  await waitForValue(async () => chrome.evaluate(() => {
    const pill = document.getElementById('islandPill').getBoundingClientRect();
    const outside = [...document.querySelectorAll('#islandPill button, #islandPill .favicon')]
      .map((element) => ({ element, rect: element.getBoundingClientRect() }))
      .filter(({ rect }) => rect.width > 0 && (rect.left < pill.left - 0.5 || rect.right > pill.right + 0.5))
      .map(({ element, rect }) => `${element.id || element.className} ${Math.round(rect.left)}–${Math.round(rect.right)}`);
    return { outside, pill: `${Math.round(pill.left)}–${Math.round(pill.right)}` };
  }), (result) => result.outside.length === 0, 'Island controls inside the Island', 3000)
    .catch(async (error) => {
      const result = await chrome.evaluate(() => document.getElementById('islandPill').getBoundingClientRect().right);
      throw new Error(`${error.message} (pill right ${result})`);
    });
});

// The address is the Island's main content: dots and secondary buttons give
// way before it, and it never shrinks below about ten characters.
Then("the Island's address stays readable", async function () {
  const chrome = await mainChromePage();
  const label = await chrome.evaluate(() => {
    const domain = document.getElementById('pillDomain');
    return {
      text: domain.textContent,
      shown: domain.getBoundingClientRect().width,
      full: domain.scrollWidth * (domain.getBoundingClientRect().width / Math.max(1, domain.clientWidth)),
      truncated: domain.scrollWidth > domain.clientWidth + 1,
    };
  });
  assert.ok(label.text.includes('127.0.0.1'), `the Island is not showing the page's address: "${label.text}"`);
  assert.ok(!label.truncated || label.shown >= 70,
    `the address "${label.text}" shows only ${Math.round(label.shown)}px of ${Math.round(label.full)}px`);
});

// In Glance the Island gives its dot row (and +N) up entirely, so the
// address and controls keep their room; tabs stay reachable from ⌘L.
Then('the Island shows no tab dots while Glance is open', async function () {
  const chrome = await mainChromePage();
  await waitForValue(() => chrome.evaluate(() => {
    const row = document.getElementById('pillDots');
    return row.getClientRects().length === 0 || row.getBoundingClientRect().width === 0;
  }), Boolean, 'the dot row hidden in Glance');
  // Back, the shield, Reload and Close never give way.
  for (const selector of ['#pillNav .pill-btn:first-child', '#pillShield', '#pillActions .pill-close']) {
    assert.ok(await chrome.locator(selector).isVisible(), `${selector} was hidden`);
  }
});

Then('the Island shows its tab dots again', async function () {
  const chrome = await mainChromePage();
  await chrome.locator('#pillDots .island-dot').first().waitFor();
});

async function sendDownloadsActivity(payload) {
  // The strip learns about downloads only from this main → strip message.
  await ctx.app.evaluate(({ webContents }, activity) => {
    const strip = webContents.getAllWebContents().find((wc) => wc.getURL() === 'blanc-chrome://index/');
    strip.send('chrome:downloads', activity);
  }, payload);
}

async function islandState(chrome) {
  return chrome.evaluate(() => {
    const pill = document.getElementById('islandPill').getBoundingClientRect();
    const outside = [...document.querySelectorAll('#islandPill button, #islandPill .favicon')]
      .map((element) => element.getBoundingClientRect())
      .filter((rect) => rect.width > 0 && (rect.left < pill.left - 0.5 || rect.right > pill.right + 0.5)).length;
    return {
      dots: document.querySelectorAll('#pillDots .island-dot').length,
      slim: document.getElementById('islandPill').classList.contains('slim'),
      downloads: !document.querySelector('#pillActions .pill-download').hidden,
      addressCut: (() => {
        const domain = document.getElementById('pillDomain');
        return domain.scrollWidth > domain.clientWidth + 1;
      })(),
      outside,
    };
  });
}

Given('twelve ordinary tabs in a narrow window', async function () {
  const ids = [];
  for (let i = 1; i <= 12; i += 1) ids.push(await this.call('openTab', this.fixtureUrl(`glance-many-${i}`)));
  await this.call('activateTab', ids[5], false);
  await this.waitForState((state) => ids.every((id) => state.tabs.find((tab) => tab.id === id && !tab.isLoading)));
  await sendDownloadsActivity({ active: 0, hasRecent: false, receivedBytes: 0, totalBytes: 0, lastCompletedAt: null });
  const chrome = await mainChromePage();
  // Find a width where the Island has already given up some dots but still
  // has more to give, so a new chip forces a visible change.
  for (let width = 640; width <= 1100; width += 20) {
    await this.call('setWindowContentSize', width, 800);
    await new Promise((resolve) => setTimeout(resolve, 150));
    const state = await islandState(chrome);
    if (!state.downloads && state.outside === 0 && !state.addressCut && state.dots >= 2 && state.dots < 8) {
      this.islandBefore = state;
      return;
    }
  }
  throw new Error(`no window width left the Island partly reduced: ${JSON.stringify(await islandState(chrome))}`);
});

// The count is a badge over the shield: it changes no widths, so it must
// not restart the fit, whose rebuild of a reduced dot row tears down a
// hovered dot's peek and any keyboard focus on a dot.
When("the active page's blocked count grows from {int} to {int}", async function (from, to) {
  const chrome = await mainChromePage();
  await chrome.evaluate(() => { document.querySelector('#pillDots .island-dot').dataset.glanceProbe = 'kept'; });
  const { activeTabId } = await this.state();
  for (const count of [from, Math.round((from + to) / 2), to]) {
    assert.equal(await this.call('setTabPresentation', activeTabId, { blockedCount: count }), true);
    await waitForValue(() => chrome.locator('#pillShieldCount').textContent(), (text) => text === String(count),
      `the shield showing ${count}`);
  }
});

Then("the Island's tab dots were not rebuilt", async function () {
  const chrome = await mainChromePage();
  assert.equal(await chrome.locator('#pillDots .island-dot[data-glance-probe="kept"]').count(), 1,
    'the dot row was rebuilt by a blocked-count change');
});

// font-display: swap draws the fallback font first; when the real one
// arrives every label widens without any tab or layout change. Simulate that
// with wider letter spacing on the address, then the font set's own event.
When('the interface font finishes loading with wider letters', async function () {
  const chrome = await mainChromePage();
  await chrome.evaluate(() => {
    const style = document.createElement('style');
    style.id = 'glance-font-swap-probe';
    style.textContent = '#pillDomain { letter-spacing: 3px; }';
    document.head.append(style);
    document.fonts.dispatchEvent(new Event('loadingdone'));
  });
});

Then("the Island's address is whole and its controls fit", async function () {
  const chrome = await mainChromePage();
  try {
    await waitForValue(() => islandState(chrome), (value) => !value.addressCut && value.outside === 0,
      'the Island re-fitted to the wider font');
  } finally {
    await chrome.evaluate(() => document.getElementById('glance-font-swap-probe')?.remove());
  }
});

// On macOS the strip is told it is Windows and given three stand-in
// buttons where Windows and Linux draw minimize, maximize and close, and a
// 1px nudge makes it re-fit and re-measure under those rules. On Windows and
// Linux the real controls and rules are already there, so nothing changes
// (and a window that already fills a small display may not grow by 1px).
When('the strip draws the Windows and Linux window controls', async function () {
  const chrome = await mainChromePage();
  this.glanceRealPlatform = await chrome.evaluate(() => {
    const real = document.documentElement.dataset.platform;
    if (real === 'darwin') {
      document.documentElement.dataset.platform = 'win32';
      document.getElementById('windowControls').replaceChildren(...['–', '□', '✕'].map((text, i) => {
        const button = document.createElement('button');
        button.textContent = text;
        button.dataset.glanceStandIn = '';
        if (i === 2) button.className = 'close-btn';
        return button;
      }));
    }
    return real;
  });
  if (this.glanceRealPlatform !== 'darwin') return;
  const { glanceGeometry } = await this.state();
  await this.call('setWindowContentSize', glanceGeometry.page.width + 1, 800);
  await this.waitForState((state) => state.glanceGeometry?.page.width === glanceGeometry.page.width + 1);
  await new Promise((resolve) => setTimeout(resolve, 300));
});

When('I drag the Glance divider as far right as it goes', async function () {
  await this.call('resizeGlance', { x: 100000, y: 200 });
  await this.waitForState((state) => state.glanceGeometry?.ratio === state.glanceGeometry?.maxRatio);
  await new Promise((resolve) => setTimeout(resolve, 200));
});

Then("the Glance header's buttons are clear of the window controls", async function () {
  const chrome = await mainChromePage();
  const result = await chrome.evaluate(() => {
    const header = document.getElementById('glanceHeader').getBoundingClientRect();
    const controls = document.getElementById('windowControls').getBoundingClientRect();
    const crowded = [...document.querySelectorAll('#glanceHeader button')]
      .map((button) => ({ id: button.id, rect: button.getBoundingClientRect() }))
      .filter(({ rect }) => rect.width > 0
        && (rect.right > controls.left - 1 || rect.left < header.left - 0.5 || rect.right > header.right + 0.5))
      .map(({ id, rect }) => `${id} ${Math.round(rect.left)}–${Math.round(rect.right)}`);
    return { crowded, controls: `${Math.round(controls.left)}–${Math.round(controls.right)}` };
  });
  assert.deepEqual(result.crowded, [], `header buttons under the window controls (${result.controls})`);
  const { glanceGeometry } = await this.state();
  assert.equal(glanceGeometry.direction, 'horizontal');
});

// The first window has measured its minimums: the slim Island's main pane
// and the compact header's reference. A new window has measured nothing yet,
// so its first layout must already stop the divider at both, not at the
// built-in 50% and 300 px. Which one binds differs by platform (on Windows
// and Linux the slim Island can need less than half the pane), so the
// expectation is computed from the measured values.
When('I open Glance in a new window just wide enough to stay side by side', async function () {
  const { glanceMinimums } = await this.state();
  assert.ok(glanceMinimums.primary > 0 && glanceMinimums.reference > 0,
    `the first window measured nothing: ${JSON.stringify(glanceMinimums)}`);
  this.glanceMeasured = glanceMinimums;
  const runtimeId = await this.call('openNewWindow');
  this.glanceExtraWindowId = runtimeId;
  const main = await this.call('openTabInWindow', runtimeId, this.fixtureUrl('glance-second-main'));
  const reference = await this.call('openTabInWindow', runtimeId, this.fixtureUrl('glance-second-reference'));
  await this.call('activateTabInWindow', runtimeId, main, false);
  await waitForValue(async () => (await this.call('windowRuntimes')).find((runtime) => runtime.id === runtimeId),
    (runtime) => runtime?.tabOrder.includes(reference), 'the new window holding both tabs');
  // Both minimums plus the divider, with 20 px to spare: side by side only
  // if the new window already knows them.
  this.glanceFirstLayout = await this.call('firstGlanceLayoutInWindow', runtimeId, reference,
    Math.max(800, glanceMinimums.primary + glanceMinimums.reference + 12 + 20));
});

Then("its first layout already stops the divider at the Island's minimum", async function () {
  const layout = this.glanceFirstLayout;
  const { primary, reference } = this.glanceMeasured;
  assert.equal(layout?.direction, 'horizontal', `first layout: ${JSON.stringify(layout)}`);
  const usable = layout.page.width - layout.divider.width;
  const expectedMin = Math.min(0.78 * usable, Math.max(0.5 * usable, primary));
  const expectedMax = Math.max(expectedMin, Math.min(0.78 * usable, usable - reference));
  assert.ok(Math.abs(layout.minRatio * usable - expectedMin) <= 1,
    `the new window started with a ${Math.round(layout.minRatio * usable)}px main-pane stop, not ${Math.round(expectedMin)}px from the measured ${primary}px`);
  assert.ok(Math.abs(layout.maxRatio * usable - expectedMax) <= 1,
    `the new window left the reference ${Math.round(usable - layout.maxRatio * usable)}px at most, not the measured ${reference}px`);
  await this.call('closeWindowRuntime', this.glanceExtraWindowId);
  this.glanceExtraWindowId = null;
});

When('a download starts', async function () {
  this.glanceDownloadsShown = true;
  await sendDownloadsActivity({ active: 1, hasRecent: true, receivedBytes: 10, totalBytes: 100, lastCompletedAt: null });
});

Then('the Island makes room for the downloads button', async function () {
  const chrome = await mainChromePage();
  // The dots give way, not the address.
  const after = await waitForValue(() => islandState(chrome),
    (value) => value.downloads && value.outside === 0 && !value.addressCut,
    'the downloads button inside the Island with the address whole');
  assert.ok(after.dots < this.islandBefore.dots || after.slim, `nothing gave way: ${JSON.stringify(after)}`);
});

When('the download indicator goes away', async function () {
  await sendDownloadsActivity({ active: 0, hasRecent: false, receivedBytes: 0, totalBytes: 0, lastCompletedAt: null });
});

Then('the Island shows as many tab dots as before', async function () {
  const chrome = await mainChromePage();
  await waitForValue(() => islandState(chrome),
    (value) => !value.downloads && value.dots === this.islandBefore.dots && value.slim === this.islandBefore.slim,
    `the Island back to ${this.islandBefore.dots} dots`);
});

// ---- A 1Password message belongs to one pane ----

async function navigatePane(world, tabId, name) {
  const url = world.fixtureUrl(name);
  // A page-initiated navigation, like following a link.
  try {
    await world.call('workspacePageScript', tabId, `location.assign(${JSON.stringify(url)})`);
  } catch { /* the script's own page is going away */ }
  await world.waitForState((state) => {
    const tab = state.tabs.find((candidate) => candidate.id === tabId);
    return tab?.title === name && !tab.isLoading;
  });
}

When('the reference pane navigates to another page', async function () {
  await navigatePane(this, this.glanceReferenceId, 'glance-reference-next');
});

When('the main page navigates to another page', async function () {
  await navigatePane(this, this.glanceMainId, 'glance-main-next');
});

Then('the fill question is still showing', async function () {
  // A dismissal comes at the navigation's start, long before the page finished
  // loading (which the step before waited for), so one read is conclusive.
  const state = await this.call('fillStatusState');
  assert.equal(state.showing, true, `the question was dismissed by the other pane: ${JSON.stringify(state)}`);
  assert.equal(state.attached, true);
});

Then('the fill question is gone', async function () {
  await waitForValue(() => this.call('fillStatusState'),
    (state) => !state.showing && !state.attached && state.lastOutcome === 'cancel', 'the question dismissed');
});

// ---- A stacked Island between the rail and the window controls ----

When('the window is {int} pixels wide', async function (width) {
  // A display narrower than the window (the Linux VM's GNOME screen is
  // 1024 px) cannot show this layout at all: skip rather than test another.
  const available = await ctx.app.evaluate(({ screen }) => screen.getPrimaryDisplay().workAreaSize.width);
  if (available < width) return 'skipped';
  await this.call('setWindowContentSize', width, 800);
  await this.waitForState((state) =>
    state.glanceGeometry && state.glanceGeometry.page.x + state.glanceGeometry.page.width === width);
  await new Promise((resolve) => setTimeout(resolve, 200));
});

// The real Island, as the fit left it: inside the page's right edge minus the
// window controls, and right of the rail.
Then('the Island stays clear of the window controls and the tab rail', async function () {
  const chrome = await mainChromePage();
  await waitForValue(() => chrome.evaluate(() => {
    const root = document.documentElement;
    const pill = document.getElementById('islandPill').getBoundingClientRect();
    return {
      left: Math.round(pill.left), right: Math.round(pill.right), width: window.innerWidth,
      controls: parseFloat(getComputedStyle(root).getPropertyValue('--window-controls-w')),
      rail: parseFloat(root.style.getPropertyValue('--vertical-tabs-w')) || 0,
    };
  }), (box) => box.right <= box.width - box.controls && box.left >= box.rail,
  'the Island between the rail and the window controls', 3000);
});

// ---- Focus that arrives without a focus event ----

// On Linux inactive tab views stay attached (hidden) to their window, so a
// background tab can hold keyboard focus. When it opens in Glance it is
// already focused, and no focus event follows.
When('the reference tab takes keyboard focus while it is in the background', async function () {
  await frontChromeWindow(this);
  assert.equal(await this.call('focusTabContents', this.glanceReferenceId), true);
  await new Promise((resolve) => setTimeout(resolve, 300));
});

Then('the recorded focused pane is the pane that holds keyboard focus', async function () {
  await waitForValue(async () => {
    const { focusedPaneTabId, tabs, glanceTabId } = await this.state();
    const focusedContents = await this.call('focusedWebContentsId');
    const holder = tabs.find((tab) => tab.webContentsId === focusedContents && tab.id && [this.glanceMainId, glanceTabId].includes(tab.id));
    return { recorded: focusedPaneTabId, holder: holder?.id ?? null };
  }, (value) => value.holder === null || value.recorded === value.holder,
  'the recorded focused pane to match the pane that holds keyboard focus', 3000);
});

// ---- The reference title keeps priority in the header ----

// The title is what the header is for: Make main's label gives way to its
// swap icon before the title is cut below about ten characters (70 px, the
// same floor the Island keeps for its address).
Then('the Glance title shows at least ten characters', async function () {
  const chrome = await mainChromePage();
  await waitForValue(() => chrome.evaluate(() => {
    const title = document.getElementById('glanceTitle');
    const rect = title.getBoundingClientRect();
    return {
      text: title.textContent,
      shown: Math.round(rect.width),
      cut: title.scrollWidth > title.clientWidth + 1,
      header: Math.round(document.getElementById('glanceHeader').getBoundingClientRect().width),
    };
  }), (value) => value.shown > 0 && (!value.cut || value.shown >= 70),
  'the Glance title at least ten characters wide', 3000);
});

Then('Make main still says what it does', async function () {
  const chrome = await mainChromePage();
  const promote = chrome.locator('#glancePromote');
  assert.equal(await promote.getAttribute('aria-label'), 'Make main — swap with the main page');
  const shows = await promote.evaluate((button) => {
    const visible = (element) => element && element.getClientRects().length > 0 && element.getBoundingClientRect().width > 0;
    return { label: visible(button.querySelector('span')), icon: visible(button.querySelector('svg')) };
  });
  assert.ok(shows.label || shows.icon, `Make main shows neither its label nor its icon: ${JSON.stringify(shows)}`);
});
