'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const crypto = require('node:crypto');

const p = require('../../src/main/sync-pairing');

const payload = () => ({
  v: 1, handle: 'anthony', accountId: 'a'.repeat(64), key: crypto.randomBytes(32).toString('base64'),
});

test('generateCode draws 8 symbols from the unambiguous alphabet', () => {
  for (let i = 0; i < 200; i += 1) {
    const code = p.generateCode();
    assert.equal(code.length, p.CODE_LENGTH);
    for (const ch of code) assert.ok(p.CODE_ALPHABET.includes(ch), `${ch} not in alphabet`);
    assert.doesNotMatch(code, /[0O1IL]/);
  }
});

test('normalizeCode accepts hyphen, spaces and lowercase; rejects ambiguous and short input', () => {
  assert.equal(p.normalizeCode('k7mr-4px2'), 'K7MR4PX2');
  assert.equal(p.normalizeCode(' k7mr 4px2\n'), 'K7MR4PX2');
  assert.equal(p.normalizeCode('K7MR4PX'), null);
  assert.equal(p.normalizeCode('K7MR4PX0'), null);
  assert.equal(p.normalizeCode('K7MR4PXO'), null);
  assert.equal(p.normalizeCode(null), null);
});

test('formatCode groups 4-4', () => {
  assert.equal(p.formatCode('K7MR4PX2'), 'K7MR-4PX2');
});

test('pairingMaterial is deterministic and code-sensitive', () => {
  const a = p.pairingMaterial('K7MR4PX2');
  const b = p.pairingMaterial('K7MR4PX2');
  const c = p.pairingMaterial('K7MR4PX3');
  assert.equal(a.pairId, b.pairId);
  assert.ok(a.wrapKey.equals(b.wrapKey));
  assert.match(a.pairId, /^[0-9a-f]{64}$/);
  assert.notEqual(a.pairId, c.pairId);
  assert.ok(!a.wrapKey.equals(c.wrapKey));
  assert.equal(a.wrapKey.length, 32);
});

test('pairingMaterial refuses a non-normalized code', () => {
  assert.throws(() => p.pairingMaterial('k7mr-4px2'));
});

test('wrapSecret/unwrapSecret round-trip and reject a wrong key', () => {
  const { wrapKey } = p.pairingMaterial('K7MR4PX2');
  const other = p.pairingMaterial('K7MR4PX3').wrapKey;
  const secret = payload();
  const blob = p.wrapSecret(wrapKey, secret);
  assert.deepEqual(p.unwrapSecret(wrapKey, blob), secret);
  assert.throws(() => p.unwrapSecret(other, blob), { message: 'pair-invalid' });
});

test('validatePayload rejects bad shapes and drops extra fields', () => {
  const good = payload();
  assert.deepEqual(p.validatePayload({ ...good, extra: 1 }), good);
  assert.throws(() => p.validatePayload({ ...good, v: 2 }), { message: 'pair-invalid' });
  assert.throws(() => p.validatePayload({ ...good, accountId: 'a'.repeat(63) }), { message: 'pair-invalid' });
  assert.throws(() => p.validatePayload({ ...good, key: crypto.randomBytes(31).toString('base64') }), { message: 'pair-invalid' });
  assert.throws(() => p.validatePayload({ ...good, handle: '' }), { message: 'pair-invalid' });
  assert.throws(() => p.validatePayload(null), { message: 'pair-invalid' });
});

test('recovery code round-trips, tolerates whitespace, rejects truncation', () => {
  const secret = payload();
  const code = p.encodeRecoveryCode(secret);
  assert.ok(code.startsWith('blanc-sync:1:'));
  assert.deepEqual(p.decodeRecoveryCode(` ${code}\n`), secret);
  assert.throws(() => p.decodeRecoveryCode(code.slice(0, -10)), { message: 'pair-invalid' });
  assert.throws(() => p.decodeRecoveryCode('blanc-sync:2:abc'), { message: 'pair-invalid' });
  assert.equal(p.isRecoveryCode(' blanc-sync:1:x'), true);
  assert.equal(p.isRecoveryCode('K7MR4PX2'), false);
});
