const assert = require('node:assert/strict');
const { test } = require('node:test');

test('Mail and Suite checkout selects one production plan and stays closed', async () => {
  const commerce = await import('../../site/src/data/mail-commerce.mjs');
  const expected = {
    'mail-monthly': 'b39dbdde-a607-4b94-bbba-f20c5acd6439',
    'mail-annual': '72c489be-30a0-4dee-9a02-2a482458f17b',
    'suite-monthly': 'bb3a14c5-7fab-4f64-a7b2-718aafec9966',
    'suite-annual': '28957184-d99d-4954-bdb6-56397a606816',
  };
  for (const [plan, id] of Object.entries(expected)) {
    assert.deepEqual(commerce.checkoutRequestFor(plan), {
      products: [id], return_url: 'https://blanc.day/mail/pricing',
    });
    assert.equal(commerce.checkoutHrefFor(plan), null);
  }
  assert.throws(() => commerce.checkoutRequestFor('toString'), RangeError);
  assert.throws(() => commerce.checkoutHrefFor('patron-monthly'), RangeError);
  assert.equal(commerce.purchaseTestingPassed, false);
  assert.equal(commerce.keyContinuityTestingPassed, false);
  assert.equal(commerce.checkoutEnabled, false);
  assert.deepEqual(commerce.productFor('suite-monthly').benefits, [
    'ed1cce8c-d87e-4d27-b9d7-d30bda2de402', commerce.mailBenefitId,
  ]);
  assert.deepEqual(commerce.productFor('suite-annual').benefits, [
    'ed1cce8c-d87e-4d27-b9d7-d30bda2de402', commerce.mailBenefitId,
  ]);
});
