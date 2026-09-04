#!/usr/bin/env node

const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
const { createIco } = require('./build-windows-icons');

const ROOT = path.join(__dirname, '..');
const SOURCE = path.join(ROOT, 'assets/blanc-mark.svg');
const SUNRISE_SOURCE = path.join(ROOT, 'src/renderer/pages/mahjong-wind-east.png');
const PLATFORM_ICON_SOURCE = path.join(ROOT, 'assets/sunrise-app-icon.png');
const PAGES_DIR = path.join(ROOT, 'src/renderer/pages');
const MONOGRAM_ICON_IDS = [
  'paper', 'ink', 'graphite', 'default', 'midnight', 'cream',
  'forest', 'sage', 'ember', 'plum', 'gold',
];
const ICON_COLORS = {
  sunrise: { background: [247, 240, 229] },
  'sunrise-dark': { background: [28, 26, 22] },
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
const SUNRISE_CROP = { left: 36, top: 16, width: 190, height: 194 };
// The 14px internal-page favicon keeps only the rays and half-sun. The water
// lines begin on source row 146 and collapse into noise at that scale.
const SUNRISE_FAVICON_CROP = { left: 36, top: 16, width: 190, height: 130 };
const SUNRISE_FLAT_SIZE = 680;
const SUNRISE_FLAT_POSITION = 172;
const SUNRISE_NATIVE_SIZE = 845;
const SUNRISE_NATIVE_POSITION = 89;

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

function siteBrandComponent(marks) {
  // The site's in-page mark. Sunrise is raster (see buildSunriseAssets), so the
  // component paints currentColor through the silhouette's alpha — the same
  // construction the app chrome uses for blanc:// favicons — with both masks
  // embedded so nothing is fetched at runtime. `small` swaps in the rays-only
  // crop for ≤16px placements, where the water lines collapse into noise.
  return `---
const { class: className, ariaLabel, small = false } = Astro.props;
---
<span class:list={['blanc-mark', { 'blanc-mark--small': small }, className]} role={ariaLabel ? 'img' : undefined} aria-label={ariaLabel} aria-hidden={ariaLabel ? undefined : 'true'}></span>
<style>
  .blanc-mark {
    display: block;
    background: currentColor;
    -webkit-mask: url("${marks.full}") center / contain no-repeat;
    mask: url("${marks.full}") center / contain no-repeat;
  }
  .blanc-mark--small {
    -webkit-mask-image: url("${marks.small}");
    mask-image: url("${marks.small}");
  }
</style>
`;
}

function tileSvg(dataUri) {
  // The 256 favicon tile keeps the B-era geometry: white, rx 48, mark at 66%.
  const markSize = 169.32;
  const offset = ((256 - markSize) / 2).toFixed(2);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">
  <rect width="256" height="256" rx="48" fill="#fff"/>
  <image href="${dataUri}" x="${offset}" y="${offset}" width="${markSize}" height="${markSize}"/>
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

function cssRgbTuple(hex) {
  return [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
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

function sunriseTileSvg({ dark }) {
  const stops = dark
    ? [
      ['0', '#292720'],
      ['0.52', '#1c1a16'],
      ['1', '#11100e'],
    ]
    : [
      ['0', '#fffaf1'],
      ['0.52', '#f7f0e5'],
      ['1', '#eee4d5'],
    ];
  const shadowOpacity = dark ? '0.5' : '0.24';
  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
      <defs>
        <linearGradient id="face" x1="0" y1="0" x2="0" y2="1">
          ${stops.map(([offset, color]) => `<stop offset="${offset}" stop-color="${color}"/>`).join('')}
        </linearGradient>
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="150%">
          <feDropShadow dx="0" dy="15" stdDeviation="18" flood-color="#000000" flood-opacity="${shadowOpacity}"/>
        </filter>
      </defs>
      <rect x="100" y="100" width="824" height="824" rx="184" fill="url(#face)" filter="url(#shadow)"/>
    </svg>
  `);
}

async function buildSunriseAssets() {
  const { data, info } = await sharp(SUNRISE_SOURCE)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.width !== 256 || info.height !== 256 || info.channels !== 4) {
    throw new Error('mahjong-wind-east.png must remain a 256px RGBA source asset');
  }
  const cleaned = Buffer.from(data);
  for (let pixel = 0; pixel < info.width * info.height; pixel += 1) {
    const alphaIndex = pixel * 4 + 3;
    if (cleaned[alphaIndex] < 4) cleaned[alphaIndex] = 0;
  }
  const sourceOptions = {
    raw: { width: info.width, height: info.height, channels: 4 },
  };
  const motif = await sharp(cleaned, sourceOptions)
    .extract(SUNRISE_CROP)
    .resize(SUNRISE_FLAT_SIZE, SUNRISE_FLAT_SIZE, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      kernel: sharp.kernel.lanczos3,
    })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
  const faviconMotif = await sharp(cleaned, sourceOptions)
    .extract(SUNRISE_FAVICON_CROP)
    .resize(SUNRISE_FLAT_SIZE, SUNRISE_FLAT_SIZE, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      kernel: sharp.kernel.lanczos3,
    })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
  const nativeMotif = await sharp(cleaned, sourceOptions)
    .extract(SUNRISE_CROP)
    .resize(SUNRISE_NATIVE_SIZE, SUNRISE_NATIVE_SIZE, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      kernel: sharp.kernel.lanczos3,
    })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
  const nativeLayer = await sharp({
    create: {
      width: ICON_CANVAS,
      height: ICON_CANVAS,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  }).composite([{
    input: nativeMotif,
    left: SUNRISE_NATIVE_POSITION,
    top: SUNRISE_NATIVE_POSITION,
  }]).png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();

  const buildFlat = (dark) => sharp({
    create: {
      width: ICON_CANVAS,
      height: ICON_CANVAS,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  }).composite([
    { input: sunriseTileSvg({ dark }), left: 0, top: 0 },
    { input: motif, left: SUNRISE_FLAT_POSITION, top: SUNRISE_FLAT_POSITION },
  ]).png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();

  return {
    light: await buildFlat(false),
    dark: await buildFlat(true),
    faviconMotif,
    motif,
    nativeLayer,
  };
}

async function raster(svg, width, height = width) {
  return sharp(Buffer.from(svg), { density: 384 })
    .resize(width, height, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
}

// A Sunrise motif (RGBA, transparent field) as a flat ink silhouette at `size`:
// the artwork's own alpha, painted one color — exactly what a CSS mask of the
// motif produces in the app chrome.
async function silhouettePng(motif, size, color = [14, 14, 14]) {
  const tight = await sharp(motif).trim({ threshold: 8 }).png().toBuffer();
  const alpha = await sharp(tight)
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 }, kernel: sharp.kernel.lanczos3 })
    .ensureAlpha()
    .extractChannel(3)
    .raw()
    .toBuffer();
  return sharp({ create: { width: size, height: size, channels: 3, background: { r: color[0], g: color[1], b: color[2] } } })
    .joinChannel(alpha, { raw: { width: size, height: size, channels: 1 } })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
}

function pngDataUri(png) {
  return `data:image/png;base64,${png.toString('base64')}`;
}

async function patchStaticBrandMark(relativePath, motif, placement) {
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
  const mark = await silhouettePng(motif, placement.height, cssRgbTuple(placement.color));
  const output = await sharp(data, { raw: info }).composite([
    { input: blank, left: placement.erase.left, top: placement.erase.top },
    {
      input: mark,
      left: placement.erase.left + Math.round((placement.erase.width - placement.height) / 2),
      top: placement.erase.top + Math.round((placement.erase.height - placement.height) / 2),
    },
  ]).png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
  await emit(relativePath, output);
}

async function buildSiteAssets(sunrise) {
  const ink = [14, 14, 14];
  const marks = {
    full: pngDataUri(await silhouettePng(sunrise.motif, 256, ink)),
    small: pngDataUri(await silhouettePng(sunrise.faviconMotif, 128, ink)),
  };
  await emit('site/src/components/BrandMark.astro', siteBrandComponent(marks));

  // The homepage's one-shot gold-to-ink reveal uses the same crop and alpha
  // as BrandMark, so its artwork never shifts while the gold fades away.
  const heroMotif = await sharp(sunrise.motif).trim({ threshold: 8 }).png().toBuffer();
  await emit('site/public/sunrise-hero-mark.png', await sharp(heroMotif)
    .resize(256, 256, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 }, kernel: sharp.kernel.lanczos3 })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer());

  // Favicons carry the rays-only crop (the app's own ≤16px rule); the 180px
  // touch icon has room for the full mark.
  const favicon = tileSvg(pngDataUri(await silhouettePng(sunrise.faviconMotif, 256, ink)));
  await emit('site/public/favicon.svg', favicon);
  const favicon16 = await raster(favicon, 16);
  const favicon32 = await raster(favicon, 32);
  const favicon48 = await raster(favicon, 48);
  await emit('site/public/favicon-16x16.png', favicon16);
  await emit('site/public/favicon-32x32.png', favicon32);
  await emit('site/public/apple-touch-icon.png', await raster(tileSvg(marks.full), 180));
  await emit('site/public/favicon.ico', createIco([
    { size: 16, png: favicon16 },
    { size: 32, png: favicon32 },
    { size: 48, png: favicon48 },
  ]));

  // Press-kit mark: white 1024 square, mark at 80% height (unchanged geometry).
  const logoMark = await silhouettePng(sunrise.motif, 824, ink);
  const siteLogo = await sharp({ create: { width: 1024, height: 1024, channels: 3, background: '#ffffff' } })
    .composite([{ input: logoMark, left: 100, top: 100 }])
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
  await emit('site/public/logo.png', siteLogo);
  await emit(
    'docs/superpowers/plans/assets/product-hunt/thumbnail-240x240.png',
    await sharp(siteLogo).resize(240, 240, { kernel: sharp.kernel.lanczos3 }).png({ compressionLevel: 9 }).toBuffer(),
  );

  await patchStaticBrandMark('site/public/press/blanc-1.0-launch-card-v2.png', sunrise.motif, {
    sampleX: 120,
    sampleY: 104,
    erase: { left: 121, top: 110, width: 62, height: 72 },
    height: 62,
    color: '#0e0e0e',
  });
  await patchStaticBrandMark('site/public/press/blanc-1.0-launch-card-v3.png', sunrise.motif, {
    sampleX: 110,
    sampleY: 92,
    erase: { left: 111, top: 93, width: 36, height: 43 },
    height: 36,
    color: '#0e0e0e',
  });
}

async function main() {
  const source = await fs.readFile(SOURCE, 'utf8');
  const artwork = sourceArtwork(source);
  const platformIcon = await fs.readFile(PLATFORM_ICON_SOURCE);
  const platformIconMetadata = await sharp(platformIcon).metadata();
  if (platformIconMetadata.format !== 'png'
      || platformIconMetadata.width !== ICON_CANVAS
      || platformIconMetadata.height !== ICON_CANVAS) {
    throw new Error('assets/sunrise-app-icon.png must remain a 1024px square PNG');
  }

  const builtIcons = new Map();
  for (const id of MONOGRAM_ICON_IDS) {
    const relativePath = `src/renderer/pages/icon-${id}.png`;
    const icon = await buildAppIcon(relativePath, artwork, ICON_COLORS[id]);
    builtIcons.set(id, icon);
    await emit(relativePath, icon);

    await emit(
      `export/app-icons-1024-square/icon-${id}-1024.png`,
      await buildSquareExport(icon, ICON_COLORS[id].background),
    );
  }

  const sunrise = await buildSunriseAssets();
  for (const [id, icon] of [
    ['sunrise', sunrise.light],
    ['sunrise-dark', sunrise.dark],
  ]) {
    builtIcons.set(id, icon);
    await emit(`src/renderer/pages/icon-${id}.png`, icon);
    await emit(
      `export/app-icons-1024-square/icon-${id}-1024.png`,
      await buildSquareExport(icon, ICON_COLORS[id].background),
    );
  }

  await emit('build/icon.png', platformIcon);
  await emit('ios/Blanc/Blanc/Assets.xcassets/AppIcon.appiconset/icon-sunrise.png', platformIcon);
  await emit('src/renderer/pages/icon.svg', standaloneMarkSvg(artwork));
  await emit('src/renderer/pages/sunrise-favicon-mark.png', sunrise.faviconMotif);
  await emit('src/renderer/pages/sunrise-mark.png', sunrise.motif);

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
  await emit('build/app-icons/Icon.icon/Assets/sunrise-mark.png', sunrise.nativeLayer);

  await buildSiteAssets(sunrise);

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
