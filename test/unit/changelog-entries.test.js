const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, '../..');
let lib;
test.before(async () => { lib = await import(pathToFileURL(path.join(ROOT, 'site/src/lib/changelog-entries.mjs'))); });

const desktop = (version, publishedAt) => ({ tag: `v${version}`, version, publishedAt, anchor: `v${version.replaceAll('.', '-')}`, sections: [] });
const beta = (version, platform, publishedAt) => ({ tag: `chromium-beta-${version}`, product: 'beta', platform, version, publishedAt, sections: [] });
const ios = (version, publishedAt, devices = ['iphone']) => ({ tag: `ios-${version}`, product: 'ios', version, devices, publishedAt, sections: [] });

test('merge orders by date with a fixed tie order', () => {
  const same = '2026-11-21T12:00:00.000Z';
  const merged = lib.mergeEntries({
    desktop: [desktop('1.52.0', same), desktop('1.51.0', '2026-11-18T00:00:00.000Z')],
    beta: [beta('158.0.8127.904', 'windows', same), beta('2.0.0-beta.9', 'mac', same), beta('158.0.8127.906', 'linux', '2026-11-23T03:45:35.000Z')],
    ios: [ios('1.1', same)],
  });
  assert.deepEqual(merged.map((entry) => entry.tag), [
    'chromium-beta-158.0.8127.906', 'v1.52.0', 'ios-1.1', 'chromium-beta-2.0.0-beta.9', 'chromium-beta-158.0.8127.904', 'v1.51.0',
  ]);
  assert.equal(merged[1].product, 'desktop');
});

test('merge never mutates its inputs', () => {
  const input = { desktop: [desktop('1.52.0', '2026-11-21T00:00:00.000Z')], beta: [], ios: [] };
  const before = JSON.stringify(input);
  lib.mergeEntries(input);
  assert.equal(JSON.stringify(input), before);
});

test('stable shows desktop and iPhone, never betas', () => {
  assert.ok(lib.matchesFilter({ product: 'desktop' }, 'stable'));
  assert.ok(lib.matchesFilter({ product: 'ios' }, 'stable'));
  assert.ok(!lib.matchesFilter({ product: 'beta' }, 'stable'));
  assert.ok(lib.matchesFilter({ product: 'desktop' }, 'desktop'));
  assert.ok(!lib.matchesFilter({ product: 'ios' }, 'desktop'));
  assert.ok(lib.matchesFilter({ product: 'ios' }, 'iphone'));
  assert.ok(lib.matchesFilter({ product: 'beta' }, 'beta'));
  assert.ok(!lib.matchesFilter({ product: 'desktop' }, 'beta'));
});

test('all shows everything', () => {
  for (const product of ['desktop', 'ios', 'beta']) assert.ok(lib.matchesFilter({ product }, 'all'));
});

test('an unknown filter is stable', () => {
  assert.deepEqual(lib.PRODUCT_FILTERS, ['stable', 'desktop', 'iphone', 'beta', 'all']);
  assert.equal(lib.normalizeFilter('bogus'), 'stable');
  assert.equal(lib.normalizeFilter(undefined), 'stable');
  assert.equal(lib.normalizeFilter('BETA'), 'beta');
  assert.ok(!lib.matchesFilter({ product: 'beta' }, 'bogus'));
});

test('titles and labels', () => {
  const d = { ...desktop('1.52.0', ''), product: 'desktop' };
  assert.equal(lib.productLabel(d), 'Blanc for desktop');
  assert.equal(lib.entryTitle(d), 'Blanc 1.52.0');
  assert.equal(lib.productLabel(beta('2.0.0-beta.9', 'mac', '')), 'Blanc Beta for Mac');
  assert.equal(lib.entryTitle(beta('2.0.0-beta.9', 'mac', '')), 'Blanc Beta 2.0.0-beta.9');
  assert.equal(lib.productLabel(beta('158.0.8127.904', 'windows', '')), 'Blanc Beta for Windows');
  assert.equal(lib.entryTitle(beta('158.0.8127.904', 'windows', '')), 'Blanc Beta for Windows 158.0.8127.904');
  assert.equal(lib.productLabel(beta('158.0.8127.906', 'linux', '')), 'Blanc Beta for Linux');
  assert.equal(lib.entryTitle(beta('158.0.8127.906', 'linux', '')), 'Blanc Beta for Linux 158.0.8127.906');
  assert.equal(lib.productLabel(ios('1.0.3', '', ['iphone', 'ipad'])), 'Blanc for iPhone and iPad');
  assert.equal(lib.productLabel(ios('1.0.2', '')), 'Blanc for iPhone');
  assert.equal(lib.entryTitle(ios('1.1', '', ['iphone', 'ipad'])), 'Blanc for iPhone 1.1');
});

test('allEntries reads every product from the site data', () => {
  const entries = lib.allEntries();
  const counts = Object.fromEntries(['desktop', 'beta', 'ios'].map((product) => [product, entries.filter((entry) => entry.product === product).length]));
  const read = (name) => JSON.parse(fs.readFileSync(path.join(ROOT, 'site/src/data', name), 'utf8')).length;
  assert.deepEqual(counts, { desktop: read('releases.json'), beta: read('beta-releases.json'), ios: read('ios-releases.json') });
  assert.equal(new Set(entries.map((entry) => entry.anchor)).size, entries.length);
});

test("only the changelog reads the other products' files", () => {
  const found = [];
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, name.name);
      if (name.isDirectory()) walk(file);
      else if (/\.(astro|js|mjs|ts)$/.test(name.name) && /(beta|ios)-releases\.json/.test(fs.readFileSync(file, 'utf8'))) found.push(path.relative(ROOT, file).split(path.sep).join('/'));
    }
  };
  walk(path.join(ROOT, 'site/src'));
  assert.deepEqual(found, ['site/src/lib/changelog-entries.mjs']);
});

test('desktop RSS is byte-identical', async () => {
  const { renderRss } = await import(pathToFileURL(path.join(ROOT, 'site/src/lib/rss.mjs')));
  const changelog = await import(pathToFileURL(path.join(ROOT, 'scripts/generate-site-changelog.mjs')));
  const fixture = JSON.parse(fs.readFileSync(path.join(ROOT, 'test/fixtures/site-releases.json'), 'utf8'));
  const digest = require('node:crypto').createHash('sha256').update(renderRss(changelog.normalizeReleases(fixture))).digest('hex');
  assert.equal(digest, '1657fd3283df88b644c086654cea50bf20c7ddefccd4f4d01b05899ff88a140d');
});

test('iPhone feed items have unique GUIDs and product titles', async () => {
  const { renderRss } = await import(pathToFileURL(path.join(ROOT, 'site/src/lib/rss.mjs')));
  const entries = lib.allEntries().filter((entry) => lib.matchesFilter(entry, 'iphone'));
  const xml = renderRss(entries, { title: 'Blanc for iPhone and iPad Changelog', itemTitle: lib.entryTitle, itemLink: lib.entryLink });
  const guids = [...xml.matchAll(/<guid[^>]*>([^<]+)<\/guid>/g)].map((match) => match[1]);
  assert.equal(guids.length, entries.length);
  assert.equal(new Set(guids).size, guids.length);
  assert.ok(guids.every((guid) => guid.startsWith('https://blanc.day/changelog#ios-')));
  assert.match(xml, /<title>Blanc for iPhone 1\.1<\/title>/);
  assert.match(xml, /<title>Blanc for iPhone and iPad Changelog<\/title>/);
});
