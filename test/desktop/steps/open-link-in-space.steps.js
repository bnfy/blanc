'use strict';
const assert = require('node:assert/strict');
const http = require('node:http');
const { Given, When, Then, After } = require('@cucumber/cucumber');
const { waitForValue } = require('../support/poll');
const { overlayPage } = require('../support/overlay');

Given('a counted link to open in another space', async function () {
  this.linkRequests = 0;
  this.linkServer = http.createServer((_req, res) => {
    this.linkRequests++;
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<title>Linked article</title><p>Linked article</p>');
  });
  await new Promise(resolve => this.linkServer.listen(0, '127.0.0.1', resolve));
  this.linkUrl = `http://127.0.0.1:${this.linkServer.address().port}/article`;
  const st = await this.state(); this.linkSource = st.activeTabId;
  this.linkSourceOrder = [...st.tabOrder]; this.linkSourceActive = st.activeTabId;
});
After(async function () { if (this.linkServer) await new Promise(resolve => this.linkServer.close(resolve)); });
When('I open the counted link in space {string}', async function (name) {
  const data = await this.call('workspaceAction', 'list');
  const target = data.items.find(w => w.name === name); assert.ok(target);
  this.linkResult = await this.call('runLinkSpaceMenuItem', this.linkSource, this.linkUrl, 'Chosen article', `link-space:${target.id}`);
});
Then('the link loads in the other window without changing either selection', async function () {
  assert.equal(this.linkResult?.ok, true, JSON.stringify(this.linkResult));
  await waitForValue(() => this.linkRequests, n => n > 0, 'linked article loaded');
  const st = await this.waitForState(s => s.tabs.some(t => t.url === this.linkUrl && !t.isLoading));
  const linked = st.tabs.find(t => t.url === this.linkUrl);
  const other = (await this.call('windowRuntimes')).find(r => r.id === this.otherWindow);
  assert.equal(other.tabOrder.at(-1), linked.id); assert.notEqual(other.activeTabId, linked.id);
  assert.deepEqual(st.tabOrder, this.linkSourceOrder); assert.equal(st.activeTabId, this.linkSourceActive);
  assert.equal(linked.groupId, null);
});
Then('space {string} has the counted link quiet and unrequested', async function (name) {
  assert.equal(this.linkResult?.ok, true, JSON.stringify(this.linkResult));
  const residents = await this.call('residentSpaces'); const space = residents.find(w => w.name === name); assert.ok(space);
  const last = space.tabs.at(-1); assert.equal(last.url, this.linkUrl); assert.equal(last.asleep, true); assert.equal(last.live, false);
  assert.equal(this.linkRequests, 0);
  const st = await this.state(); assert.deepEqual(st.tabOrder, this.linkSourceOrder); assert.equal(st.activeTabId, this.linkSourceActive);
});
Then('space {string} has the counted link saved without a runtime or request', async function (name) {
  if (this.linkResult) assert.equal(this.linkResult.ok, true, JSON.stringify(this.linkResult));
  const data = await this.call('workspaceAction', 'list'); const space = data.items.find(w => w.name === name); assert.ok(space);
  const urls = await this.call('workspaceAction', 'saved-urls', space.id); assert.equal(urls.at(-1), this.linkUrl);
  assert.equal((await this.call('residentSpaces')).some(w => w.name === name), false);
  assert.equal((await this.call('windowRuntimes')).some(w => w.workspaceId === space.id), false);
  assert.equal(this.linkRequests, 0);
});
Then('opening space {string} still does not request the link until I select it', async function (name) {
  const data = await this.call('workspaceAction', 'list'); const space = data.items.find(w => w.name === name);
  await this.waitForState(s => s.tabs.every(t => !t.isLoading && !t.waking));
  const opened = await this.call('workspaceAction', 'open', space.id);
  assert.equal(opened.ok, true, JSON.stringify(opened));
  const st = await this.state(); const tab = st.tabs.find(t => t.url === this.linkUrl); assert.ok(tab);
  assert.equal(tab.asleep, true); assert.equal(this.linkRequests, 0);
  await this.call('activateTab', tab.id);
  await waitForValue(() => this.linkRequests, n => n > 0, 'selected link loaded');
});
Then('the link failure appears in Spaces and space {string} has no counted link', async function (name) {
  assert.equal(this.linkResult?.ok, false);
  const data = await this.call('workspaceAction', 'list'); const space = data.items.find(w => w.name === name);
  assert.equal((await this.call('workspaceAction', 'saved-urls', space.id)).includes(this.linkUrl), false);
  assert.equal(this.linkRequests, 0);
  assert.equal((await this.state()).tabs.some(t => t.url === this.linkUrl), false, 'no partial tab remains');
  const page = await overlayPage();
  await page.waitForFunction(() => document.querySelector('#workspaceSwitcher .ws-error')?.textContent.includes('Couldn’t open the link'));
  assert.deepEqual((await this.state()).tabOrder, this.linkSourceOrder);
});
When('I choose New Space for the counted link', async function () {
  assert.equal(await this.call('runLinkSpaceMenuItem', this.linkSource, this.linkUrl, 'Chosen article', 'link-space-new'), true);
  const page = await overlayPage(); await page.waitForSelector('#workspaceEditor', { state: 'visible' });
  assert.match(await page.locator('#workspaceEditor').innerText(), /With this link.*Chosen article/s);
  assert.equal(await page.locator('.ws-segmented').count(), 0);
});
When('I create the link space named {string}', async function (name) {
  const page = await overlayPage(); await page.fill('#workspaceName', name);
  await page.locator('#workspaceEditor button[type="submit"]').click();
  await this.waitForState(s => s.overlayMode !== 'spaces');
});
Then('the link editor stays open with its error and name {string}', async function (name) {
  const page = await overlayPage(); await page.waitForFunction(() => !!document.querySelector('#workspaceEditor .ws-error')?.textContent);
  assert.equal(await page.locator('#workspaceName').inputValue(), name); assert.equal(this.linkRequests, 0);
});
When('I submit the link space named {string} with a failed save', async function (name) {
  await this.call('workspaceAction', 'arm-move-fault', 'write', 'storage-failed');
  const page = await overlayPage(); await page.fill('#workspaceName', name);
  await page.locator('#workspaceEditor button[type="submit"]').click();
});
