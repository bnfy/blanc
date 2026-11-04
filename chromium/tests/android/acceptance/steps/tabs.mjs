// F2 tabs, F3 groups, F18 session restore, F31 Quiet Tabs and F56 tab gestures on Android.
import {Given, When, Then} from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import {sleep} from '../support/device.mjs';
import {gridState} from '../support/parse.mjs';
import {START_PAGE, host, makeGroup} from '../support/scenario.mjs';

// ---- F2 ----

Given('a tab open on {string}', async function (name) { await this.open(name); });

Given('the active tab is on {string}', async function (name) {
  const title = host(name);
  if (this.device.grid().tabs.some(t => t.title === title)) {
    this.device.openGrid();
    this.device.tap(this.device.card(title));
    await this.device.waitForUrl(this.url(name));
  } else {
    await this.open(name);
  }
});

Given('tabs open on {string} and {string}', async function (first, second) {
  await this.open(first);
  await this.open(second);
});

When('I close that tab', function () { this.device.runInPalette('/close'); });

// While a close's Undo shows, reopening is that Undo (it is what /reopen does then); after it, /reopen.
When('I reopen the last closed tab', function () {
  if (this.undoXml && this.device.has({text: 'Undo'}, this.undoXml)) {
    this.device.tapAt(this.device.find({text: 'Undo'}, this.undoXml));
    this.undoXml = null;
    return;
  }
  this.device.runInPalette('/reopen');
});

Then('a tab open on {string} is present', async function (name) {
  // A reopened tab's card has its title once its page loads.
  await this.device.waitFor(() => this.device.grid().tabs.some(t => t.title === host(name)), `a tab on ${name}`);
});

Then('no tab open on {string} is present', function (name) {
  // Right after a swipe, read that moment's grid: a fresh dump could outlast the Undo.
  const tabs = this.undoXml ? gridState(this.undoXml).tabs : this.device.grid().tabs;
  assert.ok(!tabs.some(t => t.title === host(name)), `a tab is still on ${name}`);
});

When('I duplicate the active tab', async function () {
  const title = this.device.grid().tabs.find(t => t.selected)?.title;
  assert.ok(title, 'no active tab in the grid');
  assert.ok(this.device.cardMenu(title, 'Duplicate Tab'), 'no Duplicate Tab on the card');
});

Then('a second tab open on {string} is present', async function (name) {
  await this.device.waitFor(() => this.device.grid().tabs.filter(t => t.title === host(name)).length === 2,
    `two tabs on ${name}`);
});

When('I pin {string}', function (name) {
  assert.ok(this.device.cardMenu(host(name), 'Pin Tab'), 'no Pin Tab on the card');
});

Then('{string} is marked pinned', function (name) {
  assert.ok(this.device.cardMenu(host(name), 'Unpin Tab', {choose: false}), `${name} isn't pinned`);
});

Then('{string} is ordered before {string}', function (first, second) {
  const titles = this.device.grid().tabs.map(t => t.title);
  assert.ok(titles.indexOf(host(first)) >= 0 && titles.indexOf(host(first)) < titles.indexOf(host(second)), titles.join(', '));
});

Given('the active tab is in a group named {string}', async function (name) {
  await this.open('anchor');
  this.device.runInPalette(`/group ${name}`);
});

When('I open a new tab', async function () {
  this.device.tap({id: 'blanc_island_new_tab'});
  await this.device.waitFor(async () => START_PAGE.test((await this.device.visibleUrl()) || ''), 'the Start Page');
});

Then('the new tab has no group', function () {
  const selected = this.device.grid().tabs.find(t => t.selected);
  assert.ok(selected, 'no active tab in the grid');
  assert.equal(selected.group, null);
});

Then('the new tab is on the new-tab page', async function () {
  assert.match((await this.device.visibleUrl()) || '', START_PAGE);
});

Given('a group {string} holding {int} tabs', async function (name, count) {
  this.groupTitles = await makeGroup(this, name, count);
});

When('I close the group {string}', function (name) {
  this.device.openGrid();
  this.device.tap({desc: /^Group options$/});
  this.device.tap({text: 'Close Group'});
  // Undo lasts 5 s and a dump takes over a second: the next steps read this one.
  this.undoXml = this.device.dump();
  assert.ok(!gridState(this.undoXml).groups.some(g => g.name === name), `${name} is still open`);
});

Then('a group named {string} holds {int} tabs', function (name, count) {
  const state = this.device.grid();
  assert.deepEqual(state.groups.find(g => g.name === name)?.count, count, JSON.stringify(state.groups));
  assert.equal(state.tabs.filter(t => t.group === name).length, count);
});

Then("the group's tabs are in their original order", function () {
  const titles = this.device.grid().tabs.filter(t => this.groupTitles.includes(t.title)).map(t => t.title);
  assert.deepEqual(titles, this.groupTitles);
});

// ---- F3 ----

Given('the active tab has no group', async function () { await this.open('plain'); });

When('I run the slash command {string}', function (command) { this.device.runInPalette(command); });

Then('a group named {string} exists', function (name) {
  assert.ok(this.device.grid().groups.some(g => g.name === name), `no group ${name}`);
});

Then('the active tab is in {string}', function (name) {
  assert.equal(this.device.grid().tabs.find(t => t.selected)?.group, name);
});

Given('a group {string} with {int} tab(s)', async function (name, count) {
  this.groupTitles = await makeGroup(this, name, count);
});

When('I open the command palette', function () { this.device.openPalette(); });

When('I collapse the group {string}', function (name) {
  this.device.tap({desc: new RegExp(`^${name}, Fold group$`)});
});

Then('the panel shows a {string} row for {string}', function (row, name) {
  const xml = this.device.dump();
  const header = xml.search(new RegExp(`content-desc="${name}, Unfold group"`));
  const tucked = xml.indexOf(`text="${row}"`);
  assert.ok(header >= 0, `no folded ${name} in the palette`);
  assert.ok(tucked > header, `no "${row}" row after ${name}`);
});

When('I close the last tab in {string}', function (_group) { this.device.runInPalette('/close'); });

Then('the group {string} no longer exists', function (name) {
  assert.ok(!this.device.grid().groups.some(g => g.name === name), `${name} is still there`);
});

Then('{string} is shown inside the group {string}', function (name, group) {
  assert.equal(this.device.grid().tabs.find(t => t.title === host(name))?.group, group);
});

// ---- F18 ----

Given('one private tab open', function () { this.device.menu('New Private Tab'); sleep(2); });

When('I relaunch the app', async function () { await this.device.relaunch(); });

Then('the group {string} is restored with its {int} tab(s)', function (name, count) {
  const state = this.device.grid();
  assert.equal(state.groups.find(g => g.name === name)?.count, count, JSON.stringify(state.groups));
});

Then('no private tab is restored', function () {
  assert.ok(!this.device.grid().tabs.some(t => t.private), 'a private tab came back');
});

// ---- F31 (phones) ----

Given('a background tab that went from one page to another', async function () {
  // The debug-only quiet delay (1 hour in use) is 20 s here.
  await this.device.setPref('<long name="blanc.quiet_delay_ms" value="20000" />', 'blanc.quiet_delay_ms');
  this.quietFirst = await this.open('first');
  this.device.runInPalette(this.url('first', '/second'));
  await this.device.waitForUrl(this.url('first', '/second'));
  await this.open('other');
  this.renderersBefore = this.device.renderers();
});

When('it stays in the background past the quiet delay', function () {
  // One 30 s sweep after the 20 s delay, with room for a second.
  sleep(80);
});

Then('that tab no longer holds a renderer', function () {
  const after = this.device.renderers();
  assert.ok(after < this.renderersBefore, `${this.renderersBefore} renderers before, ${after} after`);
});

When('I switch to that tab', async function () {
  this.device.openGrid();
  this.device.tap(this.device.card('first.example/second'));
});

Then('it shows the page it was on', async function () {
  await this.device.waitForUrl(this.url('first', '/second'));
});

Then('going back returns to the page before it', async function () {
  this.device.back();
  await this.device.waitForUrl(this.quietFirst);
});

// ---- F56 ----

function pillCenter(device) {
  const b = device.find({id: 'blanc_island_pill'});
  return [Math.round((b.left + b.right) / 2), Math.round((b.top + b.bottom) / 2)];
}

// Left goes to the next tab, as on the iPhone.
When('I swipe the Island toward the next tab', function () {
  const [x, y] = pillCenter(this.device);
  this.device.swipe(x + 250, y, x - 250, y);
});

When('I swipe the Island toward the previous tab', function () {
  const [x, y] = pillCenter(this.device);
  this.device.swipe(x - 250, y, x + 250, y);
});

Then('the tab on {string} is the active tab', async function (name) {
  await this.device.waitForUrl(this.url(name));
});

When('I swipe from the Island into the page', function () {
  const [x, y] = pillCenter(this.device);
  this.device.swipe(x, y, x, y - 400, 250);
});

Then('the tab grid is open', function () {
  assert.ok(this.device.has({text: 'Open tabs'}), 'no tab grid');
});

When('I swipe the card for {string} closed', function (name) {
  const b = this.device.find(this.device.card(host(name)));
  const y = Math.round((b.top + b.bottom) / 2);
  this.device.swipe(Math.round((b.left + b.right) / 2), y, b.left - 300, y, 200, 0.8);
  // Undo lasts 5 s and a dump takes over a second: the next steps read this one.
  this.undoXml = this.device.dump();
});

When('I undo the close', function () {
  this.device.tapAt(this.device.find({text: 'Undo'}, this.undoXml));
  this.undoXml = null;
});

When('I pull the page down', async function () {
  this.timeOrigin = await this.device.page('performance.timeOrigin');
  const {width, height} = this.device.screenSize();
  this.device.swipe(width / 2, Math.round(height * 0.25), width / 2, Math.round(height * 0.75), 600, 4);
});

Then('the page reloads', async function () {
  const now = await this.device.page('performance.timeOrigin');
  assert.ok(this.timeOrigin && now && now !== this.timeOrigin, 'the page did not reload');
});

Then('the page does not reload', async function () {
  const now = await this.device.page('performance.timeOrigin');
  assert.ok(this.timeOrigin && now === this.timeOrigin, `the page reloaded (${this.timeOrigin} then ${now})`);
});
