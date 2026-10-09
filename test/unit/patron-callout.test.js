'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  PATRON_CALLOUT_SNOOZE_MS,
  isPatronCalloutSnoozed,
} = require('../../src/main/patron-callout');

const root = path.join(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const DAY = 86_400_000;

test('closing the Patron upgrade snoozes it for 90 days', () => {
  assert.equal(PATRON_CALLOUT_SNOOZE_MS, 90 * DAY);
  const closedAt = Date.UTC(2026, 9, 9);
  assert.equal(isPatronCalloutSnoozed(closedAt, closedAt), true);
  assert.equal(isPatronCalloutSnoozed(closedAt, closedAt + 89 * DAY), true);
  assert.equal(isPatronCalloutSnoozed(closedAt, closedAt + 90 * DAY), false, 'it returns on day 90');
});

test('a never-closed or unreadable timestamp never snoozes', () => {
  const now = Date.UTC(2026, 9, 9);
  for (const value of [0, -1, NaN, Infinity, null, undefined, '1700000000000']) {
    assert.equal(isPatronCalloutSnoozed(value, now), false, String(value));
  }
});

test('a clock set back keeps the snooze but never extends it past 90 days', () => {
  const closedAt = Date.UTC(2026, 9, 9);
  assert.equal(isPatronCalloutSnoozed(closedAt, closedAt - DAY), true);
  assert.equal(isPatronCalloutSnoozed(closedAt + 400 * DAY, closedAt), false,
    'a timestamp far in the future is treated as corrupt, not as a permanent dismissal');
});

test('the dismissal is device-local, validated, and reaches every start page', () => {
  const settings = read('src/main/settings.js');
  const main = read('src/main/main.js');
  const pages = read('src/main/pages.js');
  const preload = read('src/main/tab-preload.js');
  const schema = JSON.parse(read('settings-schema/schema.json'));

  assert.match(settings, /patronCalloutDismissedAt: 0,/);
  assert.doesNotMatch(settings.match(/const SYNCED_KEYS = \[[^\]]*\]/)[0], /patronCallout/);
  assert.ok(schema.internalDefaults.includes('patronCalloutDismissedAt'));
  assert.match(main, /patronCalloutSnoozed: isPatronCalloutSnoozed\(current\.patronCalloutDismissedAt, Date\.now\(\)\),/);
  assert.match(main, /dismissPatronCallout: \(\) => \{\s*settings\.setSettings\(\{ patronCalloutDismissedAt: Date\.now\(\) \}\);\s*return true;/);
  assert.match(pages, /handle\('pages:start:patron-callout-dismiss', 'newtab', \(\) => hooks\.startPage\?\.dismissPatronCallout\?\.\(\) === true\)/);
  assert.match(preload, /dismissPatronCallout: \(\) => invoke\('pages:start:patron-callout-dismiss'\)/);
});
