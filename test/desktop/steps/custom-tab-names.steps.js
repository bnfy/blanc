const assert = require('node:assert');
const { Given, When, Then } = require('@cucumber/cucumber');
const ctx = require('./../support/context');
const { waitForValue, openOverlaySurface } = require('./../support/poll');
const { overlayPage } = require('./../support/overlay');

// F46 custom tab names. "Rename Tab…" and "Reset Tab Title" are native menu
// items the harness cannot click; their steps call exactly the action each
// item runs (beginRenameTab / renameTab(id, null)). Typing in the command bar
// and the labels read back go through the real overlay.

async function openLoaded(world, name, opts) {
  const url = world.fixtureUrl(name);
  const id = await world.call('openTab', url, opts);
  await world.waitForState((s) => s.tabs.some((t) => t.id === id && t.title === name && !t.isLoading));
  ctx.tabByName[name] = id;
  return id;
}

async function named(world, name, label, opts) {
  const id = await openLoaded(world, name, opts);
  await world.call('renameTab', id, label);
  await world.waitForState((s) => s.tabs.some((t) => t.id === id && t.customTitle === label));
  return id;
}

/** The tab's label as the ⌘L panel draws it. */
async function labelOf(world, id) {
  await openOverlaySurface(world, 'openPanel', 'panel');
  const page = await overlayPage();
  const text = await page.locator(`.tab-row[data-tab-id="${id}"] .row-title`).textContent();
  await world.call('closeOverlay');
  return text;
}

Given('a tab on {string} named {string}', async function (name, label) {
  ctx.renamedTabId = await named(this, name, label);
});

Given('a private tab on {string} named {string}', async function (name, label) {
  await named(this, name, label, { private: true });
});

When('I choose Rename Tab… for the tab on {string}', async function (name) {
  const id = ctx.tabByName[name];
  // The prefill is the tab's current label, so let its page title arrive.
  await this.waitForState((s) => s.tabs.some((t) => t.id === id && t.title === name && !t.isLoading));
  await this.call('beginRenameTab', id);
  await waitForValue(() => this.call('overlayRendererMode'), (m) => m === 'panel', 'the command bar to open');
});

When('I choose Reset Tab Title for the tab on {string}', async function (name) {
  await this.call('renameTab', ctx.tabByName[name], null);
});

Then('the command bar reads {string} with {string} selected', async function (text, selected) {
  const page = await overlayPage();
  const field = await waitForValue(
    () => page.evaluate(() => {
      const input = document.getElementById('addressInput');
      return { value: input.value, selected: input.value.slice(input.selectionStart, input.selectionEnd) };
    }),
    (f) => f.value === text,
    'the command bar text',
  );
  assert.equal(field.selected, selected);
});

When('I type {string} and press Enter in the command bar', async function (typed) {
  const page = await overlayPage();
  await page.keyboard.type(typed);
  await page.press('#addressInput', 'Enter');
});

When('that tab goes to {string} on another site', async function (name) {
  // insecure.test is a different site from 127.0.0.1 (the harness maps it to
  // the same fixture server with --host-resolver-rules).
  await this.call('navigateTab', ctx.renamedTabId, this.insecureFixtureUrl(name));
  await this.waitForState((s) => s.tabs.some((t) => t.id === ctx.renamedTabId && t.title === name && !t.isLoading));
  ctx.tabByName[name] = ctx.renamedTabId;
});

Then('the tab on {string} is labelled {string}', async function (name, label) {
  // Matched by path, so it finds the tab whichever host it reached it on and
  // after a relaunch (fresh tab ids). The rename crosses IPC asynchronously:
  // wait for main's record to agree before reading what the panel draws —
  // and for any load to finish, since a loading row reads "Loading…" (the
  // selected tab reloads after a relaunch).
  const pathname = new URL(this.fixtureUrl(name)).pathname;
  const state = await this.waitForState((s) => s.tabs.some((t) =>
    t.url.endsWith(pathname) && (t.customTitle || t.title) === label && !t.isLoading));
  const tab = state.tabs.find((t) => t.url.endsWith(pathname));
  assert.equal(await labelOf(this, tab.id), label);
});

// Cucumber matches step text regardless of Given/When/Then, so this one
// definition also serves "Then the saved session holds the name …".
Given('the saved session holds the name {string}', async function (label) {
  await waitForValue(
    () => this.call('persistedSessionData'),
    (data) => JSON.stringify(data?.windows ?? []).includes(`"customTitle":${JSON.stringify(label)}`),
    `session.json to hold ${label}`,
  );
});

Then('the saved session does not contain {string}', async function (text) {
  const data = await this.call('persistedSessionData');
  assert.equal(JSON.stringify(data).includes(text), false);
});

When('I press Enter in the command bar', async function () {
  const page = await overlayPage();
  await page.press('#addressInput', 'Enter');
});

When('the page on {string} retitles itself to {string}', async function (name, title) {
  const id = ctx.tabByName[name];
  await this.call('setTabPresentation', id, { title });
  await this.waitForState((s) => s.tabs.some((t) => t.id === id && t.title === title));
});

When('the page on {string} starts loading', async function (name) {
  const id = ctx.tabByName[name];
  await this.call('setTabPresentation', id, { isLoading: true });
  await this.waitForState((s) => s.tabs.some((t) => t.id === id && t.isLoading));
});

// Unlike "is labelled", this reads the row while the tab may be loading.
Then('the command panel row for {string} reads {string}', async function (name, label) {
  assert.equal(await labelOf(this, ctx.tabByName[name]), label);
});
