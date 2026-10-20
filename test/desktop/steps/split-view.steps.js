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
