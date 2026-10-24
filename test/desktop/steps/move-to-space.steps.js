'use strict';

// Move to Space ▸ in the tab menu (#1060). The Spaces scenario setup steps
// ("spaces named …", "this window is showing a web page …") live in
// spaces-redesign.steps.js and leave the page's id in this.pageId.
const assert = require('node:assert/strict');
const { When, Then } = require('@cucumber/cucumber');
const { waitForValue } = require('../support/poll');

async function spaceId(world, name) {
  const data = await world.call('workspaceAction', 'list');
  const space = data.items.find((w) => w.name === name);
  assert.ok(space, `the space ${name} exists: ${JSON.stringify(data.items.map((w) => w.name))}`);
  return space.id;
}

When('I move that page to {string} from its tab menu', async function (name) {
  this.pageIdentity = await this.call('workspacePageIdentity', this.pageId);
  assert.ok(this.pageIdentity, 'the page has a live view before the move');
  const item = await this.call('tabMenuItem', this.pageId, 'space');
  assert.deepEqual(item, { label: 'Move to Space', enabled: true });
  await this.call('runTabMenuItem', this.pageId, 'space-move', { workspaceId: await spaceId(this, name) });
});

Then('this window no longer has that page and is still in {string}', async function (name) {
  // state().tabs lists every window's tabs; tabOrder is this window's.
  await this.waitForState((st) => !st.tabOrder.includes(this.pageId));
  const data = await this.call('workspaceAction', 'list');
  assert.equal(data.items.find((w) => w.name === name)?.active, true, `this window is still in ${name}`);
});

Then('{string} is set aside with that page last, still loaded', async function (name) {
  const spaces = await waitForValue(() => this.call('residentSpaces'), (all) => all.some((s) => s.name === name), `${name} set aside`);
  const space = spaces.find((s) => s.name === name);
  const last = space.tabs.at(-1);
  assert.equal(last?.id, this.pageId, JSON.stringify(space));
  assert.equal(last.live, true, `the page kept its renderer: ${JSON.stringify(last)}`);
  // The space's saved record already lists it (the move saves it at once).
  const data = await this.call('workspaceAction', 'list');
  assert.equal(data.items.find((w) => w.name === name)?.tabCount, space.tabs.length);
});

Then('switching this window to {string} shows that same page, its session storage intact', async function (name) {
  const result = await this.call('workspaceAction', 'open', await spaceId(this, name));
  assert.equal(result?.ok, true, JSON.stringify(result));
  await this.waitForState((st) => st.tabOrder.includes(this.pageId));
  await this.call('activateTab', this.pageId);
  await this.waitForState((st) => st.activeTabId === this.pageId);
  assert.equal(await this.call('workspacePageIdentity', this.pageId), this.pageIdentity, 'the same WebContents, not a reload');
  assert.equal(await this.call('workspacePageScript', this.pageId, "sessionStorage.getItem('kept')"), 'yes');
});

Then('the other window has that page last, without selecting it', async function () {
  const other = await waitForValue(
    async () => (await this.call('windowRuntimes')).find((r) => r.id === this.otherWindow),
    (r) => r?.tabOrder.at(-1) === this.pageId,
    'the page in the other window',
  );
  assert.notEqual(other.activeTabId, this.pageId);
});

Then('this window no longer has that page', async function () {
  await this.waitForState((st) => !st.tabOrder.includes(this.pageId));
});

Then("the tab menu's {string} is disabled for this window's only tab", async function (label) {
  const st = await this.waitForState((s) => s.tabOrder.length === 1);
  assert.deepEqual(await this.call('tabMenuItem', st.tabOrder[0], 'space'), { label, enabled: false });
});

Then("the tab menu's {string} is enabled for that page", async function (label) {
  assert.deepEqual(await this.call('tabMenuItem', this.pageId, 'space'), { label, enabled: true });
});

Then("a private tab's menu has no {string}", async function (_label) {
  const id = await this.call('openTab', 'blanc://newtab/?private=1', { private: true });
  await this.waitForState((st) => st.activeTabId === id);
  assert.equal(await this.call('tabMenuItem', id, 'space'), null);
});
