// F5 navigation and F8 find in page on Android.
import {Given, When, Then} from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import {adb, sleep} from '../support/device.mjs';

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
