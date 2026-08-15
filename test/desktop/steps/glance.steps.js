'use strict';

const assert = require('node:assert/strict');
const { Given, When, Then } = require('@cucumber/cucumber');
const { waitForValue } = require('../support/poll');

Given('two ordinary tabs in one workspace for Glance', async function () {
  this.glanceMainUrl = this.fixtureUrl('glance-main');
  this.glanceReferenceUrl = this.fixtureUrl('glance-reference');
  this.glanceMainId = await this.call('openTab', this.glanceMainUrl);
  this.glanceReferenceId = await this.call('openTab', this.glanceReferenceUrl);
  await this.call('activateTab', this.glanceMainId, false);
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

Then('the Glance picker waits for an explicit tab choice', async function () {
  await waitForValue(
    () => this.call('overlayMode'),
    (mode) => mode === 'panel',
    'Glance tab picker'
  );
  const state = await this.state();
  assert.equal(state.glanceTabId, null);
});

Then('the active page and Glance occupy separate dominant and reference panes', async function () {
  const state = await waitForValue(
    () => this.state(),
    (value) => value.glanceTabId === this.glanceReferenceId && value.glanceGeometry,
    'Glance geometry'
  );
  assert.equal(state.activeTabId, this.glanceMainId);
  assert.equal(state.glanceGeometry.direction, 'horizontal');
  assert.ok(state.glanceGeometry.primary.width > state.glanceGeometry.glance.width);
  assert.equal(
    state.glanceGeometry.primary.x + state.glanceGeometry.primary.width +
      state.glanceGeometry.divider.width,
    state.glanceGeometry.glance.x
  );
  this.glanceInitialPrimaryWidth = state.glanceGeometry.primary.width;
});

When('I promote the Glance pane', async function () {
  assert.equal(await this.call('promoteGlance'), true);
});

Then('the two visible tabs swap main and reference roles', async function () {
  const state = await this.state();
  assert.equal(state.activeTabId, this.glanceReferenceId);
  assert.equal(state.glanceTabId, this.glanceMainId);
});

When('I resize the Glance divider', async function () {
  const state = await this.state();
  const { page } = state.glanceGeometry;
  await this.call('resizeGlance', { x: page.x + (page.width - 8) * 0.62, y: page.y });
});

Then('the main pane remains larger than the reference pane', async function () {
  const state = await this.state();
  assert.ok(state.glanceGeometry.primary.width > state.glanceGeometry.glance.width);
  assert.ok(state.glanceGeometry.primary.width < this.glanceInitialPrimaryWidth);
});

When('I close Glance', async function () {
  const state = await this.state();
  this.glanceSplitWidth = state.glanceGeometry.primary.width;
  assert.equal(await this.call('closeGlance'), true);
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
