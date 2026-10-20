'use strict';
const assert = require('node:assert/strict');
const { Given, When, Then } = require('@cucumber/cucumber');
const { waitForValue } = require('../support/poll');

// F53 — Split View. Splits are made, shown and changed through the real
// main-process paths; the hooks only start them and read state back.

async function openLoaded(world, name, opts) {
  const id = await world.call('openTab', world.fixtureUrl(name), opts ?? {});
  await world.waitForState((state) => {
    const tab = state.tabs.find((t) => t.id === id);
    return tab && !tab.loading && tab.loadedUrl.includes(`/site/${encodeURIComponent(name)}`);
  });
  return id;
}

const loadCount = async (world, tabId) => {
  try {
    return await world.call('workspacePageScript', tabId, "Number(sessionStorage.getItem('acceptance-load-count'))");
  } catch {
    return null;
  }
};

async function splitOf(world) {
  const state = await world.state();
  return state.splits.find((s) => s.tabIds.includes(world.splitA)) ?? null;
}

Given('two loaded tabs made into a split', async function () {
  this.splitA = await openLoaded(this, 'split-a');
  this.splitB = await openLoaded(this, 'split-b');
  const made = await this.call('makeSplit', this.splitA, [this.splitB]);
  assert.ok(made, 'the split was made');
  await this.call('activateTab', this.splitA);
  await this.waitForState((state) => state.activeTabId === this.splitA
    && state.splits.some((s) => s.tabIds.join() === [this.splitA, this.splitB].join()));
});

Given('another ordinary tab', async function () {
  this.ordinaryId = await openLoaded(this, 'split-other');
  await this.call('activateTab', this.splitA);
  await this.waitForState((state) => state.activeTabId === this.splitA);
});

Then('both tabs are shown side by side with a header band each', async function () {
  const layout = await waitForValue(() => this.call('splitLayout'), (l) => l?.panes?.length === 2, 'a split layout');
  assert.equal(layout.mode, 'columns');
  assert.deepEqual(layout.panes.map((p) => p.tabId), [this.splitA, this.splitB]);
  const attached = await this.call('attachedTabViewIds');
  assert.ok(attached.includes(this.splitA) && attached.includes(this.splitB), `both views attached: ${attached}`);
  const state = await this.state();
  for (const pane of layout.panes) {
    assert.equal(pane.header.height, 30);
    const bounds = state.tabs.find((t) => t.id === pane.tabId).bounds;
    assert.deepEqual(bounds, pane.content, 'the page view fills the pane below its header band');
  }
  assert.ok(layout.panes[1].header.x > layout.panes[0].header.x + layout.panes[0].header.width, 'side by side');
});

// As a click does, focus moves from the first pane to the second (a page
// that already holds focus fires no focus event). As Glance's steps do, keep
// fronting the window and focusing until main makes the pane active.
When('I focus the second pane', async function () {
  await waitForValue(async () => {
    await this.call('focusWindow');
    await this.call('focusPane', this.splitA);
    return this.call('focusedWebContentsId');
  }, (id) => id != null, 'the first pane to hold focus', 4000);
  await waitForValue(async () => {
    await this.call('focusWindow');
    assert.equal(await this.call('focusPane', this.splitB), true);
    return (await this.state()).activeTabId;
  }, (active) => active === this.splitB, 'the second pane to become the active tab', 8000);
});

Then('the second pane is the active tab and both panes stay shown', async function () {
  const attached = await this.call('attachedTabViewIds');
  assert.ok(attached.includes(this.splitA) && attached.includes(this.splitB), `both views attached: ${attached}`);
  const split = await splitOf(this);
  assert.equal(split.focusedIndex, 1);
  const layout = await this.call('splitLayout');
  assert.deepEqual(layout.panes.map((p) => p.focused), [false, true]);
});

Then('reloading reloads only the second pane', async function () {
  const before = { a: await loadCount(this, this.splitA), b: await loadCount(this, this.splitB) };
  assert.equal(await this.call('pressBrowserCommand', this.splitB, 'reload'), true);
  await waitForValue(() => loadCount(this, this.splitB), (n) => n === before.b + 1, 'the second pane reloaded');
  assert.equal(await loadCount(this, this.splitA), before.a, 'the first pane did not reload');
});

When('I select the ordinary tab', async function () {
  await this.call('activateTab', this.ordinaryId);
  await this.waitForState((state) => state.activeTabId === this.ordinaryId);
});

Then('only the ordinary tab is shown', async function () {
  const attached = await waitForValue(() => this.call('attachedTabViewIds'),
    (ids) => !ids.includes(this.splitA) && !ids.includes(this.splitB), 'both split panes detached');
  assert.ok(attached.includes(this.ordinaryId));
  assert.equal(await this.call('splitLayout'), null);
});

When("I select the split's second tab", async function () {
  await this.call('activateTab', this.splitB);
  await this.waitForState((state) => state.activeTabId === this.splitB);
});

Then('both split tabs are shown and the second pane is focused', async function () {
  const attached = await this.call('attachedTabViewIds');
  assert.ok(attached.includes(this.splitA) && attached.includes(this.splitB), `both views attached: ${attached}`);
  assert.ok(!attached.includes(this.ordinaryId), 'the ordinary tab is hidden');
  const layout = await waitForValue(() => this.call('splitLayout'), (l) => l?.panes?.length === 2, 'a split layout');
  assert.deepEqual(layout.panes.map((p) => p.tabId), [this.splitA, this.splitB], 'saved pane order');
  assert.deepEqual(layout.panes.map((p) => p.focused), [false, true]);
});

When('every background tab is asked to go quiet', async function () {
  this.quietResult = await this.call('sleepBackgroundTabsNow');
});

Then('neither split pane is quiet', async function () {
  const state = await this.state();
  for (const id of [this.splitA, this.splitB]) {
    assert.equal(state.tabs.find((t) => t.id === id).asleep, false, `${id} stayed awake`);
  }
});

Then('Glance cannot open while the split shows', async function () {
  const other = await openLoaded(this, 'split-glance');
  await this.call('activateTab', this.splitA);
  await this.waitForState((state) => state.activeTabId === this.splitA);
  await this.call('setGlance', other);
  const state = await this.state();
  assert.equal(state.glanceTabId, null);
});

// ---- Making, leaving and closing (F53-5 … F53-10) ----

const splitTabsOf = async (world) => {
  const state = await world.state();
  return state.splits.map((s) => s.tabIds);
};

Given('a main page in group {string} and a Glance reference in group {string}', async function (mainGroup, refGroup) {
  this.splitA = await openLoaded(this, 'split-main');
  await this.call('groupTabByName', this.splitA, mainGroup);
  this.splitB = await openLoaded(this, 'split-reference');
  await this.call('groupTabByName', this.splitB, refGroup);
  await this.call('activateTab', this.splitA);
  await this.waitForState((state) => state.activeTabId === this.splitA);
  assert.equal(await this.call('setGlance', this.splitB), true);
  await this.waitForState((state) => state.glanceTabId === this.splitB);
});

When('I keep the Glance as a split', async function () {
  assert.ok(await this.call('keepGlanceAsSplit'), 'Keep as split made a split');
});

Then('the two tabs form a split in group {string} and Glance is closed', async function (groupName) {
  const state = await this.waitForState((s) => s.splits.length === 1);
  assert.deepEqual(state.splits[0].tabIds, [this.splitA, this.splitB]);
  assert.equal(state.glanceTabId, null);
  const group = state.groups.find((g) => g.name === groupName);
  assert.ok(group, `group ${groupName} still exists`);
  for (const id of [this.splitA, this.splitB]) {
    assert.equal(state.tabs.find((t) => t.id === id).groupId, group.id);
  }
  assert.equal(state.groups.some((g) => g.name === 'Read'), false, 'the emptied group is gone');
});

Given('two loaded ungrouped tabs', async function () {
  this.splitA = await openLoaded(this, 'split-a');
  this.splitB = await openLoaded(this, 'split-b');
  await this.call('activateTab', this.splitA);
  await this.waitForState((state) => state.activeTabId === this.splitA);
});

When('I split the first tab with the second from the tab menu', async function () {
  await this.call('runTabMenuItem', this.splitA, 'split-with-tab', { otherTabId: this.splitB });
});

Then('the two tabs form a split led by the first tab', async function () {
  await this.waitForState((s) => s.splits.length === 1);
  assert.deepEqual(await splitTabsOf(this), [[this.splitA, this.splitB]]);
});

When('I remove the first pane from the split', async function () {
  await this.call('runTabMenuItem', this.splitA, 'remove-from-split');
});

Then('there is no split and the removed tab sits directly below the other', async function () {
  const state = await this.waitForState((s) => s.splits.length === 0);
  assert.equal(state.tabOrder.indexOf(this.splitA), state.tabOrder.indexOf(this.splitB) + 1);
  for (const id of [this.splitA, this.splitB]) assert.equal(state.tabs.find((t) => t.id === id).splitId, null);
});

When("I close the focused pane's tab", async function () {
  const state = await this.state();
  assert.equal(state.activeTabId, this.splitA);
  await this.call('closeTab', this.splitA);
});

Then('there is no split and the other tab is the active full-window tab', async function () {
  const state = await this.waitForState((s) => s.splits.length === 0 && s.activeTabId === this.splitB);
  const layout = await this.call('splitLayout');
  assert.equal(layout, null);
  const other = state.tabs.find((t) => t.id === this.splitB);
  const ordinary = state.tabs.find((t) => t.id !== this.splitB && t.bounds);
  assert.equal(other.bounds.y, ordinary?.bounds?.y ?? other.bounds.y);
  assert.ok(other.bounds.width >= 1000, `the survivor fills the window: ${JSON.stringify(other.bounds)}`);
});

Given('the second split tab has gone quiet', async function () {
  await this.call('activateTab', this.splitA);
  // A visible pane never goes quiet: hide the split, quiet the tab, return.
  const other = await openLoaded(this, 'split-away');
  await this.call('activateTab', other);
  await this.waitForState((state) => state.activeTabId === other);
  assert.equal(await this.call('sleepTab', this.splitB), true);
  await this.waitForState((state) => state.tabs.find((t) => t.id === this.splitB)?.asleep);
});

When('I close the split', async function () {
  await this.call('runTabMenuItem', this.splitA, 'close-split');
});

Then('Recently closed holds one split entry', async function () {
  const state = await this.waitForState((s) => !s.tabs.some((t) => t.id === this.splitA || t.id === this.splitB));
  assert.equal(state.splits.length, 0);
  const entries = await this.call('closedEntrySummaries');
  assert.equal(entries[0].tabCount, 2);
  assert.equal(entries[0].title, 'split-a + split-b');
});

When('I reopen that entry', async function () {
  await this.call('reopenClosed');
});

Then('the two tabs form a split again in the same order', async function () {
  const state = await this.waitForState((s) => s.splits.length === 1 && s.splits[0].tabIds.length === 2);
  const urls = state.splits[0].tabIds.map((id) => state.tabs.find((t) => t.id === id).url);
  assert.match(urls[0], /\/site\/split-a/);
  assert.match(urls[1], /\/site\/split-b/);
});

When('I pin the first split tab', async function () {
  await this.call('runTabMenuItem', this.splitA, 'toggle-pin');
});

Then('there is no split and the first tab is pinned', async function () {
  const state = await this.waitForState((s) => s.splits.length === 0);
  assert.equal(state.tabs.find((t) => t.id === this.splitA).pinned, true);
});

// ---- Pane headers and the divider (F53-11) ----
const { chromePage } = require('../support/tab-drag');

Then('each pane header names its tab', async function () {
  const page = await chromePage();
  const headers = await waitForValue(() => page.evaluate(() => [...document.querySelectorAll('.split-pane-header')]
    .filter((el) => !el.hidden)
    .map((el) => ({ tabId: el.dataset.tabId, title: el.querySelector('.split-pane-title')?.textContent, label: el.getAttribute('aria-label') }))),
  (list) => list.length === 2 && list.every((h) => h.title), 'two named pane headers');
  assert.deepEqual(headers.map((h) => h.tabId), [this.splitA, this.splitB]);
  assert.deepEqual(headers.map((h) => h.title), ['split-a', 'split-b']);
  assert.equal(headers[0].label, 'split-a, pane 1 of 2');
});

When('I move the split divider with the keyboard', async function () {
  const page = await chromePage();
  this.widthsBefore = (await splitOf(this)).layout.widths;
  await page.locator('.split-divider').first().focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
});

Then('the saved column widths change', async function () {
  const split = await waitForValue(() => splitOf(this),
    (s) => s && s.layout.widths[0] > this.widthsBefore[0], 'the first column to grow');
  assert.ok(Math.abs(split.layout.widths.reduce((a, b) => a + b, 0) - 1) < 1e-6);
});

When('I reset the split divider', async function () {
  const page = await chromePage();
  await page.locator('.split-divider').first().focus();
  await page.keyboard.press('Enter');
});

Then('the column widths are equal again', async function () {
  await waitForValue(() => splitOf(this), (s) => s && Math.abs(s.layout.widths[0] - 0.5) < 1e-6, 'equal widths');
});

When("I press Remove from Split in the first pane's header", async function () {
  const page = await chromePage();
  await page.locator(`.split-pane-header[data-tab-id="${this.splitA}"] .split-pane-remove`).click();
});

Then('there is no split', async function () {
  await this.waitForState((s) => s.splits.length === 0);
  assert.equal(await this.call('splitLayout'), null);
});
