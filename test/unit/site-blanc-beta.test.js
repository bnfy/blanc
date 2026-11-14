'use strict';
// Blanc Beta on /download (owner, 2026-11-14): the page section, its data, the
// Sparkle feed and the /dl/beta redirect describe the same published release,
// and every sentence in the section is recorded in the release's claims ledger.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const beta = JSON.parse(read('site/src/data/blanc-beta.json'));
const ledger = JSON.parse(read(`docs/website-blanc-beta-${beta.version}-claims.json`));
const feed = read(`site/public${beta.feed}`);
const page = read('site/src/pages/download.astro');

const section = () => {
  const start = page.indexOf('<article class="dl-tile dl-tile--beta" id="beta"');
  assert.ok(start > 0, 'the Download page has the Blanc Beta tile');
  return page.slice(start, page.indexOf('</article>', start));
};
const plain = (text) => text
  .replace(/<!--[\s\S]*?-->/g, ' ')
  .replace(/\{beta\.requirement\}/g, beta.requirement).replace(/\{beta\.version\}/g, beta.version)
  .replace(/<[^>]+>/g, ' ').replace(/[’‘]/g, "'").replace(/↗/g, ' ').replace(/\s+/g, ' ').trim();

test('the data, ledger and feed name the same published beta', () => {
  assert.equal(ledger.release, beta.version);
  assert.equal(ledger.tag, beta.tag);
  assert.equal(beta.tag, `chromium-beta-${beta.version}`);
  assert.equal(beta.releaseUrl, `https://github.com/bnfy/blanc/releases/tag/${beta.tag}`);
  assert.equal(beta.dmg.url, `https://github.com/bnfy/blanc/releases/download/${beta.tag}/${beta.dmg.name}`);
  assert.match(beta.dmg.sha256, /^[a-f0-9]{64}$/);
  assert.ok(feed.includes(`<sparkle:shortVersionString>${beta.version}</sparkle:shortVersionString>`));
  assert.ok(feed.includes(`<sparkle:version>${beta.build}</sparkle:version>`));
  assert.ok(feed.includes(`<enclosure url="${beta.dmg.url}" length="${beta.dmg.bytes}"`), 'the feed points at the published DMG');
  assert.ok(feed.includes('<link>https://blanc.day/updates/chromium-beta/arm64.xml</link>'));
  assert.equal((feed.match(/<item>/g) || []).length, 1, 'one canonical item');
});

test('/dl/beta answers with the same DMG and is counted', async () => {
  const dl = await import('../../cloudflare/ping-worker/src/dl.js');
  assert.equal(dl.BETA_DOWNLOAD, beta.dmg.url);
  assert.equal(dl.fixedDownload('beta'), beta.dmg.url);
  assert.ok(dl.DL_TARGETS.has('beta'));
  for (const target of ['mac-arm64', 'mac-x64', 'win', 'linux', '__proto__']) assert.equal(dl.fixedDownload(target), null, target);
});

test('the feed is served as RSS and revalidated quickly', () => {
  const headers = read('site/public/_headers');
  const block = headers.slice(headers.indexOf('/updates/chromium-beta/*'));
  assert.match(block, /^\/updates\/chromium-beta\/\*\n {2}Content-Type: application\/rss\+xml; charset=utf-8\n {2}Cache-Control: public, max-age=300, must-revalidate/);
});

test('every sentence in the section is in the claims ledger, and nothing else is', () => {
  const text = plain(section());
  let rest = text;
  for (const claim of ledger.claims) {
    assert.ok(claim.kind === 'label' || (typeof claim.evidence === 'string' && claim.evidence.length > 20), `evidence for: ${claim.text}`);
    assert.ok(rest.includes(claim.text), `the page says: ${claim.text}`);
    rest = rest.replace(claim.text, ' ');
  }
  assert.equal(rest.replace(/\s+/g, ''), '', `unrecorded text on the page: ${rest.trim()}`);
  assert.match(section(), /href="\/dl\/beta"/);
});

test('the beta is never one of the platform choices, and leads the tiles', () => {
  const chooser = page.slice(page.indexOf('data-download-chooser'), page.indexOf('class="dl-version"'));
  assert.doesNotMatch(chooser, /Blanc Beta/);
  assert.doesNotMatch(chooser, /dl\/beta/);
  const tiles = page.slice(page.indexOf('id="download-more"'));
  assert.ok(tiles.indexOf('id="beta"') < tiles.indexOf('id="iphone"'), 'Blanc Beta is the first tile');
});
