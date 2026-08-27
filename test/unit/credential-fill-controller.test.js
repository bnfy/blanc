'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { createCredentialFillController } = require('../../src/main/credential-fill-controller');

function harness({ inspect = {
  originMismatch: false, hasPassword: true, hasUsername: true,
  passwordBasis: 'authoritative',
}, dialogResponses = [], candidates = [
  { vaultId: 'v', itemId: 'i', title: 'Example', vaultName: 'Personal' },
], revealError = null } = {}) {
  const calls = [];
  let scriptCall = 0;
  const webContents = {
    focus: () => calls.push('focus'),
    executeJavaScriptInIsolatedWorld: async (_world, [{ code }]) => {
      scriptCall += 1;
      if (scriptCall === 1) { calls.push('probe'); return { url: 'https://example.com/login', timeOrigin: 123, focused: true }; }
      if (scriptCall === 2) { calls.push('inspect'); return inspect; }
      calls.push('fill');
      assert.match(code, /alice/);
      assert.match(code, /secret/);
      return { originMismatch: false, filledUser: true, filledPass: true };
    },
  };
  const target = {
    runtimeId: 1, tabId: 'tab', navEpoch: 3,
    url: 'https://example.com/login', webContents,
    window: { isDestroyed: () => false }, pickerPoint: { x: 10, y: 20 },
  };
  const broker = {
    findLogins: async () => {
      calls.push('find');
      return { candidates };
    },
    revealCredential: async (_account, ref, fields) => {
      calls.push('reveal');
      calls.push({ fields, ref });
      if (revealError) throw revealError;
      return { username: 'alice', password: 'secret' };
    },
  };
  const Menu = {
    buildFromTemplate: (template) => ({
      popup: ({ callback }) => {
        calls.push({ pickerLabels: template.map(({ label, sublabel }) => ({ label, sublabel })) });
        template[1].click();
        callback();
      },
    }),
  };
  const dialog = {
    showMessageBox: async () => {
      calls.push('dialog');
      return { response: dialogResponses.length ? dialogResponses.shift() : 0 };
    },
  };
  const controller = createCredentialFillController({
    broker,
    Menu,
    dialog,
    getSettings: () => ({ onePasswordEnabled: true, onePasswordAccount: 'Account' }),
    captureTarget: () => target,
    isTargetCurrent: () => true,
    prepareTarget: async () => calls.push('prepare'),
    openSettings: () => calls.push('settings'),
  });
  return { controller, calls, broker };
}

test('flow inspects without credentials before contacting 1Password and reveals one item', async () => {
  const { controller, calls } = harness();
  assert.deepEqual(await controller.fill({}), { ok: true, filledUser: true, filledPass: true });
  const relevant = calls.filter((call) => ['prepare', 'probe', 'inspect', 'find', 'reveal', 'fill'].includes(call));
  assert.deepEqual(relevant, ['prepare', 'probe', 'inspect', 'find', 'reveal', 'fill']);
  assert.deepEqual(calls.find((call) => typeof call === 'object')?.fields,
    { username: true, password: true });
});

test('multiple matches show projected usernames and reveal only the selected item for filling', async () => {
  const { controller, calls, broker } = harness({ candidates: [
    { vaultId: 'v1', itemId: 'i1', title: 'google.com', vaultName: 'Personal',
      username: 'alice@gmail.com', itemVersion: 4 },
    { vaultId: 'v2', itemId: 'i2', title: 'google.com', vaultName: 'Work',
      username: 'alice@example.com', itemVersion: 7 },
  ] });
  assert.equal('revealUsernames' in broker, false);
  assert.deepEqual(await controller.fill({}), { ok: true, filledUser: true, filledPass: true });
  assert.equal(calls.filter((call) => call === 'reveal').length, 1);
  assert.deepEqual(calls.find((call) => call?.ref)?.ref,
    { vaultId: 'v2', itemId: 'i2', itemVersion: 7 });
  const pickerText = JSON.stringify(calls.find((call) => call?.pickerLabels)?.pickerLabels);
  assert.ok(pickerText.includes('alice@gmail.com'));
  assert.ok(pickerText.includes('google.com'));
  assert.ok(pickerText.includes('Personal'));
  assert.ok(pickerText.includes('alice@example.com'));
  assert.ok(pickerText.includes('Work'));
});

test('an item changed after picker projection stops before filling', async () => {
  const changed = Object.assign(new Error('changed'), { code: 'selection-changed' });
  const { controller, calls } = harness({
    revealError: changed,
    candidates: [
      { vaultId: 'v1', itemId: 'i1', title: 'google.com', vaultName: 'Personal',
        username: 'alice@gmail.com', itemVersion: 4 },
      { vaultId: 'v2', itemId: 'i2', title: 'google.com', vaultName: 'Work',
        username: 'alice@example.com', itemVersion: 7 },
    ],
  });
  assert.deepEqual(await controller.fill({}), { ok: false, reason: 'selection-changed' });
  assert.equal(calls.includes('fill'), false);
  assert.equal(calls.includes('dialog'), true);
});

test('username-only pages do not request the selected password from the broker', async () => {
  const { controller, calls } = harness({
    inspect: { originMismatch: false, hasPassword: false, hasUsername: true, passwordBasis: null },
  });
  await controller.fill({});
  assert.deepEqual(calls.find((call) => typeof call === 'object')?.fields,
    { username: true, password: false });
});

test('no safe form stops before any SDK request', async () => {
  const { controller, calls } = harness({
    inspect: { originMismatch: false, hasPassword: false, hasUsername: false, passwordBasis: null },
  });
  const result = await controller.fill({});
  assert.equal(result.reason, 'no-form');
  assert.equal(calls.includes('find'), false);
  assert.equal(calls.includes('reveal'), false);
  assert.equal(calls.includes('dialog'), true); // local explanation only
});

test('heuristic password targets require confirmation before SDK authorization', async () => {
  const { controller, calls } = harness({
    inspect: { originMismatch: false, hasPassword: true, hasUsername: true, passwordBasis: 'heuristic' },
    dialogResponses: [1],
  });
  const result = await controller.fill({});
  assert.equal(result.reason, 'cancelled');
  assert.equal(calls.includes('find'), false);
  assert.equal(calls.includes('reveal'), false);
  assert.ok(calls.indexOf('dialog') > calls.indexOf('inspect'));
});
