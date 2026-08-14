const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');

function pngSize(relativePath) {
  const bytes = fs.readFileSync(path.join(ROOT, relativePath));
  assert.equal(bytes.subarray(1, 4).toString('ascii'), 'PNG');
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

test('press-kit raster assets exist at their declared editorial dimensions', () => {
  assert.deepEqual(
    pngSize('site/public/press/vertical-tabs.png'),
    { width: 1400, height: 875 }
  );
  assert.deepEqual(
    pngSize('site/public/press/blanc-1.0-social.png'),
    { width: 1200, height: 630 }
  );
  assert.deepEqual(
    pngSize('site/public/press/blanc-island-product-capture-v2.png'),
    { width: 2784, height: 1824 }
  );
  assert.deepEqual(
    pngSize('site/public/press/blanc-1.0-launch-card-v3.png'),
    { width: 2400, height: 1260 }
  );
  assert.deepEqual(
    pngSize('site/public/logo.png'),
    { width: 1024, height: 1024 }
  );
  assert.deepEqual(
    pngSize('site/public/shots/desktop/cnet.png'),
    { width: 2597, height: 1494 }
  );
});

test('the public press page keeps its release links, indexability, and no-analytics boundary explicit', () => {
  const page = fs.readFileSync(path.join(ROOT, 'site/src/pages/press.astro'), 'utf8');
  const islandDemo = fs.readFileSync(path.join(ROOT, 'site/src/components/PressIslandDemo.astro'), 'utf8');
  const islandScript = fs.readFileSync(path.join(ROOT, 'site/src/scripts/press-island.js'), 'utf8');
  const siteStyles = fs.readFileSync(path.join(ROOT, 'site/src/styles/site.css'), 'utf8');
  const sitemap = fs.readFileSync(path.join(ROOT, 'site/src/pages/sitemap.xml.js'), 'utf8');
  const packageVersion = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')
  ).version;

  assert.equal(packageVersion, '1.2.4');
  assert.match(page, new RegExp(`const VERSION = '${packageVersion.replaceAll('.', '\\.')}'`));
  assert.equal(
    fs.existsSync(path.join(ROOT, `docs/press/release-notes/v${packageVersion}.md`)),
    true
  );
  // /press went public for the 1.0 launch: indexable, in the sitemap, and
  // still analytics-free (journalists are not funnel traffic).
  assert.doesNotMatch(page, /noindex/);
  assert.match(page, /analytics=\{false\}/);
  assert.match(page, /Blanc-\$\{VERSION\}-arm64\.dmg/);
  assert.match(page, /SHA256SUMS/);
  assert.match(page, /press\/blanc-island-product-capture-v2\.png/);
  assert.match(page, /Make the Island the lead image/);
  assert.match(page, /Download high-resolution product imagery, launch artwork, and the Blanc mark/);
  assert.match(page, /Each visual shows the real interface without turning another website’s brand into the story/);
  assert.doesNotMatch(page, /The Island, ready for publication/);
  assert.doesNotMatch(page, /Show the product, not another logo wall/);
  assert.doesNotMatch(page, /press\/blanc-island-product-capture\.png/);
  assert.doesNotMatch(page, /GitHub page/);
  // Wherever the page prints a version and a date together, the date is that
  // version's own ship date, derived from the generated changelog data. It was
  // hardcoded, so once the version pin moved to 1.1.0 the fact sheet read
  // "Blanc 1.1.0 · released August 2, 2026" — August 2 being 1.0's launch day.
  // The announcement's own dateline is deliberately still a literal: it dates
  // the 1.0 announcement, not whatever version ships next.
  // That fact group tracks the shipping version, so it must not call itself the
  // launch — the launch build stopped being current at 1.0.1.
  assert.match(page, /<h3 id="press-facts-release">current release<\/h3>/);
  assert.doesNotMatch(page, /press-facts-launch/);
  assert.match(page, /import releaseData from '\.\.\/data\/releases\.json'/);
  // The shipping-release facts must survive a version bump whose release has
  // not been published yet. releases.json is generated FROM the published
  // GitHub release, so during a release PR there is legitimately no entry for
  // the new tag — a hard failure here made the site build gate unpassable and
  // therefore made releasing impossible (caught cutting 1.1.1). The fallback
  // and the version it prints are asserted together: taking the date from the
  // newest published entry while still printing VERSION would pair the new
  // version with the previous one's ship date.
  assert.match(page, /\?\?\s*ALL_RELEASES\[0\]/);
  assert.match(page, /const RELEASE_VERSION = CURRENT_RELEASE\.tag\.replace/);
  assert.match(page, /<dt>version<\/dt><dd>Blanc \{RELEASE_VERSION\}<\/dd>/);
  assert.doesNotMatch(page, /<dt>version<\/dt><dd>Blanc \{VERSION\}<\/dd>/);
  assert.match(page, /<dt>released<\/dt><dd><time datetime=\{RELEASED_MACHINE\}>\{RELEASED_HUMAN\}<\/time>/);
  assert.match(page, /<dt>date<\/dt><dd><time datetime=\{RELEASED_MACHINE\}>\{RELEASED_HUMAN\}<\/time>/);
  assert.doesNotMatch(page, /<dt>(?:released|date)<\/dt><dd>[A-Z][a-z]+ \d/);
  assert.match(page, /press\/blanc-1\.0-launch-card-v3\.png/);
  assert.doesNotMatch(page, /press\/blanc-1\.0-launch-card-v2\.png/);
  assert.match(page, /<PressIslandDemo \/>/);
  assert.doesNotMatch(page, /press-product-callouts/);
  assert.doesNotMatch(page, /press\/vertical-tabs\.png/);
  // Version-free on purpose: the demo recreates whatever the Island is today.
  assert.match(islandDemo, /Interactive recreation of the Blanc Island/);
  assert.doesNotMatch(islandDemo, /Blanc 1\.0 Island/);
  assert.match(islandDemo, /id="pressIslandInput"/);
  assert.match(islandDemo, /name: 'tech news'/);
  assert.match(islandDemo, /title: 'The Verge', domain: 'theverge\.com'/);
  assert.match(islandDemo, /title: '9to5Mac', domain: '9to5mac\.com'/);
  assert.match(islandDemo, /title: 'CNET', domain: 'cnet\.com'/);
  assert.match(islandDemo, /id="pressIslandPage"/);
  assert.match(islandDemo, /press-island-connector--island/);
  assert.match(islandDemo, /press-island-connector--session/);
  assert.match(islandDemo, /press-island-connector--groups/);
  assert.match(islandDemo, /press-island-connector--expanded/);
  assert.match(islandDemo, /<aside class="press-island-callouts press-island-callouts--left"[\s\S]*?<p>Named groups<\/p>/);
  assert.match(islandDemo, /<aside class="press-island-callouts press-island-callouts--right"[\s\S]*?<p>Open context<\/p>/);
  assert.match(islandDemo, /<p>Open context<\/p>/);
  assert.match(islandDemo, /page: '\/shots\/desktop\/9to5mac\.jpg'/);
  assert.match(islandDemo, /page: '\/shots\/desktop\/cnet\.png'/);
  assert.match(islandDemo, /class:list=\{\['row-pin'/);
  assert.match(islandDemo, /class="row-grp"/);
  assert.match(islandDemo, /class="row-close"/);
  assert.doesNotMatch(islandDemo, /class="tag">active/);
  assert.doesNotMatch(islandDemo, /pressIslandPageFallback|press-island-cnet-card/);
  assert.doesNotMatch(islandDemo, /<span>launch<\/span>/);
  assert.equal(fs.existsSync(path.join(ROOT, 'site/public/shots/desktop/theverge.jpg')), true);
  for (const capture of ['9to5mac.jpg', 'gmail.jpg', 'mdn.jpg', 'hacker-news.jpg', 'cnet.png']) {
    assert.equal(fs.existsSync(path.join(ROOT, `site/public/shots/desktop/${capture}`)), true);
  }
  for (const domain of ['theverge.com', '9to5mac.com', 'cnet.com']) {
    assert.equal(fs.existsSync(path.join(ROOT, `site/public/favicons/${domain}.ico`)), true);
  }
  // CNET serves a 1-bit ICO that collapses into a solid square at the Island's
  // rendered size. Keep the cached 48px PNG payload even though the public URL
  // retains the shared `.ico` naming convention used by the demo script.
  assert.equal(
    fs.readFileSync(path.join(ROOT, 'site/public/favicons/cnet.com.ico')).subarray(1, 4).toString('ascii'),
    'PNG'
  );
  assert.match(islandScript, /renderCommands/);
  assert.match(islandScript, /switchPage/);
  assert.match(islandScript, /syncActiveRow/);
  assert.match(islandScript, /preloadPages/);
  assert.match(islandScript, /querySelector\('\.row-pin'\)/);
  assert.match(islandScript, /querySelector\('\.row-grp'\)/);
  assert.match(islandScript, /querySelector\('\.row-close'\)/);
  const islandPageRule = siteStyles.match(/\.press-island-page \{([^}]*)\}/)?.[1] || '';
  assert.doesNotMatch(islandPageRule, /opacity|filter/);
  assert.match(siteStyles, /data-site="cnet\.com"[^}]*object-position: 24% top/);
  assert.match(siteStyles, /press-island-connector--island/);
  assert.match(siteStyles, /press-island-connector--groups \{ top: 168px; left: 0/);
  assert.match(siteStyles, /press-island-connector--session \{ top: 194px; right: 0/);
  assert.match(siteStyles, /press-island-callouts--left div:first-child \{ top: 20px/);
  assert.match(siteStyles, /press-island-callouts--left div:last-child \{ top: 160px/);
  assert.match(siteStyles, /press-island-callouts--right div:first-child \{ top: 186px/);
  assert.match(siteStyles, /press-island-callouts--right div:last-child \{ top: 430px/);
  const pressCaptureRenderer = fs.readFileSync(
    path.join(ROOT, 'site/scripts/render-press-primary-capture.mjs'),
    'utf8'
  );
  assert.match(pressCaptureRenderer, /\['Quiet Spaces', 'spaces\.example'\]/);
  assert.match(pressCaptureRenderer, /firstElementChild\.textContent = 'inspiration'/);
  assert.match(pressCaptureRenderer, /\.press-island-strip \{\s*display: none/);
  assert.match(pressCaptureRenderer, /\.press-island-page \{\s*top: 0/);
  assert.match(pressCaptureRenderer, /\.frame img \{[^}]*transform: scale\(1\.16\)/);
  assert.match(islandScript, /prefers-reduced-motion/);
  assert.match(islandScript, /IntersectionObserver/);
  assert.match(islandScript, /press-reveal/);
  assert.match(siteStyles, /@keyframes press-hero-enter/);
  assert.match(siteStyles, /\.press-motion-ready \.press-reveal\.is-visible/);
  assert.match(siteStyles, /\.press-compare-table tbody tr:hover/);
  assert.match(page, /<td data-label="Traditional browser">/);
  // Every version stated beside current-product content tracks VERSION. Only
  // the announcement below stays pinned to 1.0 — it is a dated document, not a
  // claim about the shipping build.
  assert.match(page, /<td data-label=\{`Blanc \$\{VERSION\}`\}>/);
  assert.match(page, /<th scope="col">Blanc \{VERSION\}<\/th>/);
  assert.match(page, /<p class="section-kicker">Blanc \{VERSION\} · independent browser<\/p>/);
  assert.match(page, /ogImageAlt=\{`Blanc \$\{VERSION\} press kit/);
  assert.doesNotMatch(page, /Blanc 1\.0 · independent browser/);
  assert.match(siteStyles, /\.press-compare-table tbody td::before/);
  assert.match(siteStyles, /\.press-primary-asset > a:hover img/);
  assert.match(page, /macOS · Windows · Linux/);
  assert.match(page, /macOS: DMG \+ ZIP · Windows: EXE · Linux: AppImage/);
  assert.match(page, /<h1 id="press-title">Blanc replaces browser clutter with one small Island\.<\/h1>/);
  assert.doesNotMatch(page, /Blanc 1\.0 replaces the browser toolbar/);
  assert.match(page, /Anthony J\. Loria/);
  assert.doesNotMatch(page, /Anthony Loria/);
  assert.match(page, /Bananify today released Blanc 1\.0, a free independent browser for macOS, Windows, and Linux/);
  assert.match(page, /The web should feel bigger than the browser around it/);
  assert.match(page, /Bananify founder Anthony J\. Loria created Blanc after watching the browser itself become increasingly difficult to ignore/);
  assert.match(page, /The result is a throwback in spirit, not capability/);
  assert.match(page, /No more crowded tab-row anxiety/);
  assert.match(page, /no AI bot, no parade of extras, and no requirement to hand over an identity just to browse/);
  assert.match(page, /Private tabs stay out of history and are not restored later/);
  assert.match(page, /Excluded from history, recently closed tabs, and the next launch/);
  assert.match(page, /Slash commands are shortcuts, not a requirement/);
  assert.match(page, /Everything below is also available through Blanc’s visible buttons, tab controls, and menus/);
  assert.match(page, /import slashCommandCopy from '\.\.\/\.\.\/\.\.\/copy\/slash-commands\.json'/);
  assert.match(page, /const slashCommands = slashCommandCopy\.commands\.map/);
  assert.match(page, /<details class="press-command-directory">/);
  assert.doesNotMatch(page, /<details class="press-command-directory" open/);
  assert.match(page, /\/group research/);
  assert.match(page, /\/save reading/);
  assert.match(page, /\/allow-ads/);
  assert.match(page, /New York · August 2, 2026/);
  assert.match(page, /For immediate release/);
  assert.match(page, /class="press-announcement-details"/);
  assert.doesNotMatch(page, /Private tabs use a separate non-persistent session/);
  assert.doesNotMatch(page, /Private tabs use a separate in-memory session/);
  assert.match(page, /PRESS_REQUEST_URL/);
  // The press page only uses native, approved press captures. Feature-page
  // compositions are retained for marketing pages, but are not editorial files.
  assert.doesNotMatch(page, /feature-(?:island|command-palette|tab-groups|private-tabs)\.png/);
  assert.match(sitemap, /\{ path: '\/press',/);
  assert.doesNotMatch(sitemap, /new Set\(\['\/press'\]\)/);
});
