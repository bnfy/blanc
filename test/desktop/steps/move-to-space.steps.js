'use strict';

// Move to Space ▸ in the tab menu (#1060). The Spaces scenario setup steps
// ("spaces named …", "this window is showing a web page …") live in
// spaces-redesign.steps.js and leave the page's id in this.pageId.
const assert = require('node:assert/strict');
const { Given, When, Then } = require('@cucumber/cucumber');
const ctx = require('../support/context');
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
  this.pageUrl = (await this.state()).tabs.find((t) => t.id === this.pageId)?.url;
  this.moveTarget = name;
  this.moveResult = await this.call('runTabMenuItem', this.pageId, 'space-move', { workspaceId: await spaceId(this, name) });
});

Then('this window no longer has that page and is still in {string}', async function (name) {
  assert.deepEqual(this.moveResult, { ok: true });
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
  assert.deepEqual(this.moveResult, { ok: true });
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

// ---- Saving a move (space-move.js): failures, recovery, and a crash ----

Given("the move's save will fail once", async function () {
  assert.deepEqual(await this.call('workspaceAction', 'arm-move-fault', 'write', 'storage-failed'), { ok: true });
});

Given("the move's transfer and its recovery save will both fail once", async function () {
  assert.deepEqual(await this.call('workspaceAction', 'arm-move-fault', 'transfer'), { ok: true });
  assert.deepEqual(await this.call('workspaceAction', 'arm-move-fault', 'rewrite', 'storage-failed'), { ok: true });
});

Then('the move reports that it failed and that nothing moved', async function () {
  assert.equal(this.moveResult?.ok, false, JSON.stringify(this.moveResult));
  assert.equal(this.moveResult.moved, false, JSON.stringify(this.moveResult));
});

Then('this window still has that page, live and selected', async function () {
  const st = await this.waitForState((s) => s.tabOrder.includes(this.pageId) && s.activeTabId === this.pageId);
  assert.equal(st.tabs.find((t) => t.id === this.pageId)?.asleep, false);
  assert.ok(await this.call('workspacePageIdentity', this.pageId), 'the same live page');
});

Then('{string}\'s saved tabs list that page {int} time(s)', async function (name, count) {
  const urls = await this.call('workspaceAction', 'saved-urls', await spaceId(this, name));
  assert.ok(Array.isArray(urls), `${name} has a saved record`);
  assert.equal(urls.filter((url) => url === this.pageUrl).length, count, JSON.stringify(urls));
});

When('Blanc crashes and starts again', { timeout: 120_000 }, async function () {
  // Let the debounced saves that would have run before a crash run (session
  // and spaces both save on a 250 ms debounce), then kill the process.
  await new Promise((resolve) => setTimeout(resolve, 1500));
  assert.equal(typeof ctx.crashAndRelaunch, 'function', 'the harness can crash and relaunch');
  await ctx.crashAndRelaunch();
});

Then('the restored window has that page', async function () {
  const st = await this.waitForState((s) => s.tabOrder.some((id) => s.tabs.find((t) => t.id === id)?.url === this.pageUrl), { timeout: 15000 });
  const copies = st.tabOrder.filter((id) => st.tabs.find((t) => t.id === id)?.url === this.pageUrl);
  assert.equal(copies.length, 1, 'exactly one copy in the window');
});

Then('the restored window does not have that page', async function () {
  const st = await this.waitForState((s) => s.tabOrder.length > 0, { timeout: 15000 });
  const inWindow = st.tabOrder.some((id) => st.tabs.find((t) => t.id === id)?.url === this.pageUrl);
  assert.equal(inWindow, false, JSON.stringify(st.tabOrder.map((id) => st.tabs.find((t) => t.id === id)?.url)));
});

// New Space… uses the real overlay editor, not a test-only create shortcut.
const { overlayPage } = require('../support/overlay');
When("I choose New Space from that page's tab menu", async function () {
  this.pageIdentity = await this.call('workspacePageIdentity', this.pageId);
  assert.equal(await this.call('runTabMenuItem', this.pageId, 'space-new'), true);
  const page = await overlayPage();
  await page.waitForSelector('#workspaceEditor', { state: 'visible' });
  assert.equal(await page.locator('.ws-segmented').count(), 0, 'the start choice is fixed');
  assert.match(await page.locator('#workspaceEditor').innerText(), /With this tab/);
});
When("I create the tab's new space named {string}", async function (name) {
  const page = await overlayPage();
  await page.fill('#workspaceName', name);
  const submit = page.locator('#workspaceEditor button[type="submit"]');
  // A duplicate is rejected as the name is typed, before submission.
  if (await submit.isEnabled()) await submit.click();
});
When("I cancel the tab's new space editor", async function () {
  const page = await overlayPage();
  await page.locator('#workspaceName').press('Escape');
  await this.waitForState((st) => st.overlayMode !== 'spaces');
});
Then('the new space {string} has that same live page and this window stays in {string}', async function (name, original) {
  await this.waitForState((st) => !st.tabOrder.includes(this.pageId));
  const data = await this.call('workspaceAction', 'list');
  assert.equal(data.items.find(w => w.name === original)?.active, true);
  assert.equal(data.items.find(w => w.name === name)?.tabCount, 1);
  assert.equal(await this.call('workspacePageIdentity', this.pageId), this.pageIdentity);
  const residents = await this.call('residentSpaces');
  assert.equal(residents.find(w => w.name === name)?.tabs.at(-1)?.id, this.pageId);
});
Then('the profile still has only the space {string} and the page stays here', async function (name) {
  const data = await this.call('workspaceAction', 'list');
  assert.deepEqual(data.items.map(w => w.name), [name]);
  const st = await this.state(); assert.ok(st.tabOrder.includes(this.pageId));
});
Then("the tab's new space editor stays open with its error and name {string}", async function (name) {
  const page = await overlayPage();
  await page.waitForFunction(() => !!document.querySelector('#workspaceEditor .ws-error')?.textContent);
  assert.equal(await page.locator('#workspaceName').inputValue(), name);
});
Given("the new space's transfer will fail once", async function () {
  assert.deepEqual(await this.call('workspaceAction', 'arm-move-fault', 'transfer'), { ok: true });
});
Then('the Spaces list shows the saved space {string} and the move error', async function (name) {
  const page = await overlayPage();
  await page.waitForFunction(() => document.querySelector('#workspaceSwitcher')?.dataset.view === 'list');
  assert.match(await page.locator('#workspaceSwitcher').innerText(), new RegExp(`Saved ${name}`));
  const data = await this.call('workspaceAction', 'list');
  assert.ok(data.items.some(w => w.name === name));
  assert.equal(await page.locator('#workspaceEditor').count(), 0);
});
