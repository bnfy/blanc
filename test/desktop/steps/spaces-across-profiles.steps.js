'use strict';

const assert = require('node:assert/strict');
const { After, Given, When, Then } = require('@cucumber/cucumber');
const ctx = require('../support/context');
const { overlayPage } = require('../support/overlay');
const { clickWhenSettled, openOverlaySurface, waitForValue } = require('../support/poll');

const PRIMARY = 'primary';
const OVERLAY_URL = 'blanc-chrome://overlay/';
const runtimes = (world) => world.call('windowRuntimes');

async function focusPersonal(world) {
  await waitForValue(() => world.call('focusWindowRuntime', PRIMARY), Boolean, 'Personal window focused');
}

async function createWork(world) {
  const created = await world.call('createProfileWindow', 'Work');
  assert.equal(created.ok, true, created.message);
  world.work = created;
}

async function saveWorkSpace(world, name) {
  const saved = await world.call('workspaceActionInWindow', world.work.runtimeId, 'save', name);
  assert.equal(saved.ok, true, JSON.stringify(saved));
  world.workSpaceId = saved.workspace.id;
}

async function nativeWindowId(page) {
  const handle = await ctx.app.browserWindow(page);
  try { return await handle.evaluate((window) => window?.id ?? null); }
  finally { await handle.dispose(); }
}

async function pageInWindow(id, url) {
  return waitForValue(async () => {
    for (const page of ctx.app.windows()) {
      if (!page.isClosed() && page.url() === url && await nativeWindowId(page) === id) return page;
    }
    return null;
  }, Boolean, `${url} in window ${id}`);
}

async function personalOverlay() {
  const candidate = await overlayPage();
  const id = await ctx.app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().find((window) => window.getTitle() === 'Blanc')?.id);
  assert.ok(id, 'Personal has a native window');
  return await nativeWindowId(candidate) === id ? candidate : pageInWindow(id, OVERLAY_URL);
}

async function visibleMenu(page) {
  const menu = page.locator('#workspaceSwitcher');
  await menu.waitFor({ state: 'visible' });
  return menu;
}

async function personalMenu() {
  return visibleMenu(await personalOverlay());
}

async function openPersonalMenu(world) {
  await focusPersonal(world);
  await openOverlaySurface(world, 'openPanel', 'panel');
  const page = await personalOverlay();
  await clickWhenSettled(page.getByRole('button', { name: 'Spaces', exact: true }), 'Spaces footer button');
  return visibleMenu(page);
}

function spaceRow(menu, name) {
  const label = menu.page().getByText(name, { exact: true }).and(menu.page().locator('.ws-row-name'));
  return menu.locator('.ws-row').filter({ has: label });
}

async function rowUnder(menu, name, profile) {
  // Headings and rows are siblings, so check the nearest heading in the menu's
  // rendered order instead of relying on a row's internal data attributes.
  const candidates = spaceRow(menu, name);
  await candidates.first().waitFor({ state: 'visible' });
  const owners = await candidates.evaluateAll((rows) => rows.map((item) => {
    let heading = item.previousElementSibling;
    while (heading && !heading.matches('.ws-profile-heading')) heading = heading.previousElementSibling;
    return heading?.textContent ?? null;
  }));
  assert.equal(owners.filter((owner) => owner === profile).length, 1, `${name} under ${profile}: ${JSON.stringify(owners)}`);
  return candidates.nth(owners.indexOf(profile));
}

async function rememberWindows(world) {
  world.windowsBeforeAction = (await runtimes(world)).filter((runtime) => runtime.attached);
}

async function waitForWorkFocus(world, runtimeId) {
  await waitForValue(() => world.call('floatPillDiagnostics', runtimeId),
    (state) => state?.visible && state.focused, 'Work window focused');
}

Given('Personal is my only profile and has a Space named {string}', async function (name) {
  assert.deepEqual((await this.call('profiles')).map((profile) => profile.name), ['Personal']);
  const saved = await this.call('workspaceActionInWindow', PRIMARY, 'save', name);
  assert.equal(saved.ok, true, JSON.stringify(saved));
});

Given('a Work profile with a window', async function () {
  await createWork(this);
  await focusPersonal(this);
});

Given('a Work profile with a saved Space named {string} that no window shows', async function (name) {
  await createWork(this);
  await saveWorkSpace(this, name);
  assert.equal(await this.call('closeWindowRuntime', this.work.runtimeId), true);
  await waitForValue(() => runtimes(this),
    (all) => !all.some((runtime) => runtime.attached && runtime.profileId === this.work.profile.id), 'Work window closed');
  await focusPersonal(this);
});

Given('a Work window showing the Space {string}', async function (name) {
  await createWork(this);
  await saveWorkSpace(this, name);
  await focusPersonal(this);
});

Given('another Work Space named {string}', async function (name) {
  const made = await this.call('workspaceActionInWindow', this.work.runtimeId, 'create', name, { newWindow: true });
  assert.equal(made.ok, true, JSON.stringify(made));
  await focusPersonal(this);
});

Given('a Work Space named {string} set aside with an unfinished draft', async function (name) {
  await createWork(this);
  this.draftTab = await this.call('openTabInWindow', this.work.runtimeId, this.fixtureUrl('workspace-draft'), {});
  await this.waitForState((state) => state.tabs.some((tab) => tab.id === this.draftTab && tab.title === 'workspace-draft')
    && state.tabs.every((tab) => !tab.isLoading));
  this.draftText = 'Work draft still in progress';
  assert.equal(await this.call('workspacePageScript', this.draftTab, `(() => {
    const field = document.createElement('textarea');
    field.id = 'draft';
    field.value = ${JSON.stringify(this.draftText)};
    document.body.append(field);
    return field.value;
  })()`), this.draftText);
  this.draftPageIdentity = await this.call('workspacePageIdentity', this.draftTab);
  await saveWorkSpace(this, name);
  const next = await this.call('workspaceActionInWindow', this.work.runtimeId, 'create', 'Planning');
  assert.equal(next.ok, true, JSON.stringify(next));
  await waitForValue(() => runtimes(this), (all) => all.some((runtime) => runtime.profileId === this.work.profile.id
    && runtime.resident && runtime.workspaceId === this.workSpaceId && runtime.tabOrder.includes(this.draftTab)), `${name} set aside`);
  await focusPersonal(this);
});

Then('the menu shows {string} without a profile heading', async function (name) {
  const menu = await personalMenu();
  await spaceRow(menu, name).waitFor({ state: 'visible' });
  assert.equal(await menu.locator('.ws-profile-heading').count(), 0);
});

When('I choose New Space in the Spaces menu', async function () {
  const menu = await personalMenu();
  await menu.getByRole('button', { name: 'New space…', exact: true }).click();
  this.spaceEditor = menu.locator('.ws-editor');
  await this.spaceEditor.waitFor({ state: 'visible' });
});

Then('the New Space editor has no Profile choice', async function () {
  assert.equal(await this.spaceEditor.getByRole('combobox', { name: 'Profile', exact: true }).count(), 0);
});

Then('the Spaces menu lists {string} under {string} before {string} under {string}', async function (firstSpace, firstProfile, secondSpace, secondProfile) {
  const menu = await personalMenu();
  await rowUnder(menu, firstSpace, firstProfile);
  await rowUnder(menu, secondSpace, secondProfile);
  assert.deepEqual(await menu.locator('.ws-profile-heading').allTextContents(), [firstProfile, secondProfile]);
});

When('I choose {string} under {string} in the Spaces menu', async function (name, profile) {
  const row = await rowUnder(await openPersonalMenu(this), name, profile);
  await rememberWindows(this);
  if (this.windowsBeforeAction.some((runtime) => runtime.profileId === this.work.profile.id && runtime.workspaceId === this.workSpaceId)) {
    assert.equal(await row.locator('.ws-row-count').textContent(), 'Show window');
  }
  await row.getByRole('button').click();
});

Then('a new Work window shows {string}', async function (name) {
  const workList = () => this.call('workspaceActionInWindow', PRIMARY, 'list');
  const listing = await waitForValue(workList, (list) => list.otherProfiles?.some((profile) =>
    profile.id === this.work.profile.id && profile.items.some((item) => item.name === name)), `${name} saved in Work`);
  const space = listing.otherProfiles.find((profile) => profile.id === this.work.profile.id).items.find((item) => item.name === name);
  const beforeIds = this.windowsBeforeAction.map((runtime) => runtime.id);
  const target = (runtime) => runtime.attached && runtime.profileId === this.work.profile.id
    && runtime.workspaceId === space.id && !beforeIds.includes(runtime.id);
  const windows = await waitForValue(() => runtimes(this), (all) => all.some(target), `new Work window showing ${name}`);
  this.openedWork = windows.find(target);
  await waitForWorkFocus(this, this.openedWork.id);
});

Then('this Personal window still shows its web page, with no prompt shown', async function () {
  const before = this.windowsBeforeAction.find((runtime) => runtime.id === PRIMARY);
  const after = (await runtimes(this)).find((runtime) => runtime.id === PRIMARY);
  assert.equal(after.profileId, before.profileId);
  assert.equal(after.workspaceId, before.workspaceId);
  assert.equal(after.activeTabId, this.pageId);
  assert.deepEqual(after.tabOrder, before.tabOrder);
  assert.deepEqual(after.tabs, before.tabs);
  await waitForValue(() => this.call('overlayRendererMode'), (mode) => mode == null,
    'Personal overlay dismissed without a switch prompt');
});

Then('the existing Work window showing {string} comes forward', async function (name) {
  await waitForWorkFocus(this, this.work.runtimeId);
  const after = (await runtimes(this)).filter((runtime) => runtime.attached);
  assert.deepEqual(after.map((runtime) => runtime.id).sort(), this.windowsBeforeAction.map((runtime) => runtime.id).sort());
  const workWindow = after.find((runtime) => runtime.id === this.work.runtimeId);
  assert.equal(workWindow.profileId, this.work.profile.id);
  assert.equal(workWindow.workspaceId, this.workSpaceId, `${name} is still open in the same window`);
  assert.deepEqual(workWindow.tabOrder, this.windowsBeforeAction.find((runtime) => runtime.id === workWindow.id).tabOrder);
});

Then('the draft in {string} is still on the page', async function (name) {
  assert.ok(this.openedWork.tabOrder.includes(this.draftTab), `${name} keeps the draft tab`);
  assert.equal(await this.call('workspacePageIdentity', this.draftTab), this.draftPageIdentity);
  assert.equal(await this.call('workspacePageScript', this.draftTab, "document.querySelector('#draft').value"), this.draftText);
});

When('I choose the {string} profile in the editor', async function (profile) {
  const picker = this.spaceEditor.getByRole('combobox', { name: 'Profile', exact: true });
  assert.equal(await picker.locator('option:checked').textContent(), 'Personal');
  await picker.selectOption({ label: profile });
});

Then('the editor selects Empty and disables This window', async function () {
  const empty = this.spaceEditor.getByRole('radio', { name: 'Empty', exact: true });
  assert.equal(await empty.getAttribute('aria-checked'), 'true');
  assert.equal(await this.spaceEditor.getByRole('radio', { name: /^This window/ }).isDisabled(), true);
});

When('I create the Space {string} from the editor', async function (name) {
  await this.spaceEditor.locator('#workspaceName').fill(name);
  await rememberWindows(this);
  await this.spaceEditor.getByRole('button', { name: 'Create space', exact: true }).click();
});

Then('{string} is empty and appears in Work\'s Spaces list', async function (name) {
  const list = await this.call('workspaceActionInWindow', this.openedWork.id, 'list');
  const space = list.items.find((item) => item.name === name);
  assert.equal(space?.active, true);
  const startPage = /^blanc:\/\/newtab(?:[/?]|$)/;
  const urls = await this.call('workspaceActionInWindow', this.openedWork.id, 'saved-urls', space.id);
  assert.ok(urls.length <= 1 && urls.every((url) => startPage.test(url)), `no browsing pages saved: ${JSON.stringify(urls)}`);
  assert.equal(this.openedWork.tabs.length, 1, 'the empty Space shows a single Start Page');
  assert.match(this.openedWork.tabs[0].url, startPage);
});

// The renderer's DOM cannot see an Electron context menu. Record any request
// to show one and let its callback release the overlay's menu guard.
async function nativeMenusDuring(action) {
  const probe = await ctx.app.evaluateHandle(({ Menu }) => {
    const original = Menu.prototype.popup;
    const menus = [];
    Menu.prototype.popup = function (options) {
      menus.push(this.items.map((item) => item.label));
      options?.callback?.();
    };
    return { menus, restore: () => { Menu.prototype.popup = original; } };
  });
  try {
    await action();
    return await probe.evaluate(({ menus }) => menus);
  } finally {
    await probe.evaluate(({ restore }) => restore());
    await probe.dispose();
  }
}

Then('{string} under {string} offers no way to edit, delete, or reorder it', async function (name, profile) {
  const menu = await personalMenu();
  const row = await rowUnder(menu, name, profile);
  const open = row.getByRole('button');
  assert.equal(await open.count(), 1, 'the row has only its open button');
  assert.ok((await open.getAttribute('aria-label')).startsWith(`${name} · ${profile} · Show window`));

  const page = menu.page();
  const names = menu.locator('.ws-row-name');
  assert.deepEqual(await names.allTextContents(), [name, 'Planning']);
  const nativeMenus = await nativeMenusDuring(async () => {
    await open.click({ button: 'right' });
    await page.waitForFunction(() => window.__blancCtxWorkspaceId == null);
    await open.press('Alt+ArrowDown');
  });
  assert.deepEqual(nativeMenus, [], 'right-click offers no native Edit or Delete menu');
  const start = await open.boundingBox();
  const end = await spaceRow(menu, 'Planning').locator('.ws-row-main').boundingBox();
  assert.ok(start && end, 'both rows can be reached with the pointer');
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  try {
    await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2, { steps: 4 });
    assert.equal(await menu.locator('.ws-row.dragging').count(), 0);
  } finally {
    await page.mouse.up();
  }
  assert.deepEqual(await names.allTextContents(), [name, 'Planning']);
  const saved = await this.call('workspaceActionInWindow', this.work.runtimeId, 'list');
  assert.deepEqual(saved.items.map((item) => item.name), [name, 'Planning']);
});

When('I search for {string} in the Quick Switcher', async function (name) {
  await focusPersonal(this);
  await openOverlaySurface(this, 'openPanel', 'panel');
  this.quickSwitcher = await personalOverlay();
  await this.quickSwitcher.locator('#addressInput').fill(name);
});

Then('I see {string} labeled {string}', async function (name, label) {
  const page = this.quickSwitcher;
  this.switcherResult = page.locator('.island-row').filter({ has: page.locator('.row-space-tile') })
    .filter({ has: page.getByText(name, { exact: true }) }).filter({ has: page.getByText(label, { exact: true }) });
  await this.switcherResult.waitFor({ state: 'visible' });
});

When('I choose that Quick Switcher result', async function () {
  await rememberWindows(this);
  await this.switcherResult.click();
});

Then('I see {string} under {string}', async function (name, profile) {
  await rowUnder(await personalMenu(), name, profile);
});

// Freeze the durable deletion marker at the point before cleanup removes the
// registry entry, so this exercises the pending-profile filter deterministically.
function markWorkDeletion(profileId, pending) {
  return ctx.app.evaluate(({ app }, fixture) => {
    const path = process.getBuiltinModule('node:path');
    const require = process.getBuiltinModule('node:module').createRequire(path.join(app.getAppPath(), 'package.json'));
    const deletion = require('./src/main/profile-deletions');
    return fixture.pending ? deletion.markProfileDeletion(fixture.profileId) : deletion.clearProfileDeletion(fixture.profileId);
  }, { profileId, pending });
}

When('deletion of the Work profile is underway and I reopen the menu', async function () {
  await this.call('closeOverlay');
  await waitForValue(() => this.call('overlayRendererMode'), (mode) => mode == null, 'the Spaces menu closed');
  assert.equal(await markWorkDeletion(this.work.profile.id, true), true);
  this.workDeletionMarked = true;
  await this.call('clickPillSpace');
});

Then('the Spaces menu no longer shows {string} or {string}', async function (profile, name) {
  const menu = await personalMenu();
  await menu.getByRole('button', { name: 'Import Spaces from Arc' }).waitFor({ state: 'visible' });
  assert.equal(await menu.getByText(profile, { exact: true }).count(), 0);
  assert.equal(await spaceRow(menu, name).count(), 0);
});

After({ tags: '@F41-91' }, async function () {
  if (this.workDeletionMarked) await markWorkDeletion(this.work.profile.id, false);
});

When('I open the Spaces menu in the Work window', async function () {
  const shared = await this.call('sharedSpacesTest', 'state');
  assert.ok(shared.workspaces.items.some((space) => space.name === 'Work' && space.sharedSync), 'Personal has a shared Space');
  await waitForValue(() => this.call('focusWindowRuntime', this.work.runtimeId), Boolean, 'Work window focused');
  const id = await ctx.app.evaluate(({ BrowserWindow }) => BrowserWindow.getFocusedWindow()?.id);
  assert.ok(id, 'the Work window has native focus');
  const chrome = await pageInWindow(id, 'blanc-chrome://index/');
  await chrome.locator('#islandPill').click();
  const page = await pageInWindow(id, OVERLAY_URL);
  await page.locator('body[data-mode="panel"]').waitFor();
  await clickWhenSettled(page.getByRole('button', { name: 'Spaces', exact: true }), 'Spaces footer button in Work');
  this.workMenu = await visibleMenu(page);
});

Then('I see {string} under {string} without the sync marks', async function (name, profile) {
  const row = await rowUnder(this.workMenu, name, profile);
  assert.equal(await row.locator('.ws-sync-mark').count(), 0);
  assert.equal(await this.workMenu.locator('.ws-sync-status').count(), 0);
});
