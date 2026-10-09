const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

function pngSize(relativePath) {
  const bytes = fs.readFileSync(path.join(ROOT, relativePath));
  assert.equal(bytes.subarray(1, 4).toString('ascii'), 'PNG');
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

const CAPTURES = ['resting', 'expanded'].map((state) => `site/public/press/blanc-island-${state}-v1.30.1.png`);

test('media-kit raster assets exist at their declared dimensions', () => {
  for (const capture of CAPTURES) {
    // Native 2x captures of a 1280 × 800 Blanc window.
    assert.deepEqual(pngSize(capture), { width: 2560, height: 1600 }, capture);
    for (const display of ['.webp', '-1280.webp']) {
      assert.equal(fs.existsSync(path.join(ROOT, capture.replace(/\.png$/, display))), true, `${capture} ${display} display copy`);
    }
  }
  assert.deepEqual(pngSize('site/public/press/blanc-press-card.png'), { width: 2400, height: 1260 });
  assert.deepEqual(pngSize('site/public/logo.png'), { width: 1024, height: 1024 });
  // The full-color mark is the enhanced Sunrise master, shipped byte for byte.
  assert.deepEqual(pngSize('site/public/press/blanc-sunrise-mark-4096.png'), { width: 4096, height: 4096 });
  // The black mark is rendered from that master, so both share one canvas and crop.
  assert.deepEqual(pngSize('site/public/press/blanc-sunrise-mark-black-4096.png'), { width: 4096, height: 4096 });
  assert.ok(fs.readFileSync(path.join(ROOT, 'site/public/press/blanc-sunrise-mark-4096.png')).equals(
    fs.readFileSync(path.join(ROOT, 'export/app-icons-1024-square/icon-sunrise-4096.png'))));
});

test('the media page keeps its release links, indexability, and no-analytics boundary explicit', () => {
  const page = read('site/src/pages/media.astro');
  const sitemap = read('site/src/pages/sitemap.xml.js');
  const packageVersion = JSON.parse(read('package.json')).version;

  // The page reads its version straight from package.json, so page ≡ released
  // version holds by construction. A hand-typed version reappearing in the
  // release links would be the regression.
  assert.match(page, /import \{ version \} from '\.\.\/\.\.\/\.\.\/package\.json'/);
  assert.match(page, /const VERSION = version;/);
  assert.equal(fs.existsSync(path.join(ROOT, `docs/press/release-notes/v${packageVersion}.md`)), true);
  // Public and indexable, in the sitemap, and analytics-free: journalists are
  // not funnel traffic.
  assert.doesNotMatch(page, /noindex/);
  assert.match(page, /analytics=\{false\}/);
  assert.match(page, /path="\/media"/);
  assert.match(sitemap, /'\/media',/);
  assert.doesNotMatch(sitemap, /'\/press',/);
  // Downloads go through /download, which serves every platform; a direct
  // Apple Silicon DMG link left Intel, Windows, and Linux reviewers out.
  assert.doesNotMatch(page, /arm64\.dmg/);
  assert.match(page, /SHA256SUMS/);

  // Wherever the page prints a version and a date together, the date is that
  // version's own ship date from the generated changelog data. During a
  // release PR there is legitimately no entry for the new tag, so the facts
  // fall back to the newest published entry and print that entry's version —
  // never VERSION beside the previous release's date.
  assert.match(page, /import releaseData from '\.\.\/data\/releases\.json'/);
  assert.match(page, /\?\?\s*ALL_RELEASES\[0\]/);
  assert.match(page, /const RELEASE_VERSION = CURRENT_RELEASE\.tag\.replace/);
  assert.match(page, /<dt>version<\/dt><dd>Blanc \{RELEASE_VERSION\} <span class="media-fact-note">Released <time datetime=\{RELEASED_MACHINE\}>\{RELEASED_HUMAN\}<\/time>/);
  assert.doesNotMatch(page, /<dd>Blanc \{VERSION\}<\/dd>/);
  assert.match(page, /<dt>date<\/dt><dd><time datetime=\{RELEASED_MACHINE\}>\{RELEASED_HUMAN\}<\/time>/);
  assert.doesNotMatch(page, /<dt>(?:released|date)<\/dt><dd>[A-Z][a-z]+ \d/);
  assert.doesNotMatch(page, /Released [A-Z][a-z]+ \d/);

  // The captures are pinned to the release they were taken from, so the copy
  // that names that release must match the files rather than follow VERSION.
  for (const capture of CAPTURES) assert.ok(page.includes(`/press/${path.basename(capture)}`), `${capture} is on the page`);
  assert.match(page, /Native captures of public Blanc 1\.30\.1 with a sample profile/);
  assert.doesNotMatch(page, /Native captures of public Blanc \{/);
  assert.match(page, /Make the island the lead image/);
  assert.match(page, /href="\/press\/blanc-sunrise-mark-4096\.png" download/);
  assert.match(page, /href="\/press\/blanc-sunrise-mark-black-4096\.png" download/);
  // The version-free press card is the social preview; no launch card returns.
  assert.match(page, /ogImage="\/press\/blanc-press-card\.png"/);
  assert.match(page, /ogImageAlt="Blanc media kit: the browser in one small island\."/);
  assert.doesNotMatch(page, /blanc-1\.0-launch-card/);
  // Only native press captures belong here; feature-page compositions do not.
  assert.doesNotMatch(page, /feature-(?:island|command-palette|tab-groups|private-tabs)\.png/);

  // Contact and attribution go to the studio, not a person (owner decision,
  // 2026-07-27, reconfirmed 2026-10-04).
  assert.match(page, /Bananify · Publisher of Blanc Browser/);
  assert.doesNotMatch(page, /Anthony/);
  assert.match(page, /support@blancbrowser\.com/);
});

test('the retired /press route moves permanently to /media while press images keep their URLs', () => {
  const redirects = read('site/public/_redirects');
  assert.match(redirects, /^\/press \/media 301$/m);
  assert.match(redirects, /^\/press\/ \/media 301$/m);
  assert.doesNotMatch(redirects, /^\/press\/\*/m);
  assert.equal(JSON.parse(read('site/src/data/legacy-routes.json'))['/press'], '/media');
  assert.equal(fs.existsSync(path.join(ROOT, 'site/src/pages/press.astro')), false);
  assert.match(read('site/src/components/Footer.astro'), /<a href="\/media">Media<\/a>/);
});

test('the island index lists every section it links to, in page order', () => {
  const page = read('site/src/pages/media.astro');
  const ids = [...page.matchAll(/\{ id: '([a-z-]+)', label: '[^']+', icon: '[a-z]+' \}/g)].map((match) => match[1]);
  assert.deepEqual(ids, ['kit', 'describe', 'facts', 'in-the-news', 'contact']);
  const positions = ids.map((id) => page.indexOf(`id="${id}"`));
  for (const [index, position] of positions.entries()) assert.ok(position > 0, `#${ids[index]} exists`);
  assert.deepEqual([...positions].sort((a, b) => a - b), positions, 'sections follow the index order');
});

test('the black Sunrise mark still matches what its renderer makes from the color master', () => {
  // The two marks must share one canvas and crop; a changed master without a
  // re-render would silently break that.
  execFileSync(process.execPath, [path.join(ROOT, 'site/scripts/render-sunrise-black-mark.mjs'), '--check'], { cwd: ROOT, stdio: 'pipe' });
});

test('description and copy controls work without :has(), and the copy path falls back when the clipboard refuses', () => {
  const css = read('site/src/styles/media.css');
  const script = read('site/src/scripts/media.js');
  // Short is the CSS default; only Long depends on :has().
  assert.match(css, /\.media-describe-card \[data-description="long"\],\n\.media-describe-card:has\(input\[value="long"\]:checked\) \[data-description="short"\] \{ display: none; \}/);
  assert.doesNotMatch(css, /\.media-description \{ display: none/);
  assert.match(script, /await navigator\.clipboard\.writeText\(text\);\n  \} catch \{\n    copyWithSelection\(text\);/);
  assert.match(script, /getPropertyValue\('--media-spring'\)/);
});

test('the press card renderer builds from the native capture and keeps third-party brands out of frame', () => {
  const renderer = read('site/scripts/render-press-card.mjs');
  assert.match(renderer, /public\/press\/blanc-island-expanded-v1\.30\.1\.png/);
  assert.match(renderer, /const CROP = \{ x: (\d+),/);
  // The Met wordmark ends at x ≈ 262 in the 2560-wide capture, and the
  // renderer refuses any other capture size rather than shifting the crop.
  assert.ok(Number(renderer.match(/const CROP = \{ x: (\d+),/)[1]) > 262);
  assert.match(renderer, /CAPTURE_SIZE\.width !== 2560 \|\| CAPTURE_SIZE\.height !== 1600/);
});
