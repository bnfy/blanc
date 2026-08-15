'use strict';

const assert = require('node:assert/strict');
const { Given, When, Then } = require('@cucumber/cucumber');
const ctx = require('../support/context');
const { overlayPage } = require('../support/overlay');
const { waitForValue } = require('../support/poll');

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
    return main?.title === 'glance-main' && reference?.title === 'glance-reference';
  });
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
