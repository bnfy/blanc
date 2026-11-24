'use strict';
// scripts/ios-testflight-site.mjs picks the Download page's TestFlight build:
// the newest build the public group is testing, never an expired or waiting
// one, and rewrites only that claim's line in the hand-formatted ledger.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const load = () => import('../../scripts/ios-testflight-site.mjs');
const ledgerPath = path.join(__dirname, '..', '..', 'docs', 'website-download-redesign-2026-11-14-claims.json');

test('the newest build in testing wins; expired and waiting builds never do', async () => {
  const { latestPublicBuild } = await load();
  const rows = [
    { build: '202611220258', version: '1.1', uploaded: '2026-11-21T19:08:55-08:00', expired: false, state: 'IN_BETA_TESTING' },
    { build: '202611230100', version: '1.1', uploaded: '2026-11-22T17:00:00-08:00', expired: false, state: 'WAITING_FOR_BETA_REVIEW' },
    { build: '202611230200', version: '1.1', uploaded: '2026-11-22T18:00:00-08:00', expired: true, state: 'IN_BETA_TESTING' },
    { build: '202611161544', version: '1.0.4', uploaded: '2026-11-16T07:50:03-08:00', expired: false, state: 'IN_BETA_TESTING' },
  ];
  assert.deepEqual(latestPublicBuild(rows), { version: '1.1', build: '202611220258', uploaded: '2026-11-22' });
  assert.throws(() => latestPublicBuild(rows.slice(1, 3)), /no build in testing/);
});

test('only the TestFlight claim line changes, and the ledger stays valid JSON', async () => {
  const { applyToLedger, claimText } = await load();
  const before = fs.readFileSync(ledgerPath, 'utf8');
  const data = { version: '9.9', build: '209912312359', uploaded: '2099-12-31' };
  const after = applyToLedger(before, data);
  const changed = before.split('\n').filter((line, i) => line !== after.split('\n')[i]);
  assert.equal(changed.length, 1);
  const claim = JSON.parse(after).claims.find((c) => c.field === 'testflight-build');
  assert.equal(claim.exactWording, claimText(data));
  assert.equal(claim.exactWording, '9.9 (209912312359)');
  assert.ok(claim.evidence.includes('2099-12-31'));
  assert.equal(applyToLedger(applyToLedger(before, data), data), after, 'running twice changes nothing more');
});

test('a claim spread over several lines is refused with a clear message', async () => {
  const { applyToLedger } = await load();
  const text = '{\n  "claims": [\n    {\n      "field": "testflight-build",\n      "exactWording": ""\n    }\n  ]\n}\n';
  assert.throws(() => applyToLedger(text, { version: '1.1', build: '202611220258', uploaded: '2026-11-22' }), /must stay on one line/);
});
