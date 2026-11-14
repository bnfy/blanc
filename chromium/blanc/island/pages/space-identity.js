'use strict';

// Blanc Spaces identity: the preset palette, the 16 symbols, default
// assignment, and how a space's colour is drawn. Pure and DOM-free — the strip
// and overlay documents load it as window.SpaceIdentity; main and Node tests
// require it. A space's tile is filled with exactly the colour chosen, in every
// theme; the symbol and name on it are white or black, whichever reads (spec §2).
// Symbol geometry is Lucide's (ISC; see THIRD-PARTY-NOTICES.md).
(function (root) {
  // Drawn exactly as stored, in every theme. tokens/tokens.json mirrors these
  // (space-*).
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
  // The Spaces glyph itself, not a space's symbol: a ringed planet, so people
  // coming from Arc recognise Spaces. The Island's quiet mark draws it from
  // here; the ⌘L footer button's static copy in overlay.html is pinned to it
  // (test/unit/spaces-glyph.test.js). A large planet and a flat ring tilted
  // down to the right, open where it passes behind the planet.
  const SPACES_GLYPH = Object.freeze([
    Object.freeze(['circle', Object.freeze({ cx: 12, cy: 12, r: 7 })]),
    Object.freeze(['path', Object.freeze({ d: 'M20.29 13.84A11.3 3.1 27 1 1 5.64 6.37' })]),
  ]);

  // Every surface a space's tile can sit on, per theme (spec §2). A tile whose
  // colour is too close to one of them to stand out gets a hairline edge there.
  // A new fill under a space tile must be added here.
  const SURFACES = Object.freeze({
    light: Object.freeze(['#ffffff', '#f7f7f7', '#f5f5f5']),
    dark: Object.freeze(['#1f1f1f', '#171717', '#282828']),
    private: Object.freeze(['#191919', '#131313', '#222222']),
  });
  const MIN_CONTRAST = 4.5;  // the symbol and name on the colour
  const EDGE_CONTRAST = 3;   // the colour against the surface behind it
  const WHITE = '#ffffff', BLACK = '#000000';
  const WASH = Object.freeze({ light: 0.15, dark: 0.2, private: 0.2 });

  /** `#rrggbb` in lower case, from `#RRGGBB`, `rrggbb` or padded input; else null. */
  function normalizeHex(value) {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim().toLowerCase();
    const hex = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
    return /^#[0-9a-f]{6}$/.test(hex) ? hex : null;
  }
  const isSymbol = (value) => typeof value === 'string' && Object.prototype.hasOwnProperty.call(SYMBOLS, value);

  // ---- WCAG contrast ----
  const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const channels = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const luminance = (hex) => { const [r, g, b] = channels(hex).map(toLinear); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  function contrast(a, b) { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }

  /** How a stored colour is drawn on a theme: `fill` is the colour itself,
   * never adjusted; `on` is the symbol and name on it, white or black,
   * whichever contrasts more (always at least 4.5:1, about 4.58:1 at worst);
   * `edge` is true where the fill is under 3:1 against a surface it sits on. */
  function paint(hex, theme = 'light') {
    const fill = normalizeHex(hex);
    if (!fill || !SURFACES[theme]) return null;
    const on = contrast(fill, WHITE) >= contrast(fill, BLACK) ? WHITE : BLACK;
    const edge = SURFACES[theme].some((surface) => contrast(fill, surface) < EDGE_CONTRAST);
    return { fill, on, edge };
  }
  /** The colour as a faint tint (the dev-only tint switch's band), or null. */
  function wash(hex, theme = 'light') {
    const color = normalizeHex(hex);
    if (!color || !WASH[theme]) return null;
    const [r, g, b] = channels(color).map((v) => Math.round(v * 255));
    return `rgba(${r}, ${g}, ${b}, ${WASH[theme]})`;
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

  const api = { PRESETS, SYMBOLS, SYMBOL_IDS, SPACES_GLYPH, SURFACES, MIN_CONTRAST, EDGE_CONTRAST, normalizeHex, isSymbol, paint, wash, defaultsFor, presetFor, contrast };
  if (typeof module !== 'undefined') module.exports = api;
  else root.SpaceIdentity = api;
})(typeof window !== 'undefined' ? window : globalThis);
