// Verified in Polar production (bnfy), including archived-product duplicates,
// on 2026-10-13. These are public identifiers, never API credentials.
export const organizationId = '6f675077-6cb1-4965-8db8-15838e5fdb38';
export const mailBenefitId = '93a4fbc5-b7b0-4a0b-8817-46f62814181c';
export const products = Object.freeze({
  'mail-monthly': Object.freeze({ id: 'b39dbdde-a607-4b94-bbba-f20c5acd6439', amount: 499, interval: 'month', benefits: Object.freeze([mailBenefitId]) }),
  'mail-annual': Object.freeze({ id: '72c489be-30a0-4dee-9a02-2a482458f17b', amount: 4999, interval: 'year', benefits: Object.freeze([mailBenefitId]) }),
  'suite-monthly': Object.freeze({ id: 'bb3a14c5-7fab-4f64-a7b2-718aafec9966', amount: 700, interval: 'month', benefits: Object.freeze(['ed1cce8c-d87e-4d27-b9d7-d30bda2de402', mailBenefitId]) }),
  'suite-annual': Object.freeze({ id: '28957184-d99d-4954-bdb6-56397a606816', amount: 7000, interval: 'year', benefits: Object.freeze(['ed1cce8c-d87e-4d27-b9d7-d30bda2de402', mailBenefitId]) }),
});

// These gates require a reviewed change after purchase and billing-period
// key-continuity testing, including existing Patron subscribers. Private
// Polar visibility alone does not close checkout through a direct link.
// Keep checkout disabled until the approved Blanc Mail release ships.
export const purchaseTestingPassed = false;
export const keyContinuityTestingPassed = false;
export const checkoutEnabled = false;
const checkoutLinks = Object.freeze({
  'mail-monthly': null,
  'mail-annual': null,
  'suite-monthly': null,
  'suite-annual': null,
});

export function productFor(plan) {
  if (!Object.hasOwn(products, plan)) throw new RangeError('Unknown Mail or Suite plan');
  return products[plan];
}

// The future server-side Polar Checkout Sessions flow uses this exact product
// selection. No customer identity, token, trial or price override belongs here.
// Constructing the payload does not create a session or open checkout.
export function checkoutRequestFor(plan) {
  return { products: [productFor(plan).id], return_url: 'https://blanc.day/mail/pricing' };
}

export function checkoutHrefFor(plan) {
  productFor(plan);
  if (!purchaseTestingPassed || !keyContinuityTestingPassed || !checkoutEnabled) return null;
  const link = checkoutLinks[plan];
  if (!link) return null;
  const url = new URL(link);
  return url.origin === 'https://buy.polar.sh' && url.pathname.startsWith('/polar_cl_') ? url.href : null;
}

export function priceFor(plan) {
  return `$${productFor(plan).amount / 100}`;
}
