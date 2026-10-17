const assert = require('node:assert');
const { Given, When, Then } = require('@cucumber/cucumber');
const ctx = require('./../support/context');
const { waitForValue, openOverlaySurface } = require('./../support/poll');

// F47 bangs. Typing goes through the real overlay input (editAddressInput
// dispatches a real input event; pressAddressKey a real keydown), the rows
// read back are the ones the ⌘L panel drew, and Enter is captured at main's
// navigateTabToAddress / tabs:search exactly where a real submit lands. The
// Settings scenario drives the page's own controls through the sheet.

async function waitForSettingsSheet(world) {
  await waitForValue(
    () => world.call('utilitySurface'),
    (surface) => surface?.visible && surface.ready && surface.url === 'blanc://settings/',
    'the Settings sheet'
  );
}

async function openLoaded(world, name, opts) {
  const url = world.fixtureUrl(name);
  const id = await world.call('openTab', url, opts);
  await world.waitForState((s) => s.tabs.some((t) => t.id === id && t.title === name && !t.isLoading));
  ctx.tabByName[name] = id;
  return id;
}

const bangRows = (world) => world.call('addressResultRows');

Given('a custom bang {string} named {string} for {string}', async function (code, name, template) {
  const stored = await this.call('setCustomBangs', [
    ...(ctx.customBangs ?? []),
    { code, name, template },
  ]);
  ctx.customBangs = stored;
  assert.ok(stored.some((b) => b.code === code), `custom bang ${code} was accepted`);
});

Given('bangs are turned off', async function () {
  await this.call('setBangsEnabled', false);
});

Given('a loaded tab titled {string}', async function (name) {
  await openLoaded(this, name);
});

When('I type {string} in the command bar', async function (text) {
  await this.call('captureSearchNavigation', true);
  await openOverlaySurface(this, 'openPalette', 'palette');
  assert.strictEqual(await this.call('editAddressInput', text, 'insertText'), true);
});

When('I turn bangs off while the command bar is open', async function () {
  await this.call('setBangsEnabled', false);
});

When('I press Arrow Up in the command bar', async function () {
  assert.strictEqual(await this.call('pressAddressKey', 'ArrowUp'), true);
});

Then('the highlighted picker row is scrolled into view', async function () {
  await waitForValue(() => this.call('addressActiveRowVisible'), (visible) => visible === true, 'the highlighted row inside the list viewport');
});

Given('ten bangs were used recently', async function () {
  // Ten codes outside the popular set, so recent (10) and popular (19)
  // stay separate sections and the panel's capped height has to scroll.
  for (const code of ['y8', 'ya', 'yc', 'yd', 'yh', 'yi', 'yj', 'mcf', 'mib', 'mik']) {
    await this.call('captureSearchNavigation', true);
    await openOverlaySurface(this, 'openPalette', 'palette');
    assert.strictEqual(await this.call('editAddressInput', `!${code} probe`, 'insertText'), true);
    assert.strictEqual(await this.call('pressAddressKey', 'Enter'), true);
    await waitForValue(() => this.call('capturedSearchSubmission'), (v) => v?.engine === 'bang' && v.query === 'probe', `bang ${code} recorded`);
  }
  await waitForValue(() => this.call('recentBangs'), (r) => r.length === 10, 'ten recents');
});

When('I press Arrow Down in the command bar', async function () {
  assert.strictEqual(await this.call('pressAddressKey', 'ArrowDown'), true);
});

When('I choose the picker row {string}', async function (code) {
  const rows = await waitForValue(bangRows.bind(null, this), (rows) => rows.some((r) => r.cmd === code), `picker row ${code}`);
  const index = rows.findIndex((r) => r.cmd === code);
  // Arrow Down lands on the first selectable row (no hint) or past the hint;
  // walk down to the row, then Enter fills it.
  const first = rows[0].enter ? 1 : 0;
  for (let i = first; i <= index; i += 1) assert.strictEqual(await this.call('pressAddressKey', 'ArrowDown'), true);
  assert.strictEqual(await this.call('pressAddressKey', 'Enter'), true);
});

Then('the bang hint row reads {string}', async function (text) {
  await waitForValue(bangRows.bind(null, this), (rows) => rows[0]?.hint === text && rows[0].enter, `hint row “${text}”`);
});

Then('no bang hint row is shown', async function () {
  await new Promise((resolve) => setTimeout(resolve, 300));
  const rows = await bangRows(this);
  assert.ok(!rows.some((r) => r.cmd && r.hint && r.enter), `no hint row among ${JSON.stringify(rows.map((r) => r.cmd))}`);
});

Then('the bang submission goes to {string}', async function (url) {
  const submission = await waitForValue(
    () => this.call('capturedSearchSubmission'),
    (value) => value?.engine === 'bang' && value?.url === url,
    `bang submission to ${url}`
  );
  assert.strictEqual(submission.url, url);
});

Then('the address submission goes to {string}', async function (url) {
  await waitForValue(
    () => this.call('capturedSearchSubmission'),
    (value) => value?.engine === 'address' && value?.url === url,
    `address submission to ${url}`
  );
});

Then('the picker shows the section {string}', async function (name) {
  await waitForValue(() => this.call('addressSectionHeaders'), (headers) => headers.includes(name), `picker section ${name}`);
});

Then('the picker lists {string}', async function (code) {
  await waitForValue(bangRows.bind(null, this), (rows) => rows.some((r) => r.cmd === code && !r.enter), `picker row ${code}`);
});

Then('the picker lists {string} first', async function (code) {
  await waitForValue(bangRows.bind(null, this), (rows) => rows[0]?.cmd === code, `${code} as the first row`);
});

Then('the first picker row is highlighted', async function () {
  await waitForValue(bangRows.bind(null, this), (rows) => rows[0]?.active === true && rows[0].cmd, 'the first row highlighted');
});

Then('the row for the tab titled {string} is highlighted under the hint', async function (title) {
  await waitForValue(bangRows.bind(null, this), (rows) => rows[0]?.enter === false && rows[1]?.title === title && rows[1].active, `${title} highlighted`);
});

Then('the command bar text is {string}', async function (text) {
  await waitForValue(() => this.call('addressInputValue'), (value) => value === text, `command bar text “${text}”`);
});

Then('the recently used bangs are {string}', async function (list) {
  const expected = list ? list.split(',').map((s) => s.trim()) : [];
  await waitForValue(() => this.call('recentBangs'), (recent) => JSON.stringify(recent) === JSON.stringify(expected), `recent bangs ${list || '(none)'}`);
});

Then('a direct suggestions request for {string} is refused', async function (query) {
  const response = await this.call('requestSearchSuggestions', query);
  assert.deepStrictEqual(response.suggestions, []);
  assert.deepStrictEqual(await this.call('searchSuggestionRequests'), []);
});

// ---------- Settings → General → Your bangs, through the page itself ----------

Given('the Settings sheet is open', async function () {
  await this.call('openSettings');
  await waitForSettingsSheet(this);
});

When('I add the bang {string} named {string} for {string} in Settings', async function (code, name, template) {
  assert.strictEqual(await this.call('settingsAddBang', code, name, template), true);
});

When('I remove the bang {string} in Settings', async function (code) {
  assert.strictEqual(await this.call('settingsRemoveBang', code), true);
});

Then('Settings lists the bang {string}', async function (code) {
  await waitForValue(() => this.call('settingsBangControls'), (c) => c.rows.some((r) => r.code === code), `Settings row ${code}`);
});

Then('Settings lists no bangs', async function () {
  await waitForValue(() => this.call('settingsBangControls'), (c) => c.rows.length === 0 && c.empty, 'empty Your bangs list');
});

Then('Settings says {string}', async function (text) {
  await waitForValue(() => this.call('settingsBangControls'), (c) => c.error === text || c.replaces === text, `Settings notice “${text}”`);
});
