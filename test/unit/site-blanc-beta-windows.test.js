'use strict';
// Blanc Beta for Windows on /download (owner, 2026-11-21: its own tile after the
// Mac beta's): the tile, its data and the /dl/beta-win redirect describe the
// same published pre-release, and every sentence in the tile is in its claims
// ledger.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const win = JSON.parse(read('site/src/data/blanc-beta-windows.json'));
const ledger = JSON.parse(read(`docs/website-blanc-beta-windows-${win.version}-claims.json`));
const page = read('site/src/pages/download.astro');

const section = () => {
  const start = page.indexOf('<article class="dl-beta-row" id="beta-windows"');
  assert.ok(start > 0, 'the Download page has the Blanc Beta for Windows row');
  return page.slice(start, page.indexOf('</article>', start));
};
const releaseDay = new Date(`${win.published}T00:00:00Z`)
  .toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const expressions = {
  'betaWin.version': win.version, 'betaWin.requirement': win.requirement, 'betaWin.chromium': win.chromium,
  winBuild: String(win.build), winChromiumMajor: win.chromium.split('.')[0], winReleased: releaseDay,
};
const plain = (text) => text
  .replace(/<!--[\s\S]*?-->/g, ' ')
  .replace(/\{([\w.]+)\}/g, (whole, name) => (name in expressions ? expressions[name] : whole))
  .replace(/<[^>]+>/g, ' ').replace(/[’‘]/g, "'").replace(/↗/g, ' ').replace(/\s+/g, ' ').trim();

test('the data and ledger name the same published Windows pre-release', () => {
  assert.equal(ledger.release, win.version);
  assert.equal(ledger.tag, win.tag);
  assert.equal(win.tag, `chromium-beta-windows-${win.version}`);
  assert.match(win.version, /^158\.0\.8127\.(\d+)$/);
  assert.equal(win.version.split('.')[3], String(win.build));
  assert.equal(win.releaseUrl, `https://github.com/bnfy/blanc/releases/tag/${win.tag}`);
  assert.equal(win.setup.name, `Blanc-Beta-Setup-${win.version}.exe`);
  assert.equal(win.setup.url, `https://github.com/bnfy/blanc/releases/download/${win.tag}/${win.setup.name}`);
  assert.match(win.setup.sha256, /^[a-f0-9]{64}$/);
  assert.ok(Number.isInteger(win.setup.bytes) && win.setup.bytes > 1e6);
  assert.equal(win.published, ledger.publicRelease);
  assert.equal(win.chromium, '158.0.8127.2');
});

test('/dl/beta-win answers with the same setup and is counted', async () => {
  const dl = await import('../../cloudflare/ping-worker/src/dl.js');
  assert.equal(dl.BETA_WINDOWS_DOWNLOAD, win.setup.url);
  assert.equal(dl.fixedDownload('beta-win'), win.setup.url);
  assert.ok(dl.DL_TARGETS.has('beta-win'));
  assert.notEqual(dl.fixedDownload('beta'), win.setup.url, 'the Mac beta keeps its own download');
});

test('every sentence in the tile is in the claims ledger, and nothing else is', () => {
  const text = plain(section());
  let rest = text;
  for (const claim of ledger.claims) {
    assert.ok(claim.kind === 'label' || (typeof claim.evidence === 'string' && claim.evidence.length > 20), `evidence for: ${claim.text}`);
    assert.ok(rest.includes(claim.text), `the page says: ${claim.text}`);
    rest = rest.replace(claim.text, ' ');
  }
  assert.equal(rest.replace(/\s+/g, ''), '', `unrecorded text on the page: ${rest.trim()}`);
  assert.doesNotMatch(text, /\{/, 'every expression in the tile is substituted');
  assert.match(section(), /href="\/dl\/beta-win"/);
});

test('it follows the Mac beta and is never one of the platform choices', () => {
  const chooser = page.slice(page.indexOf('data-download-chooser'), page.indexOf('class="dl-version"'));
  assert.doesNotMatch(chooser, /beta-win|Blanc Beta for Windows/);
  const tiles = page.slice(page.indexOf('id="download-more"'));
  assert.ok(tiles.indexOf('id="beta"') < tiles.indexOf('id="beta-windows"'));
  assert.ok(tiles.indexOf('id="beta-windows"') < tiles.indexOf('id="beta-iphone"'));
});

test('the Mac beta tile no longer lists Windows (or Linux) as missing', () => {
  const start = page.indexOf('<article class="dl-beta-row" id="beta"');
  const mac = page.slice(start, page.indexOf('</article>', start));
  assert.doesNotMatch(mac, /Windows|Linux/);
  assert.match(mac, /<li>Intel Macs\.<\/li>/);
});
