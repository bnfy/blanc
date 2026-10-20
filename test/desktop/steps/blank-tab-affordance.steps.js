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
  assert.strictEqual(pill.text, 'Search or type a URL');
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
