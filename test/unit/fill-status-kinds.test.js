'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { FILL_KINDS, MODES, kindForErrorCode } = require('../../src/main/fill-status-kinds');
const copy = require('../../src/renderer/fill-status-copy');

test('every kind has complete copy and a valid mode', () => {
  const kinds = Object.keys(FILL_KINDS);
  assert.ok(kinds.length >= 15, 'kind table missing or truncated'); // fail-loud guard
  for (const kind of kinds) {
    const def = FILL_KINDS[kind];
    assert.ok([MODES.DECISION, MODES.NOTICE].includes(def.mode), `${kind} mode`);
    const entry = copy.FILL_COPY[kind];
    assert.ok(entry?.title, `${kind} needs title copy`);
    // Success notices are deliberately title-only ("Filled from 1Password");
    // everything else carries an actionable body line.
    if (!(def.mode === MODES.NOTICE && def.level === 'success')) {
      assert.ok(entry?.body, `${kind} needs body copy`);
    }
    if (def.mode === MODES.DECISION) {
      assert.equal(def.verbs.length, 2, `${kind} decision needs two verbs`);
      assert.ok(def.verbs.includes('cancel'), `${kind} needs cancel verb`);
      assert.ok(entry.primaryLabel && entry.cancelLabel, `${kind} needs button labels`);
    } else {
      assert.deepEqual(def.verbs, ['dismiss'], `${kind} notice verbs`);
      assert.ok(['error', 'success'].includes(def.level), `${kind} notice level`);
    }
  }
});

test('controller error codes all map to kinds; broker-unavailable unifies', () => {
  const { ERROR_COPY } = require('../../src/main/credential-fill-controller');
  for (const code of Object.keys(ERROR_COPY)) {
    assert.ok(FILL_KINDS[kindForErrorCode(code)], `unmapped error code ${code}`);
  }
  assert.equal(kindForErrorCode('broker-unavailable'), 'broker-stopped');
  assert.equal(kindForErrorCode('made-up-code'), 'sdk-error');
});

test('no copy string interpolates data (fixed strings only)', () => {
  for (const [kind, entry] of Object.entries(copy.FILL_COPY)) {
    for (const value of Object.values(entry)) {
      assert.equal(typeof value, 'string', `${kind} copy must be plain strings`);
      assert.ok(!value.includes('${'), `${kind} copy must not interpolate`);
    }
  }
});
