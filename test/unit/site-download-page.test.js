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
const testflight = JSON.parse(read('site/src/data/ios-testflight.json'));
// The iPhone and iPad row names the TestFlight build from ios-testflight.json
// (scripts/ios-testflight-site.mjs); its brief's spans are separate pieces.
const main = page.slice(page.indexOf('<main'), page.indexOf('</main>'))
  .replace(/\{testflight\.(version|build)\}/g, (_, key) => testflight[key])
  .replace(/<p class="dl-beta-brief">([\s\S]*?)<\/p>/g, (_, inner) => inner.replace(/<span>/g, '<p>').replace(/<\/span>/g, '</p>'));
// The Betas panel's heading and sentence and its Mac, Windows and Linux rows are
// recorded in the beta ledgers; its iPhone and Android rows are checked here.
const withoutBeta = main
  .replace(/<div class="dl-betas-head">[\s\S]*?<\/div>/, '')
  .replace(/<article class="dl-beta-row(?! dl-beta-row--mobile)[^"]*"[\s\S]*?<\/article>/g, '');

test('every piece of text on the page is recorded or a label (the beta tiles have their own ledgers)', () => {
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
    assert.ok(normalize(main).includes(claim.exactWording), `${claim.id}: wording drifted`);
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
    assert.match(page, new RegExp(`<div class="dl-panel" data-os="${os}"( id="\\w+")?>`));
  }
  const css = read('site/src/styles/site.css');
  for (const os of ['mac', 'win', 'linux', 'iphone', 'android']) assert.ok(css.includes(`#dl-os-${os}:checked ~ .dl-panels .dl-panel[data-os="${os}"]`), `${os} panel switches in CSS`);
  for (const target of ['mac-arm64', 'mac-x64', 'win', 'linux', 'beta', 'beta-win']) assert.match(page, new RegExp(`href="/dl/${target}"`));
  const mobile = [...main.matchAll(/<article class="dl-beta-row dl-beta-row--mobile" id="(beta-\w+)"[\s\S]*?<\/article>/g)];
  assert.deepEqual(mobile.map((m) => m[1]), ['beta-iphone', 'beta-android'], 'the Betas panel ends with the iPhone and Android betas');
  assert.match(mobile[0][0], /href=\{ios\.joinUrl\}/);
  assert.deepEqual([...mobile[1][0].matchAll(/href="([^"]+)"/g)].map((m) => m[1]), ['/android-beta'], 'the Android row leads only to the beta signup');
  assert.match(page, /<h1 id="download-title">Download Blanc<\/h1>/);
  assert.doesNotMatch(main, /<h[12][^>]*>[^<]*\.<\/h[12]>/, 'no full stops after large headings');
});

test('the Mac panel switches between the download and Homebrew without scripting', () => {
  const panel = page.slice(page.indexOf('<div class="dl-panel" data-os="mac">'), page.indexOf('<div class="dl-panel" data-os="win">'));
  const radios = [...panel.matchAll(/<input class="dl-method-radio" type="radio" name="dl-mac-method" id="dl-mac-method-(\w+)" value="(\w+)"( checked)? \/>/g)];
  assert.deepEqual(radios.map((m) => [m[1], m[2], Boolean(m[3])]), [['dmg', 'dmg', true], ['brew', 'brew', false]], 'Download shows without scripting');
  const css = read('site/src/styles/site.css');
  for (const method of ['dmg', 'brew']) {
    assert.ok(css.includes(`#dl-mac-method-${method}:checked ~ .dl-method-panes .dl-method-pane[data-method="${method}"]`), `${method} pane switches in CSS`);
    assert.match(panel, new RegExp(`<div class="dl-method-pane" data-method="${method}">`));
  }
  // site.js reveals the Intel link only as a direct child of [data-download-options].
  const options = panel.match(/<div class="dl-actions dl-actions--mac" data-download-options>([\s\S]*?)\n {16}<\/div>/)?.[1] ?? '';
  assert.match(options, /<a class="dl-button" id="dl-mac-arm64"[^>]*href="\/dl\/mac-arm64">Download for Mac<\/a>/);
  assert.match(options, /<a class="dl-alt" id="dl-mac-x64"[^>]*href="\/dl\/mac-x64" hidden>Intel Mac<\/a>/);
  assert.match(panel, /<code><span class="terminal-prompt" aria-hidden="true">% <\/span>brew install --cask bnfy\/tap\/blanc<\/code>/);
  assert.match(panel, /<button type="button" class="terminal-copy" data-terminal-copy="brew install --cask bnfy\/tap\/blanc"[^>]* hidden>Copy<\/button>/);
  assert.equal((page.match(/data-terminal-status/g) || []).length, 1, 'one status line for the Copy button');
  assert.doesNotMatch(page, /dl-tile--brew/, 'Homebrew has no tile of its own any more');
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
  // The site navigation links /download#iphone: that opens the iPhone tab whatever the system.
  assert.match(page, /<div class="dl-panel" data-os="iphone" id="iphone">/);
  const nav = await import('../../site/src/data/navigation.mjs');
  assert.ok(JSON.stringify(nav).includes('/download#iphone'), 'the navigation still links the iPhone tab');
  radios.forEach((r) => { r.checked = r.value === 'mac'; });
  const panels = { iphone: { dataset: { os: 'iphone' } } };
  const linked = { querySelector: (selector) => (selector.startsWith('.dl-panel') ? panels[selector.match(/id="(\w+)"/)[1]] ?? null : chooser.querySelector(selector)) };
  const viaHash = { document: { querySelector: () => linked }, navigator: view.navigator, location: { hash: '#iphone' } };
  assert.equal(initDownloadSwitcher(viaHash), 'iphone');
  assert.equal(radios.find((r) => r.value === 'iphone').checked, true);
  assert.equal(initDownloadSwitcher({ ...viaHash, location: { hash: '#"]x' } }), 'linux', 'an odd address falls back to the system');
});

test('the iPhone and iPad beta row names the TestFlight build its ledger records', () => {
  assert.match(testflight.version, /^\d+(\.\d+)+$/);
  assert.match(testflight.build, /^\d{12}$/);
  assert.match(testflight.uploaded, /^\d{4}-\d{2}-\d{2}$/);
  const claim = record.claims.find((c) => c.field === 'testflight-build');
  assert.equal(claim.exactWording, `${testflight.version} (${testflight.build})`);
  assert.ok(claim.evidence.includes(testflight.uploaded), 'the evidence names the upload day');
  assert.match(page, /<time datetime=\{testflight\.uploaded\} data-beta-updated><\/time>/);
});
