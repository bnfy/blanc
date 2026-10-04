'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Before, After, Given, When, Then } = require('@cucumber/cucumber');
const ctx = require('../support/context');
const { waitForValue } = require('../support/poll');
const { startWorkspaceFixtures } = require('../support/workspace-fixtures');

const tags = '@F41-12 or @F41-13 or @F41-14';
const pageAt = url => waitForValue(() => Promise.resolve(ctx.app.context().pages().find(page => page.url() === url)), Boolean, `workspace fixture ${url}`);
Before({ tags }, async function () { this.lifecycleFixture = await startWorkspaceFixtures(); });
After({ tags }, async function () { await this.lifecycleFixture?.close(); });

Given('a named workspace with a submitted POST response and unsaved edits', async function () {
  await this.call('workspacePatron');
  this.postTab = await this.call('openTab', this.lifecycleFixture.base + '/form');
  const form = await pageAt(this.lifecycleFixture.base + '/form');
  await form.locator('#submit').click();
  const response = await pageAt(this.lifecycleFixture.base + '/submitted');
  await response.locator('#draft').fill('workspace-unsaved-sentinel');
  await response.evaluate(() => { sessionStorage.setItem('draft', 'workspace-storage-sentinel'); history.pushState({}, '', '#post-history'); });
  await this.waitForState(state => state.tabs.every(tab => !tab.isLoading));
  this.postIdentity = await this.call('workspacePageIdentity', this.postTab);
  this.postHistory = await ctx.app.evaluate(({ webContents }, id) => webContents.fromId(id).navigationHistory.getAllEntries().map(entry => entry.url), this.postIdentity);
  this.postWorkspace = (await this.call('workspaceAction', 'save', 'POST workspace')).workspace.id;
  assert.equal(this.lifecycleFixture.requests.posts, 1);
  assert.deepEqual(this.lifecycleFixture.requests.postBodies, ['payload=workspace-post-sentinel']);
});
When('I switch away from the POST workspace and return', async function () {
  assert.equal((await this.call('workspaceAction', 'create', 'POST away')).ok, true);
  await this.waitForState(state => state.tabs.every(tab => !tab.isLoading));
  assert.equal((await this.call('workspaceAction', 'open', this.postWorkspace)).ok, true);
});
Then('the POST response stays live without reposting or leaking page state to disk', async function () {
  assert.equal(await this.call('workspacePageIdentity', this.postTab), this.postIdentity);
  const values = await this.call('workspacePageScript', this.postTab, `({response:document.querySelector('#post-response').textContent,draft:document.querySelector('#draft').value,storage:sessionStorage.getItem('draft'),hash:location.hash,identity:window.documentIdentity})`);
  assert.deepEqual(values, { response: 'workspace-response-sentinel', draft: 'workspace-unsaved-sentinel', storage: 'workspace-storage-sentinel', hash: '#post-history', identity: 'post-document' });
  const history = await ctx.app.evaluate(({ webContents }, id) => webContents.fromId(id).navigationHistory.getAllEntries().map(entry => entry.url), this.postIdentity);
  assert.deepEqual(history, this.postHistory);
  assert.equal(this.lifecycleFixture.requests.posts, 1, 'switching must not repeat a POST');
  assert.equal(this.lifecycleFixture.requests.gets, 0, 'switching must not replace the response with a GET');
  assert.equal((await this.call('workspaceAction', 'flush')).ok, true);
  const directory = await ctx.app.evaluate(({ app }) => app.getPath('userData'));
  for (const name of ['session.json', 'workspaces.json']) {
    const bytes = fs.readFileSync(path.join(directory, name), 'utf8');
    for (const sentinel of ['workspace-post-sentinel', 'workspace-response-sentinel', 'workspace-unsaved-sentinel', 'workspace-storage-sentinel']) assert.equal(bytes.includes(sentinel), false, `${name} must not persist page state`);
  }
});

Given('a named workspace with an active sign-in {word} opener family', async function (mode) {
  assert.ok(['popup', 'tab'].includes(mode)); this.loginMode = mode;
  await this.call('workspacePatron');
  this.loginTab = await this.call('openTab', this.lifecycleFixture.base + '/relying');
  const relying = await pageAt(this.lifecycleFixture.base + '/relying');
  await this.waitForState(state => state.tabs.every(tab => !tab.isLoading));
  this.loginWorkspace = (await this.call('workspaceAction', 'save', 'Login workspace')).workspace.id;
  const target = await this.call('workspaceAction', 'create', 'Login away'); assert.equal(target.ok, true); this.loginTarget = target.workspaceId;
  await this.waitForState(state => state.tabs.every(tab => !tab.isLoading));
  assert.equal((await this.call('workspaceAction', 'open', this.loginWorkspace)).ok, true);
  this.loginIdentity = await this.call('workspacePageIdentity', this.loginTab);
  await relying.locator('#' + mode).click();
  this.loginChild = await pageAt(this.lifecycleFixture.base.replace('127.0.0.1', 'localhost') + '/provider?mode=' + mode);
  assert.equal(await this.loginChild.evaluate(() => !!window.opener), true);
  await this.waitForState(state => state.tabs.every(tab => !tab.isLoading));
});
When('I try switching workspaces during fixture sign-in', async function () {
  this.loginGuard = await this.call('workspaceAction', 'open', this.loginTarget);
  this.loginForcedGuard = await this.call('workspaceAction', 'open', this.loginTarget, { force: true, decision: 'not-a-valid-decision' });
});
Then('the switch is refused and the sign-in callback still reaches its opener', async function () {
  for (const result of [this.loginGuard, this.loginForcedGuard]) assert.deepEqual(result, { ok: false, error: 'protected-pages', reason: 'active-page' });
  assert.equal((await this.call('workspaceAction', 'list')).items.find(workspace => workspace.active)?.id, this.loginWorkspace);
  assert.equal(await this.call('workspacePageIdentity', this.loginTab), this.loginIdentity);
  assert.equal(await this.loginChild.evaluate(() => !!window.opener), true);
  await this.loginChild.locator('#complete').click();
  await waitForValue(() => this.call('workspacePageScript', this.loginTab, 'window.loginResults'), values => values.length === 1, 'sign-in callback reaches the original opener');
  assert.deepEqual(await this.call('workspacePageScript', this.loginTab, 'window.loginResults'), [{ kind: 'workspace-login', mode: this.loginMode, opener: true }]);
  await this.loginChild.locator('#close').click();
  await waitForValue(() => Promise.resolve(this.loginChild.isClosed()), Boolean, 'sign-in child closes');
  await this.waitForState(state => state.tabs.every(tab => !tab.isLoading));
  assert.equal((await this.call('workspaceAction', 'open', this.loginTarget)).ok, true, 'the guard must clear when the opener family ends');
  await this.waitForState(state => state.tabs.every(tab => !tab.isLoading));
  assert.equal((await this.call('workspaceAction', 'open', this.loginWorkspace)).ok, true);
  assert.equal(await this.call('workspacePageIdentity', this.loginTab), this.loginIdentity);
});
