const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..', '..');
const NEW_GEOMETRY = 'M232.18,150.8';
const OLD_GEOMETRY = 'M153.05,123.49';
const ICON_IDS = [
  'paper', 'ink', 'graphite', 'default', 'midnight', 'cream',
  'forest', 'sage', 'ember', 'plum', 'gold',
];

function source(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

async function boundsOf(input, predicate) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const bounds = { minX: info.width, minY: info.height, maxX: -1, maxY: -1 };
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const offset = ((y * info.width) + x) * info.channels;
      const [r, g, b, a] = data.subarray(offset, offset + 4);
      if (!predicate(r, g, b, a)) continue;
      bounds.minX = Math.min(bounds.minX, x);
      bounds.minY = Math.min(bounds.minY, y);
      bounds.maxX = Math.max(bounds.maxX, x);
      bounds.maxY = Math.max(bounds.maxY, y);
    }
  }
  return {
    ...bounds,
    width: bounds.maxX - bounds.minX + 1,
    height: bounds.maxY - bounds.minY + 1,
  };
}

test('the supplied Mahjong-inspired mark is the canonical brand source', () => {
  const canonical = source('assets/blanc-mark.svg');
  assert.match(canonical, /viewBox="0 0 290\.91 344"/);
  assert.match(canonical, new RegExp(NEW_GEOMETRY.replace('.', '\\.')));
  assert.match(canonical, /class="cls-1"/, 'source preserves the supplied distressed highlights');

  const pkg = JSON.parse(source('package.json'));
  assert.equal(pkg.scripts['brand:build'], 'node scripts/build-brand-assets.js');
  assert.equal(pkg.scripts['brand:check'], 'node scripts/build-brand-assets.js --check');
  assert.match(pkg.scripts['substrate:check'], /brand:check/);
});

test('every active vector surface uses the new geometry as transparent cutouts', () => {
  const generated = [
    'src/renderer/pages/icon.svg',
    'site/public/favicon.svg',
    'site/src/components/BrandMark.astro',
    'build/app-icons/Icon.icon/Assets/blanc-mark.svg',
  ];
  for (const relativePath of generated) {
    const text = source(relativePath);
    assert.match(text, new RegExp(NEW_GEOMETRY.replace('.', '\\.')), `${relativePath} has the new mark`);
    assert.doesNotMatch(text, new RegExp(OLD_GEOMETRY.replace('.', '\\.')), `${relativePath} drops the old mark`);
    assert.match(text, /mask/, `${relativePath} keeps distress as negative space`);
    assert.match(text, /blanc-cutout/, `${relativePath} identifies the supplied white cutouts`);
  }

  const onboarding = source('src/renderer/pages/newtab.html');
  assert.equal((onboarding.match(/class="ob-blanc-mark"/g) ?? []).length, 2);
  assert.doesNotMatch(onboarding, new RegExp(OLD_GEOMETRY.replace('.', '\\.')));
});

test('all app icon variants and platform copies use their canonical identity sources', async () => {
  for (const id of ICON_IDS) {
    assert.equal(fs.existsSync(path.join(ROOT, `src/renderer/pages/icon-${id}.png`)), true, id);
    assert.equal(fs.existsSync(path.join(ROOT, `export/app-icons-1024-square/icon-${id}-1024.png`)), true, `${id} export`);
  }

  const paper = path.join(ROOT, 'src/renderer/pages/icon-paper.png');
  const mark = await boundsOf(paper, (r, g, b, a) => a > 24 && ((r + g + b) / 3) < 128);
  assert.ok(mark.width >= 455 && mark.width <= 465, `Paper mark width is ${mark.width}px`);
  assert.ok(mark.height >= 540 && mark.height <= 548, `Paper mark height is ${mark.height}px`);

  const platformSource = fs.readFileSync(path.join(ROOT, 'assets/sunrise-app-icon.png'));
  const platformIcon = fs.readFileSync(path.join(ROOT, 'build/icon.png'));
  assert.deepEqual(platformIcon, platformSource);
  assert.deepEqual(
    fs.readFileSync(path.join(ROOT, 'ios/Blanc/Blanc/Assets.xcassets/AppIcon.appiconset/icon-sunrise.png')),
    platformIcon,
  );
  const appIconCatalog = JSON.parse(source('ios/Blanc/Blanc/Assets.xcassets/AppIcon.appiconset/Contents.json'));
  assert.equal(appIconCatalog.images[0].filename, 'icon-sunrise.png');
  assert.ok(fs.statSync(path.join(ROOT, 'build/windows-icons/icon-sunrise.ico')).size > 10_000);
});

test('internal pages use Sunrise artwork instead of the retired B favicon', () => {
  const pages = [
    'auth', 'bookmarks', 'downloads', 'error', 'history',
    'mahjong', 'newtab', 'settings', 'shortcuts',
  ];
  for (const page of pages) {
    const html = source(`src/renderer/pages/${page}.html`);
    assert.match(html, /<link rel="icon" type="image\/png" href="icon-sunrise\.png" \/>/, page);
    assert.doesNotMatch(html, /<link rel="icon"[^>]*href="icon\.svg"/, page);
  }

  const chromeStyles = source('src/renderer/styles.css');
  assert.match(chromeStyles, /\.favicon\.internal\s*\{[^}]*mask:\s*url\("pages\/sunrise-favicon-mark\.png"\)/);
  assert.doesNotMatch(chromeStyles, /\.favicon\.internal\s*\{[^}]*url\("pages\/icon\.svg"\)/);
  assert.match(chromeStyles, /#islandPill #pillFavicon\.internal\s*\{[^}]*display:\s*none/);
  assert.match(chromeStyles, /#islandPill \.dot-peek\.internal::after\s*\{[^}]*display:\s*none/);
});

test('the tiny monochrome Sunrise omits every water line beneath the sun', async () => {
  const file = path.join(ROOT, 'src/renderer/pages/sunrise-favicon-mark.png');
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let widestOpaqueRun = 0;
  for (let y = 0; y < info.height; y += 1) {
    let run = 0;
    for (let x = 0; x < info.width; x += 1) {
      const alpha = data[((y * info.width) + x) * info.channels + 3];
      run = alpha > 24 ? run + 1 : 0;
      widestOpaqueRun = Math.max(widestOpaqueRun, run);
    }
  }
  assert.equal(info.width, 680);
  assert.equal(info.height, 680);
  assert.ok(widestOpaqueRun < 450, `unexpected horizontal water line spans ${widestOpaqueRun}px`);
});

test('website identity, OpenGraph, press, and retained social outputs are all covered', () => {
  for (const relativePath of [
    'site/public/logo.png',
    'site/public/favicon.ico',
    'site/public/favicon-16x16.png',
    'site/public/favicon-32x32.png',
    'site/public/apple-touch-icon.png',
    'site/public/og-image.png',
    'site/public/feature-island.png',
    'site/public/feature-ad-blocking.png',
    'site/public/feature-command-palette.png',
    'site/public/feature-private-tabs.png',
    'site/public/feature-tab-groups.png',
    'site/public/press/blanc-press-card.png',
    'site/public/press/blanc-1.0-launch-card-v2.png',
    'site/public/press/blanc-1.0-launch-card-v3.png',
    'docs/superpowers/plans/assets/product-hunt/thumbnail-240x240.png',
    'marketing/article-assets/ai-clean-browser/ai-clean-workspace-header-5x2.jpg',
    'marketing/article-assets/ai-clean-browser/ai-clean-workspace-cover-3x2.jpg',
    'marketing/article-assets/ai-clean-browser/tabs-are-unfinished-context.jpg',
    'marketing/article-assets/ai-clean-browser/expanded-source.jpeg',
    'marketing/article-assets/ai-clean-browser/resting-clean-source.jpeg',
    'marketing/article-assets/ai-clean-browser/resting-source.jpeg',
    'marketing/social/quiet-tabs-carousel/quiet-tabs-carousel-4-1080x1350.png',
    'marketing/social/quiet-tabs-carousel/quiet-tabs-vertical-1080x1920.mp4',
    'marketing/social/tab-count-confession/tab-count-confession-motion-4.png',
    'marketing/social/tab-count-confession/tab-count-confession-tiktok-8.png',
  ]) {
    assert.ok(fs.statSync(path.join(ROOT, relativePath)).size > 0, relativePath);
  }

  const ogRenderer = source('site/scripts/render-og-cards.mjs');
  const pressRenderer = source('site/scripts/render-press-primary-capture.mjs');
  assert.match(ogRenderer, /path\.join\(PUBLIC_ROOT, 'favicon\.svg'\)/);
  assert.match(pressRenderer, /path\.join\(SITE_ROOT, 'public\/favicon\.svg'\)/);
  assert.match(source('marketing/article-assets/ai-clean-browser/compose.py'), /src\/renderer\/pages\/icon-ink\.png/);
  assert.match(source('marketing/social/quiet-tabs-carousel/render.js'), /site\/public\/logo\.png/);
  assert.match(source('marketing/social/tab-count-confession/render.js'), /site\/public\/logo\.png/);
});
