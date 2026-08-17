'use strict';

const assert = require('node:assert/strict');
const { Given, When, Then } = require('@cucumber/cucumber');
const { waitForValue } = require('../support/poll');

// "A fresh first run is awaiting setup" is defined in browser-migration
// .steps.js (it pushes the synthetic first-run status); these steps assert
// what the walkthrough does with that state.

// One definition serves both the Given and Then phrasings — cucumber keeps
// a single registry across keywords.
Then('the onboarding walkthrough is shown', async function () {
  await waitForValue(
    () => this.call('readOnboardingDom'),
    (dom) => dom?.shown === true,
    'onboarding walkthrough to open'
  );
});

Given('a profile that completed first run', async function () {
  // The acceptance profile auto-completes first run at launch; assert the
  // precondition rather than assuming it.
  const state = await this.call('firstRunState');
  assert.equal(state.complete, true);
});

When('I skip the walkthrough', async function () {
  assert.equal(await this.call('skipOnboarding'), true);
});

Then('my first-run privacy choices are saved', async function () {
  await waitForValue(
    () => this.call('firstRunState'),
    (state) =>
      state?.complete === true &&
      typeof state.searchSuggestions === 'boolean' &&
      typeof state.usagePing === 'boolean',
    'first-run privacy choices to persist'
  );
});

Then('the onboarding walkthrough is dismissed', async function () {
  await waitForValue(
    () => this.call('readOnboardingDom'),
    (dom) => dom?.shown === false,
    'onboarding walkthrough to close'
  );
});

Then('the onboarding walkthrough is not shown', async function () {
  // Settle: give a wrongly-gated dialog a beat to appear before asserting.
  await new Promise((resolve) => setTimeout(resolve, 400));
  const dom = await this.call('readOnboardingDom');
  assert.equal(dom?.shown, false);
});

When("I reach the walkthrough's import step", async function () {
  assert.equal(await this.call('openFirstRunImportStep'), true);
});

Then('only the bookmarks-file import is offered', async function () {
  await waitForValue(
    () => this.call('readFirstRunMigrationDom'),
    (dom) =>
      dom?.migrationHidden === false &&
      dom.options.length === 1 &&
      /bookmarks file/.test(dom.options[0]),
    'import step to offer only the file fallback'
  );
});

Then('the browser lookup has not run', async function () {
  // Discovery renders detected browsers above the file row and hides the
  // Look button; an untouched step shows the button and no browser rows.
  const dom = await this.call('readFirstRunMigrationDom');
  assert.equal(dom.findHidden, false);
  assert.equal(dom.options.some((label) => !/bookmarks file/.test(label)), false);
});
