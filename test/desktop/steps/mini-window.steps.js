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

// Move to Space (#1734): the mini window's own Spaces button and menu.
const { Given } = require('@cucumber/cucumber');

async function openMiniSpacesMenu(world) {
  await waitForValue(() => world.call('miniWindowSpaces', world.miniWindowId), (value) => value?.enabled === true, 'the Spaces button usable');
  assert.equal((await world.call('miniWindowSpaces', world.miniWindowId, { click: true })).clicked, true);
  await waitForValue(() => world.call('miniWindowOverlay', world.miniWindowId,
    "document.querySelector('#workspaceSwitcher')?.dataset.view === 'list' && document.querySelector('.ws-profile-heading')?.textContent"),
  (heading) => heading === 'Move this window to…', 'the Spaces menu in move mode');
}

Given('a saved space named {string} that is open in no window', async function (name) {
  const other = await this.call('openNewWindow');
  const saved = await this.call('workspaceActionInWindow', other, 'save', name);
  assert.equal(saved.ok, true);
  await this.call('closeWindowRuntime', other);
  this.savedSpaceId = saved.workspace.id;
});

When('I open a fixture page in the mini window', async function () {
  this.miniPageUrl = this.fixtureUrl('mini-window-link');
  this.miniPageId = await this.call('openTabInWindow', this.miniWindowId, this.miniPageUrl);
  assert.ok(this.miniPageId);
});

When('I open a private tab in the mini window', async function () {
  this.miniPrivateId = await this.call('openTabInWindow', this.miniWindowId, 'blanc://newtab/?private=1', { private: true });
  assert.ok(this.miniPrivateId);
});

Then("the mini window's Spaces button can't be used", async function () {
  const button = await waitForValue(() => this.call('miniWindowSpaces', this.miniWindowId),
    (value) => value?.visible === true && value.enabled === false, 'the Spaces button disabled');
  assert.equal(button.enabled, false);
  // Main refuses too, whatever the button shows: nothing moves, the window stays.
  const result = await this.call('miniWindowOverlay', this.miniWindowId,
    `window.browserAPI.openWorkspace(${JSON.stringify(this.savedSpaceId ?? 'none')}, {})`);
  assert.equal(result?.ok, false);
  const runtime = (await this.call('windowRuntimes')).find((candidate) => candidate.id === this.miniWindowId);
  assert.equal(runtime?.attached, true);
});

When('I close that private tab and open a fixture page in the mini window', async function () {
  assert.equal(await this.call('closeTabInWindow', this.miniWindowId, this.miniPrivateId), true);
  this.miniPageUrl = this.fixtureUrl('mini-window-link');
  this.miniPageId = await this.call('openTabInWindow', this.miniWindowId, this.miniPageUrl);
});

When("I choose {string} from the mini window's Spaces button", async function (name) {
  this.windowCountBeforeMove = (await this.call('windowRuntimes')).filter((runtime) => runtime.attached && !runtime.resident).length;
  await openMiniSpacesMenu(this);
  const clicked = await this.call('miniWindowOverlay', this.miniWindowId, `(() => {
    const row = [...document.querySelectorAll('.ws-row-main')].find((node) => node.querySelector('.ws-row-name')?.textContent === ${JSON.stringify(name)});
    if (row) row.click();
    return !!row;
  })()`);
  assert.equal(clicked, true, `a ${name} row`);
});

When("I create the space {string} from the mini window's Spaces button", async function (name) {
  await openMiniSpacesMenu(this);
  await this.call('miniWindowOverlay', this.miniWindowId, `document.querySelector('[data-focus-key="new"]').click()`);
  await waitForValue(() => this.call('miniWindowOverlay', this.miniWindowId, "!!document.getElementById('workspaceEditor')"), (open) => open === true, 'the editor');
  const editor = await this.call('miniWindowOverlay', this.miniWindowId, `(() => ({
    text: document.getElementById('workspaceEditor').innerText,
    profile: !!document.getElementById('workspaceProfile'),
    start: !!document.querySelector('.ws-segmented'),
  }))()`);
  assert.match(editor.text, /With these tabs/);
  assert.equal(editor.profile, false, 'no Profile choice');
  assert.equal(editor.start, false, 'the start is fixed');
  await this.call('miniWindowOverlay', this.miniWindowId, `(() => {
    const input = document.getElementById('workspaceName');
    input.value = ${JSON.stringify(name)};
    input.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('workspaceEditor').requestSubmit();
  })()`);
});

Then('a window shows {string} with that fixture page last', async function (name) {
  const runtimes = await waitForValue(async () => {
    const list = await this.call('workspaceAction', 'list');
    const space = list.items.find((w) => w.name === name);
    const all = await this.call('windowRuntimes');
    return space && all.find((runtime) => runtime.workspaceId === space.id && runtime.attached && !runtime.resident) ? all : null;
  }, Boolean, `a window showing ${name}`);
  const list = await this.call('workspaceAction', 'list');
  const space = list.items.find((w) => w.name === name);
  const shown = runtimes.find((runtime) => runtime.workspaceId === space.id && runtime.attached && !runtime.resident);
  assert.equal(shown.mini, false);
  assert.equal(shown.tabs.at(-1)?.url, this.miniPageUrl, JSON.stringify(shown.tabs.map((tab) => tab.url)));
  assert.equal(shown.tabs.filter((tab) => tab.url === this.miniPageUrl).length, 1);
  assert.ok(!shown.tabs.some((tab) => tab.private), 'no private page reached the Space');
});

Given('a saved space named {string} shown in another window', async function (name) {
  const other = await this.call('openNewWindow');
  const saved = await this.call('workspaceActionInWindow', other, 'save', name);
  assert.equal(saved.ok, true);
  this.spaceWindowId = other;
});

Then('that other window shows {string} with that fixture page last, and no new window opened', async function (name) {
  const before = this.windowCountBeforeMove;
  const shown = await waitForValue(async () => (await this.call('windowRuntimes')).find((runtime) => runtime.id === this.spaceWindowId),
    (runtime) => runtime?.tabs.at(-1)?.url === this.miniPageUrl, `${name}'s window with the page`);
  const list = await this.call('workspaceAction', 'list');
  assert.equal(shown.workspaceId, list.items.find((w) => w.name === name)?.id);
  const attached = (await this.call('windowRuntimes')).filter((runtime) => runtime.attached && !runtime.resident);
  assert.equal(attached.length, before - 1, 'only the mini window went away');
});
