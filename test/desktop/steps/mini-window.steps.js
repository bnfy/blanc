'use strict';

// F61 Mini Window (#1138): src/main/mini-window.js and its wiring in main.

const assert = require('node:assert/strict');
const { When, Then } = require('@cucumber/cucumber');
const ctx = require('../support/context');
const { waitForValue } = require('../support/poll');

When('I open a mini window', async function () {
  const before = new Set((await this.call('windowRuntimes')).map((runtime) => runtime.id));
  const id = await this.call('openMiniWindow');
  assert.ok(id, 'a mini window opened');
  assert.ok(!before.has(id));
  this.miniWindowId = id;
  await waitForValue(() => this.call('miniWindowState', id), (state) => state?.mini === true, 'the mini window');
});

Then('the mini window is small and offers Open in Blanc on the Island', async function () {
  const state = await this.call('miniWindowState', this.miniWindowId);
  assert.ok(state.bounds.width <= 760 && state.bounds.width >= 640, `width ${state.bounds.width}`);
  assert.ok(state.bounds.height <= 600 && state.bounds.height >= 480, `height ${state.bounds.height}`);
  const chip = await waitForValue(() => this.call('miniWindowChip', this.miniWindowId),
    (value) => value?.visible === true, 'Open in Blanc on the Island');
  assert.equal(chip.miniAttribute, true);
  assert.equal(chip.spaceMarkShown, false, 'a mini window holds no Space');
});

Then('the saved session leaves the mini window out', async function () {
  await waitForValue(() => this.call('persistedSessionData'),
    (data) => Array.isArray(data?.windows) && data.windows.length > 0, 'a saved session');
  const data = await this.call('persistedSessionData');
  assert.equal(data.windows.some((entry) => entry.id === this.miniWindowId), false);
});

When('the mini window has gone unused for an hour', async function () {
  // The hour's check, run now. It waits while its new tab page is still
  // loading (a page in use), so ask until that has settled.
  await waitForValue(() => this.call('expireMiniWindow', this.miniWindowId), (result) => result === 'closed',
    'the unused mini window to close');
});

Then('the mini window has closed', async function () {
  await waitForValue(() => this.call('windowRuntimes'),
    (all) => !all.some((runtime) => runtime.id === this.miniWindowId && runtime.attached), 'the mini window closed');
});

When("I close the mini window's only tab", async function () {
  const runtime = (await this.call('windowRuntimes')).find((candidate) => candidate.id === this.miniWindowId);
  assert.equal(runtime.tabs.length, 1, 'a mini window opens with one tab');
  // ⌘W and the Island's close button both close the active tab this way.
  assert.equal(await this.call('closeTabInWindow', this.miniWindowId, runtime.tabs[0].id), true);
});

When('I click Open in Blanc in the mini window', async function () {
  await waitForValue(() => this.call('miniWindowChip', this.miniWindowId), (value) => value?.visible === true, 'Open in Blanc');
  assert.equal(await this.call('miniWindowChip', this.miniWindowId, { click: true }).then((value) => value.clicked), true);
});

Then('the mini window is now an ordinary window the session saves', async function () {
  const state = await waitForValue(() => this.call('miniWindowState', this.miniWindowId),
    (value) => value?.mini === false, 'an ordinary window');
  assert.ok(state.bounds.width > 760, `width ${state.bounds.width}`);
  await waitForValue(() => this.call('miniWindowChip', this.miniWindowId), (value) => value?.visible === false, 'the chip gone');
  await waitForValue(() => this.call('persistedSessionData'),
    (data) => (data?.windows ?? []).some((entry) => entry.id === this.miniWindowId), 'the window saved');
});

When('another app opens a fixture page while the mini window is focused', async function () {
  this.deliveredUrl = this.fixtureUrl('mini-window-link');
  await this.call('focusWindowRuntime', this.miniWindowId);
  await ctx.app.evaluate(({ app }, link) => app.emit('open-url', { preventDefault() {} }, link), this.deliveredUrl);
});

Then('the link opens in an ordinary window, not the mini window', async function () {
  const runtimes = await waitForValue(() => this.call('windowRuntimes'),
    (all) => all.some((runtime) => runtime.tabs.some((tab) => tab.url === this.deliveredUrl)), 'the delivered link');
  const receiver = runtimes.find((runtime) => runtime.tabs.some((tab) => tab.url === this.deliveredUrl));
  assert.notEqual(receiver.id, this.miniWindowId);
  assert.equal(receiver.mini, false);
});

Then('the mini window shortcut is off', async function () {
  assert.deepEqual(await this.call('setMiniWindowShortcut', null), { saved: 'off', status: 'off' });
});

When('I choose a mini window shortcut', async function () {
  this.miniShortcut = await this.call('setMiniWindowShortcut', process.platform === 'darwin' ? 'alt-cmd-n' : 'ctrl-shift-space');
});

Then('the shortcut is either working or reported as unavailable', function () {
  assert.equal(this.miniShortcut.saved, process.platform === 'darwin' ? 'alt-cmd-n' : 'ctrl-shift-space');
  assert.ok(['on', 'unavailable'].includes(this.miniShortcut.status), this.miniShortcut.status);
});

When('I turn the mini window shortcut off', async function () {
  assert.deepEqual(await this.call('setMiniWindowShortcut', 'off'), { saved: 'off', status: 'off' });
});
