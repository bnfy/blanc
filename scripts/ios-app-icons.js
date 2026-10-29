'use strict';

// Blanc for iPhone's app icons: six Icon Composer packages, so iOS 26 and
// later draw them in Liquid Glass with their Light, Dark, Clear and Tinted
// styles, and Xcode generates flat copies for older iOS. Sunrise Gold is the
// primary icon; Sunrise Dawn (iPhone only) and the Mac's other icons are
// alternates in Settings → Appearance → App icon. Spec:
// docs/superpowers/specs/2026-10-29-ios-liquid-glass-app-icons-design.md.
//
// Dawn and Gold are cut from the Sunrise's native layer (itself cut from the
// locked master), split into sun, rays and water, each a flat-painted glass
// layer that Icon Composer lights. Sunrise, Sunrise Dark, Spectrum and Amber
// reuse the Mac's documents and layers unchanged.

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const { createIconDocument, iconComposerColor } = require('./after-pack-app-icons');
const APP_ICON_ASSETS = require('../src/main/app-icon-assets');
const { appIcons: SCHEMA_ICONS } = require('../settings-schema/schema.json');

const ROOT = path.join(__dirname, '..');
const IOS_APP_ICON_DIR = 'ios/Blanc/Blanc/AppIcons';
const SCHEMA_LABELS = new Map(SCHEMA_ICONS.map((icon) => [icon.id, icon.label]));

// In picker order, the primary (standard) icon first. Every id but Dawn's is
// shared with the Mac, so its label comes from the settings schema.
const IOS_APP_ICONS = Object.freeze([
  ['sunrise-gold', 'AppIcon'],
  ['sunrise-dawn', 'SunriseDawn', 'Sunrise Dawn'],
  ['sunrise', 'Sunrise'],
  ['sunrise-dark', 'SunriseDark'],
  ['sunrise-spectrum', 'SunriseSpectrum'],
  ['sunrise-amber', 'SunriseAmber'],
].map(([id, nativeName, label = SCHEMA_LABELS.get(id)]) => Object.freeze({ id, nativeName, label })));

const SHARED_PLATFORMS = { circles: ['watchOS'], squares: 'shared' };
const CANVAS = 1024;
const PNG = { compressionLevel: 9, adaptiveFiltering: true };

// Measured on the native layer: the horizon (the disc's base), the disc's
// center, and how far from it the sun's region reaches (radius 212 plus a
// margin short of the nearest ray).
const HORIZON = 654;
const WATER_TOP = 655;
const SUN = { x: 510, y: HORIZON, reach: 224 };
// Apple warns against hairlines under glass, so each part is grown a little:
// a Gaussian blur of its alpha (sigma), then this ramp back to a hard edge.
const GROW = { rays: 3, sun: 2, water: 1.5 };
const GROW_RAMP = [40, 70];

// Icon Composer appearance switches for image layers.
const LIGHT_ONLY = [{ appearance: 'dark', value: true }, { appearance: 'tinted', value: true }];
const DARK_ONLY = [{ value: true }, { appearance: 'dark', value: false }, { appearance: 'tinted', value: true }];
const NOT_TINTED = [{ appearance: 'tinted', value: true }];

const solid = (hex) => ({ solid: iconComposerColor(hex) });
const linear = (top, bottom) => ({
  'linear-gradient': [iconComposerColor(top), iconComposerColor(bottom)],
  orientation: { start: { x: 0.5, y: 0 }, stop: { x: 0.5, y: 1 } },
});

const svg = (defs, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS}" height="${CANVAS}" viewBox="0 0 ${CANVAS} ${CANVAS}">`
  + `<defs>${defs}</defs>${body}</svg>`;
const stops = (list) => list.map(([offset, color, opacity = 1]) =>
  `<stop offset="${offset}" stop-color="${color}" stop-opacity="${Number(opacity.toFixed(4))}"/>`).join('');
const vertical = (id, list, y1, y2) =>
  `<linearGradient id="${id}" x1="0" y1="${y1}" x2="0" y2="${y2}" gradientUnits="userSpaceOnUse">${stops(list)}</linearGradient>`;
const FULL = (paint) => `<rect width="${CANVAS}" height="${CANVAS}" fill="${paint}"/>`;

const raster = (source) => sharp(Buffer.from(source)).png(PNG).toBuffer();

// Sky above the horizon, water below.
const sceneTile = (sky, sea) => svg(
  vertical('sky', sky, 0, HORIZON) + vertical('sea', sea, HORIZON, CANVAS),
  FULL('url(#sky)') + `<rect y="${HORIZON}" width="${CANVAS}" height="${CANVAS - HORIZON}" fill="url(#sea)"/>`,
);

// A soft light behind the sun.
const glow = (inner, outer, radius, opacity) => svg(
  `<radialGradient id="glow" cx="${SUN.x}" cy="${HORIZON - 40}" r="${radius}" gradientUnits="userSpaceOnUse">`
    + `${stops([[0, inner, opacity], [0.45, inner, opacity * 0.55], [1, outer, 0]])}</radialGradient>`,
  FULL('url(#glow)'),
);

// The sun's reflection, a tall soft oval under the horizon.
const reflection = (color, opacity) => svg(
  `<radialGradient id="reflection" cx="${SUN.x}" cy="${HORIZON + 30}" r="260" gradientUnits="userSpaceOnUse" `
    + `gradientTransform="translate(${SUN.x} ${HORIZON}) scale(0.62 1) translate(${-SUN.x} ${-HORIZON})">`
    + `${stops([[0, color, opacity], [0.55, color, opacity * 0.6], [1, color, 0]])}</radialGradient>`,
  `<ellipse cx="${SUN.x}" cy="${HORIZON + 120}" rx="230" ry="210" fill="url(#reflection)"/>`,
);

// The water lines' paint: `center` under the sun, fading to `edge`.
const waterWarmth = (center, edge) => svg(
  `<radialGradient id="warmth" cx="${SUN.x}" cy="660" r="230" gradientUnits="userSpaceOnUse" `
    + `gradientTransform="translate(${SUN.x} 660) scale(1 2.2) translate(${-SUN.x} -660)">`
    + `${stops([[0, center], [0.55, center], [1, edge]])}</radialGradient>`,
  FULL('url(#warmth)'),
);

const verticalPaint = (list, y1, y2) => svg(vertical('paint', list, y1, y2), FULL('url(#paint)'));

// The native layer's alpha in three parts: water below the horizon, the sun
// within reach of the disc's center, the rays everywhere else.
async function splitMark(nativeLayer) {
  const alpha = await sharp(nativeLayer).ensureAlpha().extractChannel(3).raw().toBuffer();
  const parts = { sun: Buffer.alloc(alpha.length), rays: Buffer.alloc(alpha.length), water: Buffer.alloc(alpha.length) };
  for (let y = 0; y < CANVAS; y += 1) {
    for (let x = 0; x < CANVAS; x += 1) {
      const i = (y * CANVAS) + x;
      if (alpha[i] < 4) continue;
      const part = y >= WATER_TOP ? 'water' : Math.hypot(x - SUN.x, y - SUN.y) <= SUN.reach ? 'sun' : 'rays';
      parts[part][i] = alpha[i];
    }
  }
  return parts;
}

async function grow(alpha, sigma) {
  const blurred = await sharp(alpha, { raw: { width: CANVAS, height: CANVAS, channels: 1 } })
    .blur(sigma).extractChannel(0).raw().toBuffer();
  const [low, high] = GROW_RAMP;
  return Buffer.from(blurred.map((v) => (v >= high ? 255 : v <= low ? 0 : Math.round(((v - low) / (high - low)) * 255))));
}

// An alpha painted with one color (hex) or an SVG paint covering the canvas.
async function paint(alpha, fill) {
  // Rendered to raw RGB first: in one pipeline, removeAlpha() would also drop
  // the joined alpha, since sharp applies it last.
  const rgb = fill.startsWith('#')
    ? await sharp({ create: { width: CANVAS, height: CANVAS, channels: 3, background: fill } }).raw().toBuffer()
    : await sharp(Buffer.from(fill)).removeAlpha().raw().toBuffer();
  return sharp(rgb, { raw: { width: CANVAS, height: CANVAS, channels: 3 } })
    .joinChannel(alpha, { raw: { width: CANVAS, height: CANVAS, channels: 1 } })
    .png(PNG)
    .toBuffer();
}

const glassGroup = (layer, settings) => ({ layers: [{ glass: true, ...layer }], specular: true, ...settings });
const tileLayer = (imageName, name, hidden, extra = {}) =>
  ({ glass: false, 'image-name': imageName, name, 'hidden-specializations': hidden, ...extra });

async function dawnPackage(parts) {
  const images = {
    'water.png': await paint(parts.water, waterWarmth('#FFC98A', '#FFFFFF')),
    'sun.png': await paint(parts.sun, verticalPaint([[0, '#FFE08A'], [1, '#FF9440']], 440, HORIZON)),
    'rays.png': await paint(parts.rays, '#FFFFFF'),
    'glow.png': await raster(glow('#FFF3D8', '#FFE7C0', 330, 0.85)),
    'night.png': await raster(sceneTile(
      [[0, '#0E1530'], [0.6, '#2C2347'], [1, '#7A3E3A']],
      [[0, '#5A3238'], [1, '#0E1328']],
    )),
    'sky.png': await raster(sceneTile(
      [[0, '#7FAEDF'], [0.45, '#C3C3E2'], [0.8, '#F7C9A6'], [1, '#FFD59A']],
      [[0, '#F2B48E'], [0.5, '#9C9FC6'], [1, '#6E8CC0']],
    )),
  };
  const doc = {
    fill: linear('#A9C6E6', '#F6CDA8'),
    'fill-specializations': [{ appearance: 'dark', value: linear('#121A33', '#3B2433') }],
    groups: [
      glassGroup({ 'image-name': 'water.png', name: 'Water' }, {
        shadow: { kind: 'neutral', opacity: 0.3 },
        translucency: { enabled: true, value: 0.35 },
        'blur-material': 0.6,
        lighting: 'individual',
      }),
      glassGroup({ 'image-name': 'sun.png', name: 'Sun' }, {
        shadow: { kind: 'layer-color', opacity: 0.6 },
        translucency: { enabled: true, value: 0.2 },
      }),
      glassGroup({ 'image-name': 'rays.png', name: 'Rays' }, {
        shadow: { kind: 'neutral', opacity: 0.3 },
        translucency: { enabled: true, value: 0.35 },
      }),
      { layers: [
        tileLayer('glow.png', 'Glow', LIGHT_ONLY),
        tileLayer('night.png', 'Night', DARK_ONLY),
        tileLayer('sky.png', 'Sky', LIGHT_ONLY),
      ] },
    ],
  };
  return { doc, images };
}

async function goldPackage(parts) {
  const images = {
    'water.png': await paint(parts.water, waterWarmth('#FFFFFF', '#FBE6BC')),
    'sun.png': await paint(parts.sun, '#FFF7E4'),
    'rays.png': await paint(parts.rays, '#FFFAEE'),
    'reflection.png': await raster(reflection('#FFF1CF', 0.9)),
    'glow.png': await raster(glow('#FFF1CC', '#FFE2A0', 300, 0.55)),
    'tile.png': await raster(svg(vertical('tile', [[0, '#FBE2A6'], [0.45, '#EDBE6A'], [1, '#C98B3A']], 0, CANVAS), FULL('url(#tile)'))),
  };
  // In Dark the cream mark turns gold on a near-black fill.
  const goldGlass = (imageName, name, translucency, darkFill) => glassGroup(
    { 'image-name': imageName, name, 'fill-specializations': [{ appearance: 'dark', value: solid(darkFill) }] },
    {
      shadow: { kind: 'layer-color', opacity: 0.55 },
      translucency: { enabled: true, value: translucency },
      lighting: 'individual',
    },
  );
  const doc = {
    fill: linear('#F3CD82', '#C98B3A'),
    'fill-specializations': [{ appearance: 'dark', value: linear('#2A2218', '#14110D') }],
    groups: [
      goldGlass('water.png', 'Water', 0.45, '#E9B860'),
      goldGlass('sun.png', 'Sun', 0.35, '#F0C46E'),
      goldGlass('rays.png', 'Rays', 0.35, '#E9B860'),
      { layers: [
        tileLayer('reflection.png', 'Reflection', NOT_TINTED),
        tileLayer('glow.png', 'Glow', NOT_TINTED, { 'opacity-specializations': [{ appearance: 'dark', value: 0.35 }] }),
        tileLayer('tile.png', 'Tile', LIGHT_ONLY),
      ] },
    ],
  };
  return { doc, images };
}

// A Mac icon as an iPhone package: its own document and layers, unchanged
// but for the platforms it declares.
function macPackage(definition) {
  const imageDir = definition.imageDir ?? 'build/app-icons/Icon.icon/Assets';
  const names = [
    definition.imageName ?? 'sunrise-mark.png',
    ...(definition.extraLayers ?? []).map((extra) => extra.imageName),
    definition.rimImageName,
    definition.tileImageName,
    definition.darkTileImageName,
  ].filter(Boolean);
  const images = Object.fromEntries(names.map((name) => [name, fs.readFileSync(path.join(ROOT, imageDir, name))]));
  return { doc: createIconDocument(definition), images };
}

/**
 * Every file of the six packages, keyed by repository-relative path.
 * `nativeLayer` is the Sunrise on the 1024 Icon Composer canvas, as
 * build-brand-assets.js writes it to build/app-icons/Icon.icon/Assets.
 */
async function iosAppIconFiles(nativeLayer) {
  const split = await splitMark(nativeLayer);
  const parts = {
    sun: await grow(split.sun, GROW.sun),
    rays: await grow(split.rays, GROW.rays),
    water: await grow(split.water, GROW.water),
  };
  const packages = {
    AppIcon: await goldPackage(parts),
    SunriseDawn: await dawnPackage(parts),
    Sunrise: macPackage(APP_ICON_ASSETS.sunrise),
    SunriseDark: macPackage(APP_ICON_ASSETS['sunrise-dark']),
    SunriseSpectrum: macPackage(APP_ICON_ASSETS['sunrise-spectrum']),
    SunriseAmber: macPackage(APP_ICON_ASSETS['sunrise-amber']),
  };
  const files = {};
  for (const { nativeName } of IOS_APP_ICONS) {
    const { doc, images } = packages[nativeName];
    const dir = `${IOS_APP_ICON_DIR}/${nativeName}.icon`;
    files[`${dir}/icon.json`] = `${JSON.stringify({ ...doc, 'supported-platforms': SHARED_PLATFORMS }, null, 2)}\n`;
    for (const [name, bytes] of Object.entries(images)) files[`${dir}/Assets/${name}`] = bytes;
  }
  return files;
}

/** sha256 over a package's files: sorted relative paths, each with its bytes. */
function packageDigest(packageDir) {
  const hash = crypto.createHash('sha256');
  const files = fs.readdirSync(packageDir, { recursive: true })
    .map((name) => name.split(path.sep).join('/'))
    .filter((name) => fs.statSync(path.join(packageDir, name)).isFile())
    .sort();
  for (const name of files) hash.update(`${name}\0`).update(fs.readFileSync(path.join(packageDir, name)));
  return hash.digest('hex');
}

module.exports = { IOS_APP_ICONS, IOS_APP_ICON_DIR, iosAppIconFiles, packageDigest };
