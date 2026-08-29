'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { runOnePasswordVerify } = require('../../src/main/onepassword-verify-flow');

function harness({ stored = 'Account', brokerError = null, storedAfter = null } = {}) {
  const calls = [];
  let storedValue = stored;
  return {
    calls,
    deps: {
      saveAccount: (raw) => {
        calls.push({ save: raw });
        storedValue = raw; // store keeps the raw value (settings.js does not trim)
        return storedValue;
      },
      readStoredAccount: () => (storedAfter !== null ? storedAfter : storedValue),
      brokerVerify: async (probed) => {
        calls.push({ probe: probed });
        if (brokerError) throw brokerError;
        return { ok: true };
      },
    },
  };
}

test('verify persists first and probes the normalized saved value, never raw field text', async () => {
  const { calls, deps } = harness();
  const result = await runOnePasswordVerify({ account: '  My Team  ', ...deps });
  assert.deepEqual(calls, [{ save: '  My Team  ' }, { probe: 'My Team' }]);
  assert.deepEqual(result, { ok: true, account: 'My Team' });
  assert.deepEqual(Object.keys(result), ['ok', 'account']);
});

test('an empty or whitespace account fails closed without touching the broker', async () => {
  const { calls, deps } = harness();
  const result = await runOnePasswordVerify({ account: '   ', ...deps });
  assert.deepEqual(result, { ok: false, kind: 'account-not-found', account: '' });
  assert.equal(calls.some((c) => c.probe !== undefined), false);
});

test('a cross-window account mutation during the broker await replies stale, never Connected', async () => {
  const { deps } = harness({ storedAfter: 'SomeoneElsesAccount' });
  const result = await runOnePasswordVerify({ account: 'My Team', ...deps });
  assert.deepEqual(result, { ok: false, stale: true });
  assert.deepEqual(Object.keys(result), ['ok', 'stale']);
});

test('a mutation during a FAILING broker await also replies stale — superseded beats the error', async () => {
  const err = Object.assign(new Error('denied'), { code: 'not-authorized' });
  const { deps } = harness({ brokerError: err, storedAfter: 'Changed' });
  const result = await runOnePasswordVerify({ account: 'My Team', ...deps });
  assert.deepEqual(result, { ok: false, stale: true });
});

test('broker failures map through the fixed error kinds with only ok/kind/account keys', async () => {
  const err = Object.assign(new Error('denied'), { code: 'not-authorized' });
  const { deps } = harness({ brokerError: err });
  const result = await runOnePasswordVerify({ account: 'My Team', ...deps });
  assert.deepEqual(result, { ok: false, kind: 'not-authorized', account: 'My Team' });
  assert.deepEqual(Object.keys(result), ['ok', 'kind', 'account']);
});

test('the settings bridge exposes exactly the three new 1Password methods', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../src/main/tab-preload.js'), 'utf8');
  const group = source.match(/settings: \{[\s\S]*?\n {6}\}/)?.[0];
  assert.ok(group, 'settings bridge group not found — fail loud, never silently pass');
  assert.match(group, /onePasswordStatus: \(\) => invoke\('pages:settings:onepassword-status'\)/);
  assert.match(group, /onePasswordVerify: \(account\) => invoke\('pages:settings:onepassword-verify', account\)/);
  assert.match(group, /openOnePasswordApp: \(\) => invoke\('pages:settings:open-onepassword-app'\)/);
});
