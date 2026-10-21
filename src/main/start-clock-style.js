'use strict';
// Pure rules for the Billboard clock's Font & Color choices (spec
// docs/superpowers/specs/2026-10-21-billboard-clock-style-design.md).
// No Electron here: main sends the page the finished values (the weight
// already inside the font's range, the ink as one hex), so the rules are
// unit-tested in one place and the fork ports this file unchanged.

const Identity = require('../renderer/space-identity');

// Each face is one the app already bundles (OFL, src/renderer/pages/), with
// the weight range its variable file carries.
const FONTS = Object.freeze({
  instrument: Object.freeze({ min: 400, max: 700 }),
  condensed: Object.freeze({ min: 400, max: 700 }),
  inter: Object.freeze({ min: 100, max: 900 }),
  mono: Object.freeze({ min: 400, max: 800 }),
});
const FONT_IDS = Object.freeze(Object.keys(FONTS));
const STYLES = Object.freeze(['solid', 'glass']);
const PRESET_IDS = Object.freeze(Identity.PRESETS.map((p) => p.id));
// `auto` draws the page's own text color, so the clock follows the theme and
// the wallpaper's text set as it always has.
const COLORS = Object.freeze(['auto', ...PRESET_IDS]);
// The clock as it was before these choices existed.
const DEFAULTS = Object.freeze({ font: 'instrument', weight: 500, color: 'auto', tone: 50, style: 'solid', height: 100 });
const WEIGHT_MIN = 100;
const WEIGHT_MAX = 900;
// How tall the figures stand, in percent of their typeset height: the Lock
// Screen's stretch, which lengthens stems rather than scaling strokes.
const HEIGHT_MIN = 100;
const HEIGHT_MAX = 300;
// Tone 50 is the preset exactly. Below it the color deepens toward black,
// above it it lightens toward white, short of either so it stays a color.
const TONE_DARKEN = 0.7;
const TONE_LIGHTEN = 0.88;

const normalizeFont = (value) => (FONT_IDS.includes(value) ? value : null);
const normalizeStyle = (value) => (STYLES.includes(value) ? value : null);
const normalizeColor = (value) => (COLORS.includes(value) ? value : null);
const normalizeWeight = (value) => (Number.isInteger(value) && value >= WEIGHT_MIN && value <= WEIGHT_MAX ? value : null);
const normalizeTone = (value) => (Number.isInteger(value) && value >= 0 && value <= 100 ? value : null);
const normalizeHeight = (value) => (Number.isInteger(value) && value >= HEIGHT_MIN && value <= HEIGHT_MAX ? value : null);

const channels = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const toHex = (rgb) => `#${rgb.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`;
/** `a` moved `t` (0–1) of the way to `b`, in sRGB. */
function mix(a, b, t) {
  const x = channels(a), y = channels(b);
  return toHex(x.map((v, i) => v + (y[i] - v) * t));
}

/** The preset at a tone, or null for `auto` (or an unknown color). */
function inkFor(color, tone) {
  const hex = Identity.PRESETS.find((p) => p.id === color)?.hex;
  if (!hex) return null;
  const t = normalizeTone(tone) ?? DEFAULTS.tone;
  if (t < 50) return mix(hex, '#000000', ((50 - t) / 50) * TONE_DARKEN);
  if (t > 50) return mix(hex, '#ffffff', ((t - 50) / 50) * TONE_LIGHTEN);
  return hex;
}

/** The saved weight drawn in a font: held inside the range its file carries. */
function weightIn(font, weight) {
  const range = FONTS[normalizeFont(font) ?? DEFAULTS.font];
  const w = normalizeWeight(weight) ?? DEFAULTS.weight;
  return Math.min(range.max, Math.max(range.min, w));
}

/**
 * What the Start Page draws and offers, from the saved settings. Unknown
 * values read as the defaults. The saved weight is kept as chosen, so moving
 * to a narrower font and back restores it; `weight` is what is drawn.
 */
function clockStyle({ font, weight, color, tone, style, height } = {}) {
  const f = normalizeFont(font) ?? DEFAULTS.font;
  const c = normalizeColor(color) ?? DEFAULTS.color;
  const t = normalizeTone(tone) ?? DEFAULTS.tone;
  return {
    font: f,
    weight: weightIn(f, weight),
    range: { min: FONTS[f].min, max: FONTS[f].max },
    color: c,
    tone: t,
    ink: inkFor(c, t),
    // The preset itself and how far the tone moves it, so the page can follow
    // the tone slider while it is dragged with the same mix.
    base: Identity.PRESETS.find((p) => p.id === c)?.hex ?? null,
    toneMix: { darken: TONE_DARKEN, lighten: TONE_LIGHTEN },
    style: normalizeStyle(style) ?? DEFAULTS.style,
    height: normalizeHeight(height) ?? DEFAULTS.height,
    presets: Identity.PRESETS.map(({ id, hex }) => ({ id, hex })),
  };
}

/** clockStyle() from a settings record's newtabClock* keys. */
function clockStyleFromSettings(current = {}) {
  return clockStyle({
    font: current.newtabClockFont,
    weight: current.newtabClockWeight,
    color: current.newtabClockColor,
    tone: current.newtabClockTone,
    style: current.newtabClockStyle,
    height: current.newtabClockHeight,
  });
}

/** The settings write for one Font & Color change; unknown fields are dropped. */
function settingsForClock(partial) {
  if (!partial || typeof partial !== 'object') return {};
  const write = {};
  if (normalizeFont(partial.font) !== null) write.newtabClockFont = partial.font;
  if (normalizeWeight(partial.weight) !== null) write.newtabClockWeight = partial.weight;
  if (normalizeColor(partial.color) !== null) write.newtabClockColor = partial.color;
  if (normalizeTone(partial.tone) !== null) write.newtabClockTone = partial.tone;
  if (normalizeStyle(partial.style) !== null) write.newtabClockStyle = partial.style;
  if (normalizeHeight(partial.height) !== null) write.newtabClockHeight = partial.height;
  return write;
}

module.exports = {
  FONTS,
  FONT_IDS,
  STYLES,
  COLORS,
  DEFAULTS,
  normalizeFont,
  normalizeStyle,
  normalizeColor,
  normalizeWeight,
  normalizeTone,
  normalizeHeight,
  inkFor,
  weightIn,
  clockStyle,
  clockStyleFromSettings,
  settingsForClock,
};
