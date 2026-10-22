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

Then('both tabs are shown side by side, each in its own card', async function () {
  const layout = await waitForValue(() => this.call('splitLayout'), (l) => l?.panes?.length === 2, 'a split layout');
  assert.equal(layout.mode, 'columns');
  assert.deepEqual(layout.panes.map((p) => p.tabId), [this.splitA, this.splitB]);
  const attached = await this.call('attachedTabViewIds');
  assert.ok(attached.includes(this.splitA) && attached.includes(this.splitB), `both views attached: ${attached}`);
  const state = await this.state();
  for (const pane of layout.panes) {
    const bounds = state.tabs.find((t) => t.id === pane.tabId).bounds;
    assert.deepEqual(bounds, pane.content, 'the page view fills its card inside the border');
    assert.deepEqual(pane.content, { x: pane.frame.x + 1, y: pane.frame.y + 1, width: pane.frame.width - 2, height: pane.frame.height - 2 });
  }
  assert.ok(layout.panes[1].frame.x > layout.panes[0].frame.x + layout.panes[0].frame.width, 'side by side');
  const page = await chromePage();
  const cards = await waitForValue(() => page.evaluate(() => [...document.querySelectorAll('.split-pane-frame')]
    .filter((el) => !el.hidden).map((el) => ({ tabId: el.dataset.tabId, focused: el.classList.contains('focused') }))),
  (list) => list.length === 2, 'two drawn cards');
  assert.deepEqual(cards, [{ tabId: this.splitA, focused: true }, { tabId: this.splitB, focused: false }]);
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

// A floating Glance has no ratio to carry over: a fresh 50/50 split.
Then('the split opens at equal widths', async function () {
  const state = await this.waitForState((s) => s.splits.length === 1);
  assert.deepEqual(state.splits[0].layout.widths, [0.5, 0.5]);
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
  await waitForValue(() => splitUrlsNow(this), isTheSplit, 'the split, in order', 15000);
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

const cornerOf = (list, tabId) => list.find((c) => c.tabId === tabId);
const cornersShown = (world) => waitForValue(() => world.call('splitCornerTabs'),
  (list) => [world.splitA, world.splitB].every((id) => cornerOf(list, id)?.shown && cornerOf(list, id).width > 0),
  'a corner tab on both panes');

Then("the other pane's corner tab names its site and the focused one shows only its ×", async function () {
  const list = await cornersShown(this);
  const host = new URL(this.fixtureUrl('split-b')).host;
  const [a, b] = [cornerOf(list, this.splitA), cornerOf(list, this.splitB)];
  assert.equal(a.focused, true);
  assert.equal(b.focused, false);
  assert.equal(b.site, host);
  assert.ok(b.width > a.width, 'the unfocused tab is wider: it carries the site');
  const layout = await this.call('splitLayout');
  const frame = layout.panes[1].frame;
  assert.equal(b.bounds.x + b.bounds.width, frame.x + frame.width, 'on the card\'s right edge');
  assert.equal(b.bounds.y + b.bounds.height, frame.y + frame.height, 'on the card\'s bottom edge');
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

async function dividerCenter(page) {
  const box = await page.locator('.split-divider').first().boundingBox();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

When('I drag the split divider and let go', async function () {
  const page = await chromePage();
  const before = (await splitOf(this)).layout.widths;
  const start = await dividerCenter(page);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 80, start.y, { steps: 8 });
  await page.mouse.up();
  // The divider follows the whole drag, not just its first step.
  const page80 = 80 / (await page.evaluate(() => window.innerWidth));
  await waitForValue(() => splitOf(this), (s) => s && s.layout.widths[0] > before[0] + page80 * 0.75, 'the first column to grow by most of the drag');
});

Then("hovering over the split divider doesn't move it", async function () {
  const page = await chromePage();
  const before = (await splitOf(this)).layout.widths;
  const at = await dividerCenter(page);
  // Small steps keep the pointer on the 12 px divider the whole way.
  for (let i = 0; i <= 8; i++) await page.mouse.move(at.x - i * 3, at.y);
  await new Promise((resolve) => setTimeout(resolve, 600));
  assert.deepEqual((await splitOf(this)).layout.widths, before);
});

When("I press the × on the first pane's corner tab", async function () {
  await cornersShown(this);
  assert.ok(await this.call('clickSplitCorner', this.splitA, 'close'));
});

When("I click the second pane's corner tab", async function () {
  await cornersShown(this);
  assert.ok(await this.call('clickSplitCorner', this.splitB, 'tab'));
});

Then('the second split tab is the active tab and both stay shown', async function () {
  await this.waitForState((s) => s.activeTabId === this.splitB);
  const attached = await this.call('attachedTabViewIds');
  assert.ok(attached.includes(this.splitA) && attached.includes(this.splitB), `both views attached: ${attached}`);
  await waitForValue(() => this.call('splitCornerTabs'),
    (list) => cornerOf(list, this.splitB)?.focused === true && cornerOf(list, this.splitA)?.focused === false, 'focus to move to the second corner tab');
});

Then('there is no split', async function () {
  await this.waitForState((s) => s.splits.length === 0);
  assert.equal(await this.call('splitLayout'), null);
});

// ---- One row in the panel and the rail (F53-13) ----
const { openOverlaySurface } = require('../support/poll');
const { overlayPage } = require('../support/overlay');

When('I open the tab panel', async function () {
  await openOverlaySurface(this, 'openPanel', 'panel');
});

Then('the panel shows the split as one row named {string}', async function (label) {
  const page = await overlayPage();
  const rows = await waitForValue(() => page.evaluate(() => [...document.querySelectorAll('.split-row')]
    .map((row) => ({ label: row.querySelector('.split-row-title')?.textContent, name: row.getAttribute('aria-label') }))),
  (list) => list.length === 1, 'one split row');
  assert.equal(rows[0].label, label);
  assert.equal(rows[0].name, `Split: ${label}`);
  const looseSplitTabs = await page.evaluate((ids) => ids.filter((id) => document.querySelector(`.tab-row[data-tab-id="${id}"]:not(.in-split)`)).length, [this.splitA, this.splitB]);
  assert.equal(looseSplitTabs, 0, 'its tabs are not listed as separate rows');
});

When("I choose the split's row", async function () {
  const page = await overlayPage();
  await page.locator('.split-row .split-row-primary').click();
  await this.waitForState((state) => [this.splitA, this.splitB].includes(state.activeTabId));
});

Then('both split tabs are shown and the first pane is focused', async function () {
  const layout = await waitForValue(() => this.call('splitLayout'), (l) => l?.panes?.length === 2, 'a split layout');
  assert.deepEqual(layout.panes.map((p) => p.focused), [true, false]);
});

When("I open the tab panel and show the split's tabs", async function () {
  await openOverlaySurface(this, 'openPanel', 'panel');
  const page = await overlayPage();
  await page.locator('.split-row .split-row-disclosure').click();
});

Then("the panel lists both split tabs under the split's row", async function () {
  const page = await overlayPage();
  const ids = await waitForValue(() => page.evaluate(() => [...document.querySelectorAll('.tab-row.in-split')].map((r) => r.dataset.tabId)),
    (list) => list.length === 2, 'two split tab rows');
  assert.deepEqual(ids, [this.splitA, this.splitB]);
  assert.equal(await page.locator('.split-row .split-row-disclosure').getAttribute('aria-expanded'), 'true');
});

When('I show the tabs in the side list', async function () {
  await this.call('closeOverlay');
  await this.call('setTabLayout', 'vertical');
});

Then('the side list shows the split as one row', async function () {
  const page = await chromePage();
  const rows = await waitForValue(() => page.evaluate(() => [...document.querySelectorAll('.vertical-split-row')]
    .map((row) => row.getAttribute('aria-label'))), (list) => list.length === 1, 'one split row in the side list');
  assert.equal(rows[0], 'Split: split-a + split-b');
  await this.call('setTabLayout', 'horizontal');
});

// ---- Persistence (F53-12) ----
const ctx = require('../support/context');

async function splitUrlsNow(world) {
  const state = await world.state();
  return state.splits.map((s) => s.tabIds.map((id) => state.tabs.find((t) => t.id === id)?.url ?? ''));
}
const isTheSplit = (urls) => urls.length === 1 && urls[0].length === 2
  && /\/site\/split-a/.test(urls[0][0]) && /\/site\/split-b/.test(urls[0][1]);

When('Blanc relaunches', async function () {
  await waitForValue(() => this.call('persistedSessionData'),
    (session) => (session.windows ?? []).some((w) => Array.isArray(w.splits) && w.splits.length === 1),
    'the split to reach session.json');
  await ctx.relaunch();
  await waitForValue(() => splitUrlsNow(this), isTheSplit, 'the split to be restored', 15000);
});

When('I save this window as a Space, switch away and come back', async function () {
  // A Space switch is refused while a page in the window is still waking or
  // loading; after a relaunch the split's second pane wakes as it is shown.
  await this.waitForState((state) => state.tabs.every((t) => !t.isLoading && !t.loading)
    && state.splits.every((sp) => sp.tabIds.every((id) => !state.tabs.find((t) => t.id === id)?.asleep)));
  const saved = await this.call('workspaceAction', 'save', 'Split space');
  assert.equal(saved.ok, true, JSON.stringify(saved));
  // The waking flag is main-only: retry while main still reports an active page.
  const away = await waitForValue(() => this.call('workspaceAction', 'create', 'Elsewhere'),
    (result) => result.ok || result.reason !== 'active-page', 'the switch away to be accepted', 8000);
  assert.equal(away.ok, true, JSON.stringify(away));
  await this.waitForState((state) => state.tabs.every((t) => !t.isLoading));
  const back = await this.call('workspaceAction', 'open', saved.workspace.id);
  assert.equal(back.ok, true, JSON.stringify(back));
});

// ---- Review fixes (F53-14 … F53-19) ----

// A web page's corner tab shows its host; anything else shows its title, so
// moving from a web page to Mahjong changes what the tab says.
When('the second pane navigates to a page of another kind', async function () {
  await cornersShown(this);
  await this.call('navigateTab', this.splitB, 'blanc://mahjong/');
  await this.waitForState((s) => {
    const tab = s.tabs.find((t) => t.id === this.splitB);
    return tab?.url.startsWith('blanc://mahjong') && !tab.loading && tab.title;
  });
});

Then("the second pane's corner tab names the new page", async function () {
  const state = await this.state();
  const title = state.tabs.find((t) => t.id === this.splitB).title;
  await waitForValue(() => this.call('splitCornerTabs'), (list) => cornerOf(list, this.splitB)?.site === title,
    `the corner tab to say "${title}"`);
});

When('I group the first split tab as {string}', async function (name) {
  await this.call('groupTabByName', this.splitA, name);
});

Then('both split tabs are in group {string} and still one split', async function (name) {
  const state = await this.waitForState((s) => s.groups.some((g) => g.name === name));
  const group = state.groups.find((g) => g.name === name);
  for (const id of [this.splitA, this.splitB]) assert.equal(state.tabs.find((t) => t.id === id).groupId, group.id, `${id} in ${name}`);
  assert.equal(state.splits.length, 1);
  assert.deepEqual(state.splits[0].tabIds, [this.splitA, this.splitB]);
  const order = state.tabOrder.filter((id) => state.tabs.find((t) => t.id === id)?.groupId === group.id);
  assert.deepEqual(order, [this.splitA, this.splitB], 'the split stays together in its group');
});

Given('the split is in group {string}', async function (name) {
  await this.call('groupTabByName', this.splitA, name);
  this.splitGroupName = name;
  await this.waitForState((s) => s.tabs.filter((t) => [this.splitA, this.splitB].includes(t.id))
    .every((t) => t.groupId && s.groups.find((g) => g.id === t.groupId)?.name === name));
});

When('I move group {string} to a new window', async function (name) {
  const state = await this.state();
  const group = state.groups.find((g) => g.name === name);
  assert.ok(await this.call('moveGroupToNewWindow', group.id), 'the group moved');
});

Then("no tab is left pointing at a split that isn't there", async function () {
  const stray = await waitForValue(() => this.call('straySplitIds'), (list) => Array.isArray(list), 'the split check');
  assert.deepEqual(stray, []);
});

When('I close the second split tab', async function () {
  assert.equal((await this.state()).activeTabId, this.splitA);
  await this.call('closeTab', this.splitB);
  await this.waitForState((s) => !s.tabs.some((t) => t.id === this.splitB));
});

Then("the second split tab's view is no longer in the window", async function () {
  const views = await this.call('windowChildViewCount');
  const attached = await this.call('attachedTabViewIds');
  assert.deepEqual(attached, [this.splitA], 'only the remaining tab is attached');
  assert.equal(views.tabViews, 1, `no leftover page view: ${JSON.stringify(views)}`);
});

Then('Blanc announces that {string} moves into {string}', async function (title, group) {
  const page = await chromePage();
  await waitForValue(() => page.evaluate(() => document.getElementById('glanceStatus')?.textContent ?? ''),
    (text) => text.includes(`Moves ${title} into ${group}`), 'the group move to be announced');
});

Then('the first split tab is the active tab', async function () {
  const state = await this.waitForState((s) => s.splits.length === 0);
  assert.equal(state.activeTabId, this.splitA);
  assert.equal(state.tabs.find((t) => t.id === this.splitA).pinned, true);
});

// ---- The floating Island over a split (F53-22) ----

// Split with ▸ on the active tab: no tab switch follows, so nothing but the
// split itself restacks the window's views.
Given('the active tab is split with another, as its menu does', async function () {
  this.splitB = await openLoaded(this, 'split-b');
  this.splitA = await openLoaded(this, 'split-a');
  await this.waitForState((state) => state.activeTabId === this.splitA);
  await this.call('runTabMenuItem', this.splitA, 'split-with-tab', { otherTabId: this.splitB });
  await this.waitForState((state) => state.splits.some((s) => s.tabIds.includes(this.splitA) && s.tabIds.includes(this.splitB)));
});

Then("the floating pill stays above the split's panes and corner tabs", async function () {
  // Tab ids change across a relaunch, so wait for any two drawn corner tabs.
  await waitForValue(() => this.call('splitCornerTabs'), (list) => list.length === 2 && list.every((c) => c.shown && c.width > 0),
    'a corner tab on both panes');
  const pill = await waitForValue(() => this.call('floatViewState', 'pill'), (value) => value?.attached === true, 'the floating pill view');
  assert.equal(pill?.attached, true, 'the floating pill view is in the window');
  assert.equal(pill.aboveTabsAndSheet, true, 'the floating pill sits above every pane');
  const order = await this.call('splitCornerTabs');
  for (const corner of order) assert.equal(corner.belowFloat, true, `${corner.tabId}'s corner tab sits under the floating pill`);
});

Then('the floating pill slides in over the split', async function () {
  await waitForValue(() => this.call('floatViewState', 'pill'), (value) => value?.shown === true && value.visible === true
    && value.aboveTabsAndSheet === true, 'the floating pill to show above the panes');
});

Then("the Island is shown and the split's cards start below the strip", async function () {
  const state = await waitForValue(() => this.call('islandAutoHideState'),
    (value) => !value?.sliding && value?.stripHidden === false && value.pageY > 0, 'the strip to be shown');
  const layout = await waitForValue(() => this.call('splitLayout'),
    (l) => l?.panes?.length === 2 && l.panes.every((p) => p.frame?.y > state.pageY), 'the cards below the strip');
  const after = await this.state();
  for (const pane of layout.panes) {
    const bounds = after.tabs.find((t) => t.id === pane.tabId).bounds;
    assert.ok(bounds.y > state.pageY, `pane page view at ${bounds.y} starts below the strip (${state.pageY})`);
  }
});

When("a pane's view is raised above everything", async function () {
  assert.equal(await this.call('raiseTabView', this.splitB), true);
  const pill = await this.call('floatViewState', 'pill');
  assert.equal(pill.aboveTabsAndSheet, false, 'the raised pane now covers the floating pill');
});
