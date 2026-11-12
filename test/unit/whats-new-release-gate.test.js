'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// A feature release's What's New page must be live on blanc.day before the
// release publishes: the first launch after an update asks for it once, and
// v1.39.0's first launches came a minute after publication, before the page
// deployed (docs/release-incidents/2026-10-19-v1.39.0.md).
const ROOT = path.join(__dirname, '../..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const load = () => import('../../scripts/check-whats-new-page.mjs');

test('a feature release needs its page; bug-fix releases and pre-releases do not', async () => {
  const { whatsNewGate } = await load();
  assert.deepEqual(whatsNewGate({ version: '1.40.0', noPage: [] }), { url: 'https://blanc.day/whats-new/1.40' });
  assert.match(whatsNewGate({ version: '1.40.1', noPage: [] }).skip, /bug-fix/);
  assert.match(whatsNewGate({ version: '1.40.0-rc.1', noPage: [] }).skip, /pre-release/);
  assert.match(whatsNewGate({ version: '1.40.0', noPage: ['1.40'] }).skip, /noPage/);
});

test('only a direct 200 counts, as in the app', async () => {
  const { pageIsLive } = await load();
  const seen = [];
  const fetch = async (url, init) => { seen.push({ url, init }); return { status: 200 }; };
  assert.equal(await pageIsLive('https://blanc.day/whats-new/1.40', { fetch }), true);
  assert.equal(seen[0].init.method, 'HEAD');
  assert.equal(seen[0].init.redirect, 'manual');
  assert.equal(await pageIsLive('u', { fetch: async () => ({ status: 301 }) }), false);
  assert.equal(await pageIsLive('u', { fetch: async () => ({ status: 404 }) }), false);
  assert.equal(await pageIsLive('u', { fetch: async () => { throw new Error('offline'); } }), false);
});

test('release.sh checks the page before building and again before signing', () => {
  const script = read('scripts/release.sh');
  const checks = [...script.matchAll(/node scripts\/check-whats-new-page\.mjs --version "\$VERSION"/g)].map((m) => m.index);
  assert.equal(checks.length, 2, 'two checks');
  assert.ok(checks[0] < script.indexOf('running the press verification gate'), 'the first fails fast, before any build');
  assert.ok(checks[1] < script.indexOf('Signing the complete checksum manifest through Sigstore'), 'the second runs before Sigstore');
  assert.ok(checks[1] > script.indexOf('Downloading the authenticated draft asset set'));
});
