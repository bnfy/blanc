'use strict';

// The document-policy smoke needs an unsandboxed page-opened tab to rest, and
// asked Quiet Tabs exactly once. quietTab refuses whenever anything is
// uncertain, and some refusals pass on their own: the page's form response
// still loading in its iframe, or a probe frame missing its 250 ms budget on a
// busy runner. That single request failed the smoke as "unsandboxed: forced
// quiet false !== true" with no reason (macOS and Intel, October 2026).
// restTab waits for the tab to stop loading, asks again while a must-rest tab
// is refused, and reports main's recorded reason for every refusal.

const test = require('node:test');
const assert = require('node:assert/strict');
const { restTab } = require('../desktop/support/quiet-rest');

/** A fake test-hook caller: `loading` lists the tab's isLoading reads in
 * order (the last repeats), `outcomes` the quietTabOutcome replies. */
function fakeHook({ loading = [false], outcomes }) {
  const calls = [];
  let reads = 0;
  let asked = 0;
  const call = async (method, args) => {
    calls.push(method);
    if (method === 'state') {
      const isLoading = loading[Math.min(reads++, loading.length - 1)];
      return { tabs: [{ id: 'other', isLoading: true }, { id: args[0] ?? 't1', isLoading }] };
    }
    if (method === 'quietTabOutcome') return outcomes[Math.min(asked++, outcomes.length - 1)];
    throw new Error(`unexpected ${method}`);
  };
  return { call, calls };
}

test('a tab that rests at once is asked once', async () => {
  const hook = fakeHook({ outcomes: [{ rested: true, reason: null }] });
  assert.deepEqual(await restTab(hook.call, 't1', 'tab', { retryDelay: 0 }), { rested: true, reasons: [] });
  assert.deepEqual(hook.calls, ['state', 'quietTabOutcome']);
});

test('a refused tab that must rest is asked again, and the refusals are kept', async () => {
  const hook = fakeHook({ outcomes: [
    { rested: false, reason: 'dirty' },
    { rested: false, reason: 'changed-during-probe' },
    { rested: true, reason: null },
  ] });
  const result = await restTab(hook.call, 't1', 'tab', { retryDelay: 0 });
  assert.deepEqual(result, { rested: true, reasons: ['dirty', 'changed-during-probe'] });
  assert.equal(hook.calls.filter((method) => method === 'quietTabOutcome').length, 3);
});

test('a tab still loading is not asked until every frame has stopped', async () => {
  const hook = fakeHook({ loading: [true, true, false], outcomes: [{ rested: true, reason: null }] });
  await restTab(hook.call, 't1', 'tab', { retryDelay: 0 });
  assert.deepEqual(hook.calls, ['state', 'state', 'state', 'quietTabOutcome']);
});

test('a tab that may stay awake is asked once and its refusal returned', async () => {
  const hook = fakeHook({ outcomes: [{ rested: false, reason: 'dirty' }, { rested: true, reason: null }] });
  assert.deepEqual(await restTab(hook.call, 't1', 'tab', { required: false, retryDelay: 0 }),
    { rested: false, reasons: ['dirty'] });
  assert.equal(hook.calls.filter((method) => method === 'quietTabOutcome').length, 1);
});

test('a tab that never rests fails at the deadline, naming every refusal', async () => {
  const hook = fakeHook({ outcomes: [{ rested: false, reason: 'teardown:unresponsive' }] });
  const result = await restTab(hook.call, 't1', 'tab', { timeout: 60, retryDelay: 10 });
  assert.equal(result.rested, false);
  assert(result.reasons.length >= 2, `asked again before the deadline: ${result.reasons}`);
  assert(result.reasons.every((reason) => reason === 'teardown:unresponsive'));
});

test('a reply without a recorded reason still counts as a refusal', async () => {
  const hook = fakeHook({ outcomes: [{ rested: false }] });
  const result = await restTab(hook.call, 't1', 'tab', { required: false });
  assert.deepEqual(result, { rested: false, reasons: ['unknown'] });
});
