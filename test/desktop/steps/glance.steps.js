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
  // A moved or resized card would otherwise carry into the next scenario.
  await restore(() => this.call('resetGlanceCard'));
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

When('I filter the Glance picker and choose the reference tab', async function () {
  const page = await overlayPage();
  await page.fill('#glancePickerInput', 'reference');
  const result = page.locator('.glance-picker-option');
  await result.first().waitFor();
  assert.equal(await result.count(), 1);
  assert.equal(await result.first().getAttribute('aria-selected'), 'true');
  assert.ok(await page.locator('#glancePickerInput').getAttribute('aria-activedescendant'));
  // Watch the live region through the choice: an awake tab must not be
  // announced as opening (only a waking quiet tab is).
  await page.evaluate(() => {
    const live = document.getElementById('glancePickerLive');
    window.__glanceLiveSeen = [];
    new MutationObserver(() => { window.__glanceLiveSeen.push(live.textContent); }).observe(live, { childList: true, characterData: true, subtree: true });
  });
  await page.press('#glancePickerInput', 'Enter');
  await this.waitForState((state) => state.glanceTabId === this.glanceReferenceId);
  const seen = await page.evaluate(() => window.__glanceLiveSeen);
  this.pickerLiveSeen = seen.includes('Opening…') ? 'Opening…' : seen.at(-1) ?? '';
});

When('I close Glance', async function () {
  // The header, and its ×, are on the floating card.
  const card = await glanceCardPage();
  await card.locator('#glanceClose').click();
  await waitForValue(() => this.state(), (state) => state.glanceTabId == null, 'Glance to close');
});

When('I choose Change and select the replacement tab', async function () {
  const chrome = await glanceCardPage();
  await chrome.locator('#glanceChange').click();
  await waitForValue(() => this.call('overlayMode'), (mode) => mode === 'glance', 'change picker');
  const page = await overlayPage();
  await page.locator('#glancePicker:not([hidden])').waitFor();
  assert.equal(await page.locator('body').getAttribute('data-glance-purpose'), 'change');
  // The picker hangs from the overlay's right edge: 24 px, or 12 px when the
  // overlay (the reference header's width) is 560 px or narrower
  // (styles.css). The overlay's bounds settle a moment after it shows.
  const pickerPosition = await waitForValue(() => page.locator('#glancePicker').evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      width: rect.width,
      rightGap: window.innerWidth - rect.right,
      overlayWidth: window.innerWidth,
      expectedGap: window.innerWidth <= 560 ? 12 : 24,
    };
  }), (value) => Math.abs(value.rightGap - value.expectedGap) <= 1, 'the change picker in place', 3000);
  assert.ok(pickerPosition.width <= 421, `change picker was too wide: ${pickerPosition.width}px`);
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
  const chrome = await glanceCardPage();
  await chrome.locator('#glanceChange').click();
  await waitForValue(() => this.call('overlayMode'), (mode) => mode === 'glance', 'change picker');
  const page = await overlayPage();
  await page.locator('#glancePickerInput').press('Escape');
  await waitForValue(() => this.call('overlayMode'), (mode) => mode === null, 'dismissed change picker');
});

Then('focus returns to the Change control', async function () {
  const chrome = await glanceCardPage();
  // The card's document must hold keyboard focus, not only point its
  // activeElement at the control.
  await waitForValue(() => this.call('glanceCardFocused'), (focused) => focused === true, 'the card document to hold focus');
  assert.equal(
    await chrome.locator('#glanceChange').evaluate((element) => document.activeElement === element),
    true
  );
});

When('I close the underlying Glance tab', async function () {
  const state = await this.state();
  // The Glance page's width inside its card; afterwards the page is full width.
  this.glanceSplitWidth = (await glanceCard(this)).page.width;
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
  const chrome = await glanceCardPage();
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
  this.glanceSplitWidth = (await glanceCard(this)).page.width;
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
  assert.ok(bounds && bounds.width > this.glanceSplitWidth, `the reference is still card-sized: ${JSON.stringify(bounds)}`);
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
  this.glanceSplitWidth = (await glanceCard(this)).page.width;
});

Given('the main page and the fourth tab share a group', async function () {
  await this.call('groupTabByName', this.glanceMainId, 'Research');
  await this.call('groupTabByName', this.glanceReplacementId, 'Research');
  await this.waitForState((state) => state.groups.some((group) => group.name === 'Research'));
});

Given('the main page and the reference share a group', async function () {
  await this.call('groupTabByName', this.glanceMainId, 'Research');
  await this.call('groupTabByName', this.glanceReferenceId, 'Research');
  await this.waitForState((state) => state.groups.some((group) => group.name === 'Research'));
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
  // Same rule as focusPane: front and focus until the reference holds
  // keyboard focus, not just once; paneHoldsFocus then checks it.
  assert.equal(await this.call('focusTabContents', this.glanceReferenceId), true);
  await paneHoldsFocus(this, this.glanceReferenceId, 'reference pane focused before the close');
});

When('I close the main page tab', async function () {
  const state = await this.state();
  assert.equal(state.activeTabId, this.glanceMainId);
  await this.call('closeTab', this.glanceMainId);
});

// Another app can hold the foreground during a run, and macOS may refuse to
// let Blanc take activation from it; then no page reports focus and the
// window never becomes key. When the window can be key, the OS-level check
// is required; when it cannot, the check falls back to what main recorded
// and says so, since the responder the app chose cannot be observed.
async function paneHoldsFocus(world, tabId, label) {
  const result = await waitForValue(async () => {
    const windowFocused = await world.call('focusWindow');
    const { focusedPaneTabId, tabs } = await world.state();
    const pane = tabs.find((tab) => tab.id === tabId);
    const focused = await world.call('focusedWebContentsId');
    return {
      os: !!pane && focused === pane.webContentsId,
      recorded: focusedPaneTabId === tabId,
      windowFocused,
    };
  }, (value) => value.os || (!value.windowFocused && value.recorded), label);
  if (!result.os) {
    const note = `${label}: the window could not become key (another app holds the foreground); checked main's record only`;
    console.warn(`\n${note}`);
    world.attach?.(note);
  }
}

Then('keyboard focus is on the main page', async function () {
  await this.waitForState((candidate) => candidate.glanceTabId === null);
  await paneHoldsFocus(this, this.glanceMainId, 'focus handed to the main page after the reference closed');
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
  const chrome = await glanceCardPage();
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

// --- Windows/Linux window controls over the header (Glance fixes, PR 1) ---

// --- Stacked Change picker (Glance fixes, PR 1) ---

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
  const chrome = await glanceCardPage();
  await chrome.locator('#glanceHeader.focused').waitFor();
  const eyebrow = await chrome.locator('#glanceEyebrow').evaluate((element) => getComputedStyle(element).color);
  const border = await chrome.locator('#glanceHeader').evaluate((element) => getComputedStyle(element).borderBottomColor);
  assert.equal(eyebrow, await cssColour(chrome, '--text'));
  assert.equal(border, await cssColour(chrome, '--text-dim'));
});

Then('the Glance header shows the main page has focus', async function () {
  const chrome = await glanceCardPage();
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
  await paneHoldsFocus(this, this.glanceMainId, 'focus handed to the main page');
});

Then('the main page tab is closed', async function () {
  await this.waitForState((state) => !state.tabs.some((tab) => tab.id === this.glanceMainId));
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
  const chrome = await glanceCardPage();
  await chrome.locator('#glanceBack:not([disabled])').waitFor();
  assert.equal(await chrome.locator('#glanceBack').getAttribute('aria-label'), 'Back');
});

Then("the Glance header's Back button is disabled", async function () {
  const chrome = await glanceCardPage();
  await chrome.locator('#glanceBack[disabled]').waitFor();
});

When('I click Back in the Glance header', async function () {
  const chrome = await glanceCardPage();
  await chrome.locator('#glanceBack').click();
});

When('I click Reload in the Glance header', async function () {
  await recordLoadCounts(this);
  const chrome = await glanceCardPage();
  await chrome.locator('#glanceReload').click();
});

When('the reference starts a slow load', async function () {
  const url = new URL((await this.state()).tabs.find((tab) => tab.id === this.glanceReferenceId).url);
  url.searchParams.set('hold', 'slow');
  // Not awaited: navigateTab resolves only when the slow load finishes.
  this.call('navigateTab', this.glanceReferenceId, url.toString()).catch(() => {});
});

Then("the Glance header's Reload button reads Stop", async function () {
  const chrome = await glanceCardPage();
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
  const chrome = await glanceCardPage();
  await chrome.locator('#glanceHeader:not([hidden])').waitFor();
  const result = await stripContextTarget(chrome, '#glanceTitle');
  assert.equal(String(result.id), String(this.glanceReferenceId));
  assert.equal(result.prevented, false);
});

Then('a right-click on a Glance header button addresses no tab', async function () {
  const chrome = await glanceCardPage();
  for (const selector of ['#glanceBack', '#glanceReload', '#glanceChange', '#glanceOpenAsTab', '#glanceKeepSplit', '#glanceMove', '#glanceClose']) {
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
  // A second private tab, opened now: any tab switch once Glance is open
  // would close it.
  this.glancePrivateOtherId = await this.call('openTab', this.fixtureUrl('glance-private-reference'), { private: true });
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

// ---- The record after a main-page change and after activation ----

// A new tab is a new working page and becomes main, with the address bar
// focused (spec: Commands follow focus, "Reset to the main tab whenever ...
// the main tab changes"). The reference's focus is gone with it.
Then('the recorded focused pane is the main page', async function () {
  await waitForValue(async () => {
    const { focusedPaneTabId, activeTabId } = await this.state();
    return { recorded: focusedPaneTabId, main: activeTabId, reference: this.glanceReferenceId };
  }, (value) => value.recorded === value.main && value.main !== value.reference,
  'the main page recorded as the focused pane', 3000);
});

// On Linux, activating a window restores focus to its last focused view
// without that view's own focus event, so main re-reads live focus on the
// window's activation.
When('another Blanc window takes the foreground and this one is activated again', async function () {
  this.glanceExtraWindowId = await this.call('openNewWindow');
  await waitForValue(async () => (await this.call('windowRuntimes')).find((runtime) => runtime.id === this.glanceExtraWindowId),
    Boolean, 'the second window');
  await new Promise((resolve) => setTimeout(resolve, 400));
  await frontChromeWindow(this);
  await this.call('closeWindowRuntime', this.glanceExtraWindowId);
  this.glanceExtraWindowId = null;
  await frontChromeWindow(this);
  await new Promise((resolve) => setTimeout(resolve, 300));
});

// ---- Motion: the chrome's own vocabulary ----

When('I choose Change from the Glance header', async function () {
  const chrome = await glanceCardPage();
  await chrome.locator('#glanceChange').click();
  await waitForValue(() => this.call('overlayMode'), (mode) => mode === 'glance', 'the Change picker');
  const page = await overlayPage();
  await page.locator('#glancePicker:not([hidden])').waitFor();
});

// ---- Picker rows in the panel's vocabulary ----

Given('a quiet background tab and a private background tab eligible for Glance', async function () {
  await createGlanceTabs(this);
  this.glancePrivateId = await this.call('openTab', this.fixtureUrl('glance-private-ref'), { private: true });
  await this.call('activateTab', this.glanceMainId, false);
  await this.waitForState((state) => {
    const priv = state.tabs.find((tab) => tab.id === this.glancePrivateId);
    return priv?.private === true && priv.title === 'glance-private-ref' && !priv.isLoading && state.activeTabId === this.glanceMainId;
  });
  assert.equal(await this.call('sleepTab', this.glanceReferenceId), true);
  await this.waitForState((candidate) => candidate.tabs.find((tab) => tab.id === this.glanceReferenceId)?.asleep === true);
});

async function pickerRows(page) {
  await page.locator('.glance-picker-option').first().waitFor();
  return page.locator('.glance-picker-option').evaluateAll((rows) => rows.map((row) => ({
    label: row.getAttribute('aria-label'),
    title: row.title,
    quiet: row.classList.contains('quiet'),
    sub: row.querySelector('.glance-picker-option-sub')?.textContent ?? '',
    privateChip: row.querySelector('.row-private')?.textContent ?? null,
    opacity: Number(getComputedStyle(row).opacity),
  })));
}

Then('the quiet row is dimmed and says quiet only to assistive tech', async function () {
  const rows = await pickerRows(await overlayPage());
  const quiet = rows.find((row) => row.label.includes('glance-reference'));
  assert.ok(quiet, `no quiet row: ${JSON.stringify(rows)}`);
  assert.equal(quiet.quiet, true, 'the quiet row is not marked quiet');
  assert.ok(quiet.opacity < 1, `the quiet row is not dimmed: opacity ${quiet.opacity}`);
  assert.ok(!quiet.sub.includes('quiet'), `the visible line still says quiet: "${quiet.sub}"`);
  assert.ok(quiet.label.includes('quiet'), `the accessible name lost quiet: "${quiet.label}"`);
});

Then('the private row carries the private chip', async function () {
  const rows = await pickerRows(await overlayPage());
  const priv = rows.find((row) => row.label.includes('glance-private-ref'));
  assert.ok(priv, `no private row: ${JSON.stringify(rows)}`);
  assert.equal(priv.privateChip, 'private');
  assert.ok(!priv.sub.includes('private'), `the secondary line still says private: "${priv.sub}"`);
});

Then('every picker row has a tooltip with its title and host', async function () {
  const rows = await pickerRows(await overlayPage());
  // Fixture pages have a host; the harness's blank tab has none, so its
  // tooltip is its title alone.
  for (const row of rows) {
    const expected = row.label.includes('127.0.0.1') ? /^glance-[a-z-]+ — 127\.0\.0\.1(:\d+)?$/ : /^New Tab$/;
    assert.ok(expected.test(row.title), `tooltip "${row.title}" for "${row.label}"`);
  }
});

Then('the row names join their parts with commas', async function () {
  const rows = await pickerRows(await overlayPage());
  for (const row of rows) {
    assert.ok(row.label.includes(', '), `no comma in "${row.label}"`);
    assert.ok(!row.label.includes(' · '), `visual separator in the name "${row.label}"`);
  }
});

When('I press ArrowDown in the picker', async function () {
  const page = await overlayPage();
  // Clear the live region first: a re-announcement would write the same
  // count back, which an unchanged-text check could not see.
  await page.evaluate(() => { document.getElementById('glancePickerLive').textContent = ''; });
  this.pickerLiveBefore = '';
  await page.press('#glancePickerInput', 'ArrowDown');
  await page.waitForFunction(() => document.querySelectorAll('.glance-picker-option')[1]?.getAttribute('aria-selected') === 'true');
});

Then('the live region did not re-announce the count', async function () {
  const page = await overlayPage();
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.equal(await page.locator('#glancePickerLive').textContent(), this.pickerLiveBefore);
});

When('I type {string} into the picker filter and press Home', async function (text) {
  const page = await overlayPage();
  await page.fill('#glancePickerInput', text);
  await page.locator('.glance-picker-option').first().waitFor();
  await page.press('#glancePickerInput', 'End');
  await page.press('#glancePickerInput', 'Home');
});

Then('the caret is at the start of the filter and the first row is still highlighted', async function () {
  const page = await overlayPage();
  const state = await page.evaluate(() => {
    const input = document.getElementById('glancePickerInput');
    const rows = [...document.querySelectorAll('.glance-picker-option')];
    return { caret: input.selectionStart, value: input.value, selected: rows.findIndex((row) => row.getAttribute('aria-selected') === 'true') };
  });
  assert.equal(state.caret, 0, `caret at ${state.caret} in "${state.value}"`);
  assert.equal(state.selected, 0, `row ${state.selected} highlighted`);
});

When('I choose the slow quiet tab in the picker', async function () {
  const page = await overlayPage();
  await page.fill('#glancePickerInput', 'reference');
  await page.locator('.glance-picker-option').first().waitFor();
  await page.press('#glancePickerInput', 'Enter');
  await page.locator('#glancePickerInput[aria-busy="true"]').waitFor();
});

Then('the chosen row says Opening and the live region says it', async function () {
  const page = await overlayPage();
  const seen = await waitForValue(() => page.evaluate(() => {
    const row = document.querySelector('.glance-picker-option[data-opening="true"]');
    return { sub: row?.querySelector('.glance-picker-option-sub')?.textContent ?? null, live: document.getElementById('glancePickerLive').textContent };
  }), (value) => value.sub === 'Opening…', 'the chosen row saying Opening', 2000);
  assert.equal(seen.live, 'Opening…');
});

Then('the other rows are dimmed while it wakes', async function () {
  const page = await overlayPage();
  const others = await page.locator('.glance-picker-option:not([data-opening="true"])').evaluateAll((rows) => rows.map((row) => row.disabled));
  assert.ok(others.every(Boolean), `other rows not dimmed: ${JSON.stringify(others)}`);
});

// ---- The header's private chip, the identity cross-fade, the dialog ----

Then('the Glance header shows the private chip', async function () {
  const chrome = await glanceCardPage();
  await chrome.locator('#glancePrivate:not([hidden])').waitFor();
  assert.equal((await chrome.locator('#glancePrivate').textContent()).trim(), 'private');
});

// Make main swaps the panes at once; the header's favicon, title and chip
// cross-fade over 120 ms instead of changing in one frame.
Then("the header's identity cross-faded rather than swapping", async function () {
  const motion = await this.call('glanceHeaderMotion');
  assert.ok(motion.identity, 'no identity measured');
  assert.ok(motion.identity.transition.includes('opacity 0.12s'), `identity transition: ${motion.identity.transition}`);
  assert.equal(this.glanceIdentitySwapped, true, 'the identity never entered its swapping state');
});

Then('the picker has the dialog role and is labelled by its heading', async function () {
  const page = await overlayPage();
  const picker = page.locator('#glancePicker');
  assert.equal(await picker.getAttribute('role'), 'dialog');
  assert.equal(await picker.getAttribute('aria-labelledby'), 'glancePickerTitle');
  assert.equal((await page.locator('#glancePickerTitle').textContent()).trim(), 'Choose a tab for Glance');
});

// Change the Glance to a private tab, watching the header's identity for its
// cross-fade state, which lasts 120 ms and would otherwise be gone by the
// time a step looked.
When('I show a private tab in Glance instead', async function () {
  const chrome = await glanceCardPage();
  await chrome.evaluate(() => {
    const identity = document.querySelector('#glanceHeader .glance-tab-identity');
    window.__glanceIdentitySwapped = identity.classList.contains('swapping');
    new MutationObserver(() => { if (identity.classList.contains('swapping')) window.__glanceIdentitySwapped = true; })
      .observe(identity, { attributes: true, attributeFilter: ['class'] });
  });
  const privateId = this.glancePrivateOtherId;
  assert.equal(await this.call('setGlance', privateId), true);
  this.glanceReferenceId = privateId;
  await new Promise((resolve) => setTimeout(resolve, 150));
  this.glanceIdentitySwapped = await chrome.evaluate(() => window.__glanceIdentitySwapped === true);
});

Then('the Glance header shows no private chip', async function () {
  const chrome = await glanceCardPage();
  await chrome.locator('#glanceHeader:not([hidden])').waitFor();
  const chip = await chrome.locator('#glancePrivate').evaluate((element) => ({
    hidden: element.hidden, drawn: element.getClientRects().length > 0,
  }));
  assert.deepEqual(chip, { hidden: true, drawn: false });
});

// ---- /glance ----

Given('twelve ordinary tabs in one workspace', async function () {
  const ids = [];
  for (let i = 1; i <= 12; i += 1) ids.push(await this.call('openTab', this.fixtureUrl(`glance-many-${i}`)));
  await this.call('activateTab', ids[5], false);
  await this.waitForState((state) => ids.every((id) => {
    const tab = state.tabs.find((candidate) => candidate.id === id);
    return tab && !tab.isLoading && tab.title.startsWith('glance-many');
  }));
});

Then('the Glance picker is open with the filter {string} and one row', async function (filter) {
  await waitForValue(() => this.call('overlayMode'), (mode) => mode === 'glance', 'the Glance picker');
  const page = await overlayPage();
  await page.locator('#glancePicker:not([hidden])').waitFor();
  assert.equal(await page.locator('body').getAttribute('data-glance-purpose'), 'open');
  assert.equal(await page.inputValue('#glancePickerInput'), filter);
  await page.locator('.glance-picker-option').first().waitFor();
  assert.equal(await page.locator('.glance-picker-option').count(), 1);
  assert.ok((await page.locator('.glance-picker-option').first().getAttribute('aria-label')).includes(filter));
});

Then('the Change picker is open', async function () {
  await waitForValue(() => this.call('overlayMode'), (mode) => mode === 'glance', 'the Change picker');
  const page = await overlayPage();
  await page.locator('#glancePicker:not([hidden])').waitFor();
  assert.equal(await page.locator('body').getAttribute('data-glance-purpose'), 'change');
});

Then('the picker says to open another tab and keeps the filter {string}', async function (filter) {
  await waitForValue(() => this.call('overlayMode'), (mode) => mode === 'glance', 'the Glance picker');
  const page = await overlayPage();
  await page.locator('#glancePicker:not([hidden])').waitFor();
  await page.locator('#glancePickerState:not([hidden])').waitFor();
  assert.equal(await page.locator('#glancePickerState').textContent(), 'Open another tab to use Glance');
  assert.equal(await page.inputValue('#glancePickerInput'), filter);
});

// ---- Open Link in Glance ----
// The page context menu is native, so the step calls the same main-process
// action the menu item calls, through the test hook.

let glanceLinkCount = 0;
async function openLinkInGlanceFrom(world, tabId) {
  glanceLinkCount += 1;
  const name = `glance-linked-${glanceLinkCount}`;
  const before = new Set((await world.state()).tabs.map((tab) => tab.id));
  assert.equal(await world.call('openLinkInGlance', tabId, world.fixtureUrl(name)), true);
  const state = await world.waitForState((candidate) => candidate.tabs.some((tab) => !before.has(tab.id) && tab.title === name && !tab.isLoading));
  return state.tabs.find((tab) => !before.has(tab.id) && tab.title === name).id;
}

When('I open a link from the main page in Glance', async function () {
  this.glanceLinkedId = await openLinkInGlanceFrom(this, this.glanceMainId);
});

When('I open a link from the reference in Glance', async function () {
  this.glancePreviousReferenceId = (await this.state()).glanceTabId;
  this.glanceLinkedId = await openLinkInGlanceFrom(this, this.glancePreviousReferenceId);
});

Then('the linked page is the reference and the main page is untouched', async function () {
  const state = await this.waitForState((candidate) => candidate.glanceTabId === this.glanceLinkedId);
  assert.equal(state.activeTabId, this.glanceMainId);
});

Then('the linked page replaced the reference', async function () {
  const state = await this.waitForState((candidate) => candidate.glanceTabId === this.glanceLinkedId);
  assert.equal(state.activeTabId, this.glanceMainId);
  assert.ok(state.tabs.some((tab) => tab.id === this.glancePreviousReferenceId), 'the previous reference was closed');
});

Given('a private main page and an ordinary tab', async function () {
  this.glanceMainId = await this.call('openTab', this.fixtureUrl('glance-private-main'), { private: true });
  this.glanceReferenceId = await this.call('openTab', this.fixtureUrl('glance-reference'));
  await this.call('activateTab', this.glanceMainId, false);
  await this.waitForState((state) => {
    const main = state.tabs.find((tab) => tab.id === this.glanceMainId);
    return main?.private === true && !main.isLoading && state.activeTabId === this.glanceMainId;
  });
});

Then('the reference is a private tab in the private session', async function () {
  const state = await this.waitForState((candidate) => candidate.glanceTabId === this.glanceLinkedId);
  const reference = state.tabs.find((tab) => tab.id === this.glanceLinkedId);
  assert.equal(reference.private, true);
  assert.equal(reference.sessionKind, 'private');
});

Then('the live region never said Opening', async function () {
  assert.notEqual(this.pickerLiveSeen, 'Opening…', 'the live region said Opening… for a tab that was already awake');
});

// ---- Floating Glance card (spec 2026-10-20-floating-glance-design.md) ----

const glanceCard = (world) => world.call('getGlanceCard');
const insideRect = (inner, outer) => inner.x >= outer.x && inner.y >= outer.y
  && inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height;

Given("the window's page is {int} by {int}", async function (width, height) {
  await this.call('setWindowContentSize', width, height);
  await waitForValue(() => this.call('windowContentBounds'),
    (bounds) => bounds?.width === width && bounds?.height === height, `the window to be ${width} by ${height}`);
});

Then('the Glance is a large centered card over the whole main page', async function () {
  const card = await waitForValue(() => glanceCard(this), (value) => value?.cardViewVisible === true, 'the Glance card to show');
  const { pageArea } = card;
  const width = Math.min(1100, Math.round(pageArea.width * 0.8));
  assert.deepEqual(card.frame, {
    x: pageArea.x + Math.round((pageArea.width - width) / 2),
    y: pageArea.y + 16,
    width,
    height: pageArea.height - 48,
  });
  assert.deepEqual(card.mainViewBounds, card.pageBounds, 'the main page keeps the whole page area');
  assert.deepEqual(card.viewBounds, card.page, 'the Glance page sits inside the card, below its header');
  assert.deepEqual(card.page, { x: card.frame.x + 1, y: card.frame.y + 40, width: card.frame.width - 2, height: card.frame.height - 41 });
  assert.deepEqual(card.cardViewBounds, card.chrome);
  assert.ok(card.stackIndex.main < card.stackIndex.card && card.stackIndex.card < card.stackIndex.glance,
    `tabs < card < Glance page: ${JSON.stringify(card.stackIndex)}`);
});

Then("the card keeps its share of the page with its header on screen", async function () {
  const card = await waitForValue(() => glanceCard(this), (value) => {
    if (!value?.cardViewVisible) return false;
    return value.pageArea.width === value.pageBounds.width && insideRect(value.frame, value.pageArea);
  }, 'the card to fit the resized window');
  assert.ok(card.frame.y >= card.pageArea.y, 'the header stays below the Island band');
  assert.ok(card.frame.width >= 360 && card.frame.height >= 280);
  assert.deepEqual(card.viewBounds, card.page);
});

async function glanceCardPage() {
  return waitForValue(async () => ctx.app.windows().find((page) =>
    !page.isClosed() && page.url() === 'blanc-chrome://glance/') ?? null, (page) => !!page, 'the Glance card document');
}

// Through the card document's own bridge, as its drag code calls it.
async function cardBridge(world, method, input) {
  const page = await glanceCardPage();
  const card = await waitForValue(() => glanceCard(world), (value) => value?.cardViewVisible === true, 'the Glance card to show');
  world.glanceCardBefore = card.frame;
  return page.evaluate(async ({ method, input }) => {
    const generation = await new Promise((resolve) => {
      const read = () => {
        const html = document.documentElement;
        return html.dataset.glanceGeneration ? Number(html.dataset.glanceGeneration) : null;
      };
      const value = read();
      if (value != null) resolve(value);
      else setTimeout(() => resolve(read()), 200);
    });
    return window.browserAPI[method]({ ...input, generation });
  }, { method, input });
}

// The first-open card fills the page's height, so it moves up and sideways.
When('I move the Glance card by {int}, {int}', async function (dx, dy) {
  this.glanceCardStart = (await glanceCard(this))?.frame ?? null;
  const frame = await cardBridge(this, 'moveGlanceCard', { dx, dy });
  assert.ok(frame, 'the move was accepted');
});

Then('the Glance card has moved by {int}, {int}', async function (dx, dy) {
  const start = this.glanceCardStart;
  const card = await waitForValue(() => glanceCard(this), (value) => value?.cardViewVisible === true
    && value.frame.x === start.x + dx && value.frame.y === start.y + dy, 'the card to sit where it was moved');
  assert.equal(card.frame.width, start.width);
  assert.deepEqual(card.viewBounds, card.page);
});

When("I drag the Glance card's left edge {int} to the right", async function (dx) {
  this.glanceCardStart = (await glanceCard(this))?.frame ?? null;
  const frame = await cardBridge(this, 'resizeGlanceCard', { edge: 'w', dx, dy: 0 });
  assert.ok(frame, 'the resize was accepted');
});

Then('the Glance card is {int} narrower with its right edge where it was', async function (dx) {
  const start = this.glanceCardStart;
  const card = await waitForValue(() => glanceCard(this), (value) => value?.frame.width === start.width - dx, 'the card to narrow');
  assert.equal(card.frame.x + card.frame.width, start.x + start.width);
});

When("I double-click the Glance card's header", async function () {
  const page = await glanceCardPage();
  await page.dblclick('#glanceEyebrow');
});

When('I switch to the replacement tab', async function () {
  await this.call('activateTab', this.glanceReplacementId, false);
});

Then('Glance is closed and the replacement tab fills the page', async function () {
  await this.waitForState((state) => state.activeTabId === this.glanceReplacementId && state.glanceTabId == null);
  assert.equal(await glanceCard(this), null, 'no card while no Glance is open');
});

When('I switch back to the original main page', async function () {
  await this.call('activateTab', this.glanceMainId, false);
  await this.waitForState((state) => state.activeTabId === this.glanceMainId);
});

Then('Glance stays closed', async function () {
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.equal((await this.state()).glanceTabId, null);
});

When('I choose the Glance tab from the tab list', async function () {
  await this.call('activateTab', this.glanceReferenceId, false);
});

Then('the Glance tab is the current tab and Glance is closed', async function () {
  await this.waitForState((state) => state.activeTabId === this.glanceReferenceId && state.glanceTabId == null);
  assert.equal(await glanceCard(this), null);
});

When('I choose Open as tab on the Glance card', async function () {
  const card = await glanceCardPage();
  await card.locator('#glanceOpenAsTab').click();
});

Then('the original main page is still open', async function () {
  const state = await this.state();
  assert.ok(state.tabs.some((tab) => tab.id === this.glanceMainId));
});

When('I press Escape inside the Glance page', async function () {
  await this.call('workspacePageScript', this.glanceReferenceId,
    "window.__escapes = 0; document.addEventListener('keydown', (e) => { if (e.key === 'Escape') window.__escapes += 1; }, true); true");
  assert.equal(await this.call('sendMouseInput', this.glanceReferenceId, { type: 'keyDown', keyCode: 'Escape' }), true);
  await this.call('sendMouseInput', this.glanceReferenceId, { type: 'keyUp', keyCode: 'Escape' });
});

Then('the Glance page received the Escape and Glance is still open', async function () {
  await waitForValue(() => this.call('workspacePageScript', this.glanceReferenceId, 'window.__escapes'),
    (count) => count === 1, 'the Glance page to see its Escape');
  assert.equal((await this.state()).glanceTabId, this.glanceReferenceId);
});

When("I press Escape on the Glance card's header", async function () {
  assert.equal(await this.call('sendGlanceCardInput', { type: 'keyDown', keyCode: 'Escape' }), true);
});

Then('Glance is closed and the original main page fills the page', async function () {
  await this.waitForState((state) => state.activeTabId === this.glanceMainId && state.glanceTabId == null);
  assert.equal(await glanceCard(this), null);
});

When('I click and scroll the main page beside the card', async function () {
  const card = await waitForValue(() => glanceCard(this), (value) => value?.cardViewVisible === true, 'the Glance card to show');
  // Left of the card, inside the main page (its view starts at the page area).
  const x = Math.max(4, Math.round((card.chrome.x - card.mainViewBounds.x) / 2));
  const y = Math.round(card.mainViewBounds.height / 2);
  for (const type of ['mouseDown', 'mouseUp']) {
    assert.equal(await this.call('sendMouseInput', this.glanceMainId, { type, x, y, button: 'left', clickCount: 1 }), true);
  }
  await this.call('sendMouseInput', this.glanceMainId, { type: 'mouseWheel', x, y, deltaX: 0, deltaY: -240 });
});

Then('Glance is still open over the main page', async function () {
  await new Promise((resolve) => setTimeout(resolve, 300));
  const state = await this.state();
  assert.equal(state.activeTabId, this.glanceMainId);
  assert.equal(state.glanceTabId, this.glanceReferenceId);
  assert.equal((await glanceCard(this))?.cardViewVisible, true);
});

When('I close the main page', async function () {
  await this.call('closeTab', this.glanceMainId);
});

When('I narrow the Glance card to its minimum', async function () {
  const frame = await cardBridge(this, 'resizeGlanceCard', { edge: 'w', dx: 5000, dy: 0 });
  assert.equal(frame?.width, 360);
});

Then('the Glance header shows Back, Reload, the three actions as icons and × on one row', async function () {
  const page = await glanceCardPage();
  const header = await waitForValue(() => page.evaluate(() => {
    const el = document.getElementById('glanceHeader');
    const shown = (id) => document.getElementById(id)?.getClientRects().length > 0;
    return {
      width: Math.round(el.getBoundingClientRect().width),
      fits: el.scrollWidth <= el.clientWidth + 1,
      compact: el.classList.contains('compact-actions'),
      shown: Object.fromEntries(['glanceBack', 'glanceReload', 'glanceChange', 'glanceOpenAsTab', 'glanceKeepSplit', 'glanceClose', 'glanceFavicon']
        .map((id) => [id, shown(id)])),
      labelsShown: [...el.querySelectorAll('.glance-action-label')].some((label) => label.getClientRects().length > 0),
    };
  }), (value) => value?.width === 358 && value.compact, 'the header to compact in a 360 px card (358 inside its border)');
  assert.equal(header.fits, true, 'nothing spills out of the header');
  assert.equal(header.labelsShown, false, 'the actions are icons');
  for (const [id, shown] of Object.entries(header.shown)) assert.equal(shown, true, `${id} is shown`);
});

When("I press the right arrow on the Glance card's Move or resize control", async function () {
  this.glanceCardStart = (await waitForValue(() => glanceCard(this), (value) => value?.cardViewVisible === true, 'the Glance card'))?.frame;
  const page = await glanceCardPage();
  await page.locator('#glanceMove').focus();
  await page.keyboard.press('ArrowRight');
});

Then('the Glance card announces {string}', async function (message) {
  const page = await glanceCardPage();
  await waitForValue(() => page.evaluate(() => document.getElementById('glanceCardStatus')?.textContent ?? ''),
    (text) => text === message, `the card to announce ${message}`);
});

Then('the find capsule sits over the Glance card and searches it', async function () {
  await waitForValue(() => this.call('overlayMode'), (mode) => mode === 'find', 'find capsule');
  assert.equal(await this.call('findTabId'), this.glanceReferenceId);
  const card = await glanceCard(this);
  const bounds = await this.call('overlayViewBounds');
  assert.ok(bounds.x >= card.page.x && bounds.x + bounds.width <= card.page.x + card.page.width,
    `capsule ${JSON.stringify(bounds)} inside the card's page ${JSON.stringify(card.page)}`);
  assert.equal(bounds.y, card.page.y);
  const page = await overlayPage();
  await page.locator('#findInput').fill('widget');
  await waitForValue(() => page.locator('#findCount').textContent(), (text) => text === '1/3', 'match count from the Glance page');
});

Then('the Glance card fades in at its full size', async function () {
  const motion = await waitForValue(() => this.call('glanceCardMotion'), (value) => value && value.hidden === false, 'the card motion');
  assert.match(motion.transition, /opacity 0\.14s/);
  assert.equal(motion.transform, 'none');
});

When('I close Glance and look at the card in the same moment', async function () {
  this.glanceCloseRead = await this.call('closeGlanceAndReadCard');
});

Then('the Glance card was already gone', async function () {
  assert.deepEqual(this.glanceCloseRead, { closed: true, cardViewVisible: false });
});

// The card's document measures in its own view; main moves the anchor by the
// view's origin, so the tip lands under the button in the window.
Then('hovering the compact Change button shows its tooltip under it', async function () {
  const page = await glanceCardPage();
  await page.hover('#glanceChange');
  const tip = await waitForValue(() => this.call('tooltipViewState'), (value) => value?.attached === true && value.bounds,
    'the Change tooltip to show');
  const card = await glanceCard(this);
  assert.ok(tip.bounds.y >= card.header.y + card.header.height - 4, `tip ${JSON.stringify(tip.bounds)} under the header ${JSON.stringify(card.header)}`);
  assert.ok(tip.bounds.x + tip.bounds.width > card.header.x && tip.bounds.x < card.header.x + card.header.width,
    'the tip sits over the card, not at the window origin');
});

When('I close the Glance tab and look at the card in the same moment', async function () {
  this.glanceCloseRead = await this.call('closeTabAndReadGlance', this.glanceReferenceId);
});

When('I close the main page and look at the card in the same moment', async function () {
  this.glanceCloseRead = await this.call('closeTabAndReadGlance', this.glanceMainId);
});

// Read in the same turn as the close, well inside the 250 ms save debounce:
// a move still waiting there would be lost if Blanc quit now.
Then("the card's move was already saved and its view was already gone", async function () {
  const { savedFrame, cardViewVisible, glanceTabId } = this.glanceCloseRead;
  assert.equal(glanceTabId, null, 'the Glance ended');
  assert.equal(cardViewVisible, false, 'the card view was hidden in the same turn');
  const start = this.glanceCardStart;
  assert.deepEqual(savedFrame && { x: savedFrame.x, y: savedFrame.y }, { x: start.x - 120, y: start.y - 16 }, 'the moved frame was saved');
});

When("I open the window's first Glance and look in the same moment", async function () {
  this.glanceFirstOpenRead = await this.call('openFirstGlanceAndRead', this.glanceReferenceId);
});

// Before the card's document has drawn, its view would show as a transparent
// hole with the Glance page floating chromeless inside it.
Then('neither the card nor the Glance page was showing yet', async function () {
  assert.deepEqual(this.glanceFirstOpenRead, { opened: true, cardViewVisible: false, glancePageVisible: false });
});

Then('the card and the Glance page then show together', async function () {
  const card = await waitForValue(() => glanceCard(this), (value) => value?.cardViewVisible === true, 'the card to show');
  assert.equal(await this.call('glancePageViewVisible'), true);
  assert.deepEqual(card.viewBounds, card.page);
});

// Every text the strip's live region is given, in order, so a message that is
// replaced before the next frame still counts.
Given("I listen to the strip's announcements", async function () {
  const chrome = await mainChromePage();
  await chrome.evaluate(() => {
    window.__glanceAnnouncementObserver?.disconnect();
    window.__glanceAnnouncements = [];
    const region = document.getElementById('glanceStatus');
    window.__glanceAnnouncementObserver = new MutationObserver(() => window.__glanceAnnouncements.push(region.textContent));
    window.__glanceAnnouncementObserver.observe(region, { childList: true, characterData: true, subtree: true });
  });
});

When('I choose Keep as split on the Glance card', async function () {
  const card = await glanceCardPage();
  await card.locator('#glanceKeepSplit').click();
});

Then('the strip announced only {string}', async function (announcement) {
  const chrome = await mainChromePage();
  await waitForValue(() => chrome.evaluate(() => window.__glanceAnnouncements.length > 0),
    Boolean, 'an announcement');
  await new Promise((resolve) => setTimeout(resolve, 400));
  const heard = await chrome.evaluate(() => window.__glanceAnnouncements.filter((text) => text.trim() !== ''));
  assert.deepEqual(heard, [announcement]);
});
