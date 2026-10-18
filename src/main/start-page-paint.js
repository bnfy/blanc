'use strict';
// Pure paint for the Start Page's Color wallpaper (spec
// docs/superpowers/specs/2026-10-18-start-page-color-and-space-wallpaper-design.md).
// No Electron here: main sends the page finished hex values, so every stop's
// contrast is decided (and unit-tested) in one place, and the fork ports this
// file unchanged. The colors are the Spaces presets from space-identity.js.

const Identity = require('../renderer/space-identity');

const FILLS = Object.freeze(['soft', 'solid', 'gradient']);
const PRESET_IDS = Object.freeze(Identity.PRESETS.map((p) => p.id));
const DEFAULT_PRESET = 'sage';
const DEFAULT_FILL = 'gradient';
// Every stop keeps the page's ink at or above this (WCAG AA body text).
const MIN_INK = 4.5;
// The Start Page's own background per theme (pages.css .ledger-body --bg) and
// the dim ink drawn on Soft, which must still read on the tint.
const SOFT = Object.freeze({
  light: Object.freeze({ bg: '#f8f2e8', amount: 0.12, dim: '#6b6257' }),
  dark: Object.freeze({ bg: '#17130f', amount: 0.36, dim: '#b8aa98' }),
});
// How far the gradient may move from the color: lighter toward its glow, darker
// toward its deep corner. The glow is cut back until the ink keeps GLOW_INK,
// which leaves the dim ink room to stay at MIN_INK on every stop.
const MAX_GLOW = 0.2;
const GLOW_INK = 5.2;
const DEEP = 0.28;
// The dim ink (dates, labels) moves from the ink toward the color, no further
// than every stop still allows.
const MAX_DIM = 0.4;

const channels = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const toHex = (rgb) => `#${rgb.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`;
/** `a` moved `t` (0–1) of the way to `b`, in sRGB. */
function mix(a, b, t) {
  const x = channels(a), y = channels(b);
  return toHex(x.map((v, i) => v + (y[i] - v) * t));
}
/** The largest step of 0.01 up to `max` for which `ok(t)` holds (0 when none). */
function largest(max, ok) {
  for (let step = Math.round(max * 100); step > 0; step -= 1) {
    if (ok(step / 100)) return step / 100;
  }
  return 0;
}

/** The theme background tinted with the color, as far as `amount` allows
 * while the theme's dim ink still reads on it. */
function softTint(base, { bg, amount, dim }) {
  return mix(bg, base, largest(amount, (t) => Identity.contrast(mix(bg, base, t), dim) >= MIN_INK));
}

const normalizePreset = (value) => (PRESET_IDS.includes(value) ? value : null);
const normalizeFill = (value) => (FILLS.includes(value) ? value : null);
const presetHex = (id) => Identity.PRESETS.find((p) => p.id === id)?.hex ?? null;

/**
 * What the page draws for one color and fill: `base` is the color exactly;
 * `glow` and `deep` are the gradient's light and dark ends; `ink` and `dim`
 * are the text on Solid and Gradient (white or black, then a quieter tone);
 * `softLight` and `softDark` are the tint Soft draws under each theme, whose
 * text stays the theme's own. Null for anything that is not a color.
 */
function colorPaint(hex) {
  const base = Identity.normalizeHex(hex);
  if (!base) return null;
  const { on: ink } = Identity.paint(base, 'light');
  // The glow moves toward the ink (lighter under white), so it is the stop
  // that can fail; the deep corner moves away from it and only gains contrast.
  const towardInk = (t) => mix(base, ink, t);
  const glowAmount = largest(MAX_GLOW, (t) => Identity.contrast(towardInk(t), ink) >= GLOW_INK);
  const awayFromInk = ink === '#ffffff' ? '#000000' : '#ffffff';
  const glow = glowAmount ? towardInk(glowAmount) : base;
  const deep = mix(base, awayFromInk, DEEP);
  const stops = [base, glow, deep];
  const dimAmount = largest(MAX_DIM, (t) => stops.every((stop) => Identity.contrast(mix(ink, base, t), stop) >= MIN_INK));
  return {
    base,
    glow,
    deep,
    ink,
    dim: mix(ink, base, dimAmount),
    softLight: softTint(base, SOFT.light),
    softDark: softTint(base, SOFT.dark),
  };
}

/**
 * The Color wallpaper a page draws: the window's Space color while following
 * it and the window is in a Space, else the chosen preset. Null when nothing
 * can be painted.
 */
function colorWallpaper({ preset, fill, followSpace, spaceColor }) {
  const space = followSpace === true ? Identity.normalizeHex(spaceColor) : null;
  const hex = space ?? presetHex(normalizePreset(preset) ?? DEFAULT_PRESET);
  const paint = colorPaint(hex);
  if (!paint) return null;
  return { fill: normalizeFill(fill) ?? DEFAULT_FILL, fromSpace: space !== null, ...paint };
}

module.exports = {
  FILLS, PRESET_IDS, DEFAULT_PRESET, DEFAULT_FILL, MIN_INK, SOFT,
  mix, colorPaint, colorWallpaper, normalizePreset, normalizeFill, presetHex,
};
