'use strict';

// Sunrise Spectrum and Sunrise Amber, the glass colorways: the Sunrise as an
// outlined ring sun, seven rays and six stepped water lines, on the shipped
// artwork's own geometry. Where the ring passes behind a water line, the line
// takes on the ring's color, the way Arc's icon lets its strokes overlap. The
// shipped Sunrise artwork stays the source of every other surface. Each
// colorway yields:
//   - four Icon Composer layers on the full-bleed 1024 canvas: the sun (the
//     ring above the horizon), the rays and the water in color, and the white
//     rim drawn behind them with its drop shadow (a muted warm one in Dark);
//   - flat Dock fallbacks for Light and Dark on the 824px visible tile, with
//     the glass approximated (glow, rim, colors).

const { cx: CX, cy: HORIZON, rx, ry, rayWidth: RAY_WIDTH, rays: RAYS, water: WATER } = require('./sunrise-geometry');
const RING_CUT = WATER[0].y;
const RIM = 3;
// A soft drop shadow drawn under the white rim, as Arc's icon has one.
const SHADOW_DY = 12;
const SHADOW_BLUR = 16;
const SHADOW_OPACITY = 0.32;
// In Dark the rim is a muted warm gray: a white one glares on the near-black
// tile (owner, 2026-11-14).
const DARK_RIM = '#5C534A';
const MARK_TOP = RAYS[3].ends[3] - RAY_WIDTH / 2;
const MARK_BOTTOM = WATER.at(-1).y + WATER.at(-1).height;
const FLAT_SCALE = 824 / 1024;

const COLORWAYS = {
  spectrum: {
    // Arc's coral and red above the horizon, its royal blue and navy below.
    sun: [[0, '#FF7A86'], [0.5, '#F94A64'], [1, '#E23A55']],
    water: [[0, '#1942CD'], [0.4, '#2338C8'], [0.55, '#20108F'], [1, '#1A007F']],
    // Arc's Dock tile: darker gray at the top, lighter below. Drawn as a tile
    // image, since an Icon Composer fill takes a single color.
    tile: [[0, '#A9B0BA'], [0.3, '#B3B9C2'], [0.85, '#CED3DB'], [1, '#D2D7DE']],
    tileLayer: true,
  },
  amber: {
    sun: [[0, '#E2AE4E'], [0.5, '#CD8530'], [1, '#B8692A']],
    water: [[0, '#A4582A'], [0.4, '#8E4A22'], [0.55, '#6E3818'], [1, '#5A2C12']],
    tile: [[0, '#FEF8ED'], [1, '#F3EBDF']],
  },
};
// Icon Composer renders both Dark tiles this near-black, whatever the fill.
const DARK_TILE = [[0, '#1F1F1E'], [1, '#100F0F']];

const fixed = (n) => Number(n.toFixed(1));

function line([x1, y1, x2, y2], paint, width) {
  return `<line x1="${fixed(x1)}" y1="${fixed(y1)}" x2="${fixed(x2)}" y2="${fixed(y2)}" stroke="${paint}" `
    + `stroke-width="${fixed(width)}" stroke-linecap="round"/>`;
}

const rays = (paint, grow = 0) =>
  RAYS.map(({ ends }) => line(ends, paint, RAY_WIDTH + 2 * grow)).join('');
const ring = (paint) =>
  `<ellipse cx="${CX}" cy="${HORIZON}" rx="${rx - 14}" ry="${ry - 14}" fill="none" stroke="${paint}" stroke-width="28"/>`;
const water = (paint, grow = 0) =>
  WATER.map(({ x, y, width, height }) => line(
    [x + height / 2, y + height / 2, x + width - height / 2, y + height / 2], paint, height + 2 * grow,
  )).join('');

// The ring above the water, and the ring's color mixed into the water where it
// passes behind a line (masked, since a clipPath would ignore stroke widths).
const ABOVE = `<clipPath id="above"><rect width="1024" height="${RING_CUT}"/></clipPath>`;
const sunAbove = (paint, grow = 0) => `<g clip-path="url(#above)"><ellipse cx="${CX}" cy="${HORIZON}" rx="${rx + grow}" ry="${ry + grow}" fill="${paint}"/></g>`;
const BEHIND = `<mask id="behind" maskUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024">${water('#FFFFFF')}</mask>`;
const waterWithRing = () => water('url(#water)')
  + `<g mask="url(#behind)" opacity="0.55" style="mix-blend-mode:screen">${ring('url(#sun)')}</g>`;

function linearGradient(id, stops, [x1, y1, x2, y2]) {
  return `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" gradientUnits="userSpaceOnUse">`
    + stops.map(([offset, color]) => `<stop offset="${offset}" stop-color="${color}"/>`).join('')
    + '</linearGradient>';
}

const verticalGradient = (id, stops, y1, y2) => linearGradient(id, stops, [0, y1, 0, y2]);

function paints(colorway) {
  return verticalGradient('sun', colorway.sun, MARK_TOP, MARK_BOTTOM)
    + verticalGradient('water', colorway.water, HORIZON, MARK_BOTTOM)
    + ABOVE + BEHIND;
}

function placed(body, scale, centerY) {
  const dy = centerY - 512 * scale;
  return `<g transform="translate(${fixed(CX - CX * scale)} ${fixed(dy)}) scale(${scale})">${body}</g>`;
}

const svg = (defs, body) =>
  '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">'
  + `<defs>${defs}</defs>${body}</svg>`;

function nativePart(colorway, part) {
  const body = {
    sun: () => sunAbove('url(#sun)'),
    rays: () => rays('url(#sun)'),
    water: waterWithRing,
  }[part]();
  return svg(paints(colorway), placed(body, 1, 512));
}

const SHADOW = '<filter id="drop" x="-20%" y="-20%" width="140%" height="160%">'
  + `<feDropShadow dx="0" dy="${SHADOW_DY}" stdDeviation="${SHADOW_BLUR}" flood-color="#000000" `
  + `flood-opacity="${SHADOW_OPACITY}"/></filter>`;

function outline(color) {
  return `<g filter="url(#drop)">${rays(color, RIM)}${sunAbove(color, RIM)}${water(color, RIM)}</g>`;
}

function nativeRim(color = '#FFFFFF') {
  return svg(SHADOW + ABOVE, placed(outline(color), 1, 512));
}

// A full-bleed tile image, for a tile that needs more than the single color an
// Icon Composer fill takes.
function nativeTile(stops) {
  return svg(verticalGradient('tile', stops, 0, 1024), '<rect width="1024" height="1024" fill="url(#tile)"/>');
}

// The flat Dock copy: the tile clipped to the flat 824px rounded rect with the
// flat icons' drop shadow, then the glass approximated in layers: a soft glow
// of the colors, the white rim with its shadow, the colored strokes.
function flatIcon(colorway, tile, dark) {
  const defs = verticalGradient('tile', tile, 100, 924)
    + `<filter id="shadow" x="-20%" y="-20%" width="140%" height="150%">
      <feDropShadow dx="0" dy="15" stdDeviation="18" flood-color="#000000" flood-opacity="${dark ? 0.5 : 0.24}"/></filter>
    <filter id="glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="26"/></filter>`
    + SHADOW + paints(colorway);
  const mark = `<g filter="url(#glow)" opacity="${dark ? 0.7 : 0.55}">`
      + `${rays('url(#sun)', 5)}${sunAbove('url(#sun)', 5)}${water('url(#water)', 5)}</g>`
    + `<g opacity="${dark ? 0.95 : 0.92}">${outline(dark ? DARK_RIM : '#FFFFFF')}</g>`
    + `<g opacity="0.92">${rays('url(#sun)')}${sunAbove('url(#sun)')}${waterWithRing()}</g>`;
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
    sources[`build/app-icons/colorways/${prefix}-rim-dark.png`] = nativeRim(DARK_RIM);
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
