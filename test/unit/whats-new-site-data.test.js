'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// The website's What's New pages (docs/superpowers/specs/2026-10-19-whats-new-page-design.md):
// one page per feature release, three to five highlights, only for released
// versions, and every feature release from firstRelease on either has a page
// or is listed in noPage on purpose.

const ROOT = path.join(__dirname, '../..');
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const lib = () => import('../../site/src/lib/whats-new.mjs');
const releases = readJson('site/src/data/releases.json');
const data = readJson('site/src/data/whats-new.json');
const identitySource = fs.readFileSync(path.join(ROOT, 'src/renderer/space-identity.js'), 'utf8');
const options = async () => ({ tileColors: (await lib()).tileColorsFrom(identitySource), publicDir: path.join(ROOT, 'site/public') });

const highlight = (id, extra = {}) => ({
  id,
  tile: `Tile ${id}`,
  title: `Title ${id}`,
  body: 'Body.',
  color: 'rose',
  media: { kind: 'image', src: '/feature-captures/start-page-color-v1.38.0.webp', width: 1440, height: 900, alt: 'Alt.' },
  ...extra,
});
const page = (release, count = 3, extra = {}) => ({
  release,
  highlights: Array.from({ length: count }, (_, i) => highlight(`h${i}`, extra)),
});
const fixture = (pages, more = {}) => ({ firstRelease: '1.38', noPage: [], pages, ...more });
const RELEASES = [{ version: '1.38.0', humanDate: 'October 18, 2026', anchor: 'v1-38-0' }];

test('the tile colors are the eight Spaces presets', async () => {
  const { tileColorsFrom } = await lib();
  assert.deepEqual(Object.keys(tileColorsFrom(identitySource)), ['sage', 'sky', 'iris', 'rose', 'clay', 'sand', 'slate', 'graphite']);
});

test('featureRelease keeps major.minor of a release version only', async () => {
  const { featureRelease } = await lib();
  assert.equal(featureRelease('1.38.0'), '1.38');
  assert.equal(featureRelease('2.0.3'), '2.0');
  assert.equal(featureRelease('1.38.0-beta.1'), null);
  assert.equal(featureRelease(''), null);
});

test('the committed What\'s New data is valid against the committed releases', async () => {
  const { validateWhatsNew } = await lib();
  assert.deepEqual(validateWhatsNew(data, releases, await options()), []);
});

test('a page must belong to a published release', async () => {
  const { validateWhatsNew } = await lib();
  const errors = validateWhatsNew(fixture([page('1.38'), page('1.39')]), RELEASES, await options());
  assert.equal(errors.length, 1);
  assert.match(errors[0], /1\.39/);
});

test('a page holds three to five highlights', async () => {
  const { validateWhatsNew } = await lib();
  assert.equal(validateWhatsNew(fixture([page('1.38', 2)]), RELEASES, await options()).length, 1);
  assert.equal(validateWhatsNew(fixture([page('1.38', 6)]), RELEASES, await options()).length, 1);
  assert.deepEqual(validateWhatsNew(fixture([page('1.38', 5)]), RELEASES, await options()), []);
});

test('each highlight is checked', async () => {
  const { validateWhatsNew } = await lib();
  const opts = await options();
  const bad = (extra) => validateWhatsNew(fixture([page('1.38', 3, extra)]), RELEASES, opts).length > 0;
  assert.ok(bad({ color: 'teal' }), 'color outside the eight Spaces presets');
  assert.ok(bad({ media: { kind: 'gif', src: '/x.gif' } }), 'unknown media kind');
  assert.ok(bad({ media: { kind: 'demo', demo: 'mahjong' } }), 'unknown demo');
  assert.ok(bad({ media: { kind: 'image', src: '/feature-captures/start-page-color-v1.38.0.webp', width: 1440, height: 900 } }), 'image without alt');
  assert.ok(bad({ media: { kind: 'image', src: '/feature-captures/start-page-color-v1.38.0.webp', alt: 'Alt.' } }), 'image without size');
  assert.ok(bad({ learnMore: 'https://example.com/x' }), 'learnMore off the site');
  assert.ok(!bad({ learnMore: '/features/start-page' }));
  assert.ok(!bad({ learnMore: 'https://blanc.day/features/start-page' }));
  assert.ok(!bad({ media: { kind: 'demo', demo: 'spaces' } }));
  const duplicate = fixture([{ release: '1.38', highlights: [highlight('a'), highlight('a'), highlight('b')] }]);
  assert.equal(validateWhatsNew(duplicate, RELEASES, await options()).length, 1, 'duplicate ids');
});

test('every feature release from firstRelease on has a page or is skipped on purpose', async () => {
  const { validateWhatsNew } = await lib();
  const twoReleases = [{ version: '1.39.0' }, { version: '1.38.1' }, ...RELEASES, { version: '1.37.0' }];
  const errors = validateWhatsNew(fixture([page('1.38')]), twoReleases, await options());
  assert.equal(errors.length, 1);
  assert.match(errors[0], /1\.39/);
  assert.deepEqual(validateWhatsNew(fixture([page('1.38')], { noPage: ['1.39'] }), twoReleases, await options()), []);
  assert.equal(validateWhatsNew(fixture([page('1.38')], { noPage: ['1.38', '1.39'] }), twoReleases, await options()).length, 1, 'both paged and skipped');
});

test('the build can skip the every-release check, which waits on the owner', async () => {
  const { validateWhatsNew } = await lib();
  const twoReleases = [{ version: '1.39.0' }, ...RELEASES];
  assert.deepEqual(validateWhatsNew(fixture([page('1.38')]), twoReleases, { ...(await options()), requireEveryRelease: false }), []);
  const route = fs.readFileSync(path.join(ROOT, 'site/src/pages/whats-new/[release].astro'), 'utf8');
  assert.match(route, /requireEveryRelease: false/, 'a release without a signed-off page never blocks the site build');
});

test('every local media file exists', async () => {
  const { validateWhatsNew } = await lib();
  const missing = validateWhatsNew(fixture([page('1.38', 3, { media: { kind: 'video', src: '/nope.mp4', poster: '/nope.webp', alt: 'Alt.' } })]), RELEASES, await options());
  assert.ok(missing.some((e) => /nope\.mp4/.test(e)));
  assert.ok(missing.some((e) => /nope\.webp/.test(e)));
});

test('published pages come newest first with their release date and changelog anchor', async () => {
  const { publishedPages } = await lib();
  const pages = publishedPages(data, releases);
  assert.ok(pages.length >= 1);
  const first = pages.find((p) => p.release === '1.38');
  assert.equal(first.version, '1.38.0');
  assert.equal(first.humanDate, 'October 18, 2026');
  assert.equal(first.anchor, 'v1-38-0');
});
