'use strict';

const assert = require('node:assert/strict');
const { When, Then } = require('@cucumber/cucumber');
const { waitForValue } = require('../support/poll');

When('I open Glance', async function () {
  this.preGlance = await this.call('state');
  assert.equal(await this.call('openGlance'), true);
});

Then('the browser shows an active tab and Glance side by side', async function () {
  const state = await waitForValue(
    () => this.call('state'),
    (current) => !!current.glanceTabId,
    'the Glance tab to attach',
  );
  this.glanceTabId = state.glanceTabId;
  this.activeBeforeGlance = state.activeTabId;
  const glance = state.tabs.find((tab) => tab.id === this.glanceTabId);
  const active = state.tabs.find((tab) => tab.id === state.activeTabId);
  assert.notEqual(glance.id, active.id);
  assert.equal(active.bounds.width + glance.bounds.width, 1279);
  assert.equal(active.bounds.y, glance.bounds.y);
  assert.equal(active.bounds.height, glance.bounds.height);
});

When('I activate the Glance tab', async function () {
  await this.call('activateTab', this.glanceTabId, false);
});

Then('the Glance and active tabs swap roles', async function () {
  const state = await waitForValue(
    () => this.call('state'),
    (current) => current.activeTabId === this.glanceTabId && current.glanceTabId === this.activeBeforeGlance,
    'the Glance tab to become active',
  );
  assert.equal(state.activeTabId, this.glanceTabId);
  assert.equal(state.glanceTabId, this.activeBeforeGlance);
});

When('I close Glance', async function () {
  assert.equal(await this.call('closeGlance'), true);
});

Then('the active tab fills the browser page', async function () {
  const state = await waitForValue(
    () => this.call('state'),
    (current) => !current.glanceTabId,
    'Glance to close',
  );
  const active = state.tabs.find((tab) => tab.id === state.activeTabId);
  assert.deepEqual(active.bounds, { x: 0, y: 64, width: 1280, height: 736 });
});
