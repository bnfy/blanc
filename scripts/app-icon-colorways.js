'use strict';

// Sunrise Spectrum and Sunrise Amber, the glass colorways. The Sunrise is
// redrawn here as a half disc and seven heavy rounded rays, with no water
// lines (the shipped artwork's own proportions, below), so the mark can be drawn large and carry Icon Composer glass; the
// shipped Sunrise artwork stays the source of every other surface. Each
// colorway yields:
//   - three Icon Composer layers on the full-bleed 1024 canvas: the sun and
//     rays in color with a soft gloss baked along each stroke's top, and the
//     white rim drawn behind them;
//   - flat Dock fallbacks for Light and Dark on the 824px visible tile, with
//     the glass approximated (glow, rim, gloss) and tile colors sampled from
//     Icon Composer's own renders.

const CX = 512;
// Proportions follow the Sunrise's native layer (sunrise-mark.png): the side
// rays' tips reach as far from the sun's center as there, and the middle ray
// reaches further still, so it stands well above the rest. Rays here are
// heavier than the artwork's, so the sun is drawn a little larger than its
// 210px half disc and risen above its flat base, or the heavy rays and rims
// swamp it; the rays start far enough out for their thick white rims to stay
// clear of the sun's.
const HORIZON = 654;
const SUN_RADIUS = 225;
// How far the sun's center stands above its flat base; 0 is a half disc.
const SUN_RISE = 80;
const SUN_Y = HORIZON - SUN_RISE;
const RAY_WIDTH = 52;
// Clear space between the sun and the rays' caps.
const RAY_GAP = 66;
const RAY_REACH = [[0, 615], [28, 470], [52.5, 455], [76, 394]];
const RAYS = RAY_REACH.flatMap(([angle, reach]) => (angle ? [-angle, angle] : [0])
  .map((a) => [a, SUN_RADIUS + RAY_GAP + RAY_WIDTH / 2, reach - RAY_WIDTH / 2]));
const RIM = 30;
// A soft drop shadow drawn under the white rim, as Arc's icon has one.
const SHADOW_DY = 12;
const SHADOW_BLUR = 18;
const SHADOW_OPACITY = 0.42;
// Vertical middle of the drawn mark, from the middle ray's tip to the sun's
// flat base, before scaling.
const MARK_TOP = SUN_Y - RAY_REACH[0][1];
const MARK_CENTER = (MARK_TOP + HORIZON) / 2;
// The mark, rim included, fills 800px of the full-bleed 1024 canvas in its
// longer direction. macOS paints the native tile full-bleed; the flat copy
// draws an 824px tile, so its mark takes the same share of the visible tile.
const MARK_WIDTH = 2 * (Math.max(...RAY_REACH.map(([a, reach]) => reach * Math.sin((a * Math.PI) / 180))) + RIM);
const MARK_HEIGHT = HORIZON - MARK_TOP + 2 * RIM;
const NATIVE_SCALE = Number((800 / Math.max(MARK_WIDTH, MARK_HEIGHT)).toFixed(3));
const FLAT_SCALE = NATIVE_SCALE * (824 / 1024);

const COLORWAYS = {
  spectrum: {
    rays: [[0, '#1A007F'], [0.24, '#1942CD'], [0.4, '#2C39B9'], [0.48, '#E23A55'], [0.6, '#F95B6E'], [0.8, '#FF7F88'], [1, '#FFA3A8']],
    sun: [[0, '#1942CD'], [0.28, '#2C39B9'], [0.46, '#E23A55'], [0.7, '#FF5F73'], [1, '#FF8F96']],
    // Arc's Dock tile: darker gray at the top, lighter below. Drawn as a tile
    // image, since an Icon Composer fill takes a single color.
    tile: [[0, '#A9B0BA'], [0.3, '#B3B9C2'], [0.85, '#CED3DB'], [1, '#D2D7DE']],
    tileLayer: true,
  },
  amber: {
    rays: [[0, '#B8692A'], [0.3, '#CD8530'], [0.5, '#D9A040'], [0.7, '#CD8530'], [1, '#B8692A']],
    sun: [[0, '#D08A2C'], [0.55, '#B9652A'], [1, '#9E4A2A']],
    tile: [[0, '#FEF8ED'], [1, '#F3EBDF']],
  },
};
// Icon Composer renders both Dark tiles this near-black, whatever the fill.
const DARK_TILE = [[0, '#1F1F1E'], [1, '#100F0F']];

const fixed = (n) => Number(n.toFixed(1));

function ray([angle, inner, outer]) {
  const a = (angle * Math.PI) / 180;
  return [
    CX + inner * Math.sin(a), SUN_Y - inner * Math.cos(a),
    CX + outer * Math.sin(a), SUN_Y - outer * Math.cos(a),
  ];
}

function line([x1, y1, x2, y2], paint, width) {
  return `<line x1="${fixed(x1)}" y1="${fixed(y1)}" x2="${fixed(x2)}" y2="${fixed(y2)}" stroke="${paint}" `
    + `stroke-width="${fixed(width)}" stroke-linecap="round"/>`;
}

// The sun: the part of its disc above the flat base, more than half when it
// has risen.
function sun(paint, grow = 0) {
  const half = Math.sqrt(SUN_RADIUS ** 2 - SUN_RISE ** 2);
  const stroke = grow ? ` stroke="${paint}" stroke-width="${2 * grow}" stroke-linejoin="round"` : '';
  return `<path d="M${fixed(CX - half)} ${HORIZON} A${SUN_RADIUS} ${SUN_RADIUS} 0 ${SUN_RISE > 0 ? 1 : 0} 1 `
    + `${fixed(CX + half)} ${HORIZON} Z" fill="${paint}"${stroke}/>`;
}

const rays = (paint, grow = 0) =>
  RAYS.map((r) => line(ray(r), paint, RAY_WIDTH + 2 * grow)).join('');

// A highlight riding the upper edge of a stroke.
function gloss(points, width) {
  const [x1, y1, x2, y2] = points;
  const length = Math.hypot(x2 - x1, y2 - y1) || 1;
  let nx = (y2 - y1) / length;
  let ny = -(x2 - x1) / length;
  if (ny > 0) [nx, ny] = [-nx, -ny];
  const o = width * 0.26;
  return line([x1 + nx * o, y1 + ny * o, x2 + nx * o, y2 + ny * o], '#FFFFFF', width * 0.34);
}

const RAY_GLOSS = RAYS.map((r) => gloss(ray(r), RAY_WIDTH)).join('');
const GLOSS_RADIUS = SUN_RADIUS * 0.78;
const GLOSS_Y = SUN_Y - SUN_RADIUS * 0.16;
const SUN_GLOSS = `<path d="M${fixed(CX - GLOSS_RADIUS)} ${fixed(GLOSS_Y)} A${fixed(GLOSS_RADIUS)} ${fixed(GLOSS_RADIUS)} 0 0 1 `
  + `${fixed(CX + GLOSS_RADIUS)} ${fixed(GLOSS_Y)}" fill="none" stroke="#FFFFFF" `
  + `stroke-width="${fixed(SUN_RADIUS * 0.16)}" stroke-linecap="round"/>`;

function linearGradient(id, stops, [x1, y1, x2, y2]) {
  return `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" gradientUnits="userSpaceOnUse">`
    + stops.map(([offset, color]) => `<stop offset="${offset}" stop-color="${color}"/>`).join('')
    + '</linearGradient>';
}

const gradient = (id, stops, x1 = CX - 390, x2 = CX + 390) => linearGradient(id, stops, [x1, 0, x2, 0]);
const verticalGradient = (id, stops, y1, y2) => linearGradient(id, stops, [0, y1, 0, y2]);

function paints(colorway) {
  return gradient('rays', colorway.rays) + gradient('sun', colorway.sun, CX - SUN_RADIUS, CX + SUN_RADIUS);
}

function placed(body, scale, centerY) {
  const dy = centerY - MARK_CENTER * scale;
  return `<g transform="translate(${fixed(CX - CX * scale)} ${fixed(dy)}) scale(${scale})">${body}</g>`;
}

const svg = (defs, body) =>
  '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">'
  + `<defs>${defs}</defs>${body}</svg>`;

// One colored part with its gloss baked in, masked to the strokes (a
// clipPath would ignore stroke widths).
function nativePart(colorway, part) {
  const [shape, highlight, paint] = {
    sun: [sun, SUN_GLOSS, 'url(#sun)'],
    rays: [rays, RAY_GLOSS, 'url(#rays)'],
  }[part];
  const defs = paints(colorway)
    + `<mask id="m" maskUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024">${shape('#FFFFFF')}</mask>`
    + '<filter id="soft" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="6"/></filter>';
  const body = shape(paint) + `<g mask="url(#m)"><g filter="url(#soft)" opacity="0.38">${highlight}</g></g>`;
  return svg(defs, placed(body, NATIVE_SCALE, 512));
}

function nativeRim() {
  const white = '#FFFFFF';
  const defs = '<filter id="drop" x="-20%" y="-20%" width="140%" height="160%">'
    + `<feDropShadow dx="0" dy="${SHADOW_DY}" stdDeviation="${SHADOW_BLUR}" flood-color="#000000" `
    + `flood-opacity="${SHADOW_OPACITY}"/></filter>`;
  return svg(defs, placed(`<g filter="url(#drop)">${rays(white, RIM)}${sun(white, RIM)}</g>`, NATIVE_SCALE, 512));
}

// A full-bleed tile image, for a tile that needs more than the single color an
// Icon Composer fill takes.
function nativeTile(stops) {
  return svg(verticalGradient('tile', stops, 0, 1024), '<rect width="1024" height="1024" fill="url(#tile)"/>');
}

// The flat Dock copy: the tile clipped to the flat 824px rounded rect with the
// flat icons' drop shadow, then the glass approximated in layers: a soft glow
// of the colors, the white rim with its own shadow, the strokes, the gloss.
function flatIcon(colorway, tile, dark) {
  const defs = verticalGradient('tile', tile, 100, 924)
    + `<filter id="shadow" x="-20%" y="-20%" width="140%" height="150%">
      <feDropShadow dx="0" dy="15" stdDeviation="18" flood-color="#000000" flood-opacity="${dark ? 0.5 : 0.24}"/></filter>
    <filter id="glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="26"/></filter>
    <filter id="lift" x="-20%" y="-20%" width="140%" height="150%">
      <feDropShadow dx="0" dy="${SHADOW_DY}" stdDeviation="${SHADOW_BLUR}" flood-color="#000000" flood-opacity="${SHADOW_OPACITY}"/></filter>
    <filter id="soft" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="4"/></filter>`
    + paints(colorway);
  const rim = dark ? '#F4EEF8' : '#FFFFFF';
  const mark = `<g filter="url(#glow)" opacity="${dark ? 0.7 : 0.55}">`
      + `${rays('url(#rays)', 5)}${sun('url(#sun)')}</g>`
    + `<g filter="url(#lift)" opacity="0.92">${rays(rim, RIM)}${sun(rim, RIM)}</g>`
    + `<g opacity="0.92">${rays('url(#rays)')}${sun('url(#sun)')}</g>`
    + `<g filter="url(#soft)" opacity="0.55">${RAY_GLOSS}${SUN_GLOSS}</g>`;
  const body = '<rect x="100" y="100" width="824" height="824" rx="184" fill="url(#tile)" filter="url(#shadow)"/>'
    + placed(mark, FLAT_SCALE, 512);
  return svg(defs, body);
}

/**
 * The SVG sources for both glass colorways, keyed by the file each becomes.
 * Paths are relative to the repository root.
 */
function colorwaySources() {
  const sources = {};
  for (const [prefix, colorway] of Object.entries(COLORWAYS)) {
    for (const part of ['sun', 'rays']) {
      sources[`build/app-icons/colorways/${prefix}-${part}.png`] = nativePart(colorway, part);
    }
    sources[`build/app-icons/colorways/${prefix}-rim.png`] = nativeRim();
    if (colorway.tileLayer) {
      sources[`build/app-icons/colorways/${prefix}-tile.png`] = nativeTile(colorway.tile);
      sources[`build/app-icons/colorways/${prefix}-tile-dark.png`] = nativeTile(DARK_TILE);
    }
    sources[`src/renderer/pages/icon-sunrise-${prefix}.png`] = flatIcon(colorway, colorway.tile, false);
    sources[`src/renderer/pages/icon-sunrise-${prefix}-dark.png`] = flatIcon(colorway, DARK_TILE, true);
  }
  return sources;
}

module.exports = { colorwaySources };
