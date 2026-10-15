'use strict';

const assert = require('node:assert/strict');
const { Given, When, Then } = require('@cucumber/cucumber');
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
async function focusPane(world, tabId) {
  await frontChromeWindow(world);
  assert.equal(await world.call('focusTabContents', tabId), true);
  await world.waitForState((state) => state.focusedPaneTabId === tabId);
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
  assert.equal(await chrome.locator('#glancePromote').getAttribute('aria-label'), 'Make Glance the main page');
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
  await frontChromeWindow(this);
  assert.equal(await this.call('focusTabContents', this.glanceReferenceId), true);
  const reference = (await this.state()).tabs.find((tab) => tab.id === this.glanceReferenceId);
  await waitForValue(
    () => this.call('focusedWebContentsId'),
    (id) => id === reference.webContentsId,
    'reference pane focused before the close'
  );
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
