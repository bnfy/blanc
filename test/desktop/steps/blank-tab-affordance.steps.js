const assert = require('node:assert');
const { Given, When, Then } = require('@cucumber/cucumber');
const { waitForValue } = require('./../support/poll');

// F37 — the blank tab's typing affordance.
//
// These read the real chrome DOM through the test hook rather than the tab
// model: the contract is what the island SHOWS and what typing DOES, and a
// model-level proxy would pass even if the placeholder never rendered.

Given('a blank new tab is active', async function () {
  this.blankTabId = await this.call('newTab');
  await this.waitForState((s) => s.activeTabId === this.blankTabId);
  // The pill renders from a tabs:updated broadcast, so the DOM trails the
  // model by a frame.
  await waitForValue(
    () => this.call('pillPlaceholderState'),
    (p) => p && p.placeholder,
    'the pill to enter placeholder mode',
  );
});

Given('a blank new tab is active with page content focused', async function () {
  this.blankTabId = await this.call('newTab');
  // Wait for the page itself, not just the tab record. A tab created a
  // moment ago has not run blanc://newtab's scripts yet, so its keydown
  // listener does not exist and a keystroke lands on nothing — which fails
  // as "the island never opened" and looks like a product bug.
  await this.waitForState((s) => {
    const tab = s.tabs.find((t) => t.id === this.blankTabId);
    return s.activeTabId === this.blankTabId
      && tab && !tab.loading
      && String(tab.loadedUrl || '').startsWith('blanc://newtab');
  });
  // Reproduce cold launch. main activates the startup tab with
  // focusContent: true; Cmd/Ctrl+T deliberately does the opposite
  // (focusAddress: true), which would open and focus the island on the way
  // in and make the typing assertion below pass vacuously.
  await this.call('activateTab', this.blankTabId, true);
  const focused = await this.call('focusTabContents', this.blankTabId);
  assert.ok(focused, 'could not focus the blank tabContents');
});

// Deliberately not "the island is closed" — runnable.steps.js already owns
// that text as a Then that only asserts, and Cucumber matches on text
// regardless of keyword. This one establishes the state and then asserts it.
Given('the island starts closed', async function () {
  await this.call('closeOverlay');
  const mode = await waitForValue(
    () => this.call('overlayRendererMode'),
    (m) => m == null,
    'the island to close',
  );
  // Asserted, not assumed: this precondition is what makes F37-2 meaningful.
  assert.strictEqual(mode, null, 'the island must be closed before typing');
});

When('I type {string} into the page', async function (key) {
  await this.call('typeIntoActivePage', key);
});

When('I click the island commands chip', async function () {
  await this.call('clickPillSlash');
});

Then('the island shows the typing prompt', async function () {
  const pill = await this.call('pillPlaceholderState');
  assert.ok(pill, 'the pill label was not found in the chrome document');
  assert.ok(pill.placeholder, 'the pill label is not in placeholder mode');
  assert.strictEqual(pill.text, 'Search or type URL');
  // What makes the prompt read as a field rather than a label is its motion:
  // a bright band washing through the glyphs, painted by a gradient clipped
  // to the text. Under reduced motion that is deliberately traded for a
  // stronger resting ink instead (styles.css). Assert whichever branch this
  // environment is actually in, so neither can be quietly deleted.
  if (pill.reducedMotion) {
    assert.strictEqual(pill.animation, 'none',
      'reduced motion must not animate the prompt');
    assert.strictEqual(pill.gradientPainted, false,
      'the reduced-motion prompt must paint real ink, not a clipped gradient');
  } else {
    assert.strictEqual(pill.animation, 'pill-placeholder-wash',
      'the prompt is not running the wash that signals a typing field');
    assert.strictEqual(pill.gradientPainted, true,
      'the wash must paint through the glyphs (text fill is transparent)');
  }
});

Then('the island shows the commands chip', async function () {
  const pill = await this.call('pillPlaceholderState');
  assert.strictEqual(pill.chipHidden, false, 'the commands chip is hidden');
  assert.strictEqual(pill.chipLabel, '/');
});

Then('the island opens with {string} already entered', async function (expected) {
  await waitForValue(
    () => this.call('overlayRendererMode'),
    (m) => m === 'panel',
    'the island to open',
  );
  const value = await waitForValue(
    () => this.call('overlayAddressValue'),
    (v) => v === expected,
    `the island input to contain ${JSON.stringify(expected)}`,
  );
  assert.strictEqual(value, expected);
});

Given('a single ordinary page is the only open tab', async function () {
  // Mahjong is an ordinary managed tab served locally, so the scenario needs
  // no network and the replacement is the only blank tab in the window.
  this.onlyTabId = await this.call('openTab', 'blanc://mahjong/');
  const state = await this.waitForState((s) => s.activeTabId === this.onlyTabId);
  for (const tab of state.tabs) {
    if (tab.id !== this.onlyTabId) await this.call('closeTab', tab.id);
  }
  await this.waitForState((s) => s.tabs.length === 1 && s.activeTabId === this.onlyTabId);
  // Start from page focus with the island closed, as after ordinary browsing,
  // so the assertion below cannot pass on focus left over from setup.
  await this.call('closeOverlay');
  await this.call('focusTabContents', this.onlyTabId);
});

When('I close the only tab', async function () {
  await this.call('closeTab', this.onlyTabId);
});

Then('a blank tab replaces it with the island address field focused', async function () {
  const state = await this.waitForState((s) => s.tabs.length === 1
    && s.activeTabId && s.activeTabId !== this.onlyTabId);
  const tab = state.tabs.find((t) => t.id === state.activeTabId);
  assert.ok(String(tab.url || '').startsWith('blanc://newtab'),
    `the replacement tab is not blank: ${tab.url}`);
  await waitForValue(
    () => this.call('overlayRendererMode'),
    (m) => m === 'panel',
    'the island to open on the replacement tab',
  );
  const focused = await waitForValue(
    () => this.call('overlayFocusedId'),
    (id) => id === 'addressInput',
    'the island address field to take keyboard focus',
  );
  assert.strictEqual(focused, 'addressInput');
});

// ---- #1505: New Tab switches to an unused new tab (F37-5..9) ----

const MAHJONG = 'blanc://mahjong/';
const PRIVATE_NEW_TAB = 'blanc://newtab/?private=1';

// Leaves exactly `keep` open (in that order of creation), so the startup tab
// can't be the unused new tab the shortcut finds.
async function keepOnly(world, keep) {
  const state = await world.waitForState((s) => keep.every((id) => s.tabs.some((t) => t.id === id)));
  for (const tab of state.tabs) {
    if (!keep.includes(tab.id)) await world.call('closeTab', tab.id);
  }
  return world.waitForState((s) => s.tabs.length === keep.length);
}

async function activateOrdinaryPage(world, keep) {
  world.pageTabId = await world.call('openTab', MAHJONG);
  const state = await keepOnly(world, [...keep, world.pageTabId]);
  await world.waitForState((s) => s.activeTabId === world.pageTabId
    && s.tabs.find((t) => t.id === world.pageTabId)?.loadedUrl?.startsWith(MAHJONG));
  await world.call('closeOverlay');
  world.tabCountBefore = state.tabs.length;
  world.tabIdsBefore = state.tabs.map((t) => t.id);
}

Given('an unused new tab and an ordinary page are open, with the page active', async function () {
  this.unusedTabId = await this.call('newTab');
  await activateOrdinaryPage(this, [this.unusedTabId]);
});

// Leaving a fresh new tab replaces its entry, so "used" is a tab that went to
// a page and then back to the start page: it shows the New Tab page again,
// with history behind it.
Given('a new tab that went to a page and came back, and an ordinary page active', async function () {
  this.usedTabId = await this.call('newTab');
  await this.call('navigateTab', this.usedTabId, MAHJONG);
  await this.waitForState((s) => s.tabs.find((t) => t.id === this.usedTabId)?.loadedUrl?.startsWith(MAHJONG));
  await this.call('navigateTab', this.usedTabId, 'blanc://newtab/');
  await this.waitForState((s) => {
    const tab = s.tabs.find((t) => t.id === this.usedTabId);
    return tab?.url === 'blanc://newtab/' && tab.canGoBack;
  });
  await activateOrdinaryPage(this, [this.usedTabId]);
});

Given('an unused new tab in a group, an unused pinned new tab, and an ordinary page active', async function () {
  const grouped = await this.call('newTab');
  await this.waitForState((s) => s.activeTabId === grouped);
  await this.call('groupActiveByName', 'Work');
  await this.waitForState((s) => s.tabs.find((t) => t.id === grouped)?.groupId);
  const pinned = await this.call('newTab');
  await this.call('pinTab', pinned);
  await this.waitForState((s) => s.tabs.find((t) => t.id === pinned)?.pinned);
  await activateOrdinaryPage(this, [grouped, pinned]);
});

Given('switching to an unused new tab is turned off', async function () {
  assert.strictEqual(await this.call('setReuseNewTab', false), false);
});

Given('an unused private new tab, an unused new tab and an ordinary page are open, with the page active', async function () {
  this.privateTabId = await this.call('openTab', PRIVATE_NEW_TAB, { private: true });
  this.unusedTabId = await this.call('newTab');
  await activateOrdinaryPage(this, [this.privateTabId, this.unusedTabId]);
});

When('I press the New Tab shortcut', async function () {
  assert.ok(await this.call('pressBrowserCommand', this.pageTabId, 'new-tab'));
});

When('I press the New Private Tab shortcut', async function () {
  assert.ok(await this.call('pressBrowserCommand', this.pageTabId, 'new-private-tab'));
});

Then('the unused new tab is active with the island address field focused', async function () {
  await this.waitForState((s) => s.activeTabId === this.unusedTabId);
  const focused = await waitForValue(
    () => this.call('overlayFocusedId'),
    (id) => id === 'addressInput',
    'the island address field to take keyboard focus',
  );
  assert.strictEqual(focused, 'addressInput');
});

Then('the unused private new tab is active', async function () {
  await this.waitForState((s) => s.activeTabId === this.privateTabId);
});

Then('no tab was opened', async function () {
  const state = await this.waitForState(() => true);
  assert.deepStrictEqual(state.tabs.map((t) => t.id).sort(), [...this.tabIdsBefore].sort());
});

Then('a new blank tab is opened and active', async function () {
  const state = await this.waitForState((s) => s.tabs.length === this.tabCountBefore + 1
    && !this.tabIdsBefore.includes(s.activeTabId));
  const tab = state.tabs.find((t) => t.id === state.activeTabId);
  assert.strictEqual(tab.url, 'blanc://newtab/');
});
