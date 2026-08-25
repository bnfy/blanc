'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { createCredentialFillController } = require('../../src/main/credential-fill-controller');

function harness({ inspect = {
  originMismatch: false, hasPassword: true, hasUsername: true,
  passwordBasis: 'authoritative',
}, dialogResponses = [], candidates = [
  { vaultId: 'v', itemId: 'i', title: 'Example', vaultName: 'Personal' },
] } = {}) {
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

test('multiple matches use overview metadata and decrypt only the selected item', async () => {
  const { controller, calls, broker } = harness({ candidates: [
    { vaultId: 'v1', itemId: 'i1', title: 'Example personal', vaultName: 'Personal' },
    { vaultId: 'v2', itemId: 'i2', title: 'Example work', vaultName: 'Work' },
  ] });
  assert.equal('revealUsernames' in broker, false);
  assert.deepEqual(await controller.fill({}), { ok: true, filledUser: true, filledPass: true });
  assert.equal(calls.filter((call) => call === 'reveal').length, 1);
  assert.deepEqual(calls.find((call) => call?.ref)?.ref, { vaultId: 'v2', itemId: 'i2' });
  const pickerText = JSON.stringify(calls.find((call) => call?.pickerLabels)?.pickerLabels);
  assert.match(pickerText, /Example personal/);
  assert.match(pickerText, /Personal/);
  assert.match(pickerText, /Example work/);
  assert.match(pickerText, /Work/);
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
