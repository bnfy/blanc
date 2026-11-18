// Verified in Polar production (bnfy), including archived-product duplicates,
// on 2026-10-13. These are public identifiers, never API credentials.
// The Nodding Off License benefit (the iPhone app's key) was created and attached to both Bundle
// products on 2026-11-07. The Bundle prices were $9 and $90 from that day until 2026-11-17, when
// the owner moved them to $7.99 and $79.99 in Polar (the November 15 pricing decision).
export const organizationId = '6f675077-6cb1-4965-8db8-15838e5fdb38';
export const mailBenefitId = '93a4fbc5-b7b0-4a0b-8817-46f62814181c';
export const noddingOffBenefitId = '972583d1-c22d-415d-bd69-494ed63c5220';
export const products = Object.freeze({
  'mail-monthly': Object.freeze({ id: 'b39dbdde-a607-4b94-bbba-f20c5acd6439', amount: 499, interval: 'month', benefits: Object.freeze([mailBenefitId]) }),
  'mail-annual': Object.freeze({ id: '72c489be-30a0-4dee-9a02-2a482458f17b', amount: 4999, interval: 'year', benefits: Object.freeze([mailBenefitId]) }),
  // Blanc Mail with a hosted Blanc Mail address, annual only (created in Polar
  // production with the owner's go-ahead, 2026-11-17). The address itself is granted by
  // the Mail repository's Worker, not by a Polar benefit.
  'mail-address-annual': Object.freeze({ id: '77d31f96-aa36-4012-a2d9-7a1587fbf532', amount: 6999, interval: 'year', benefits: Object.freeze([mailBenefitId]) }),
  'suite-monthly': Object.freeze({ id: 'bb3a14c5-7fab-4f64-a7b2-718aafec9966', amount: 799, interval: 'month', benefits: Object.freeze(['ed1cce8c-d87e-4d27-b9d7-d30bda2de402', mailBenefitId, noddingOffBenefitId]) }),
  'suite-annual': Object.freeze({ id: '28957184-d99d-4954-bdb6-56397a606816', amount: 7999, interval: 'year', benefits: Object.freeze(['ed1cce8c-d87e-4d27-b9d7-d30bda2de402', mailBenefitId, noddingOffBenefitId]) }),
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
  'mail-address-annual': null,
  'suite-monthly': null,
  'suite-annual': null,
});

export function productFor(plan) {
  if (!Object.hasOwn(products, plan)) throw new RangeError('Unknown Mail or Bundle plan');
  return products[plan];
}

// The future server-side Polar Checkout Sessions flow uses this exact product
// selection. No customer identity, token, trial or price override belongs here.
// Constructing the payload does not create a session or open checkout.
export function checkoutRequestFor(plan) {
  return { products: [productFor(plan).id], return_url: 'https://blanc.day/mail#pricing' };
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
