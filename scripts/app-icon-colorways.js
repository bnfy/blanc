'use strict';

// Sunrise Spectrum and Sunrise Amber, the glass colorways. The Sunrise is
// redrawn here in heavy rounded strokes (seven rays, a half disc, three water
// lines) so it carries Icon Composer glass; the shipped Sunrise artwork stays
// the source of every other surface. Each colorway yields:
//   - four Icon Composer layers on the full-bleed 1024 canvas: the sun, rays
//     and water in color with a soft gloss baked along each stroke's top, and
//     the white rim drawn behind them;
//   - flat Dock fallbacks for Light and Dark on the 824px visible tile, with
//     the glass approximated (glow, rim, gloss) and tile colors sampled from
//     Icon Composer's own renders.

const CX = 512;
const HORIZON = 548;
// Vertical middle of the drawn mark, from the top ray's cap to the last
// water line's, before scaling.
const MARK_CENTER = 492;
// macOS paints the native tile full-bleed; the flat copy draws an 824px tile,
// so its mark takes the same share of the visible tile.
const NATIVE_SCALE = 1.27;
const FLAT_SCALE = NATIVE_SCALE * (824 / 1024);
const RAYS = [
  [0, 205, 330], [-34, 200, 300], [34, 200, 300],
  [-62, 195, 275], [62, 195, 275], [-86, 190, 250], [86, 190, 250],
];
const WATER = [[614, 250], [690, 170], [766, 92]];
const RAY_WIDTH = 44;
const WATER_WIDTH = 46;
const SUN_RADIUS = 140;
const RIM = 15;

const COLORWAYS = {
  spectrum: {
    rays: [[0, '#2F55FF'], [0.3, '#7C3BFF'], [0.58, '#F0409A'], [0.8, '#FF5A72'], [1, '#FF8C7A']],
    sun: [[0, '#9A3BF5'], [0.45, '#F0409A'], [1, '#FF6A6A']],
    water: [[0, '#2F55FF'], [0.5, '#6A3CFF'], [1, '#B23CE8']],
    tile: ['#FAFAFC', '#EFECEF'],
  },
  amber: {
    rays: [[0, '#F28A3A'], [0.3, '#F5AC3C'], [0.5, '#F8C64E'], [0.7, '#F5AC3C'], [1, '#F28A3A']],
    sun: [[0, '#F7A52E'], [0.6, '#F2803A'], [1, '#EC6248']],
    water: [[0, '#C9762A'], [0.5, '#B0571E'], [1, '#9A3F2A']],
    tile: ['#FEF8ED', '#F3EBDF'],
  },
};
// Icon Composer renders both Dark tiles this near-black, whatever the fill.
const DARK_TILE = ['#1F1F1E', '#100F0F'];

const fixed = (n) => Number(n.toFixed(1));

function ray([angle, inner, outer]) {
  const a = (angle * Math.PI) / 180;
  return [
    CX + inner * Math.sin(a), HORIZON - inner * Math.cos(a),
    CX + outer * Math.sin(a), HORIZON - outer * Math.cos(a),
  ];
}

const waterLine = ([y, half]) => [CX - half, y, CX + half, y];

function line([x1, y1, x2, y2], paint, width) {
  return `<line x1="${fixed(x1)}" y1="${fixed(y1)}" x2="${fixed(x2)}" y2="${fixed(y2)}" stroke="${paint}" `
    + `stroke-width="${fixed(width)}" stroke-linecap="round"/>`;
}

const arcPath = (r, lift = 0) =>
  `M${CX - r} ${HORIZON - lift} A${r} ${r} 0 0 1 ${CX + r} ${HORIZON - lift}`;

function sun(paint, grow = 0) {
  const stroke = grow ? ` stroke="${paint}" stroke-width="${2 * grow}" stroke-linejoin="round"` : '';
  return `<path d="${arcPath(SUN_RADIUS)} Z" fill="${paint}"${stroke}/>`;
}

const rays = (paint, grow = 0) =>
  RAYS.map((r) => line(ray(r), paint, RAY_WIDTH + 2 * grow)).join('');
const water = (paint, grow = 0) =>
  WATER.map((w) => line(waterLine(w), paint, WATER_WIDTH + 2 * grow)).join('');

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
const WATER_GLOSS = WATER.map((w) => gloss(waterLine(w), WATER_WIDTH)).join('');
const SUN_GLOSS = `<path d="${arcPath(SUN_RADIUS * 0.78, 22)}" fill="none" stroke="#FFFFFF" `
  + `stroke-width="${fixed(SUN_RADIUS * 0.16)}" stroke-linecap="round"/>`;

function gradient(id, stops, x1 = 210, x2 = 814) {
  return `<linearGradient id="${id}" x1="${x1}" y1="0" x2="${x2}" y2="0" gradientUnits="userSpaceOnUse">`
    + stops.map(([offset, color]) => `<stop offset="${offset}" stop-color="${color}"/>`).join('')
    + '</linearGradient>';
}

function paints(colorway) {
  return gradient('rays', colorway.rays)
    + gradient('sun', colorway.sun, 372, 652)
    + gradient('water', colorway.water, 262, 762);
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
    water: [water, WATER_GLOSS, 'url(#water)'],
  }[part];
  const defs = paints(colorway)
    + `<mask id="m" maskUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024">${shape('#FFFFFF')}</mask>`
    + '<filter id="soft" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="6"/></filter>';
  const body = shape(paint) + `<g mask="url(#m)"><g filter="url(#soft)" opacity="0.38">${highlight}</g></g>`;
  return svg(defs, placed(body, NATIVE_SCALE, 512));
}

function nativeRim() {
  const white = '#FFFFFF';
  return svg('', placed(rays(white, RIM) + sun(white, RIM) + water(white, RIM), NATIVE_SCALE, 512));
}

// The flat Dock copy: the tile clipped to the flat 824px rounded rect with the
// flat icons' drop shadow, then the glass approximated in layers: a soft glow
// of the colors, the white rim with its own shadow, the strokes, the gloss.
function flatIcon(colorway, [top, bottom], dark) {
  const defs = `<linearGradient id="tile" x1="0" y1="100" x2="0" y2="924" gradientUnits="userSpaceOnUse">
      <stop stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="150%">
      <feDropShadow dx="0" dy="15" stdDeviation="18" flood-color="#000000" flood-opacity="${dark ? 0.5 : 0.24}"/></filter>
    <filter id="glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="26"/></filter>
    <filter id="lift" x="-20%" y="-20%" width="140%" height="150%">
      <feDropShadow dx="0" dy="10" stdDeviation="10" flood-color="#000000" flood-opacity="0.16"/></filter>
    <filter id="soft" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="4"/></filter>`
    + paints(colorway);
  const rim = dark ? '#F4EEF8' : '#FFFFFF';
  const mark = `<g filter="url(#glow)" opacity="${dark ? 0.7 : 0.55}">`
      + `${rays('url(#rays)', 5)}${sun('url(#sun)')}${water('url(#water)', 5)}</g>`
    + `<g filter="url(#lift)" opacity="0.92">${rays(rim, RIM)}${sun(rim, RIM)}${water(rim, RIM)}</g>`
    + `<g opacity="0.92">${rays('url(#rays)')}${sun('url(#sun)')}${water('url(#water)')}</g>`
    + `<g filter="url(#soft)" opacity="0.55">${RAY_GLOSS}${SUN_GLOSS}${WATER_GLOSS}</g>`;
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
    for (const part of ['sun', 'rays', 'water']) {
      sources[`build/app-icons/colorways/${prefix}-${part}.png`] = nativePart(colorway, part);
    }
    sources[`build/app-icons/colorways/${prefix}-rim.png`] = nativeRim();
    sources[`src/renderer/pages/icon-sunrise-${prefix}.png`] = flatIcon(colorway, colorway.tile, false);
    sources[`src/renderer/pages/icon-sunrise-${prefix}-dark.png`] = flatIcon(colorway, DARK_TILE, true);
  }
  return sources;
}

module.exports = { colorwaySources };
