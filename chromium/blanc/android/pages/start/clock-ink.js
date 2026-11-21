// The Billboard clock's tone rule, in one place: main computes the saved ink
// with it (src/main/start-clock-style.js requires this file) and the Start
// Page previews the Tone slider with it while it is dragged, so the two can
// never disagree. Pure (no DOM), served flat from this directory.
(() => {
  'use strict';

  // Tone 50 is the preset exactly. Below it the color deepens toward black,
  // above it it lightens toward white, short of either so it stays a color.
  const TONE_DARKEN = 0.7;
  const TONE_LIGHTEN = 0.88;

  /** `a` moved `t` (0–1) of the way to `b` in sRGB, as #rrggbb. */
  function mixHex(a, b, t) {
    const channels = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const x = channels(a), y = channels(b);
    return `#${x.map((v, i) => Math.round(Math.min(255, Math.max(0, v + (y[i] - v) * t))).toString(16).padStart(2, '0')).join('')}`;
  }

  /** A preset hex at a tone (0–100). */
  function toneInk(base, tone) {
    if (tone < 50) return mixHex(base, '#000000', ((50 - tone) / 50) * TONE_DARKEN);
    if (tone > 50) return mixHex(base, '#ffffff', ((tone - 50) / 50) * TONE_LIGHTEN);
    return base;
  }

  const api = Object.freeze({ TONE_DARKEN, TONE_LIGHTEN, mixHex, toneInk });
  if (typeof module === 'object' && module.exports) module.exports = api;
  globalThis.blancClockInk = api;
})();
