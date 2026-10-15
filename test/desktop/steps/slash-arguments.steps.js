const assert = require('node:assert');
const { Given, Then } = require('@cucumber/cucumber');
const { waitForValue } = require('./../support/poll');

// F7-3/F7-4: a slash command typed as any prefix of its name ("/gr", "/sav")
// must read its argument after the word that was typed, never fold the
// command text into a group, folder, theme or space name.

Given('the appearance is set to {string}', async function (theme) {
  await this.call('setAppearance', theme);
});

Then('the page on {string} is a Favorite in {string}', async function (name, folder) {
  const url = this.fixtureUrl(name);
  await waitForValue(
    () => this.call('bookmarkRecords'),
    (records) => records.some((r) => r.url === url && r.folder === folder),
    `${name} to be a Favorite in ${folder}`,
  );
});

Then('the appearance is {string}', async function (theme) {
  await waitForValue(
    () => this.call('settingsSyncValues'),
    (values) => values.theme === theme,
    `the appearance to be ${theme}`,
  );
});

Then('no group exists', async function () {
  const state = await this.state();
  assert.deepEqual(state.groups, []);
});
