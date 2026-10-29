// Cloudflare supplies the country from the connecting IP. Do not cache a
// visitor-specific decision or expose the country to the browser.
const consentCountries = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR',
  'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK',
  'SI', 'ES', 'SE', 'IS', 'LI', 'NO', 'GB', 'CH', 'GF', 'GP', 'MQ', 'RE',
  'YT', 'AX', 'MF',
]);

export function onRequestGet({ request }) {
  const country = request.cf?.country;
  const known = typeof country === 'string' && /^[A-Z]{2}$/.test(country) &&
    country !== 'XX' && country !== 'ZZ' && country !== 'T1';
  return Response.json({ optInRequired: !known || consentCountries.has(country) }, {
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}
