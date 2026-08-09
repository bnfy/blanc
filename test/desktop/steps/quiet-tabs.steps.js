const assert = require('node:assert/strict');
const { Given, When, Then } = require('@cucumber/cucumber');
const { waitForValue } = require('../support/poll');

// F31 — Quiet Tabs. These steps drive the real sleep/wake implementation.
// The process-count assertions are the falsifiability net: a missing view is
// not enough evidence that Electron released the renderer process.

Given('a background tab on a quietable page', async function () {
  const previouslyActive = (await this.state()).activeTabId;
  // ?nostore=1 omits the fixture's sessionStorage write. Non-empty
  // sessionStorage is intentionally considered unsaved work by the probe.
  const url = `${this.fixtureUrl('quietable')}?nostore=1`;
  this.quietCandidateId = await this.call('openTab', url);
  await this.waitForState((state) =>
    (state.tabs.find((tab) => tab.id === this.quietCandidateId)?.loadedUrl || '')
      .includes('quietable'));
  // The active tab is never quietable.
  await this.call('activateTab', previouslyActive);
  await this.waitForState((state) => state.activeTabId === previouslyActive);
});

Given('the renderer process count is recorded', async function () {
  // Earlier teardown can settle asynchronously. Take a reading only after two
  // matching polls, rather than baking a timing assumption into the assertion.
  let previous = -1;
  this.baselineProcessCount = await waitForValue(
    async () => {
      const now = await this.call('tabProcessCount');
      const stable = now === previous;
      previous = now;
      return stable ? now : null;
    },
    (value) => value !== null,
    'the renderer process count to settle'
  );
});

When('I quiet that background tab', async function () {
  const quieted = await this.call('sleepTab', this.quietCandidateId);
  assert.equal(quieted, true, 'sleepTab refused to quiet the tab');
});

When('I activate that quiet tab', async function () {
  await this.call('activateTab', this.quietCandidateId);
});

Then('that tab is quiet', async function () {
  const state = await this.call('sleepState', this.quietCandidateId);
  assert.ok(state, 'no sleep state for the tab');
  assert.equal(state.asleep, true);
  assert.equal(state.hasSnapshot, true, 'a quiet tab must retain its snapshot');
  assert.ok(state.entryCount >= 1, `expected a retained entry, got ${state.entryCount}`);
});

Then('that tab is awake', async function () {
  await waitForValue(
    () => this.call('sleepState', this.quietCandidateId),
    (state) => state && state.asleep === false && state.hasSnapshot === false,
    'the tab to finish waking and release its snapshot'
  );
});

Then('the renderer process count has dropped by {int}', async function (count) {
  await waitForValue(
    () => this.call('tabProcessCount'),
    (now) => now === this.baselineProcessCount - count,
    `the renderer process count to drop from ${this.baselineProcessCount} by ${count}`
  );
});

Then('the renderer process count has returned to what it was', async function () {
  await waitForValue(
    () => this.call('tabProcessCount'),
    (now) => now === this.baselineProcessCount,
    `the renderer process count to return to ${this.baselineProcessCount}`
  );
});
