// F5 navigation, F6 the Quick Switcher, F7 slash commands and F8 find in page on Android.
import {Given, When, Then} from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import {adb, sleep} from '../support/device.mjs';
import {host, makeGroup} from '../support/scenario.mjs';

const SEARCH = {duckduckgo: 'https://duckduckgo.com/?q='};

// ---- F5 ----

When('I enter {string} in the command bar', function (text) {
  adb('logcat', '-c');
  this.entered = text;
  this.device.runInPalette(text);
});

Then('the active tab navigates to {string}', async function (target) {
  await this.device.waitForUrl(/^[a-z][a-z0-9+.-]*:\/\//i.test(target) ? target : `https://${target}/`);
});

Then('the OS mail handler is invoked', function () {
  const log = adb('logcat', '-d', '-s', 'ActivityTaskManager:I');
  assert.match(log, /START u0 \{[^}]*act=android\.intent\.action\.(VIEW|SENDTO)[^}]*dat=mailto:/, 'no mailto intent started');
});

Then('no tab treats {string} as a search query', async function (uri) {
  const pages = (await this.device.targets()).map(t => t.url);
  const query = encodeURIComponent(uri);
  assert.ok(!pages.some(u => u.includes(query) || u.includes(uri)), pages.join(', '));
});

Given('the island panel is open', function () { this.device.openPalette(); });

When('I submit the address of {string} in the command bar', function (name) {
  this.device.type(this.url(name));
  this.device.enter();
});

Then('the active tab loads the address of {string}', async function (name) {
  await this.device.waitForUrl(this.url(name));
});

Given('the search engine is {string}', function (engine) {
  // Android searches with DuckDuckGo until Settings (A5) offers others.
  assert.ok(SEARCH[engine], `Android has no ${engine} search yet`);
});

Then('the active tab navigates to a {string} search for {string}', async function (engine, query) {
  const prefix = SEARCH[engine] + encodeURIComponent(query);
  let url = null;
  await this.device.waitFor(async () => (url = await this.device.visibleUrl())?.startsWith(prefix), `${prefix} (it is ${url})`, 30);
});

// ---- F6 ----

Given('a favorite for {string}', async function (name) {
  await this.open(name);
  this.device.menu('Save to Favorites');
  this.device.runInPalette('/close');
  // Past the close's Undo, so it's a favorite and not an open tab.
  sleep(6);
});

When('I type {string}', function (text) { this.device.type(text); });

Then('the results include the tab {string}', function (name) {
  const rows = this.device.paletteRows();
  assert.ok(rows.some(r => r.kind === 'tab' && r.title === host(name)), JSON.stringify(rows));
});

Then('the results include the favorite {string}', function (name) {
  const rows = this.device.paletteRows();
  assert.ok(rows.some(r => r.kind === 'favorite' && r.subtitle.startsWith(this.url(name))), JSON.stringify(rows));
});

Given('a group named {string} with {int} tabs that is not active', async function (name, count) {
  this.groupTitles = await makeGroup(this, name, count);
  await this.open('elsewhere');
});

Then('a group result {string} is listed above any tab results', function (name) {
  const rows = this.device.paletteRows();
  const group = rows.findIndex(r => r.kind === 'group' && r.title === name);
  const tab = rows.findIndex(r => r.kind === 'tab');
  assert.ok(group >= 0 && (tab < 0 || group < tab), JSON.stringify(rows));
});

When('I choose the group result {string}', function (name) {
  const xml = this.device.dump();
  // The row's title, not the field holding the same text.
  const after = xml.slice(xml.search(/class="android\.widget\.EditText"/));
  this.device.tapAt(this.device.find({text: name}, after.slice(after.indexOf('<node', 1))));
});

Then('the active tab is one of the tabs in {string}', function (name) {
  const active = this.device.grid().tabs.find(t => t.selected);
  assert.equal(active?.group, name, JSON.stringify(active));
});

// ---- F7 ----

Then('the command {string} is listed', function (command) {
  assert.ok(this.device.paletteRows().some(r => r.kind === 'command' && r.title === command));
});

Then('the command {string} is not listed', function (command) {
  const rows = this.device.paletteRows();
  assert.ok(rows.some(r => r.kind === 'command'), 'no commands listed at all');
  assert.ok(!rows.some(r => r.kind === 'command' && r.title === command), JSON.stringify(rows));
});

// ---- F8 ----

Given('a page containing the word {string} {int} times', async function (word, count) {
  await this.open('words', `/words?w=${word}&n=${count}`);
});

When('I open find in page', function () { this.device.menu('Find in Page'); });

When('I search for {string}', function (text) { this.device.type(text); });

Then('the match count shows {int}', async function (count) {
  let shown = null;
  await this.device.waitFor(() => (shown = this.device.findCount())?.[1] === count, `${count} matches (shows ${shown})`);
});

Then('I can navigate to the next and previous match', function () {
  this.device.tap({desc: /^Next match$/});
  assert.equal(this.device.findCount()?.[0], 2);
  this.device.tap({desc: /^Previous match$/});
  assert.equal(this.device.findCount()?.[0], 1);
});

Then('the page content outside the find bar remains clickable', async function () {
  assert.ok(this.device.has({desc: /^Next match$/}), 'the find bar closed');
  const {width, height} = this.device.screenSize();
  this.device.tapAt({left: width / 2, right: width / 2, top: height * 0.2, bottom: height * 0.2});
  assert.equal(await this.device.page('document.getElementById("clicker").dataset.clicks'), '1');
});
