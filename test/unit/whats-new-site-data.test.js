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
const options = async () => ({ publicDir: path.join(ROOT, 'site/public') });

// Real captures, handed out in turn so no two fixture highlights share one.
const CAPTURES = fs.readdirSync(path.join(ROOT, 'site/public/feature-captures')).filter((f) => f.endsWith('.webp')).sort();
let nextCapture = 0;
const capture = () => ({ kind: 'image', src: `/feature-captures/${CAPTURES[nextCapture++ % CAPTURES.length]}`, width: 1440, height: 900, alt: 'Alt.' });
const highlight = (id, extra = {}) => ({
  id,
  tile: `Tile ${id}`,
  title: `Title ${id}`,
  body: 'Body.',
  media: capture(),
  ...extra,
});
const page = (release, count = 3, extra = {}) => ({
  release,
  highlights: Array.from({ length: count }, (_, i) => highlight(`h${i}`, extra)),
});
const fixture = (pages, more = {}) => ({ firstRelease: '1.38', noPage: [], pages, ...more });
const RELEASES = [{ version: '1.38.0', humanDate: 'October 18, 2026', anchor: 'v1-38-0' }];

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
  const errors = validateWhatsNew(fixture([named('1.38', 3), named('1.39', 3)]), RELEASES, await options());
  assert.equal(errors.length, 1);
  assert.match(errors[0], /1\.39/);
});

test('a page holds two to five highlights of its own', async () => {
  const { validateWhatsNew } = await lib();
  assert.equal(validateWhatsNew(fixture([page('1.38', 1)]), RELEASES, await options()).length, 1);
  assert.equal(validateWhatsNew(fixture([page('1.38', 6)]), RELEASES, await options()).length, 1);
  assert.deepEqual(validateWhatsNew(fixture([page('1.38', 2)]), RELEASES, await options()), []);
  assert.deepEqual(validateWhatsNew(fixture([page('1.38', 5)]), RELEASES, await options()), []);
});

test('each highlight is checked', async () => {
  const { validateWhatsNew } = await lib();
  const opts = await options();
  const bad = (extra) => validateWhatsNew(fixture([page('1.38', 3, extra)]), RELEASES, opts).length > 0;
  assert.ok(bad({ color: 'rose' }), 'website pages use the site palette, not Spaces colors');
  assert.ok(bad({ media: { kind: 'gif', src: '/x.gif' } }), 'unknown media kind');
  assert.ok(bad({ media: { kind: 'demo', demo: 'mahjong' } }), 'unknown demo');
  assert.ok(bad({ media: { kind: 'image', src: '/feature-captures/start-page-color-v1.38.0.webp', width: 1440, height: 900 } }), 'image without alt');
  assert.ok(bad({ media: { kind: 'image', src: '/feature-captures/start-page-color-v1.38.0.webp', alt: 'Alt.' } }), 'image without size');
  assert.ok(bad({ learnMore: 'https://example.com/x' }), 'learnMore off the site');
  assert.ok(!bad({ learnMore: '/features/start-page' }));
  assert.ok(!bad({ learnMore: 'https://blanc.day/features/start-page' }));
  const oneDemo = fixture([{ release: '1.38', highlights: [highlight('a', { media: { kind: 'demo', demo: 'spaces' } }), highlight('b'), highlight('c')] }]);
  assert.deepEqual(validateWhatsNew(oneDemo, RELEASES, opts), [], 'a demo is fine');
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

// Recent releases: each page leads with its own highlights, then adds the
// highlights of the two previous feature releases that have pages, newest
// first, up to eight in all.
const named = (release, count) => ({
  release,
  highlights: Array.from({ length: count }, (_, i) => highlight(`r${release.replace('.', '-')}-h${i}`)),
});
const LADDER = ['1.39', '1.38', '1.37', '1.36'].map((r, i) => ({ version: `${r}.0`, humanDate: `October ${19 - i}, 2026`, anchor: `v${r.replace('.', '-')}-0` }));

test('a page adds the two previous releases\' highlights after its own, up to eight', async () => {
  const { publishedPages } = await lib();
  const ladder = fixture([named('1.39', 3), named('1.38', 3), named('1.37', 3), named('1.36', 3)], { firstRelease: '1.36' });
  const pages = publishedPages(ladder, LADDER);
  const newest = pages.find((p) => p.release === '1.39');
  assert.deepEqual(newest.entries.map((e) => `${e.release}:${e.current}`), [
    '1.39:true', '1.39:true', '1.39:true', '1.38:false', '1.38:false', '1.38:false', '1.37:false', '1.37:false',
  ]);
  assert.equal(newest.entries[3].humanDate, 'October 18, 2026');
  assert.deepEqual(newest.highlights.map((h) => h.id), ladder.pages[0].highlights.map((h) => h.id), 'its own highlights stay separate');
  const oldest = pages.find((p) => p.release === '1.36');
  assert.deepEqual(oldest.entries.map((e) => e.release), ['1.36', '1.36', '1.36'], 'nothing older to add');
});

test('a full release keeps all its own highlights and older ones fill what is left', async () => {
  const { publishedPages } = await lib();
  const ladder = fixture([named('1.39', 5), named('1.38', 5)], { firstRelease: '1.38' });
  const newest = publishedPages(ladder, LADDER).find((p) => p.release === '1.39');
  assert.deepEqual(newest.entries.map((e) => e.release), ['1.39', '1.39', '1.39', '1.39', '1.39', '1.38', '1.38', '1.38']);
});

test('a release skipped on purpose adds nothing; the next page with highlights does', async () => {
  const { publishedPages } = await lib();
  const ladder = fixture([named('1.39', 3), named('1.37', 3), named('1.36', 3)], { firstRelease: '1.36', noPage: ['1.38'] });
  const newest = publishedPages(ladder, LADDER).find((p) => p.release === '1.39');
  assert.deepEqual([...new Set(newest.entries.map((e) => e.release))], ['1.39', '1.37', '1.36']);
});

test('highlight ids are unique across every page, so a link to one never clashes', async () => {
  const { validateWhatsNew } = await lib();
  const clash = fixture([page('1.39'), page('1.38')], { firstRelease: '1.38' });
  const errors = validateWhatsNew(clash, LADDER, await options());
  assert.ok(errors.some((e) => /duplicate id/.test(e)), errors.join('\n'));
});

test('a page never shows the same image or demo twice', async () => {
  const { validateWhatsNew } = await lib();
  const same = { kind: 'image', src: '/feature-captures/start-page-color-v1.38.0.webp', width: 1440, height: 900, alt: 'Alt.' };
  const repeated = fixture([{ release: '1.38', highlights: [highlight('a', { media: same }), highlight('b', { media: same }), highlight('c', { media: { kind: 'demo', demo: 'spaces' } })] }]);
  assert.ok(validateWhatsNew(repeated, RELEASES, await options()).some((e) => /repeats/.test(e)));
});

test('the 1.38 page shows six different features from three releases, each with its own visual', async () => {
  const { publishedPages } = await lib();
  const newest = publishedPages(data, releases).find((p) => p.release === '1.38');
  assert.deepEqual(newest.entries.map((e) => `${e.release} ${e.highlight.id}`), [
    '1.38 your-image', '1.38 start-page-color',
    '1.37 group-colors', '1.37 island-hover',
    '1.36 bangs', '1.36 recently-closed',
  ]);
  const visuals = newest.entries.map((e) => e.highlight.media.src ?? e.highlight.media.demo);
  assert.equal(new Set(visuals).size, visuals.length, 'no visual twice');
  assert.equal(newest.entries[1].highlight.media.src, '/feature-captures/start-page-color-rose-solid-v1.38.0.webp');
});
