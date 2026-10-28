'use strict';

// F60 link routing: the Settings group, and links delivered the way the OS
// delivers them (app 'open-url'). The routed site is the fixture server under
// its insecure.test name, so a domain rule has a real host to match.

const assert = require('node:assert/strict');
const { Given, When, Then } = require('@cucumber/cucumber');
const ctx = require('../support/context');
const { waitForValue } = require('../support/poll');

const ROUTED_HOST = 'insecure.test';
const linkRoutes = (world, ...args) => world.call('settingsLinkRoutes', ...args);
const storedRoutes = () => ctx.app.evaluate((_electron, root) => {
  const require = process.getBuiltinModule('module').createRequire(`${root}/package.json`);
  return require('./src/main/settings').getSettings().linkRoutes;
}, process.cwd());

async function deliver(world, url) {
  world.deliveredUrl = url;
  await ctx.app.evaluate(({ app }, link) => app.emit('open-url', { preventDefault() {} }, link), url);
  const runtimes = await waitForValue(() => world.call('windowRuntimes'),
    (all) => all.some((runtime) => runtime.tabs.some((tab) => tab.url === url)), `delivered ${url}`);
  world.receiver = runtimes.find((runtime) => runtime.tabs.some((tab) => tab.url === url));
}

Then('the Open links from other apps group is hidden', async function () {
  const state = await waitForValue(() => linkRoutes(this, 'state'), (value) => value?.ready, 'link routing group');
  assert.equal(state.shown, false);
});

Then('the Open links from other apps group is shown', async function () {
  await waitForValue(() => linkRoutes(this, 'state'), (state) => state?.shown, 'link routing group shown');
});

Then('its last row reads {string}', async function (text) {
  assert.equal((await linkRoutes(this, 'state')).fallback, text);
});

When('I add a rule in Settings for a pasted link to the routed site', async function () {
  await waitForValue(() => linkRoutes(this, 'state'), (state) => state?.shown, 'link routing group shown');
  assert.equal(await linkRoutes(this, 'add'), 1);
  assert.equal(await linkRoutes(this, 'fill', 0, this.insecureFixtureUrl('pasted-link')), true);
});

Then('the rule keeps just the routed site\'s domain', async function () {
  const [row] = (await linkRoutes(this, 'state')).rows;
  assert.equal(row.value, ROUTED_HOST);
  assert.equal(row.invalid, false);
  assert.match(row.error, new RegExp(`${ROUTED_HOST.replace('.', '\\.')}$`));
});

When('I choose the Personal profile for that rule', async function () {
  // Through Work and back, so the menu's own change events do the saving.
  assert.equal(await linkRoutes(this, 'profile', 0, this.namedProfile.id), true);
  await waitForValue(storedRoutes, (stored) => stored[0]?.destination.profileId === this.namedProfile.id, 'rule saved for Work');
  assert.equal(await linkRoutes(this, 'profile', 0, 'default'), true);
});

Then('the rule is saved for the routed site pointing at Personal', async function () {
  const routes = await waitForValue(storedRoutes,
    (stored) => stored.length === 1 && stored[0].destination.profileId === 'default', 'saved rule');
  assert.deepEqual(routes[0].match, { kind: 'domain', value: ROUTED_HOST });
  assert.deepEqual({ ...routes[0].destination }, { profileId: 'default', spaceId: null, private: false });
  const [row] = (await linkRoutes(this, 'state')).rows;
  assert.equal(row.label, `Links to ${ROUTED_HOST} open in Personal`);
});

Given('a saved rule sending the routed site to Work', async function () {
  const result = await ctx.app.evaluate((_electron, { root, profileId, host }) => {
    const require = process.getBuiltinModule('module').createRequire(`${root}/package.json`);
    return require('./src/main/settings').setLinkRoutes([
      { id: 'routed', match: { kind: 'domain', value: host }, destination: { profileId } },
    ]);
  }, { root: process.cwd(), profileId: this.namedProfile.id, host: ROUTED_HOST });
  assert.equal(result.ok, true);
});

When('another app opens a link to the routed site', async function () {
  await deliver(this, this.insecureFixtureUrl(`routed-${Date.now()}`));
});

When('another app opens a link no rule matches', async function () {
  await deliver(this, this.fixtureUrl(`unmatched-${Date.now()}`));
});

Then('the link opens in the Work profile window, the window used last', function () {
  assert.equal(this.receiver.profileId, this.namedProfile.id);
  assert.equal(this.receiver.tabs.find((tab) => tab.url === this.deliveredUrl).id, this.receiver.activeTabId);
});

Then('the link opens in the Personal window', function () {
  assert.equal(this.receiver.profileId, 'default');
});

// The Work window was used last, so without the rule the link would go there.
Then('the link opens in the Personal window, not the window used last', function () {
  assert.equal(this.receiver.profileId, 'default');
  assert.equal(this.receiver.tabs.find((tab) => tab.url === this.deliveredUrl).id, this.receiver.activeTabId);
});

When('the Work profile is deleted', async function () {
  const result = await this.call('deleteProfile', this.namedProfile.id, this.namedProfile.name);
  assert.equal(result.ok, true, result.message);
});

Then('no rule points at Work', async function () {
  await waitForValue(storedRoutes,
    (stored) => !stored.some((route) => route.destination.profileId === this.namedProfile.id), 'Work rules removed');
});

// ---- PR 2: the shield popover row and /route ----

Given('a second local profile whose window is closed', async function () {
  const created = await this.call('createProfileWindow', 'Work');
  assert.equal(created.ok, true, created.message);
  this.namedProfile = created.profile;
  assert.equal(await this.call('closeWindowRuntime', created.runtimeId), true);
  await waitForValue(() => this.call('windowRuntimes'),
    (all) => !all.some((runtime) => runtime.profileId === created.profile.id && runtime.attached), 'Work window closed');
  await waitForValue(() => this.call('focusWindowRuntime', 'primary'), Boolean, 'Personal window focused');
});

Given('the routed site is open in Personal', async function () {
  this.routedUrl = this.insecureFixtureUrl('route-here');
  const id = await this.call('openTab', this.routedUrl);
  await waitForValue(() => this.state(), (state) => state.activeTabId === id
    && state.tabs.some((tab) => tab.id === id && tab.url === this.routedUrl), 'routed site active');
});

When('the routed site is open in a private tab', async function () {
  const url = this.insecureFixtureUrl('route-private');
  const id = await this.call('openTab', url, { private: true });
  await waitForValue(() => this.state(), (state) => state.activeTabId === id
    && state.tabs.some((tab) => tab.id === id && tab.url === url), 'private routed site active');
});

When('I open the shield popover', async function () {
  await this.call('clickPillShield');
  await waitForValue(() => this.call('shieldPopoverState'), (state) => state?.visible, 'shield popover');
});

Then('it offers {string}, off', async function (label) {
  const state = await waitForValue(() => this.call('shieldPopoverState'), (value) => value?.route, 'link routing row');
  assert.equal(state.route.label, label);
  assert.equal(state.route.on, false);
});

When(/^I turn (on|off) the popover's link routing switch$/, async function (_direction) {
  await this.call('clickShieldRouteToggle');
});

Then('a rule sends the routed site to Personal', async function () {
  const routes = await waitForValue(storedRoutes, (stored) => stored.length === 1, 'route saved');
  assert.deepEqual(routes[0].match, { kind: 'domain', value: ROUTED_HOST });
  assert.deepEqual({ ...routes[0].destination }, { profileId: 'default', spaceId: null, private: false });
});

Then('the popover\'s link routing switch is on', async function () {
  await waitForValue(() => this.call('shieldPopoverState'), (state) => state?.route?.on === true, 'switch on');
});

Then('no rule is left for the routed site', async function () {
  await waitForValue(storedRoutes, (stored) => !stored.some((route) => route.match.value === ROUTED_HOST), 'no rule');
});

Then('the pill says {string}', async function (text) {
  await waitForValue(() => this.call('pillPlaceholderState'), (state) => state?.text === text, `pill notice ${text}`);
});

// ---- #1199: links opened in a new tab from a page ----

const tabsWithUrl = (runtime, url) => runtime.tabs.filter((tab) => tab.url === url).length;

Given('a saved rule sending addresses containing {string} to Work', async function (value) {
  const result = await ctx.app.evaluate((_electron, { root, profileId, value: text }) => {
    const require = process.getBuiltinModule('module').createRequire(`${root}/package.json`);
    return require('./src/main/settings').setLinkRoutes([
      { id: 'in-app', match: { kind: 'contains', value: text }, destination: { profileId } },
    ]);
  }, { root: process.cwd(), profileId: this.namedProfile.id, value });
  assert.equal(result.ok, true);
});

// The fixture's ?blanklink= draws a target=_blank link to /site/<name> on the
// same server, so only the path tells the rule apart.
Given('a Personal page has a new-tab link to {string}', async function (name) {
  await waitForValue(() => this.call('focusWindowRuntime', 'primary'), Boolean, 'Personal window focused');
  this.inAppSourceUrl = `${this.fixtureUrl('in-app-source')}?blanklink=${name}`;
  this.inAppTargetUrl = this.fixtureUrl(name);
  this.inAppSourceId = await this.call('openTab', this.inAppSourceUrl);
  await waitForValue(() => this.state(), (state) => state.tabs.some((tab) => tab.id === this.inAppSourceId && !tab.loading
    && tab.url === this.inAppSourceUrl), 'link page loaded');
});

async function inAppSourcePage(world) {
  await world.call('activateTab', world.inAppSourceId);
  return waitForValue(async () => ctx.app.windows().find((page) => page.url() === world.inAppSourceUrl),
    Boolean, 'the link page');
}

async function countTargets(world) {
  const runtimes = await world.call('windowRuntimes');
  const personal = runtimes.find((runtime) => runtime.id === 'primary');
  const work = runtimes.filter((runtime) => runtime.profileId === world.namedProfile.id);
  return {
    personal: tabsWithUrl(personal, world.inAppTargetUrl),
    work: work.reduce((sum, runtime) => sum + tabsWithUrl(runtime, world.inAppTargetUrl), 0),
  };
}

When('I click the page\'s new-tab link', async function () {
  this.inAppBefore = await countTargets(this);
  await (await inAppSourcePage(this)).click('#acceptance-blank');
});

When('link rules also apply to links opened in a new tab', async function () {
  const saved = await ctx.app.evaluate((_electron, root) => {
    const require = process.getBuiltinModule('module').createRequire(`${root}/package.json`);
    return require('./src/main/settings').setSettings({ linkRoutesInApp: true }).linkRoutesInApp;
  }, process.cwd());
  assert.equal(saved, true);
});

// Script on the page, with no press on it: the last click is over a second
// old, so the page can't borrow it.
When('the page opens that link in a new tab on its own', async function () {
  this.inAppBefore = await countTargets(this);
  const page = await inAppSourcePage(this);
  await new Promise((resolve) => setTimeout(resolve, 1200));
  await page.evaluate((url) => { window.open(url); }, this.inAppTargetUrl);
});

Then('the link opens in a new tab of the Personal window', async function () {
  const after = await waitForValue(() => countTargets(this),
    (counts) => counts.personal === this.inAppBefore.personal + 1, 'the link in the Personal window');
  assert.equal(after.work, this.inAppBefore.work);
});

Then('the link opens in the Work window', async function () {
  const after = await waitForValue(() => countTargets(this),
    (counts) => counts.work === this.inAppBefore.work + 1, 'the link in the Work window');
  assert.equal(after.personal, this.inAppBefore.personal);
});
