// F3-6..16: drag (and keyboard) reordering on both surfaces. Every outline
// runs once in the rail and once in the island; see spec/acceptance/tab-drag.feature.
const assert = require('node:assert/strict');
const { Given, When, Then } = require('@cucumber/cucumber');
const { waitForValue } = require('../support/poll');
const {
  surfaceFor, rowFor, headerFor, pointerDrag, gapBefore, middleOf, openNamedTab,
} = require('../support/tab-drag');

const ORDINALS = { first: 0, second: 1, third: 2, last: -1 };
function pick(list, ordinal) {
  assert.ok(ordinal in ORDINALS, `unknown ordinal ${ordinal}`);
  const index = ORDINALS[ordinal];
  return index < 0 ? list[list.length + index] : list[index];
}

function namedTabs(world, name) {
  const ids = world.dragTabs?.[name];
  assert.ok(ids?.length, `no tabs recorded for ${name}`);
  return ids;
}

async function groupIdOf(world, name) {
  const state = await world.state();
  return state.groups.find((group) => group.name === name)?.id ?? null;
}

/** Tabs of one group (or loose, unpinned) in canonical order. */
function bucketOrder(state, groupId) {
  return state.tabOrder.filter((id) => {
    const tab = state.tabs.find((candidate) => candidate.id === id);
    return tab && (tab.groupId ?? null) === groupId && (groupId !== null || !tab.pinned);
  });
}

function snapshot(state) {
  return {
    tabOrder: [...state.tabOrder],
    groups: state.groups.map(({ id, name, collapsed }) => ({ id, name, collapsed })),
    tabs: state.tabs.map(({ id, groupId, pinned }) => ({ id, groupId: groupId ?? null, pinned: !!pinned }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  };
}

async function remember(world) {
  world.dragBefore = snapshot(await world.state());
}

/** A rejected or cancelled drag changes nothing, so wait for the drag to end. */
async function settleDrag(world) {
  await waitForValue(
    () => world.dragSurface.list.evaluate((el) => !el.hasAttribute('data-tab-dragging')),
    Boolean,
    'drag to finish'
  );
  await new Promise((resolve) => setTimeout(resolve, 250));
}

async function dragTabBefore(world, surface, sourceId, targetId) {
  world.dragSurface = await surfaceFor(world, surface);
  const { page, list } = world.dragSurface;
  const y = await gapBefore(rowFor(list, targetId), 'target row');
  world.movedId = sourceId;
  world.targetId = targetId;
  await pointerDrag(world, page, rowFor(list, sourceId), { y });
}

// ---------- Background ----------

Given('groups {string} and {string} each hold three loaded tabs', async function (a, b) {
  this.dragTabs = {};
  for (const name of [a, b]) {
    this.dragTabs[name] = [];
    for (const n of [1, 2, 3]) {
      const id = await openNamedTab(this, `${name}-${n}`);
      await this.call('groupTabByName', id, name);
      this.dragTabs[name].push(id);
    }
  }
});

Given('two loose tabs are open', async function () {
  this.dragTabs.loose = [await openNamedTab(this, 'loose-1'), await openNamedTab(this, 'loose-2')];
});

Given('group {string} holds one loaded tab', async function (name) {
  const id = await openNamedTab(this, `${name}-1`);
  await this.call('groupTabByName', id, name);
  this.dragTabs[name] = [id];
});

Given('group {string} holds one loaded tab and sits between {string} and {string}',
  async function (name, _before, after) {
    const id = await openNamedTab(this, `${name}-1`);
    await this.call('groupTabByName', id, name);
    this.dragTabs[name] = [id];
    assert.equal(await this.call('reorderGroup', await groupIdOf(this, name), await groupIdOf(this, after)), true);
  });

Given('{string} is collapsed', async function (name) {
  const id = await groupIdOf(this, name);
  const state = await this.state();
  if (!state.groups.find((group) => group.id === id).collapsed) await this.call('toggleGroup', id);
  await this.waitForState((s) => s.groups.find((group) => group.id === id)?.collapsed === true);
});

Given('the first loose tab is pinned', async function () {
  const id = this.dragTabs.loose[0];
  await this.call('pinTab', id);
  await this.waitForState((s) => s.tabs.find((tab) => tab.id === id)?.pinned === true);
});

Given('the active tab is the drag probe page', async function () {
  const id = await openNamedTab(this, 'drag-probe', '?dragprobe=1');
  await this.call('activateTab', id);
  this.probeTab = id;
  this.probeBefore = await this.call('workspacePageScript', id, 'location.href + "|" + history.length');
});

// ---------- Drags ----------

When('I drag the {word} {string} tab before the {word} {string} tab in the {word}',
  async function (srcOrd, srcGroup, dstOrd, dstGroup, surface) {
    await dragTabBefore(this, surface,
      pick(namedTabs(this, srcGroup), srcOrd), pick(namedTabs(this, dstGroup), dstOrd));
  });

When('I drag the {word} {string} tab before the first loose tab in the {word}',
  async function (srcOrd, srcGroup, surface) {
    await dragTabBefore(this, surface, pick(namedTabs(this, srcGroup), srcOrd), this.dragTabs.loose[0]);
  });

When('I drag the first loose tab before the {word} {string} tab in the {word}',
  async function (dstOrd, dstGroup, surface) {
    await dragTabBefore(this, surface, this.dragTabs.loose[0], pick(namedTabs(this, dstGroup), dstOrd));
  });

When('I drag that pinned tab before the second loose tab in the {word}', async function (surface) {
  await remember(this);
  await dragTabBefore(this, surface, this.dragTabs.loose[0], this.dragTabs.loose[1]);
  await settleDrag(this);
});

When('I drag the first loose tab onto the {string} header in the {word}', async function (name, surface) {
  this.dragSurface = await surfaceFor(this, surface);
  const { page, list } = this.dragSurface;
  const gid = await groupIdOf(this, name);
  this.movedId = this.dragTabs.loose[0];
  const y = await middleOf(headerFor(list, gid), `${name} header`);
  await pointerDrag(this, page, rowFor(list, this.movedId), { y });
});

When('I drag the {string} header above the {string} header in the {word}', async function (src, dst, surface) {
  this.dragSurface = await surfaceFor(this, surface);
  const { page, list } = this.dragSurface;
  const y = await gapBefore(headerFor(list, await groupIdOf(this, dst)), `${dst} header`);
  await pointerDrag(this, page, headerFor(list, await groupIdOf(this, src)), { y });
});

When('I drag the first {string} tab out over the page and release it in the {word}',
  async function (name, surface) {
    await remember(this);
    this.dragSurface = await surfaceFor(this, surface);
    const { page, list } = this.dragSurface;
    const source = rowFor(list, namedTabs(this, name)[0]);
    const listBox = await list.boundingBox();
    const sourceBox = await source.boundingBox();
    // Rail: level with the row, well to the right over page content.
    // Island: below the panel, over page content.
    const target = surface === 'rail'
      ? { x: listBox.x + listBox.width + 300, y: sourceBox.y + sourceBox.height / 2 }
      : { y: listBox.y + listBox.height + 80 };
    await pointerDrag(this, page, source, target);
    await settleDrag(this);
  });

When('I start dragging the first {string} tab in the island', async function (name) {
  await remember(this);
  this.dragSurface = await surfaceFor(this, 'island');
  const { page, list } = this.dragSurface;
  const source = rowFor(list, namedTabs(this, name)[0]);
  const box = await source.boundingBox();
  await pointerDrag(this, page, source, { y: box.y + box.height / 2 + 40 }, { hold: true });
  await waitForValue(() => this.call('overlayDragging'), (v) => v === true, 'main to see the island drag');
});

When('I press Escape during the drag', async function () {
  const { page } = this.dragSurface;
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await settleDrag(this);
});

When('I focus the last {string} tab in the {word} and press Alt+Shift+ArrowDown', async function (name, surface) {
  this.dragSurface = await surfaceFor(this, surface);
  const { page, list } = this.dragSurface;
  this.movedId = pick(namedTabs(this, name), 'last');
  const control = surface === 'rail'
    ? list.locator(`.vertical-tab-primary[data-tab-id="${this.movedId}"]`)
    : rowFor(list, this.movedId).locator('.row-primary');
  await control.focus();
  await page.keyboard.press('Alt+Shift+ArrowDown');
});

// ---------- Outcomes ----------

Then('{string} lists that tab first', async function (name) {
  const gid = await groupIdOf(this, name);
  await this.waitForState((s) => bucketOrder(s, gid)[0] === this.movedId);
});

Then('that tab belongs to {string} at that position', async function (name) {
  const gid = await groupIdOf(this, name);
  await this.waitForState((s) => {
    const order = bucketOrder(s, gid);
    const at = order.indexOf(this.movedId);
    return at !== -1 && order[at + 1] === this.targetId;
  });
});

Then('that tab is loose and leads the loose section', async function () {
  await this.waitForState((s) => {
    const order = bucketOrder(s, null);
    const at = order.indexOf(this.movedId);
    return at !== -1 && order[at + 1] === this.dragTabs.loose[0];
  });
});

Then('that tab is the last tab of {string}', async function (name) {
  const gid = await groupIdOf(this, name);
  await this.waitForState((s) => bucketOrder(s, gid).at(-1) === this.movedId);
});

Then('{string} is still collapsed', async function (name) {
  const state = await this.state();
  assert.equal(state.groups.find((group) => group.name === name)?.collapsed, true);
});

Then('the group order is {string}, {string}', async function (a, b) {
  await this.waitForState((s) => {
    const names = s.groups.map((group) => group.name).filter((n) => n === a || n === b);
    return names.join() === [a, b].join();
  });
});

Then('the first cluster shortcut selects the first {string} tab', async function (name) {
  await this.call('selectTabAtIndex', 0);
  await this.waitForState((s) => s.activeTabId === namedTabs(this, name)[0]);
});

Then('that tab belongs to {string} as its first tab', async function (name) {
  const gid = await groupIdOf(this, name);
  await this.waitForState((s) => bucketOrder(s, gid)[0] === this.movedId);
});

Then('canonical tab order, groups and pinned state are unchanged', async function () {
  assert.deepEqual(snapshot(await this.state()), this.dragBefore);
});

Then('canonical tab order and groups are unchanged', async function () {
  const now = snapshot(await this.state());
  assert.deepEqual(now.tabOrder, this.dragBefore.tabOrder);
  assert.deepEqual(now.groups, this.dragBefore.groups);
  assert.deepEqual(now.tabs, this.dragBefore.tabs);
});

Then('the probe page did not navigate', async function () {
  const after = await this.call('workspacePageScript', this.probeTab, 'location.href + "|" + history.length');
  assert.equal(after, this.probeBefore);
});

Then('the probe page saw no drag, drop or paste events and no tab id', async function () {
  const probe = JSON.parse(await this.call('workspacePageScript', this.probeTab,
    'JSON.stringify({ probe: window.__dragProbe, text: document.body.innerText })'));
  assert.ok(probe.probe, 'drag probe installed on the page');
  assert.deepEqual(probe.probe.events, []);
  const state = await this.state();
  const exposed = [...probe.probe.data, probe.text].join('\n');
  for (const tab of state.tabs) assert.ok(!exposed.includes(tab.id), `page saw tab id ${tab.id}`);
});

Then('the island panel is still open', async function () {
  assert.equal(await this.call('overlayRendererMode'), 'panel');
});

Then('the island drag flag is clear', async function () {
  assert.equal(await this.call('overlayDragging'), false);
});
