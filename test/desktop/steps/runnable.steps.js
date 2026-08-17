const assert = require('node:assert');
const { Given, When, Then } = require('@cucumber/cucumber');
const ctx = require('./../support/context');
const { waitForValue, openOverlaySurface } = require('./../support/poll');
const { runSlashCommand } = require('./../support/overlay');

// Step definitions for the desktop-runnable scenario set (see the `runnable`
// profile in cucumber.mjs). Every step is intent-level and drives the app
// through the test hook; where a WebContentsView navigation settles async, the
// assertion polls via world.waitForState(). Steps asserting "appears on the
// <page>" check the store the page renders from — a store-level proxy for the
// DOM, documented in test/desktop/README.md.

// ---------- Given (setup) ----------

async function openNamed(world, name) {
  const url = world.fixtureUrl(name);
  const id = await world.call('openTab', url);
  ctx.tabByName[name] = id;
  ctx.activeExpectedUrl = url;
  return id;
}

Given('a tab open on {string}', async function (name) { await openNamed(this, name); });
Given('the active tab is on {string}', async function (name) { await openNamed(this, name); });

Given('tabs open on {string} and {string}', async function (a, b) {
  await openNamed(this, a);
  await openNamed(this, b);
});

Given('the active tab has no group', async function () { await openNamed(this, 'plain'); });

Given('the active tab is in a group named {string}', async function (name) {
  await openNamed(this, 'anchor');
  await this.call('groupActiveByName', name);
});

Given('a group {string} with 1 tab', async function (name) {
  await openNamed(this, `${name}-1`);
  await this.call('groupActiveByName', name);
});

Given('history has at least one entry', async function () { await this.call('seedHistory'); });

Given('there is no active supporter license', async function () { await this.call('clearSupporter'); });

Given('the active tab is private', async function () {
  ctx.privateTabId = await this.call('openTab', 'blanc://newtab/?private=1', { private: true });
});

// "ad/tracker blocking is enabled" is BOTH a Background precondition and a final
// assertion (F12-3). A step is matched by text regardless of keyword, so it is
// defined once, as an assertion. reset() leaves blocking enabled, so it holds
// as a precondition too. (See the Then section.)

// ---------- When (actions) ----------

When('I close that tab', async function () {
  const names = Object.keys(ctx.tabByName);
  const id = ctx.tabByName[names[names.length - 1]];
  await this.call('closeTab', id);
});

When('I reopen the last closed tab', async function () { await this.call('reopenClosed'); });

// ---- F2-6: group close is one undo step ----

/** Ordered member URLs for a named group, read from the same state()
 *  projection the panel renders from. Restored tabs get NEW ids, so order
 *  comparisons go by URL, never by id. */
async function groupUrls(world, name) {
  const state = await world.call('state');
  const group = state.groups.find((g) => g.name === String(name).toLowerCase());
  if (!group) return [];
  return state.tabs.filter((t) => t.groupId === group.id).map((t) => t.url);
}

Given('a group {string} holding {int} tabs', async function (name, count) {
  for (let i = 1; i <= count; i += 1) {
    const memberName = `${name}-member-${i}.example`;
    const id = await this.call('openTab', this.fixtureUrl(memberName));
    await this.call('groupTabByName', id, name);
  }
  // Retain the pre-close order: the reopened members carry fresh ids.
  ctx.expectedGroupUrls = await groupUrls(this, name);
  assert.strictEqual(ctx.expectedGroupUrls.length, count);
});

When('I close the group {string}', async function (name) {
  await this.call('closeGroupByName', name);
});

Then('a group named {string} holds {int} tabs', async function (name, count) {
  await waitForValue(
    async () => (await groupUrls(this, name)).length,
    (n) => n === count,
    `group "${name}" holds ${count} tabs`,
  );
});

Then("the group's tabs are in their original order", async function () {
  const urls = await groupUrls(this, 'research');
  assert.deepStrictEqual(urls, ctx.expectedGroupUrls);
});
When('I duplicate the active tab', async function () { await this.call('duplicateActive'); });
When('I pin {string}', async function (name) { await this.call('pinTab', ctx.tabByName[name]); });
When('I open a new tab', async function () { ctx.lastNewTabId = await this.call('newTab'); });
When('I close the last tab in {string}', async function (name) { await this.call('closeTabsInGroupName', name); });

When('I run the slash command {string}', async function (cmd) {
  const text = String(cmd).trim();
  const before = await this.call('state');
  await runSlashCommand(this, text);
  if (text.split(/\s+/)[0] === '/new') {
    const known = new Set(before.tabs.map((tab) => tab.id));
    await this.waitForState((s) => s.tabs.some((tab) => !known.has(tab.id)));
    const after = await this.call('state');
    ctx.lastNewTabId = after.tabs.map((tab) => tab.id).find((id) => !known.has(id)) ?? ctx.lastNewTabId;
  }
});

When('I add the active page to favorites', async function () {
  if (ctx.activeExpectedUrl) {
    await this.waitForState((s) => s.tabs.some((t) => t.id === s.activeTabId && t.url === ctx.activeExpectedUrl));
  }
  await this.call('favoriteActive');
});

When('I add all open tabs to favorites', async function () {
  const ids = Object.values(ctx.tabByName);
  await this.waitForState((s) => ids.every((id) => {
    const t = s.tabs.find((x) => x.id === id);
    return t && /^https?:/.test(t.url);
  }));
  await this.call('favoriteAllTabs');
});

When('I attempt to set the search engine to {string}', async function (x) { await this.call('setSearchEngine', x); });
When('I turn search suggestions off', async function () { await this.call('setSearchSuggestions', false); });
When('settings contain the app icon {string}', async function (x) { await this.call('setAppIcon', x); });
When('I add {string} to the ad-block exceptions', async function (h) { await this.call('addException', h); });

When('browser chrome attempts to navigate to {string}', async function (url) {
  await this.call('attemptChromeNavigation', url);
});

// ---------- Then (assertions) ----------

Then('a tab open on {string} is present', async function (name) {
  const url = this.fixtureUrl(name);
  await this.waitForState((s) => s.tabs.some((t) => t.url === url));
});

Then('a second tab open on {string} is present', async function (name) {
  const url = this.fixtureUrl(name);
  await this.waitForState((s) => s.tabs.filter((t) => t.url === url).length >= 2);
});

Then('{string} is marked pinned', async function (name) {
  const s = await this.state();
  const t = s.tabs.find((x) => x.id === ctx.tabByName[name]);
  assert.ok(t && t.pinned === true, `${name} should be pinned`);
});

Then('{string} is shown inside the group {string}', async function (tabName, groupName) {
  const s = await this.state();
  const group = s.groups.find((g) => g.name === groupName.toLowerCase());
  const cluster = s.clusters.find((c) => c.groupId === group?.id);
  assert.ok(group && cluster?.tabIds.includes(ctx.tabByName[tabName]), `${tabName} should render inside ${groupName}`);
});

Then('{string} is ordered before {string}', async function (a, b) {
  const s = await this.state();
  const displayedOrder = s.clusters.flatMap((cluster) => cluster.tabIds);
  const ia = displayedOrder.indexOf(ctx.tabByName[a]);
  const ib = displayedOrder.indexOf(ctx.tabByName[b]);
  assert.ok(ia >= 0 && ib >= 0 && ia < ib, `${a} (${ia}) should be before ${b} (${ib})`);
});

Then('the new tab has no group', async function () {
  const s = await this.state();
  const t = s.tabs.find((x) => x.id === ctx.lastNewTabId);
  assert.ok(t && t.groupId == null, 'new tab should be ungrouped');
});

Then('the new tab is on the new-tab page', async function () {
  await this.waitForState((s) => {
    const t = s.tabs.find((x) => x.id === ctx.lastNewTabId);
    return t && t.url.startsWith('blanc://newtab');
  });
});

Then('the private tab uses a different web session from ordinary tabs', async function () {
  const s = await this.state();
  const privateTab = s.tabs.find((t) => t.id === ctx.privateTabId);
  assert.equal(privateTab?.sessionKind, 'private');
  assert.ok(
    s.tabs.some((t) => !t.private && t.sessionKind === 'default'),
    'an ordinary tab should remain on the persistent default session'
  );
});

// Regression guard for the blanc:// scheme being registered only on the
// default session: a private new tab would open blank (committed URL empty)
// while its tab-model .url still read blanc://newtab. Assert the ACTUAL
// committed WebContents URL (loadedUrl), not the model's stored url.
Then("the private tab's start page loads in the non-persistent session", async function () {
  const s = await this.waitForState((st) => {
    const t = st.tabs.find((x) => x.id === ctx.privateTabId);
    return t && t.loadedUrl === 'blanc://newtab/?private=1' && t.loading === false;
  });
  const t = s.tabs.find((x) => x.id === ctx.privateTabId);
  assert.equal(t.sessionKind, 'private', 'private tab must use the private session');
  assert.equal(t.sessionPersistent, false, 'the private session must be non-persistent');
  assert.equal(
    t.loadedUrl,
    'blanc://newtab/?private=1',
    'the committed WebContents URL must be the private start page, not a blank load'
  );
});

Then('a group named {string} exists', async function (name) {
  const s = await this.state();
  assert.ok(s.groups.some((g) => g.name === name.toLowerCase()), `group ${name} should exist`);
});

Then('the active tab is in {string}', async function (name) {
  const s = await this.state();
  const g = s.groups.find((x) => x.name === name.toLowerCase());
  const t = s.tabs.find((x) => x.id === s.activeTabId);
  assert.ok(g && t && t.groupId === g.id, `active tab should be in ${name}`);
});

Then('the group {string} no longer exists', async function (name) {
  const s = await this.state();
  assert.ok(!s.groups.some((g) => g.name === name.toLowerCase()), `group ${name} should be pruned`);
});

Then('the favorite control shows as active', async function () {
  assert.strictEqual(await this.call('activeFavorited'), true);
});

Then('{string} appears on the new-tab page', async function (name) {
  const urls = await this.call('bookmarkUrls');
  assert.ok(urls.includes(this.fixtureUrl(name)), `${name} should be a favorite`);
});

Then('{string} appears on the favorites page', async function (name) {
  const urls = await this.call('bookmarkUrls');
  assert.ok(urls.includes(this.fixtureUrl(name)), `${name} should be a favorite`);
});

Then('history is empty', async function () {
  assert.strictEqual(await this.call('historyCount'), 0);
});

// NOTE: `/` is the alternation operator in Cucumber Expressions, so the literal
// slash in "ad/tracker" must be escaped (\\/) for these to match the step text.
Then('ad\\/tracker blocking is enabled', async function () {
  assert.strictEqual(await this.call('adblockEnabled'), true);
});

Then('ad\\/tracker blocking is disabled', async function () {
  assert.strictEqual(await this.call('adblockEnabled'), false);
});

Then('the search engine remains unchanged', async function () {
  assert.strictEqual(await this.call('searchEngine'), 'duckduckgo');
});

Then('search suggestions are disabled', async function () {
  assert.strictEqual(await this.call('searchSuggestions'), false);
});

Then('the search-suggestions preference remains device-local', async function () {
  const values = await this.call('settingsSyncValues');
  assert.ok(!Object.hasOwn(values, 'searchSuggestions'));
});

Then('the effective app icon is {string}', async function (x) {
  assert.strictEqual(await this.call('appIcon'), x);
});

Then('the ad-block exceptions contain {string}', async function (h) {
  const ex = await this.call('exceptions');
  assert.ok(ex.includes(h.toLowerCase()), `exceptions ${JSON.stringify(ex)} should contain ${h.toLowerCase()}`);
});

Then('the ad-block exceptions do not contain {string}', async function (h) {
  const ex = await this.call('exceptions');
  assert.ok(!ex.includes(h.toLowerCase()), `exceptions ${JSON.stringify(ex)} should not contain ${h.toLowerCase()}`);
});

// "the active site" keeps the scenario platform-neutral: the fixture server's
// host is an implementation detail of this harness, not part of the contract.
Then('the ad-block exceptions contain the active site', async function () {
  const [ex, host] = [await this.call('exceptions'), await this.call('activeHostname')];
  assert.ok(host, 'the active tab should have an exception-list hostname');
  assert.ok(ex.includes(host), `exceptions ${JSON.stringify(ex)} should contain ${host}`);
});

Then('the ad-block exceptions do not contain the active site', async function () {
  const [ex, host] = [await this.call('exceptions'), await this.call('activeHostname')];
  assert.ok(host, 'the active tab should have an exception-list hostname');
  assert.ok(!ex.includes(host), `exceptions ${JSON.stringify(ex)} should not contain ${host}`);
});

Then('the pill shows that ads are allowed here', async function () {
  const shield = await waitForValue(
    () => this.call('pillShieldState'),
    (s) => s && !s.hidden && s.off,
    'the pill shield to show the allow-listed state',
  );
  assert.match(shield.title, /Blanc Blocker off for this site/i);
});

Then('the pill no longer shows that ads are allowed here', async function () {
  await waitForValue(
    () => this.call('pillShieldState'),
    (s) => s && !s.off,
    'the pill shield to drop the allow-listed state',
  );
});

// ---------- F12-6: shield popover ----------

When('I open the shield popover from the pill', async function () {
  await this.call('clickPillShield');
  await waitForValue(
    () => this.call('shieldPopoverState'),
    (p) => p && p.visible,
    'the shield popover to open',
  );
});

When('I flip the shield popover toggle', async function () {
  await this.call('clickShieldPopoverToggle');
});

/** Shared assertion: popover visible, in the given on/off state, describing
 * the ACTIVE site (host compared against the same exception-list hostname
 * the toggle writes, not a hardcoded fixture host). */
async function assertShieldPopover(world, on) {
  const host = await world.call('activeHostname');
  const pop = await waitForValue(
    () => world.call('shieldPopoverState'),
    (p) => p && p.visible && p.on === on,
    `the shield popover to show protection ${on ? 'on' : 'off'}`,
  );
  assert.equal(pop.host, host, 'the popover should describe the active site');
  assert.ok(pop.toggleShown, 'the site toggle should be shown');
}

Then('the shield popover shows protection on for the active site', async function () {
  await assertShieldPopover(this, true);
});

Then('the shield popover shows protection off for the active site', async function () {
  await assertShieldPopover(this, false);
});

Then('browser chrome remains on its trusted local document', async function () {
  assert.equal(await this.call('chromeUrl'), 'blanc-chrome://index/');
});

// ---------- Utility sheet (F16-2, F16-4, F16-5) ----------

/** Poll the sheet state — fixed sleeps turn slow CI into flakes; a missing
 * state change must time out loudly. */
async function untilSurface(world, predicate, what, ms = 5000) {
  const deadline = Date.now() + ms;
  for (;;) {
    const surf = await world.call('utilitySurface');
    if (predicate(surf)) return surf;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}; last: ${JSON.stringify(surf)}`);
    await new Promise((r) => setTimeout(r, 100));
  }
}

const sheetHostFor = (name) => (name === 'favorites' ? 'bookmarks' : name);

Given('the new-tab page is open', async function () {
  await this.call('newTab'); // opens blanc://newtab as the active tab
});

Given('a favorite for {string} exists', async function (host) {
  await this.call('seedFavorite', `https://${host}/`, host);
});

Given('the favorites page is open in the utility sheet', async function () {
  await this.call('openFavoritesSheet');
  await untilSurface(this, (s) => s.visible && s.ready, 'favorites sheet to open');
  this.tabStateBefore = await this.call('state');
});

When('I follow its {string} navigation link', async function (label) {
  assert.strictEqual(label, 'Favorites', 'the ledger has exactly one nav link');
  this.tabStateBefore = await this.call('state');
  await this.call('followNewtabFavoritesLink');
  await untilSurface(this, (s) => s.visible && s.ready, 'sheet to open from ledger link');
});

When('I open the downloads page', async function () {
  this.tabStateBefore = await this.call('state');
  await this.call('openDownloads');
  await untilSurface(this, (s) => s.visible && s.ready, 'downloads sheet to open');
});

When('I activate that favorite', async function () {
  await this.call('clickFirstSheetLink');
  await this.waitForState((s) => s.tabs.length === this.tabStateBefore.tabs.length + 1);
});

When('the utility sheet contents are destroyed', async function () {
  this.destroyedUtilitySheetContentsId = await this.call('utilitySheetContentsId');
  assert.ok(this.destroyedUtilitySheetContentsId, 'the open utility sheet should have webContents');
  assert.strictEqual(await this.call('destroyUtilitySheetContents'), true);
  await untilSurface(this, (s) => !s.visible, 'destroyed sheet to be dismissed');
});

Then('the {word} page opens in the utility sheet', async function (name) {
  const surf = await untilSurface(this, (s) => s.visible && s.ready, `${name} sheet`);
  assert.strictEqual(surf.url, `blanc://${sheetHostFor(name)}/`);
});

Then('the {word} page opens in the utility sheet under the blanc scheme', async function (name) {
  const surf = await untilSurface(this, (s) => s.visible && s.ready, `${name} sheet`);
  assert.ok(surf.url.startsWith(`blanc://${sheetHostFor(name)}/`),
    `sheet url ${surf.url} should be blanc://${sheetHostFor(name)}/`);
});

Then('no new tab is created', async function () {
  const now = await this.call('state');
  assert.strictEqual(now.tabs.length, this.tabStateBefore.tabs.length);
});

Then('the active tab and tab order are unchanged', async function () {
  const now = await this.call('state');
  assert.strictEqual(now.activeTabId, this.tabStateBefore.activeTabId);
  assert.deepStrictEqual(now.tabOrder, this.tabStateBefore.tabOrder);
});

Then('exactly one new tab opens on {string}', async function (host) {
  const now = await this.call('state');
  assert.strictEqual(now.tabs.length, this.tabStateBefore.tabs.length + 1);
  assert.ok(now.tabs.some((t) => t.url.includes(host)),
    `a tab should be on ${host}: ${JSON.stringify(now.tabs.map((t) => t.url))}`);
});

Then('the utility sheet is dismissed', async function () {
  await untilSurface(this, (s) => !s.visible, 'sheet to dismiss');
});

Then('the utility sheet uses newly-created contents', async function () {
  const id = await this.call('utilitySheetContentsId');
  assert.ok(id, 'the replacement utility sheet should have webContents');
  assert.notStrictEqual(id, this.destroyedUtilitySheetContentsId);
});

// F16-6: the P1 regression class this guards — utility routing running
// BEFORE the web→blanc denial in a navigation handler — is an ordering
// bug, so the coverage must drive the real handlers from a real committed
// web document, with execution PROOF: the test-hook attack drivers resolve
// only after the hostile expression ran in the page (a scenario must never
// pass because an inline script silently failed to load).

/** Negative assertions can't poll for success — give a mis-routed summon a
 * bounded window to land before declaring the sheet stayed closed. */
const settle = (ms) => new Promise((r) => setTimeout(r, ms));

// A directly loaded about:blank document has an opaque origin and reaches the
// blanc:// navigation handlers. HTTP content cannot: Chromium blocks
// http→blanc:// upstream, so will-navigate never fires from it (verified by
// mutation — an HTTP-origin fixture would make this test vacuous). data: is
// deliberately rejected by Blanc's top-level URL policy and therefore cannot
// be used as the hostile fixture anymore.
const UNTRUSTED_DOC = 'about:blank';

Given('a tab open on untrusted web content', async function () {
  const id = await this.call('openTab', UNTRUSTED_DOC);
  ctx.tabByName.hostile = id;
  // The attack only exercises the handlers if the document actually
  // committed — gate on the tab's committed URL, not just creation.
  await this.waitForState((s) => {
    const t = s.tabs.find((x) => x.id === id);
    return t && t.loadedUrl === UNTRUSTED_DOC && !t.loading;
  });
});

When('the page navigates itself to the settings page', async function () {
  await this.call('attemptNavigateActiveTab', 'blanc://settings/');
  await settle(500);
});

When('the page window-opens the settings page', async function () {
  await this.call('attemptWindowOpenActiveTab', 'blanc://settings/');
  await settle(500);
});

Then('the utility sheet remains closed', async function () {
  const surf = await this.call('utilitySurface');
  assert.strictEqual(surf.visible, false,
    `web content summoned the sheet: ${JSON.stringify(surf)}`);
});

// F16-7: toggle must compare page identity, not URL spelling — typed
// addresses arrive without the trailing slash the menu items carry.
Given('the settings page is open in the utility sheet via a typed address', async function () {
  await this.call('openTab', 'blanc://settings'); // typed spelling, no trailing slash
  await untilSurface(this, (s) => s.visible && s.ready, 'settings sheet (typed spelling)');
});

When('the settings page is invoked again by the menu', async function () {
  await this.call('openTab', 'blanc://settings/'); // canonical menu spelling
});

// ---------- F5-6: real navigation through the command bar ----------

Given('the island panel is open', async function () {
  await openOverlaySurface(this, 'openPanel', 'panel');
});

When('I submit the address of {string} in the command bar', async function (name) {
  const url = this.fixtureUrl(name);
  // editAddressInput dispatches a real input event (inputTouched flips), so
  // the renderer treats the value as typed; Enter then navigates it.
  await this.call('editAddressInput', url);
  assert.strictEqual(await this.call('pressAddressKey', 'Enter'), true);
});

Then('the active tab loads the address of {string}', async function (name) {
  const url = this.fixtureUrl(name);
  // loadedUrl is the committed WebContents URL — the model's t.url is set
  // synchronously before any load and would pass against a botched loadURL.
  await this.waitForState((s) =>
    s.tabs.some((t) => t.id === s.activeTabId && t.loadedUrl === url && t.loading === false));
});

// ---------- F19-2 / F19-3: address-bar context menu ----------

Given('the active tab is on {string} with query {string}', async function (name, query) {
  const url = this.fixtureUrl(name) + query;
  const id = await this.call('openTab', url);
  ctx.tabByName[name] = id;
  ctx.activeExpectedUrl = url;
  await this.waitForState((s) => s.tabs.some((t) => t.id === id && t.url === url));
});

Given('the clipboard holds the address of {string}', async function (name) {
  await this.call('setClipboardText', this.fixtureUrl(name));
});

// Binding note: a native popup can't be driven by the harness, so "opening"
// the menu captures the descriptors the popup would show. It still asserts
// the real wiring exists (attachAddressMenu installed) and reads fieldText
// through the production executeJavaScript path — which requires the island
// to actually be open, exactly like the real menu.
async function captureAddressMenu(world) {
  assert.equal(await world.call('addressMenuWired'), true,
    'attachAddressMenu is wired to the overlay');
  ctx.addressMenuFieldText = await world.call('addressFieldText');
  ctx.addressMenuItems = await world.call('addressMenu', { fieldText: ctx.addressMenuFieldText });
}

When('I open the command-bar context menu', async function () {
  await captureAddressMenu(this);
});

Then('the {string} item is enabled', async function (label) {
  const item = ctx.addressMenuItems.find((i) => i.label === label);
  assert.ok(item, `menu has "${label}"`);
  assert.equal(item.enabled, true, `"${label}" enabled`);
});

When('I choose {string} from the command-bar context menu', async function (label) {
  // F19-3 skips the explicit "open" step: capture lazily, same shared helper.
  if (!ctx.addressMenuItems) await captureAddressMenu(this);
  const item = ctx.addressMenuItems.find((i) => i.label === label);
  assert.ok(item, `menu has "${label}"`);
  assert.equal(item.enabled, true, `"${label}" enabled`);
  await this.call('runAddressMenuItem', item.id, ctx.addressMenuFieldText);
});

Then('the clipboard holds the page address with query {string}', async function (query) {
  const expected = ctx.activeExpectedUrl.split('?')[0] + query;
  assert.equal(await this.call('readClipboardText'), expected);
});

Then('the island is closed', async function () {
  assert.equal(await this.call('overlayMode'), null);
});

// ---------- F12-7/8/9: connection in the site-controls popover ----------

Given('I am on an unencrypted page', async function () {
  // insecure.test maps to the loopback fixtures server at the resolver, so
  // this is a plain-HTTP page whose HOSTNAME is not loopback — the one case
  // that renders the warning badge and the 'Not encrypted' row.
  const id = await this.call('openTab', this.insecureFixtureUrl('plain-http'));
  ctx.tabByName['plain-http'] = id;
  // The badge is visible only once the load commits (connection is null —
  // deliberately claimless — while loading), so wait for visibility, not for
  // the aria attribute, which exists even while hidden.
  await waitForValue(
    () => this.call('pillInsecureHidden'),
    (hidden) => hidden === false,
    'the not-secure badge to render',
  );
});

Given('I am on an encrypted page', async function () {
  // TLS on loopback behind the secure.test mapping, trusted only through the
  // per-run SPKI pin — a genuinely https-committed page, fully offline.
  const id = await this.call('openTab', this.secureFixtureUrl('plain-https'));
  ctx.tabByName['plain-https'] = id;
});

When('I open site controls', async function () {
  this.shieldBoundsBefore = null;
  await this.call('clickPillShield');
  await waitForValue(
    () => this.call('shieldPopoverState'),
    (p) => p && p.visible,
    'site controls to open from the shield',
  );
  this.shieldBoundsBefore = await this.call('overlayBounds');
});

When('I open site controls from the warning badge', async function () {
  assert.equal(await this.call('clickInsecureBadge'), true, 'badge should be clickable');
  await waitForValue(
    () => this.call('shieldPopoverState'),
    (p) => p && p.visible,
    'site controls to open from the badge',
  );
});

Then('site controls report the connection is not encrypted', async function () {
  const state = await waitForValue(
    () => this.call('shieldPopoverState'),
    (p) => p && p.visible && p.connection,
    'the connection row to render',
  );
  assert.equal(state.connection, 'Connection · Not encrypted');
  assert.match(state.header, /Ad & tracker blocking/);
});

Then('site controls report the connection uses HTTPS', async function () {
  const state = await waitForValue(
    () => this.call('shieldPopoverState'),
    (p) => p && p.visible && p.connection,
    'the connection row to render',
  );
  assert.equal(state.connection, 'Connection · Uses HTTPS');
});

Then('only the shield reports itself expanded', async function () {
  const v = await waitForValue(
    () => this.call('shieldAriaExpanded'),
    (x) => x && x.shield === 'true',
    'the shield to report expanded',
  );
  assert.equal(v.insecure, 'false');
});

Then('site controls stay open and move to the warning badge', async function () {
  const before = this.shieldBoundsBefore;
  assert.ok(before, 'bounds should have been captured when the popover opened');
  const after = await waitForValue(
    () => this.call('overlayBounds'),
    (b) => b && b.x !== before.x,
    'the popover to re-anchor',
  );
  // The badge sits left of the shield in the pill, so the card moves left —
  // and this is the assertion that catches "stored trigger updated but the
  // bounds never moved".
  assert.ok(after.x < before.x, `popover should move toward the badge (was x=${before.x}, now x=${after.x})`);
  const state = await this.call('shieldPopoverState');
  assert.equal(state.visible, true, 'popover must stay open across the re-anchor');
});

Then('only the warning badge reports itself expanded', async function () {
  const v = await waitForValue(
    () => this.call('shieldAriaExpanded'),
    (x) => x && x.insecure === 'true',
    'the badge to report expanded',
  );
  assert.equal(v.shield, 'false');
});

When('I dismiss site controls with Escape', async function () {
  await this.call('pressOverlayEscape');
});

Then('focus returns to the warning badge', async function () {
  await waitForValue(
    () => this.call('chromeFocusedId'),
    (id) => id === 'pillInsecure',
    'focus to return to the warning badge',
  );
});
