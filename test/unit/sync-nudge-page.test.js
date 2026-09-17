'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const COPY = 'Sync your favorites and settings across your devices, and, if you choose, open tabs. End-to-end encrypted; Blanc can’t read it.';

test('the ledger and Billboard each carry one hidden-by-default sync card with the approved copy', () => {
  const html = read('src/renderer/pages/newtab.html');
  const cards = html.match(/class="[^"]*js-sync-nudge[^"]*"[^>]*hidden/g) ?? [];
  assert.equal(cards.length, 2);
  assert.match(html, /<section id="syncNudge" class="ledger-section sync-nudge js-sync-nudge" hidden>/);
  assert.match(html, /<section class="bb-sync-nudge sync-nudge js-sync-nudge" hidden>/);
  assert.equal((html.split(COPY).length - 1), 2, 'exact copy in both cards');
  assert.equal((html.match(/class="js-sync-nudge-setup">Set up sync</g) ?? []).length, 2);
  assert.equal((html.match(/class="quiet js-sync-nudge-dismiss">Not now</g) ?? []).length, 2);
  assert.doesNotMatch(html, /Macs and PCs/);
  assert.doesNotMatch(html, /style="/, 'no inline styles');
});

test('newtab.js reflects syncNudge from data and status and routes clicks through the bridge', () => {
  const js = read('src/renderer/pages/newtab.js');
  assert.match(js, /function renderSyncNudge\(show\) \{\s*for \(const el of document\.querySelectorAll\('\.js-sync-nudge'\)\) el\.hidden = !show;\s*\}/);
  assert.match(js, /renderSyncNudge\(data\.syncNudge === true\);/);
  assert.match(js, /if \(status && 'syncNudge' in status\) renderSyncNudge\(status\.syncNudge === true\);/);
  assert.match(js, /start\.openSettings\('sync'\)/);
  assert.match(js, /start\.dismissSyncNudge\(\)/);
  // The renderer never hides the card on its own click; the status push does.
  assert.doesNotMatch(js, /js-sync-nudge-dismiss[\s\S]{0,200}\.hidden = true/);
});
