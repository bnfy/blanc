'use strict';
const assert = require('node:assert/strict');
const { Given, When, Then } = require('@cucumber/cucumber');
const { overlayPage, waitForPanelSettled } = require('../support/overlay');
const { chromePage } = require('../support/tab-drag');
const { waitForValue } = require('../support/poll');

Given('three pages for multi-tab selection', async function () {
  this.selectionPages = [];
  for (const name of ['selection-one', 'selection-two', 'selection-three']) {
    const id = await this.call('openTab', this.fixtureUrl(name)); this.selectionPages.push(id);
  }
  await this.waitForState(s => this.selectionPages.every(id => s.tabs.some(t => t.id === id && !t.isLoading)));
});
When('I select the first two rows in the {string} list', async function (surface) {
  this.selectionSurface = surface;
  let page, selector;
  if (surface === 'side') {
    await this.call('setTabLayout', 'vertical'); page = await chromePage(); selector = '.vertical-tab-primary';
  } else {
    await this.call('openPanel'); page = await waitForPanelSettled(); selector = '.row-primary';
  }
  for (const id of this.selectionPages.slice(0, 2)) {
    const target = surface === 'side' ? `${selector}[data-tab-id="${id}"]` : `[data-tab-id="${id}"] > ${selector}`;
    await page.locator(target).click({ modifiers: [process.platform === 'darwin' ? 'Meta' : 'Control'] });
  }
});
Then('all three pages are selected and the third remains current', async function () {
  const selected = await waitForValue(() => this.call('selectedTabIds'), ids => ids.length === 3, 'three selected tabs');
  assert.deepEqual(selected, this.selectionPages);
  assert.equal((await this.state()).activeTabId, this.selectionPages[2]);
  if (this.selectionSurface) {
    const page = this.selectionSurface === 'side' ? await chromePage() : await overlayPage();
    const selector = this.selectionSurface === 'side' ? '.vertical-tab-row.selected' : '#islandList .tab-row.selected';
    await waitForValue(() => page.locator(selector).count(), count => count === 3, 'three highlighted rows');
  }
});
When('I select all three pages through the selection model', async function () {
  await this.call('selectTabRows', this.selectionPages[0], 'toggle');
  await this.call('selectTabRows', this.selectionPages[1], 'toggle');
});
When('I run the batch action {string}', async function (action) {
  this.batchResult = await this.call('runSelectedTabsAction', `batch-${action}`);
});
Then('the selection is empty', async function () {
  await waitForValue(() => this.call('selectedTabIds'), ids => !ids.length, 'empty selection');
});
Then('all three selected pages are pinned', async function () {
  const st = await this.state(); assert.ok(this.selectionPages.every(id => st.tabs.find(t => t.id === id)?.pinned));
});
When('I press Escape in the selection list', async function () {
  const page = this.selectionSurface === 'side' ? await chromePage() : await overlayPage();
  await page.keyboard.press('Escape');
});
Then('the selection has not been saved to the session', async function () {
  const saved = JSON.stringify(await this.call('persistedSessionData'));
  assert.equal(saved.includes('selectedTabIds'), false); assert.equal(saved.includes('selectionAnchorId'), false);
});
Given('the first two selection pages form a split', async function () {
  assert.ok(await this.call('makeSplit', this.selectionPages[0], [this.selectionPages[1]]));
});
When('I select one pane of that split', async function () {
  await this.call('selectTabRows', this.selectionPages[0], 'toggle');
});
Then('closing and reopening the selection restores the split', async function () {
  assert.equal(await this.call('runSelectedTabsAction', 'batch-close'), true);
  await this.call('reopenClosed');
  const st = await this.waitForState(s => s.splits.length === 1);
  const urls = st.splits[0].tabIds.map(id => st.tabs.find(t => t.id === id)?.url);
  assert.deepEqual(urls, ['selection-one', 'selection-two'].map(name => this.fixtureUrl(name)));
  assert.equal(st.tabs.some(t => t.url === this.fixtureUrl('selection-three')), true);
});
When('I move the selected pages to space {string}', async function (name) {
  const data = await this.call('workspaceAction', 'list');
  this.selectionDestination = data.items.find(w => w.name === name).id;
  this.batchResult = await this.call('runSelectedTabsAction', 'batch-space-move', { workspaceId: this.selectionDestination });
});
Then('space {string} has all selected pages in order', async function (name) {
  assert.equal(this.batchResult.ok, true, JSON.stringify(this.batchResult));
  const resident = (await this.call('residentSpaces')).find(s => s.name === name);
  assert.deepEqual(resident.tabs.slice(-this.selectionPages.length).map(t => t.id), this.selectionPages);
  assert.ok(resident.tabs.slice(-this.selectionPages.length).every(t => t.live));
});
Then('the selected split is still whole in space {string}', async function (name) {
  assert.equal((await this.call('workspaceAction', 'open', this.selectionDestination)).ok, true);
  const st = await this.state(); assert.equal(st.splits.length, 1, name);
  assert.deepEqual(st.splits[0].tabIds, this.selectionPages.slice(0, 2));
});
Then('the failed batch move leaves all three pages selected here', async function () {
  assert.equal(this.batchResult.ok, false); assert.equal(this.batchResult.movedCount, 0);
  assert.deepEqual(await this.call('selectedTabIds'), this.selectionPages);
  const st = await this.state(); assert.ok(this.selectionPages.every(id => st.tabOrder.includes(id)));
});
Then('the partial batch move leaves two pages selected here', async function () {
  assert.equal(this.batchResult.error, 'moved-partly'); assert.equal(this.batchResult.movedCount, 1);
  assert.deepEqual(await this.call('selectedTabIds'), this.selectionPages.slice(1));
});
Then('every selection page survives the restart across both spaces', async function () {
  for (const name of ['selection-one', 'selection-two', 'selection-three']) {
    const url = this.fixtureUrl(name);
    const st = await this.state();
    const saved = await this.call('workspaceAction', 'saved-urls', this.selectionDestination);
    assert.ok(st.tabs.some(t => t.url === url) || saved.includes(url), `${name} recovered`);
  }
  assert.deepEqual(await this.call('selectedTabIds'), []);
});
Then('the batch window failure keeps every page in place', async function () {
  assert.equal(this.batchResult, false);
  const st = await this.state(); assert.ok(this.selectionPages.every(id => st.tabOrder.includes(id)));
  assert.deepEqual(await this.call('selectedTabIds'), this.selectionPages);
});

When('I extend the first row selection through the second row in the panel', async function () {
  await this.call('openPanel'); const page = await waitForPanelSettled();
  const first = page.locator(`[data-tab-id="${this.selectionPages[0]}"] > .row-primary`);
  await first.click({ modifiers: [process.platform === 'darwin' ? 'Meta' : 'Control'] });
  await page.locator(`[data-tab-id="${this.selectionPages[1]}"] > .row-primary`).click({ modifiers: ['Shift'] });
});
Then('the new window has the three pages in order', async function () {
  assert.equal(this.batchResult, true);
  const windows = await this.call('windowRuntimes');
  const target = windows.find(w => this.selectionPages.every(id => w.tabOrder.includes(id)));
  assert.ok(target); assert.deepEqual(target.tabOrder, this.selectionPages);
  assert.deepEqual(await this.call('straySplitIds'), []);
});
When('I create a new space for the selection named {string}', async function (name) {
  assert.equal(await this.call('runSelectedTabsAction', 'batch-space-new'), true);
  const page = await overlayPage(); await page.waitForSelector('#workspaceEditor', { state: 'visible' });
  assert.match(await page.locator('#workspaceEditor').innerText(), /With these tabs/);
  await page.fill('#workspaceName', name); await page.locator('#workspaceEditor button[type="submit"]').click();
  await this.waitForState(s => !this.selectionPages.some(id => s.tabOrder.includes(id)));
  this.batchResult = { ok: true };
});
When('I create a new group for the selection named {string}', async function (name) {
  assert.equal(await this.call('runSelectedTabsAction', 'batch-group-new'), true);
  const page = await overlayPage(); await page.fill('#addressInput', `/group ${name}`); await page.press('#addressInput', 'Enter');
});
Then('all three pages belong to the group {string}', async function (name) {
  const st = await this.waitForState(s => s.groups.some(g => g.name === name));
  const group = st.groups.find(g => g.name === name);
  assert.ok(this.selectionPages.every(id => st.tabs.find(t => t.id === id)?.groupId === group.id));
});

When('I extend selection down from the first focused row in the {string} list', async function (surface) {
  let page, selector;
  if (surface === 'side') { await this.call('setTabLayout', 'vertical'); page = await chromePage(); selector = `.vertical-tab-primary[data-tab-id="${this.selectionPages[0]}"]`; }
  else { await this.call('openPanel'); page = await waitForPanelSettled(); selector = `[data-tab-id="${this.selectionPages[0]}"] > .row-primary`; }
  await page.locator(selector).click({ modifiers: [process.platform === 'darwin' ? 'Meta' : 'Control'] });
  await page.keyboard.press('Shift+ArrowDown');
});
Then('only the current page remains selected after quieting the others', async function () {
  const selected = await this.call('selectedTabIds'); assert.deepEqual(selected, [this.selectionPages[2]]);
  const st = await this.state(); assert.ok(this.selectionPages.slice(0, 2).every(id => st.tabs.find(t => t.id === id)?.asleep));
});
Then('all selected pages are muted', async function () {
  const st = await this.state(); assert.ok(this.selectionPages.every(id => st.tabs.find(t => t.id === id)?.muted));
});

Given('the batch transfer will fail after one split pane', async function () {
  assert.equal((await this.call('workspaceAction', 'arm-move-fault', 'transfer-pane')).ok, true);
});
Then('the selected split is restored whole in this window', async function () {
  const st = await this.state(); assert.equal(st.splits.length, 1);
  assert.deepEqual(st.splits[0].tabIds, this.selectionPages.slice(0, 2));
  assert.deepEqual(await this.call('straySplitIds'), []);
});

When('I select only the split for the batch', async function () {
  this.selectionPages = this.selectionPages.slice(0, 2);
  await this.call('activateTab', this.selectionPages[0]);
  await this.call('selectTabRows', this.selectionPages[0], 'toggle');
});
