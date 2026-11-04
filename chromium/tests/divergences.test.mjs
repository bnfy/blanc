// Each divergence replacement must stand in for a step shipping defines.
import test from 'node:test';
import assert from 'node:assert/strict';
import {definitions} from './steps.mjs';
import {DIVERGENCES} from './fork-steps/divergences.mjs';

test('every divergence replaces a shipping step and names its divergence', () => {
  for (const [expression, {divergence}] of DIVERGENCES) {
    assert.match(divergence, /^V\d+$/, expression);
    const found = definitions.filter(d => d.expression === expression);
    assert.equal(found.length, 1, expression);
    assert.match(found[0].shippingSource, /divergences\.mjs \(V\d+; shipping test\/desktop\/steps\//, expression);
  }
});
