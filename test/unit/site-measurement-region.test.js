const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('Cloudflare region decision requires opt-in for Europe and unknown locations', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../../functions/measurement-region.js'), 'utf8');
  const { onRequestGet } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  for (const [country, expected] of [['US', false], ['CA', false], ['DE', true], ['NO', true], ['GB', true], ['CH', true], ['XX', true], ['ZZ', true], ['T1', true], [undefined, true]]) {
    const response = onRequestGet({ request: { cf: { country } } });
    assert.equal((await response.json()).optInRequired, expected, String(country));
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
});
