import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareWindowIdentity } from './window-identity.mjs';

test('identity hooks cover session rebuild and both window restore paths', () => {
  const changes = [];
  prepareWindowIdentity((path, edits) => changes.push({ path, edits }));
  assert.equal(changes.length, 3);
  const all = changes.flatMap(c => c.edits.map(e => e.replacement)).join('\n');
  assert.equal((all.match(/RestoreWindowIdentity\(/g) || []).length, 2);
  assert(all.includes('CreateAddWindowExtraDataCommand'));
  assert(all.includes('kWindowIdentityKey'));
  for (const { edits } of changes) for (const e of edits) {
    assert(e.anchor && e.present && e.replacement.includes(e.present));
  }
});
