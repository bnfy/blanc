'use strict';

const assert = require('node:assert/strict');
const { Given, When, Then } = require('@cucumber/cucumber');
const { waitForValue } = require('../support/poll');

Given('Blanc has recorded a local tab crash', async function () {
  const status = await this.call('seedDiagnosticCrash');
  assert.equal(status.count, 1);
});
When('I open the Diagnostics settings', async function () {
  await this.call('openSettings');
});

Then('Settings describes and counts the URL-free local crash ledger', async function () {
  const state = await waitForValue(
    () => this.call('readSettingsDiagnosticsDom'),
    (value) => value?.nav === 'Diagnostics' &&
      value.summary === '1 crash event recorded on this device.' &&
      value.exportLabel === 'Export diagnostics…' &&
      value.clearLabel === 'Clear crash history' &&
      value.clearDisabled === false,
    'the local diagnostics controls and crash count',
  );
  assert.match(state.copy, /never includes URLs, page titles, history/);
});

When('I clear the local crash ledger', async function () {
  assert.equal(await this.call('clickClearDiagnostics'), true);
});

Then('Settings reports that no crashes are recorded', async function () {
  const state = await waitForValue(
    () => this.call('readSettingsDiagnosticsDom'),
    (value) => value?.summary === 'No crashes have been recorded on this device.' &&
      value.clearDisabled === true &&
      value.status === 'Crash history cleared.',
    'the cleared local crash ledger state',
  );
  assert.equal(state.clearDisabled, true);
});
