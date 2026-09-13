'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
async function evidence(page, name, nativeCapture = false) {
  if (!process.env.BLANC_WORKSPACE_EVIDENCE_DIR) return;
  fs.mkdirSync(process.env.BLANC_WORKSPACE_EVIDENCE_DIR, { recursive: true });
  const target = path.join(process.env.BLANC_WORKSPACE_EVIDENCE_DIR, `${name}.png`);
  if (nativeCapture) {
    // CDP's viewport screenshot clips Electron views using unscaled CSS
    // coordinates after setZoomFactor. Capture the whole native view instead.
    const png = await ctx.app.evaluate(async ({ webContents }) => {
      const view = webContents.getAllWebContents().find((wc) => wc.getURL() === 'blanc-chrome://overlay/');
      return (await view.capturePage()).toPNG().toString('base64');
    });
    fs.writeFileSync(target, Buffer.from(png, 'base64'));
  } else await page.screenshot({ path: target });
}
const { Given, When, Then } = require('@cucumber/cucumber');
const { overlayPage } = require('../support/overlay');
const ctx = require('../support/context');
const { openOverlaySurface } = require('../support/poll');

Given('a named workspace with a live unsaved draft', async function () {
  await this.call('workspacePatron');
  this.draftId = await this.call('openTab', this.fixtureUrl('workspace-draft'));
  await this.waitForState((s) => s.tabs.some((t) => t.id === this.draftId && t.title === 'workspace-draft' && !t.isLoading));
  await this.call('workspacePageScript', this.draftId, `(() => {
    const field = document.createElement('textarea'); field.id = 'draft'; field.value = 'unsaved workspace draft'; document.body.append(field);
    sessionStorage.setItem('workspace-draft', 'keep');
    window.addEventListener('beforeunload', event => { event.preventDefault(); event.returnValue = ''; });
    history.pushState({}, '', '#keep-history'); return true;
  })()`);
  this.draftIdentity = await this.call('workspacePageIdentity', this.draftId);
  const saved = await this.call('workspaceAction', 'save', 'Draft workspace'); assert.equal(saved.ok, true);
  this.workspaceA = saved.workspace.id;
});
When('I switch to another named workspace and back', async function () {
  this.workspaceMetricsBefore = await this.call('workspaceAction', 'metrics');
  this.switchStarted = performance.now();
  const made = await this.call('workspaceAction', 'create', 'Second workspace'); assert.equal(made.ok, true, JSON.stringify(made)); this.workspaceB = made.workspaceId;
  await this.waitForState((s) => s.tabs.every((t) => !t.isLoading));
  const back = await this.call('workspaceAction', 'open', this.workspaceA); assert.equal(back.ok, true, JSON.stringify(back));
  if (process.env.BLANC_WORKSPACE_EVIDENCE_DIR) {
    fs.mkdirSync(process.env.BLANC_WORKSPACE_EVIDENCE_DIR, { recursive: true });
    fs.writeFileSync(path.join(process.env.BLANC_WORKSPACE_EVIDENCE_DIR, 'candidate-measurement.json'), JSON.stringify({ before: this.workspaceMetricsBefore, after: await this.call('workspaceAction', 'metrics'), roundTripIncludingIPCAndLoadMs: performance.now() - this.switchStarted }, null, 2));
  }
});
Then('the original page identity and draft are unchanged', async function () {
  assert.equal(await this.call('workspacePageIdentity', this.draftId), this.draftIdentity);
  const values = await this.call('workspacePageScript', this.draftId, `({draft: document.querySelector('#draft').value, storage: sessionStorage.getItem('workspace-draft'), hash: location.hash})`);
  assert.deepEqual(values, { draft: 'unsaved workspace draft', storage: 'keep', hash: '#keep-history' });
});
When('I open a private tab and select the current named workspace', async function () {
  this.privateId = await this.call('openTab', this.fixtureUrl('workspace-private'), { private: true });
  this.workspaceResult = await this.call('workspaceAction', 'open', this.workspaceA);
});
Then('the workspace action is a no-op and both pages remain open', async function () {
  assert.equal(this.workspaceResult.action, 'noop'); const state = await this.state();
  assert.ok(state.tabs.some((t) => t.id === this.draftId)); assert.ok(state.tabs.some((t) => t.private));
});
Given('two named workspaces for editing', async function () {
  await this.call('workspacePatron');
  this.workspaceA = (await this.call('workspaceAction', 'save', 'First workspace')).workspace.id;
  this.workspaceB = (await this.call('workspaceAction', 'save', 'Second workspace')).workspace.id;
});
When('I rename one workspace to the other workspace name', async function () {
  await openOverlaySurface(this, 'openPanel', 'panel'); const page = await overlayPage();
  await page.click('#footerWorkspace');
  await page.getByRole('button', { name: 'Manage First workspace', exact: true }).click();
  await page.getByRole('button', { name: 'Rename', exact: true }).click();
  await page.fill('#workspaceName', 'Second workspace');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
});
Then('the name and validation error stay visible in the workspace editor', async function () {
  const page = await overlayPage(); await page.waitForFunction(() => document.getElementById('workspaceEditorError')?.textContent.includes('already in use'));
  assert.equal(await page.inputValue('#workspaceName'), 'Second workspace'); assert.equal(await page.getAttribute('#workspaceName', 'aria-invalid'), 'true');
  assert.equal(await page.isVisible('#wsSwitcherNew'), false);
  await evidence(page, 'rename-validation');
});
When('I try switching with a private page and type a slash query', async function () {
  const target = await this.call('workspaceAction', 'save', 'Target workspace'); this.targetWorkspace = target.workspace.id;
  await this.call('openTab', this.fixtureUrl('workspace-private'), { private: true });
  await this.waitForState((s) => s.tabs.some((t) => t.private && t.title === 'workspace-private' && !t.isLoading));
  await openOverlaySurface(this, 'openPanel', 'panel'); const page = await overlayPage(); await page.click('#footerWorkspace');
  await page.getByRole('button', { name: /Draft workspace · Open workspace/ }).click();
  await page.waitForSelector('.ws-switcher-confirm'); await page.fill('#addressInput', '/settings');
});
Then('the private switch decision remains visible', async function () {
  const page = await overlayPage(); assert.equal(await page.isVisible('.ws-switcher-confirm'), true);
  assert.ok((await page.textContent('.ws-switcher-confirm')).includes('private'));
  await evidence(page, 'private-decision-search');
});
When('I close its ordinary pages leaving only a private page', async function () {
  await this.call('openTab', this.fixtureUrl('workspace-private'), { private: true });
  const state = await this.state(); for (const tab of state.tabs.filter((t) => !t.private)) await this.call('closeTab', tab.id);
  assert.equal((await this.call('workspaceAction', 'flush')).ok, true);
});
Then('the saved workspace has no ordinary tabs', async function () {
  const data = await this.call('workspaceAction', 'list'); assert.equal(data.items.find((w) => w.id === this.workspaceA).tabCount, 0);
});

When('I quiet a grouped pinned page and switch away', async function () {
  this.quietId = await this.call('openTab', this.insecureFixtureUrl('workspace-quiet'));
  await this.waitForState((s) => s.tabs.some((t) => t.id === this.quietId && t.title === 'workspace-quiet' && !t.isLoading));
  await this.call('pinTab', this.quietId);
  await this.call('groupTabByName', this.quietId, 'Research');
  await this.call('activateTab', this.draftId);
  assert.equal(await this.call('sleepTab', this.quietId), true);
  const made = await this.call('workspaceAction', 'create', 'Away'); assert.equal(made.ok, true, JSON.stringify(made));
});
Then('inactive navigation belongs to the original workspace and its quiet tab survives', async function () {
  await this.call('workspacePageScript', this.draftId, `history.pushState({}, '', '#inactive-navigation'); document.title = 'Inactive workspace'; true`);
  const popupDenied = await this.call('workspacePageScript', this.draftId, `window.open('about:blank') === null`); assert.equal(popupDenied, true);
  await this.waitForState((s) => s.tabs.every((t) => !t.isLoading));
  const opened = await this.call('workspaceAction', 'open', this.workspaceA); assert.equal(opened.ok, true, JSON.stringify(opened));
  const state = await this.state(); const quiet = state.tabs.find((t) => t.id === this.quietId);
  assert.equal(quiet.asleep, true); assert.equal(quiet.pinned, true); assert.ok(quiet.groupId);
  assert.equal(await this.call('workspacePageIdentity', this.draftId), this.draftIdentity);
  assert.equal(await this.call('workspacePageScript', this.draftId, 'location.hash'), '#inactive-navigation');
});
When('I switch away and delete the inactive workspace', async function () {
  assert.equal((await this.call('workspaceAction', 'create', 'Away')).ok, true);
  assert.equal((await this.call('workspaceAction', 'remove', this.workspaceA)).ok, true);
});
Then('the deleted workspace draft remains in a visible unsaved window', async function () {
  const windows = await this.call('windowRuntimes'); const owner = windows.find((w) => w.tabs.some((t) => t.id === this.draftId));
  assert.equal(owner.attached, true); assert.equal(await this.call('workspacePageIdentity', this.draftId), this.draftIdentity);
  const data = await this.call('workspaceActionInWindow', owner.id, 'list'); assert.equal(data.items.some((w) => w.active), false); assert.ok(data.deleted.some((w) => w.id === this.workspaceA));
});
Given('twenty five named workspaces with long names', async function () {
  await this.call('workspacePatron');
  for (let i = 0; i < 25; i++) assert.equal((await this.call('workspaceAction', 'save', `${String(i + 1).padStart(2, '0')} A long research workspace name with expanded descriptions`)).ok, true);
});
Then('the workspace list scrolls while creation controls remain visible', async function () {
  await ctx.app.evaluate(({ BrowserWindow }) => { const window = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL() === 'blanc-chrome://index/'); window.setSize(640, 480); });
  await openOverlaySurface(this, 'openPanel', 'panel'); const page = await overlayPage(); await page.click('#footerWorkspace');
  const geometry = await page.evaluate(() => {
    const list = document.getElementById('workspaceSwitcherList'); const popup = document.getElementById('workspaceSwitcher').getBoundingClientRect();
    const create = document.getElementById('wsSwitcherNew').getBoundingClientRect();
    list.scrollTop = list.scrollHeight;
    return { scroll: list.scrollHeight > list.clientHeight, popupTop: popup.top, popupBottom: popup.bottom, createBottom: create.bottom, height: innerHeight, rows: list.querySelectorAll('.ws-managed-row').length };
  });
  assert.equal(geometry.rows, 25); assert.equal(geometry.scroll, true); assert.ok(geometry.popupTop >= 0 && geometry.popupBottom <= geometry.height); assert.ok(geometry.createBottom <= geometry.height);
  await evidence(page, 'long-workspace-list');
  await this.call('setTabLayout', 'vertical');
  await openOverlaySurface(this, 'openPanel', 'panel'); await page.click('#footerWorkspace');
  await ctx.app.evaluate(({ webContents }) => { webContents.getAllWebContents().find((wc) => wc.getURL() === 'blanc-chrome://overlay/').setZoomFactor(1.25); });
  await page.waitForTimeout(100);
  const scaled = await page.evaluate(() => {
    const popup = document.getElementById('workspaceSwitcher').getBoundingClientRect();
    const button = document.getElementById('wsSwitcherNew').getBoundingClientRect();
    return { top: popup.top, bottom: popup.bottom, left: popup.left, right: popup.right, width: innerWidth, height: innerHeight, buttonBottom: button.bottom, buttonHeight: button.height };
  });
  assert.ok(scaled.top >= 0 && scaled.bottom <= scaled.height + 1); assert.ok(scaled.left >= 0 && scaled.right <= scaled.width + 1); assert.ok(scaled.buttonBottom <= scaled.height + 1); assert.ok(scaled.buttonHeight >= 24);
  await evidence(page, 'long-workspace-list-vertical-125percent', true);
  await ctx.app.evaluate(({ BrowserWindow, webContents }) => { webContents.getAllWebContents().find((wc) => wc.getURL() === 'blanc-chrome://overlay/').setZoomFactor(1); BrowserWindow.getAllWindows().find((w) => w.webContents.getURL() === 'blanc-chrome://index/').setSize(1280, 800); });
  await this.call('setTabLayout', 'island');
});
Given('a private-only secondary window bound to a named workspace', async function () {
  await this.call('workspacePatron'); this.secondary = await this.call('openNewWindow');
  const ordinary = await this.call('openTabInWindow', this.secondary, this.fixtureUrl('workspace-close'));
  this.closedWorkspace = (await this.call('workspaceActionInWindow', this.secondary, 'save', 'Close empty')).workspace.id;
  await this.call('openTabInWindow', this.secondary, this.fixtureUrl('workspace-private'), { private: true });
  const windows = await this.call('windowRuntimes'); const target = windows.find((w) => w.id === this.secondary);
  for (const tab of target.tabs.filter((t) => !t.private)) await this.call('closeTabInWindow', this.secondary, tab.id);
});
When('I close that window and reopen its workspace', async function () {
  await this.call('closeWindowRuntime', this.secondary);
  await new Promise((resolve) => setTimeout(resolve, 100));
  const opened = await this.call('workspaceAction', 'open', this.closedWorkspace, { newWindow: true }); assert.equal(opened.ok, true, JSON.stringify(opened)); this.reopenedWindow = opened.windowId;
});
Then('no removed ordinary page is restored', async function () {
  const windows = await this.call('windowRuntimes'); const target = windows.find((w) => w.id === this.reopenedWindow);
  assert.ok(target); assert.equal(target.tabs.length, 1); assert.equal(target.tabs[0].url, 'blanc://newtab/');
});

When('the incoming workspace session commit fails', async function () {
  const result = await this.call('workspaceAction', 'fail-session-commit', 'Commit fails');
  assert.equal(result.ok, false); assert.equal(result.error, 'storage-failed');
  const data = await this.call('workspaceAction', 'list'); assert.equal(data.items.find((w) => w.active).id, this.workspaceA);
});
When('I explicitly close a private page while switching and return', async function () {
  await this.call('openTab', this.fixtureUrl('workspace-private'), { private: true });
  await this.waitForState((s) => s.tabs.some((t) => t.private && t.title === 'workspace-private' && !t.isLoading));
  const guard = await this.call('workspaceAction', 'create', 'Private close target'); assert.equal(guard.error, 'unsaved-scratch');
  const created = await this.call('workspaceAction', 'create', 'Private close target', { decision: guard.decision }); assert.equal(created.ok, true, JSON.stringify(created));
  await this.waitForState((s) => s.tabs.every((t) => !t.isLoading));
  assert.equal((await this.call('workspaceAction', 'open', this.workspaceA)).ok, true);
  const state = await this.state(); assert.equal(state.tabs.some((t) => t.private), false); assert.equal(state.activeTabId, this.draftId);
});
