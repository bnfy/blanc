#!/usr/bin/env node

const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
const { createIco } = require('./build-windows-icons');

const ROOT = path.join(__dirname, '..');
const SOURCE = path.join(ROOT, 'assets/blanc-mark.svg');
const PAGES_DIR = path.join(ROOT, 'src/renderer/pages');
const ICON_IDS = [
  'paper', 'ink', 'graphite', 'default', 'midnight', 'cream',
  'forest', 'sage', 'ember', 'plum', 'gold',
];
const ICON_COLORS = {
  paper: { background: [255, 255, 255], mark: [14, 14, 14] },
  ink: { background: [13, 13, 13], mark: [244, 244, 244] },
  graphite: { background: [98, 98, 98], mark: [244, 244, 244] },
  default: { background: [47, 70, 57], mark: [244, 244, 241] },
  midnight: { background: [20, 24, 21], mark: [68, 96, 79] },
  cream: { background: [247, 245, 238], mark: [47, 70, 57] },
  forest: { background: [31, 37, 31], mark: [107, 144, 128] },
  sage: { background: [107, 144, 128], mark: [255, 255, 255] },
  ember: { background: [130, 76, 59], mark: [246, 237, 228] },
  plum: { background: [74, 59, 82], mark: [230, 223, 238] },
  gold: { background: [32, 27, 16], mark: [194, 165, 102] },
};
const SOURCE_WIDTH = 290.91;
const SOURCE_HEIGHT = 344;
const ICON_CANVAS = 1024;
const ICON_MARK_HEIGHT = 544;
const ICON_MARK_CENTER = { x: 535.5, y: 511.5 };
const ICON_ERASE_REGION = { left: 296, top: 226, width: 480, height: 572 };
const SQUARE_EXPORT_BOX = { left: 170, top: 170, width: 684, height: 684 };

const check = process.argv.includes('--check');
const changed = [];
const stale = [];

function sourceArtwork(source) {
  const match = source.match(/<g id="Layer_1-2"[^>]*>([\s\S]*)<\/g>\s*<\/svg>\s*$/);
  if (!match) throw new Error('assets/blanc-mark.svg has an unexpected structure');
  return match[1].split('\n').map((line) => line.trimEnd()).join('\n').trim();
}

function maskedMarkSvg({ artwork, canvasWidth, canvasHeight, markHeight, centerX, centerY, color, maskId = 'blanc-mark' }) {
  const scale = markHeight / SOURCE_HEIGHT;
  const markWidth = SOURCE_WIDTH * scale;
  const translateX = centerX - (markWidth / 2);
  const translateY = centerY - (markHeight / 2);
  const cutoutArtwork = artwork.replaceAll('class="cls-1"', 'class="blanc-cutout"');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${canvasWidth} ${canvasHeight}">
  <defs>
    <style>.blanc-cutout { fill: #000 !important; }</style>
    <mask id="${maskId}" x="0" y="0" width="${canvasWidth}" height="${canvasHeight}" maskUnits="userSpaceOnUse" style="mask-type:luminance">
      <g fill="#fff" transform="translate(${translateX.toFixed(5)} ${translateY.toFixed(5)}) scale(${scale.toFixed(8)})">
        ${cutoutArtwork}
      </g>
    </mask>
  </defs>
  <rect width="${canvasWidth}" height="${canvasHeight}" fill="${color}" mask="url(#${maskId})" />
</svg>
`;
}

function standaloneMarkSvg(artwork) {
  const cutoutArtwork = artwork.replaceAll('class="cls-1"', 'class="blanc-cutout"');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SOURCE_WIDTH} ${SOURCE_HEIGHT}">
  <style>
    .blanc-mark { fill: #0e0e0e; }
    .blanc-cutout { fill: #000 !important; }
    @media (prefers-color-scheme: dark) { .blanc-mark { fill: #f5f5f5; } }
  </style>
  <defs>
    <mask id="blanc-mark" x="0" y="0" width="${SOURCE_WIDTH}" height="${SOURCE_HEIGHT}" maskUnits="userSpaceOnUse" style="mask-type:luminance">
      <g fill="#fff">${cutoutArtwork}</g>
    </mask>
  </defs>
  <rect class="blanc-mark" width="${SOURCE_WIDTH}" height="${SOURCE_HEIGHT}" mask="url(#blanc-mark)" />
</svg>
`;
}

function siteBrandComponent(artwork) {
  const cutoutArtwork = artwork.replaceAll('class="cls-1"', 'class="blanc-cutout"');
  return `---
const { class: className, ariaLabel } = Astro.props;
const maskId = \`blanc-mark-\${String(className || 'default').replace(/[^a-z0-9_-]/gi, '-')}\`;
---
<svg class={className} viewBox="0 0 ${SOURCE_WIDTH} ${SOURCE_HEIGHT}" aria-label={ariaLabel} aria-hidden={ariaLabel ? undefined : 'true'}>
  <defs>
    <style>.blanc-cutout { fill: #000 !important; }</style>
    <mask id={maskId} x="0" y="0" width="${SOURCE_WIDTH}" height="${SOURCE_HEIGHT}" maskUnits="userSpaceOnUse" style="mask-type:luminance">
      <g fill="#fff">${cutoutArtwork}</g>
    </mask>
  </defs>
  <rect width="${SOURCE_WIDTH}" height="${SOURCE_HEIGHT}" fill="currentColor" mask={\`url(#\${maskId})\`} />
</svg>
`;
}

function faviconSvg(artwork) {
  const markHeight = 169.32;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">
  <rect width="256" height="256" rx="48" fill="#fff"/>
  ${maskedMarkSvg({
    artwork,
    canvasWidth: 256,
    canvasHeight: 256,
    markHeight,
    centerX: 135.45,
    centerY: 128,
    color: '#0e0e0e',
    maskId: 'blanc-favicon-mark',
  }).replace(/^<\?xml[^>]*>\n/, '').replace(/^<svg[^>]*>\n/, '').replace(/<\/svg>\n$/, '')}
</svg>
`;
}

async function emit(relativePath, contents) {
  const target = path.join(ROOT, relativePath);
  const next = Buffer.isBuffer(contents) ? contents : Buffer.from(contents);
  const current = await fs.readFile(target).catch(() => null);
  if (current?.equals(next)) return;
  if (check) {
    stale.push(relativePath);
    return;
  }
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, next);
  changed.push(relativePath);
}

function pixelAt(data, info, x, y) {
  const offset = ((y * info.width) + x) * info.channels;
  return Array.from(data.subarray(offset, offset + 4));
}

function distance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function cssRgb(color) {
  return `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
}

async function buildAppIcon(relativePath, artwork, palette) {
  const source = path.join(ROOT, relativePath);
  const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.width !== ICON_CANVAS || info.height !== ICON_CANVAS || info.channels !== 4) {
    throw new Error(`${relativePath} must be a 1024px RGBA icon`);
  }
  const actualBackground = pixelAt(data, info, 512, 160).slice(0, 3);
  if (distance(actualBackground, palette.background) > 2) {
    throw new Error(`${relativePath} no longer matches its canonical background color`);
  }
  const { background, mark } = palette;
  const region = ICON_ERASE_REGION;
  const blank = await sharp({
    create: { width: region.width, height: region.height, channels: 4, background: { r: background[0], g: background[1], b: background[2], alpha: 1 } },
  }).png().toBuffer();
  const markSvg = maskedMarkSvg({
    artwork,
    canvasWidth: ICON_CANVAS,
    canvasHeight: ICON_CANVAS,
    markHeight: ICON_MARK_HEIGHT,
    centerX: ICON_MARK_CENTER.x,
    centerY: ICON_MARK_CENTER.y,
    color: cssRgb(mark),
  });
  return sharp(data, { raw: info })
    .composite([
      { input: blank, left: region.left, top: region.top },
      { input: Buffer.from(markSvg) },
    ])
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
}

async function buildSquareExport(icon, background) {
  const box = SQUARE_EXPORT_BOX;
  const crop = await sharp(icon).extract(box).png().toBuffer();
  return sharp({
    create: { width: ICON_CANVAS, height: ICON_CANVAS, channels: 3, background: { r: background[0], g: background[1], b: background[2] } },
  }).composite([{ input: crop, left: box.left, top: box.top }]).png({ compressionLevel: 9 }).toBuffer();
}

async function raster(svg, width, height = width) {
  return sharp(Buffer.from(svg), { density: 384 })
    .resize(width, height, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
}

async function patchStaticBrandMark(relativePath, artwork, placement) {
  const source = path.join(ROOT, relativePath);
  const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const background = pixelAt(data, info, placement.sampleX, placement.sampleY);
  const blank = await sharp({
    create: {
      width: placement.erase.width,
      height: placement.erase.height,
      channels: 4,
      background: { r: background[0], g: background[1], b: background[2], alpha: background[3] / 255 },
    },
  }).png().toBuffer();
  const mark = maskedMarkSvg({
    artwork,
    canvasWidth: info.width,
    canvasHeight: info.height,
    markHeight: placement.height,
    centerX: placement.centerX,
    centerY: placement.centerY,
    color: placement.color,
  });
  const output = await sharp(data, { raw: info }).composite([
    { input: blank, left: placement.erase.left, top: placement.erase.top },
    { input: Buffer.from(mark) },
  ]).png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
  await emit(relativePath, output);
}

async function buildSiteAssets(artwork) {
  const favicon = faviconSvg(artwork);
  await emit('site/public/favicon.svg', favicon);
  await emit('site/src/components/BrandMark.astro', siteBrandComponent(artwork));

  const favicon16 = await raster(favicon, 16);
  const favicon32 = await raster(favicon, 32);
  const favicon48 = await raster(favicon, 48);
  await emit('site/public/favicon-16x16.png', favicon16);
  await emit('site/public/favicon-32x32.png', favicon32);
  await emit('site/public/apple-touch-icon.png', await raster(favicon, 180));
  await emit('site/public/favicon.ico', createIco([
    { size: 16, png: favicon16 },
    { size: 32, png: favicon32 },
    { size: 48, png: favicon48 },
  ]));

  const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><rect width="1024" height="1024" fill="#fff"/>${maskedMarkSvg({
    artwork,
    canvasWidth: 1024,
    canvasHeight: 1024,
    markHeight: 824,
    centerX: 512,
    centerY: 512,
    color: '#0e0e0e',
    maskId: 'blanc-logo-mark',
  }).replace(/^<\?xml[^>]*>\n/, '').replace(/^<svg[^>]*>\n/, '').replace(/<\/svg>\n$/, '')}</svg>`;
  const siteLogo = await raster(logoSvg, 1024);
  await emit('site/public/logo.png', siteLogo);
  await emit(
    'docs/superpowers/plans/assets/product-hunt/thumbnail-240x240.png',
    await sharp(siteLogo).resize(240, 240, { kernel: sharp.kernel.lanczos3 }).png({ compressionLevel: 9 }).toBuffer(),
  );

  await patchStaticBrandMark('site/public/press/blanc-1.0-launch-card-v2.png', artwork, {
    sampleX: 120,
    sampleY: 104,
    erase: { left: 121, top: 110, width: 62, height: 72 },
    height: 66,
    centerX: 151,
    centerY: 146,
    color: '#0e0e0e',
  });
  await patchStaticBrandMark('site/public/press/blanc-1.0-launch-card-v3.png', artwork, {
    sampleX: 110,
    sampleY: 92,
    erase: { left: 111, top: 93, width: 36, height: 43 },
    height: 38,
    centerX: 128,
    centerY: 114,
    color: '#0e0e0e',
  });
}

async function main() {
  const source = await fs.readFile(SOURCE, 'utf8');
  const artwork = sourceArtwork(source);

  const builtIcons = new Map();
  for (const id of ICON_IDS) {
    const relativePath = `src/renderer/pages/icon-${id}.png`;
    const icon = await buildAppIcon(relativePath, artwork, ICON_COLORS[id]);
    builtIcons.set(id, icon);
    await emit(relativePath, icon);

    await emit(
      `export/app-icons-1024-square/icon-${id}-1024.png`,
      await buildSquareExport(icon, ICON_COLORS[id].background),
    );
  }

  const paper = builtIcons.get('paper');
  await emit('build/icon.png', paper);
  await emit('ios/Blanc/Blanc/Assets.xcassets/AppIcon.appiconset/icon-paper.png', paper);
  await emit('src/renderer/pages/icon.svg', standaloneMarkSvg(artwork));

  const nativeHeight = ICON_MARK_HEIGHT * (ICON_CANVAS / 824);
  const nativeCenterX = (ICON_CANVAS / 2) + (((ICON_MARK_CENTER.x - 511.5) / 824) * ICON_CANVAS);
  await emit('build/app-icons/Icon.icon/Assets/blanc-mark.svg', maskedMarkSvg({
    artwork,
    canvasWidth: ICON_CANVAS,
    canvasHeight: ICON_CANVAS,
    markHeight: nativeHeight,
    centerX: nativeCenterX,
    centerY: ICON_CANVAS / 2,
    color: '#0e0e0e',
  }));

  await buildSiteAssets(artwork);

  if (stale.length) {
    throw new Error(`Brand assets are stale:\n  ${stale.join('\n  ')}\nRun npm run brand:build and commit the generated files.`);
  }
  if (!check) {
    console.log(changed.length ? `Updated ${changed.length} brand assets.` : 'Brand assets already current.');
  } else {
    console.log('Brand assets are current.');
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
