'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { createCredentialFillController, FILL_REASONS } = require('../../src/main/credential-fill-controller');
const { FILL_KINDS } = require('../../src/main/fill-status-kinds');

function harness({ inspect = {
  originMismatch: false, hasPassword: true, hasUsername: true,
  passwordBasis: 'authoritative',
}, confirmResponses = [], candidates = [
  { vaultId: 'v', itemId: 'i', title: 'Example', vaultName: 'Personal' },
], revealError = null, settings = { onePasswordEnabled: true, onePasswordAccount: 'Account' },
duringFind = null, startGeneration = 0 } = {}) {
  const calls = [];
  const state = { generation: startGeneration, urlCurrent: true };
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
      await duringFind?.(state);
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
  const controller = createCredentialFillController({
    broker,
    Menu,
    getSettings: () => settings,
    captureTarget: () => target,
    // Mirrors main.js: generation mismatch (or a flipped URL predicate)
    // makes the target stale; only the generation half counts as a
    // surface change.
    isTargetCurrent: (t) => state.urlCurrent
      && (t.surfaceGeneration === undefined || t.surfaceGeneration === state.generation),
    surfaceChanged: (t) => t.surfaceGeneration !== undefined
      && t.surfaceGeneration !== state.generation,
    prepareTarget: async (t) => { calls.push('prepare'); t.surfaceGeneration = state.generation; },
    openSettings: () => calls.push('settings'),
    notify: async (_t, kind) => { calls.push(`notify:${kind}`); },
    confirm: async (_t, kind) => {
      calls.push(`confirm:${kind}`);
      return confirmResponses.length ? confirmResponses.shift() : 'primary';
    },
  });
  const notified = () => calls.filter((c) => typeof c === 'string' && c.startsWith('notify:'))
    .map((c) => c.slice('notify:'.length));
  return { controller, calls, broker, state, notified };
}

test('flow inspects without credentials before contacting 1Password and reveals one item', async () => {
  const { controller, calls, notified } = harness();
  assert.deepEqual(await controller.fill({}), { ok: true, filledUser: true, filledPass: true });
  const relevant = calls.filter((call) => ['prepare', 'probe', 'inspect', 'find', 'reveal', 'fill'].includes(call));
  assert.deepEqual(relevant, ['prepare', 'probe', 'inspect', 'find', 'reveal', 'fill']);
  assert.deepEqual(calls.find((call) => typeof call === 'object')?.fields,
    { username: true, password: true });
  assert.deepEqual(notified(), ['filled'], 'success notifies filled exactly once, after the fill');
  assert.ok(calls.indexOf('notify:filled') > calls.indexOf('fill'));
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
  const expectedLabels = process.platform === 'darwin'
    ? [
      { label: 'alice@gmail.com', sublabel: 'google.com · Personal' },
      { label: 'alice@example.com', sublabel: 'google.com · Work' },
    ]
    : [
      { label: 'alice@gmail.com — google.com · Personal', sublabel: undefined },
      { label: 'alice@example.com — google.com · Work', sublabel: undefined },
    ];
  assert.deepEqual(calls.find((call) => call?.pickerLabels)?.pickerLabels, expectedLabels);
});

test('an item changed after picker projection stops before filling', async () => {
  const changed = Object.assign(new Error('changed'), { code: 'selection-changed' });
  const { controller, calls, notified } = harness({
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
  assert.deepEqual(notified(), ['selection-changed']);
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
  const { controller, calls, notified } = harness({
    inspect: { originMismatch: false, hasPassword: false, hasUsername: false, passwordBasis: null },
  });
  const result = await controller.fill({});
  assert.equal(result.reason, 'no-form');
  assert.equal(calls.includes('find'), false);
  assert.equal(calls.includes('reveal'), false);
  assert.deepEqual(notified(), ['no-form']); // local explanation only
});

test('heuristic password targets require confirmation before SDK authorization', async () => {
  const { controller, calls } = harness({
    inspect: { originMismatch: false, hasPassword: true, hasUsername: true, passwordBasis: 'heuristic' },
    confirmResponses: ['cancel'],
  });
  const result = await controller.fill({});
  assert.equal(result.reason, 'cancelled');
  assert.equal(calls.includes('find'), false);
  assert.equal(calls.includes('reveal'), false);
  assert.ok(calls.indexOf('confirm:confirm-heuristic') > calls.indexOf('inspect'));
});

test('setup nudges are decision capsules whose primary verb opens Settings', async () => {
  {
    const { controller, calls } = harness({ settings: { onePasswordEnabled: false } });
    assert.equal((await controller.fill({})).reason, 'disabled');
    assert.ok(calls.includes('confirm:setup-enable'));
    assert.ok(calls.includes('settings'));
  }
  {
    const { controller, calls } = harness({
      settings: { onePasswordEnabled: true, onePasswordAccount: '  ' },
      confirmResponses: ['cancel'],
    });
    assert.equal((await controller.fill({})).reason, 'missing-account');
    assert.ok(calls.includes('confirm:setup-account'));
    assert.equal(calls.includes('settings'), false, 'cancel must not open Settings');
  }
});

test('every emitted reason has a kind, and broker error codes notify their mapped kinds', async () => {
  for (const reason of FILL_REASONS) {
    assert.ok(FILL_KINDS[reason], `FILL_REASONS entry ${reason} missing from FILL_KINDS`);
  }
  for (const code of ['desktop-unavailable', 'not-authorized', 'timed-out', 'broker-unavailable']) {
    const err = Object.assign(new Error(code), { code });
    const failing = harness();
    failing.broker.findLogins = async () => { throw err; };
    const result = await failing.controller.fill({});
    assert.equal(result.reason, code);
    const expected = code === 'broker-unavailable' ? 'broker-stopped' : code;
    assert.deepEqual(failing.notified(), [expected]);
  }
});

test('⌘L opened and closed within one broker await aborts silently', async () => {
  const { controller, notified } = harness({
    duringFind: async (state) => { state.generation += 2; }, // open + close
  });
  const result = await controller.fill({});
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'page-changed');
  assert.deepEqual(notified(), [], 'surface-change aborts must be silent');
});

test('permission-prompt arrival mid-broker aborts silently', async () => {
  const { controller, notified } = harness({
    duringFind: async (state) => { state.generation += 1; },
  });
  const result = await controller.fill({});
  assert.equal(result.reason, 'page-changed');
  assert.deepEqual(notified(), []);
});

test('tab switch-away mid-broker aborts silently', async () => {
  const { controller, notified } = harness({
    duringFind: async (state) => { state.generation += 1; state.urlCurrent = true; },
  });
  assert.equal((await controller.fill({})).reason, 'page-changed');
  assert.deepEqual(notified(), []);
});

test('tab switch-away-then-back mid-broker: only the generation catches it, silently', async () => {
  const { controller, notified } = harness({
    // Away and back: every current-state predicate recovers; the generation
    // advanced twice and is the only witness.
    duringFind: async (state) => { state.generation += 2; state.urlCurrent = true; },
  });
  assert.equal((await controller.fill({})).reason, 'page-changed');
  assert.deepEqual(notified(), []);
});

test('a palette-started fill does not self-invalidate', async () => {
  // The overlay closed as part of starting: the generation moved BEFORE
  // prepareTarget ran. prepareTarget stamps after cleanup, so the flow
  // completes.
  const { controller } = harness({ startGeneration: 5 });
  assert.deepEqual(await controller.fill({}), { ok: true, filledUser: true, filledPass: true });
});

test('a genuine page change still notifies page-changed', async () => {
  const { controller, notified } = harness({
    duringFind: async (state) => { state.urlCurrent = false; }, // navigation, not a surface
  });
  assert.equal((await controller.fill({})).reason, 'page-changed');
  assert.deepEqual(notified(), ['page-changed']);
});
