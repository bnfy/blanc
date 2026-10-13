'use strict';

// Blanc Spaces identity: the preset palette, the 16 symbols, default
// assignment, and the readability guard that derives the colour actually
// drawn. Pure and DOM-free — the strip and overlay documents load it as
// window.SpaceIdentity; main and Node tests require it. The stored hex is
// always the user's choice; only the drawn ink may differ (spec §2).
// Symbol geometry is Lucide's (ISC; see THIRD-PARTY-NOTICES.md).
(function (root) {
  // Fixed points of the light-mode guard, so a preset swatch is exactly the
  // colour drawn in light mode. tokens/tokens.json mirrors these (space-*).
  const PRESETS = Object.freeze([
    Object.freeze({ id: 'sage', hex: '#426c4c' }),
    Object.freeze({ id: 'sky', hex: '#376694' }),
    Object.freeze({ id: 'iris', hex: '#6757a3' }),
    Object.freeze({ id: 'rose', hex: '#9b4761' }),
    Object.freeze({ id: 'clay', hex: '#974f2a' }),
    Object.freeze({ id: 'sand', hex: '#815c02' }),
    Object.freeze({ id: 'slate', hex: '#576471' }),
    Object.freeze({ id: 'graphite', hex: '#3a3a3a' }),
  ]);

  // Each symbol is a list of SVG elements on a 24×24 grid: [tag, attributes].
  const SYMBOLS = Object.freeze({
    briefcase: [['rect', { x: 2, y: 7, width: 20, height: 14, rx: 2 }], ['path', { d: 'M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16' }]],
    house: [['path', { d: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1Z' }]],
    code: [['path', { d: 'm16 18 6-6-6-6M8 6l-6 6 6 6' }]],
    flask: [['path', { d: 'M9 3h6M10 3v6L4.5 19a1.5 1.5 0 0 0 1.3 2h12.4a1.5 1.5 0 0 0 1.3-2L14 9V3' }]],
    book: [['path', { d: 'M4 19.5V5a2 2 0 0 1 2-2h14v16H6a2 2 0 0 0-2 2Zm0 0A2 2 0 0 0 6 22h14' }]],
    music: [['path', { d: 'M9 18V5l12-2v13' }], ['circle', { cx: 6, cy: 18, r: 3 }], ['circle', { cx: 18, cy: 16, r: 3 }]],
    camera: [['path', { d: 'M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z' }], ['circle', { cx: 12, cy: 13, r: 3 }]],
    plane: [['path', { d: 'M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z' }]],
    heart: [['path', { d: 'M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7Z' }]],
    star: [['path', { d: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z' }]],
    leaf: [['path', { d: 'M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z' }], ['path', { d: 'M2 21c0-3 1.85-5.36 5.08-6' }]],
    coffee: [['path', { d: 'M17 8h1a4 4 0 1 1 0 8h-1' }], ['path', { d: 'M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z' }]],
    cap: [['path', { d: 'M22 10 12 5 2 10l10 5 10-5Z' }], ['path', { d: 'M6 12v5c3 3 9 3 12 0v-5' }]],
    gamepad: [['path', { d: 'M6 12h4M8 10v4M15 13h.01M18 11h.01' }], ['rect', { x: 2, y: 6, width: 20, height: 12, rx: 2 }]],
    wallet: [['path', { d: 'M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1' }], ['path', { d: 'M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4' }]],
    sun: [['circle', { cx: 12, cy: 12, r: 4 }], ['path', { d: 'M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4' }]],
  });
  const SYMBOL_IDS = Object.freeze(Object.keys(SYMBOLS));

  // Every surface a space mark or tile can sit on, per theme (spec §2). A new
  // fill under a space tile must be added here.
  const SURFACES = Object.freeze({
    light: Object.freeze({ bases: Object.freeze(['#ffffff', '#f7f7f7', '#f5f5f5']), wash: 0.15, lighten: false }),
    dark: Object.freeze({ bases: Object.freeze(['#1f1f1f', '#171717', '#282828']), wash: 0.2, lighten: true }),
    private: Object.freeze({ bases: Object.freeze(['#191919', '#131313', '#222222']), wash: 0.2, lighten: true }),
  });
  const MIN_CONTRAST = 4.5;

  /** `#rrggbb` in lower case, from `#RRGGBB`, `rrggbb` or padded input; else null. */
  function normalizeHex(value) {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim().toLowerCase();
    const hex = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
    return /^#[0-9a-f]{6}$/.test(hex) ? hex : null;
  }
  const isSymbol = (value) => typeof value === 'string' && Object.prototype.hasOwnProperty.call(SYMBOLS, value);

  // ---- colour maths: sRGB ↔ OKLCH, WCAG contrast, 8-bit compositing ----
  const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const toGamma = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
  const channels = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const toHex = (rgb) => `#${rgb.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('')}`;
  function toOklch(hex) {
    const [r, g, b] = channels(hex).map(toLinear);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    const L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
    const A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
    const B = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
    return [L, Math.hypot(A, B), Math.atan2(B, A)];
  }
  function oklchToLinear(L, C, H) {
    const A = C * Math.cos(H), B = C * Math.sin(H);
    const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
    const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
    const s = (L - 0.0894841775 * A - 1.2914855480 * B) ** 3;
    return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s];
  }
  const inGamut = (lin) => lin.every((v) => v >= -1e-6 && v <= 1 + 1e-6);
  /** The hex for (L, C, H), lowering chroma only as far as sRGB gamut needs. */
  function oklchHex(L, C, H) {
    let chroma = C;
    if (!inGamut(oklchToLinear(L, chroma, H))) {
      let lo = 0, hi = chroma;
      for (let i = 0; i < 30; i++) { const mid = (lo + hi) / 2; if (inGamut(oklchToLinear(L, mid, H))) lo = mid; else hi = mid; }
      chroma = lo;
    }
    return toHex(oklchToLinear(L, chroma, H).map(toGamma));
  }
  const luminance = (hex) => { const [r, g, b] = channels(hex).map(toLinear); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  function contrast(a, b) { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
  /** `ink` at `alpha` painted over `base`, rounded to 8-bit as the screen does. */
  function composite(ink, alpha, base) { const f = channels(ink), b = channels(base); return toHex(f.map((v, i) => alpha * v + (1 - alpha) * b[i])); }
  /** The lowest contrast `ink` has against any surface or its own wash over it. */
  function worstContrast(ink, theme) {
    const s = SURFACES[theme];
    return Math.min(...s.bases.flatMap((base) => [contrast(ink, base), contrast(ink, composite(ink, s.wash, base))]));
  }

  /** The ink drawn for a stored colour on a theme: unchanged when readable,
   * otherwise the smallest OKLCH-lightness change that reaches 4.5:1. */
  function inkFor(hex, theme = 'light') {
    const color = normalizeHex(hex);
    if (!color || !SURFACES[theme]) return null;
    if (worstContrast(color, theme) >= MIN_CONTRAST) return color;
    const { lighten } = SURFACES[theme];
    const [L, C, H] = toOklch(color);
    const passes = (l) => worstContrast(oklchHex(l, C, H), theme) >= MIN_CONTRAST;
    let lo = lighten ? L : 0, hi = lighten ? 1 : L;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (lighten) { if (passes(mid)) hi = mid; else lo = mid; } else if (passes(mid)) lo = mid; else hi = mid;
    }
    let l = lighten ? hi : lo, out = oklchHex(l, C, H);
    // Rounding to 8 bits can land just under the floor; keep stepping.
    while (worstContrast(out, theme) < MIN_CONTRAST && l > 0 && l < 1) { l += lighten ? 0.001 : -0.001; out = oklchHex(l, C, H); }
    return out;
  }
  /** `{ ink, wash }` CSS colours for a stored colour on a theme. */
  function paint(hex, theme = 'light') {
    const ink = inkFor(hex, theme);
    if (!ink) return null;
    const [r, g, b] = channels(ink).map((v) => Math.round(v * 255));
    return { ink, wash: `rgba(${r}, ${g}, ${b}, ${SURFACES[theme].wash})` };
  }

  /** The first preset colour and first symbol not used by `existing` records,
   * in list order, cycling once every one is used. */
  function defaultsFor(existing = []) {
    const usedColors = new Set(existing.map((w) => normalizeHex(w?.color)).filter(Boolean));
    const usedSymbols = new Set(existing.map((w) => w?.symbol).filter(isSymbol));
    const color = (PRESETS.find((p) => !usedColors.has(p.hex)) ?? PRESETS[existing.length % PRESETS.length]).hex;
    const symbol = SYMBOL_IDS.find((id) => !usedSymbols.has(id)) ?? SYMBOL_IDS[existing.length % SYMBOL_IDS.length];
    return { color, symbol };
  }

  /** The preset whose stored hex equals `hex`, or null for a custom colour. */
  const presetFor = (hex) => PRESETS.find((p) => p.hex === normalizeHex(hex)) ?? null;

  const api = { PRESETS, SYMBOLS, SYMBOL_IDS, SURFACES, MIN_CONTRAST, normalizeHex, isSymbol, inkFor, paint, defaultsFor, presetFor, worstContrast, contrast, composite };
  if (typeof module !== 'undefined') module.exports = api;
  else root.SpaceIdentity = api;
})(typeof window !== 'undefined' ? window : globalThis);
