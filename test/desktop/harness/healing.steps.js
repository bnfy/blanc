'use strict';

// Steps for test/desktop/harness/healing.feature. Several of them break the
// app on purpose; the hooks are what is under test.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { After, Given, When, Then } = require('@cucumber/cucumber');
const ctx = require('../support/context');
const { waitForValue } = require('../support/poll');
const { exitCodeOf } = require('../support/app-health');

Given('a fixture page is open', async function () {
  this.pageUrl = this.fixtureUrl('healing-crash');
  this.tabId = await this.call('openTab', this.pageUrl);
  this.page = await waitForValue(
    async () => ctx.app.windows().find((page) => page.url() === this.pageUrl),
    Boolean,
    'fixture page',
  );
});

When('the page\'s renderer is crashed and the page is used again', async function () {
  const crashed = this.page.waitForEvent('crash', { timeout: 5000 });
  await this.call('crashTabRenderer', this.tabId);
  await crashed;
  await this.page.evaluate('1');
});

Then('the app answers', async function () {
  assert.ok(await this.call('state'));
});

Then('the harness has relaunched Blanc {int} time(s)', function (count) {
  assert.equal(ctx.healing.entries.length, count);
});

Given('the app was relaunched with the environment mark {string}', async function (mark) {
  await ctx.relaunch({ BLANC_TEST_HARNESS_MARK: mark });
});

When('a main-process exception is raised', async function () {
  await this.call('raiseMainProcessExceptionForTest');
  await waitForValue(() => exitCodeOf(ctx.app), (code) => code !== null, 'main process exit', 10_000);
});

Then('the app still carries the environment mark {string}', async function (mark) {
  assert.equal(await ctx.app.evaluate(() => process.env.BLANC_TEST_HARNESS_MARK), mark);
});

// An unpackaged Blanc keeps its data beside the profile it is given, in
// "<dir>-Dev" (main.js), so compare against that, through real paths.
Then('the app still uses the acceptance profile directory', async function () {
  const userData = await ctx.app.evaluate(({ app }) => app.getPath('userData'));
  assert.equal(fs.realpathSync(userData), `${fs.realpathSync(ctx.profileDir)}-Dev`);
});

// Like the @F57 and @glance hooks: an After that relaunches the app.
After({ tags: '@harness-relaunch-after' }, async function () {
  await ctx.relaunch();
});
