'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { chooseAndReveal } = require('../../src/main/credential-fill-flow');

function cand(n) {
  return { vaultId: 'v', vaultName: 'Personal', itemId: 'i' + n, title: 't', host: 'h', updatedAt: new Date(0) };
}

/** Collaborators that record what was called, so contracts are asserted on
 * CALLS — not on log text, which would pass even if a decrypt had happened.
 *
 * requestPick returns index 1, NOT 0: an implementation that ignored the
 * picker's answer and always took kept[0] would pass against index 0. The
 * assertions below check which candidate actually reached revealCredential. */
function deps(over = {}) {
  const seen = {
    revealUsernames: 0, requestPick: 0, restoreTabFocus: 0, revealCredential: 0,
    revealedFor: null,
  };
  return {
    seen,
    async revealUsernames(list) {
      seen.revealUsernames += 1;
      return list.map((c) => ({ ...c, username: 'u-' + c.itemId }));
    },
    async requestPick() { seen.requestPick += 1; return { index: 1, reason: 'selected' }; },
    async restoreTabFocus() { seen.restoreTabFocus += 1; return true; },
    revalidate() { return null; },                 // null = still valid
    async revealCredential(c) {
      seen.revealCredential += 1;
      seen.revealedFor = c.itemId;
      return { username: 'u', password: 'p' };
    },
    ...over,
  };
}

test('flow: ONE survivor bypasses enumeration and the picker entirely', async () => {
  const d = deps();
  const r = await chooseAndReveal({ kept: [cand(1)], truncated: 0, host: 'x.test', deps: d });
  assert.equal(r.outcome, 'ok');
  assert.equal(d.seen.revealUsernames, 0, 'nothing may be decrypted for a single survivor');
  assert.equal(d.seen.requestPick, 0, 'no picker may open for a single survivor');
  assert.equal(d.seen.revealCredential, 1);
  assert.equal(d.seen.revealedFor, 'i1');
});

test('flow: several survivors enumerate, pick, and reveal THE CHOSEN one', async () => {
  const d = deps();   // requestPick resolves index 1
  const r = await chooseAndReveal({ kept: [cand(1), cand(2)], truncated: 0, host: 'x.test', deps: d });
  assert.equal(r.outcome, 'ok');
  assert.equal(d.seen.revealUsernames, 1);
  assert.equal(d.seen.requestPick, 1);
  assert.equal(r.chosen.itemId, 'i2', 'the picker chose index 1, so kept[1] must win');
  assert.equal(d.seen.revealedFor, 'i2',
    'revealCredential must receive the CHOSEN candidate — always taking kept[0] would pass with index 0');
});

test('flow: enumeration failure never opens a picker and never leaks the SDK message', async () => {
  const d = deps({ async revealUsernames() { throw new Error('SDK-SECRET-DETAIL'); } });
  const r = await chooseAndReveal({ kept: [cand(1), cand(2)], truncated: 0, host: 'x.test', deps: d });
  assert.equal(r.outcome, 'fill-error');
  assert.equal(d.seen.requestPick, 0, 'no partial picker may be shown');
  assert.equal(d.seen.revealCredential, 0);
  assert.ok(!JSON.stringify(r).includes('SDK-SECRET-DETAIL'), 'the SDK message must not escape');
});

test('flow: FAILED focus restoration never calls revealCredential', async () => {
  const d = deps({ async restoreTabFocus() { return false; } });
  const r = await chooseAndReveal({ kept: [cand(1), cand(2)], truncated: 0, host: 'x.test', deps: d });
  assert.equal(r.outcome, 'abort-wc-changed');
  assert.equal(d.seen.revealCredential, 0,
    'asserted on the CALL — a log assertion would pass even if the decrypt had happened');
});

test('flow: cancellation restores focus only for dismissed and escape', async () => {
  for (const [reason, expected] of [['dismissed', 1], ['escape', 1], ['blur', 0],
    ['tab-changed', 0], ['window-closed', 0], ['timeout', 0], ['mode-replaced', 0],
    ['hidden', 0], ['invalid-reply', 0]]) {
    const d = deps({ async requestPick() { return { index: null, reason }; } });
    const r = await chooseAndReveal({ kept: [cand(1), cand(2)], truncated: 0, host: 'x.test', deps: d });
    assert.equal(r.outcome, 'chooser-cancel');
    assert.equal(r.detail, reason);
    assert.equal(d.seen.restoreTabFocus, expected, `focus policy for ${reason}`);
    assert.equal(d.seen.revealCredential, 0);
  }
});

test('flow: a failed re-validation after selection aborts before decrypting', async () => {
  const d = deps({ revalidate: () => 'abort-navigated' });
  const r = await chooseAndReveal({ kept: [cand(1), cand(2)], truncated: 0, host: 'x.test', deps: d });
  assert.equal(r.outcome, 'abort-navigated');
  assert.equal(d.seen.revealCredential, 0);
});

test('flow: rows handed to the picker carry exactly four keys', async () => {
  let captured = null;
  const d = deps({ async requestPick(rows) { captured = rows; return { index: 1, reason: 'selected' }; } });
  await chooseAndReveal({ kept: [cand(1), cand(2)], truncated: 0, host: 'x.test', deps: d });
  for (const row of captured) {
    assert.deepEqual(Object.keys(row).sort(), ['host', 'title', 'username', 'vaultName'],
      'no vaultId, no itemId, never a password');
  }
});
