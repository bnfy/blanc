'use strict';
// /download, reimagined on 2026-11-14 (owner: far fewer words, Blanc Beta up
// front): every piece of text on the page is recorded in a claims ledger or
// listed as a label, the system switch works without scripting, and the
// script only preselects the visitor's system.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const page = read('site/src/pages/download.astro');
const record = JSON.parse(read('docs/website-download-redesign-2026-11-14-claims.json'));
const entities = { rsquo: '’', lsquo: '‘', amp: '&', ldquo: '“', rdquo: '”' };
const normalize = (text) => text.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]*>/g, ' ')
  .replace(/&(rsquo|lsquo|amp|ldquo|rdquo);/g, (_, name) => entities[name]).replace(/↗/g, ' ')
  .replace(/\s+/g, ' ').replace(/\s+([.,?])/g, '$1').trim();
const main = page.slice(page.indexOf('<main'), page.indexOf('</main>'));
const withoutBeta = main.replace(/<article class="dl-tile dl-tile--beta"[\s\S]*?<\/article>/, '');

test('every piece of text on the page is recorded or a label (the beta tile has its own ledger)', () => {
  const recorded = new Set([...record.claims.map((claim) => claim.exactWording), ...record.labels]);
  const pieces = [
    ...[...withoutBeta.matchAll(/<(h1|h2|h3|p|li|summary|label|dt|dd|button)\b[^>]*>([\s\S]*?)<\/\1>/g)].map((m) => m[2]),
    ...[...withoutBeta.matchAll(/<a\b[^>]*class="(?:dl-button|dl-alt|dl-tile-button|dl-tile-link|download-handheld-action)"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => m[1]),
  ].map(normalize).filter(Boolean);
  for (const piece of pieces) {
    const sentences = recorded.has(piece) ? [piece] : piece.split(/(?<=[.?]) (?=[A-Z])/);
    for (const sentence of sentences) assert.ok(recorded.has(sentence), `unrecorded text on /download: ${sentence}`);
  }
  for (const claim of record.claims) {
    assert.ok(normalize(page).includes(claim.exactWording), `${claim.id}: wording drifted`);
    assert.ok(['verified', 'qualified'].includes(claim.verdict) && claim.evidence.length > 20, `${claim.id}: verdict and evidence`);
  }
});

test('each new sentence rests on a claim recorded in an earlier, checked ledger', () => {
  const known = new Map();
  for (const file of fs.readdirSync(path.join(root, 'docs')).filter((f) => /^website-.*claims.*\.json$/.test(f))) {
    const ledger = JSON.parse(read(`docs/${file}`));
    for (const list of Object.values(ledger)) if (Array.isArray(list)) for (const claim of list) if (claim?.id) known.set(claim.id, file);
  }
  for (const claim of record.claims) for (const id of claim.rests) assert.ok(known.has(id), `${claim.id} rests on unknown claim ${id}`);
});

test('the system switch works without scripting and every download is a counted link', () => {
  const radios = [...page.matchAll(/<input class="dl-radio" type="radio" name="dl-os" id="dl-os-(\w+)" value="(\w+)"( checked)? \/>/g)];
  assert.deepEqual(radios.map((m) => m[2]), ['mac', 'win', 'linux', 'iphone', 'android']);
  assert.deepEqual(radios.filter((m) => m[3]).map((m) => m[2]), ['mac'], 'Mac shows without scripting');
  for (const os of ['mac', 'win', 'linux', 'iphone', 'android']) {
    assert.match(page, new RegExp(`<label for="dl-os-${os}">`));
    assert.match(page, new RegExp(`<div class="dl-panel" data-os="${os}">`));
  }
  const css = read('site/src/styles/site.css');
  for (const os of ['mac', 'win', 'linux', 'iphone', 'android']) assert.ok(css.includes(`#dl-os-${os}:checked ~ .dl-panels .dl-panel[data-os="${os}"]`), `${os} panel switches in CSS`);
  for (const target of ['mac-arm64', 'mac-x64', 'win', 'linux', 'beta']) assert.match(page, new RegExp(`href="/dl/${target}"`));
  assert.match(page, /<h1 id="download-title">Download Blanc<\/h1>/);
  assert.doesNotMatch(main, /<h[12][^>]*>[^<]*\.<\/h[12]>/, 'no full stops after large headings');
});

test('the switcher preselects the visitor’s system and nothing else', async () => {
  const { detectSystem, initDownloadSwitcher } = await import('../../site/src/scripts/download-switcher.js');
  assert.equal(detectSystem('Mozilla/5.0 (Windows NT 10.0; Win64; x64)'), 'win');
  assert.equal(detectSystem('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'), 'mac');
  assert.equal(detectSystem('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5), 'iphone', 'iPadOS asks for desktop sites');
  assert.equal(detectSystem('Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X)'), 'iphone');
  assert.equal(detectSystem('Mozilla/5.0 (X11; Linux x86_64)'), 'linux');
  assert.equal(detectSystem('Mozilla/5.0 (Linux; Android 15)'), 'android', 'Android opens the Android tab, never Linux');
  const radios = ['mac', 'win', 'linux', 'iphone'].map((value) => ({ value, checked: value === 'mac' }));
  const chooser = { querySelector: (selector) => radios.find((r) => selector.includes(`value="${r.value}"`)) };
  const view = { document: { querySelector: () => chooser }, navigator: { userAgent: 'Mozilla/5.0 (X11; Linux x86_64)', maxTouchPoints: 0 } };
  assert.equal(initDownloadSwitcher(view), 'linux');
  assert.equal(radios.find((r) => r.value === 'linux').checked, true);
  assert.equal(initDownloadSwitcher({ document: { querySelector: () => null }, navigator: view.navigator }), null);
});
