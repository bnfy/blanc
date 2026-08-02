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
    pngSize('site/public/press/blanc-island-product-capture.png'),
    { width: 2784, height: 1824 }
  );
  assert.deepEqual(
    pngSize('site/public/press/blanc-1.0-launch-card-v2.png'),
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

  assert.equal(packageVersion, '1.0.0');
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
  assert.match(page, /press\/vertical-tabs\.png/);
  assert.match(page, /press\/blanc-island-product-capture\.png/);
  assert.match(page, /press\/blanc-1\.0-launch-card-v2\.png/);
  assert.match(page, /<PressIslandDemo \/>/);
  assert.doesNotMatch(page, /press-product-callouts/);
  assert.match(islandDemo, /Interactive recreation of the Blanc 1\.0 Island/);
  assert.match(islandDemo, /id="pressIslandInput"/);
  assert.match(islandDemo, /<span>tech news<\/span>/);
  assert.match(islandDemo, /data-title="The Verge" data-domain="theverge\.com"/);
  assert.match(islandDemo, /data-title="9to5Mac" data-domain="9to5mac\.com"/);
  assert.match(islandDemo, /data-title="CNET" data-domain="cnet\.com"/);
  assert.match(islandDemo, /id="pressIslandPage"/);
  assert.match(islandDemo, /data-page="\/shots\/desktop\/9to5mac\.jpg"/);
  assert.match(islandDemo, /data-page="\/shots\/desktop\/cnet\.png"/);
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
  const islandPageRule = siteStyles.match(/\.press-island-page \{([^}]*)\}/)?.[1] || '';
  assert.doesNotMatch(islandPageRule, /opacity|filter/);
  assert.match(siteStyles, /data-site="cnet\.com"[^}]*object-position: 24% top/);
  assert.match(islandScript, /prefers-reduced-motion/);
  assert.match(page, /macOS · Windows · Linux/);
  assert.match(page, /<h1 id="press-title">Blanc replaces the browser toolbar\.<\/h1>/);
  assert.doesNotMatch(page, /Blanc 1\.0 replaces the browser toolbar/);
  assert.match(page, /Anthony J\. Loria/);
  assert.doesNotMatch(page, /Anthony Loria/);
  assert.match(page, /PRESS_REQUEST_URL/);
  // The press page only uses native, approved press captures. Feature-page
  // compositions are retained for marketing pages, but are not editorial files.
  assert.doesNotMatch(page, /feature-(?:island|command-palette|tab-groups|private-tabs)\.png/);
  assert.match(sitemap, /\{ path: '\/press',/);
  assert.doesNotMatch(sitemap, /new Set\(\['\/press'\]\)/);
});
