'use strict';

// The Spaces editor's custom colour picker: a saturation/brightness square, a
// hue slider and a hex field, drawn inside the overlay. The native colour
// panel would take focus and overlay blur would dismiss the menu mid-pick.
// onInput fires while the colour changes (the caller throttles writes);
// onCommit fires once a gesture or edit settles.
(function (root) {
  const clamp = (v) => Math.min(1, Math.max(0, v));
  const channels = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const toHex = (rgb) => `#${rgb.map((v) => Math.round(clamp(v) * 255).toString(16).padStart(2, '0')).join('')}`;
  function hsvToHex(h, s, v) {
    const f = (n) => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
    return toHex([f(5), f(3), f(1)]);
  }
  function hexToHsv(hex) {
    const [r, g, b] = channels(hex);
    const max = Math.max(r, g, b), d = max - Math.min(r, g, b);
    let h = 0;
    if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return { h: (h * 60 + 360) % 360, s: max ? d / max : 0, v: max };
  }
  const normalizeHex = (value) => {
    if (typeof value !== 'string') return null;
    const t = value.trim().toLowerCase();
    const hex = t.startsWith('#') ? t : `#${t}`;
    return /^#[0-9a-f]{6}$/.test(hex) ? hex : null;
  };

  function create({ document: doc, hex, t, onInput = () => {}, onCommit = () => {} }) {
    let hsv = hexToHsv(normalizeHex(hex) ?? '#808080');
    const el = (tag, className) => { const node = doc.createElement(tag); node.className = className; return node; };
    const element = el('div', 'space-picker');
    const square = el('div', 'space-picker-sv');
    const knob = el('span', 'space-picker-knob');
    square.append(knob);
    square.tabIndex = 0;
    square.setAttribute('role', 'slider');
    square.setAttribute('aria-label', t('spaces.picker.square'));
    const hue = el('input', 'space-picker-hue');
    hue.type = 'range'; hue.min = '0'; hue.max = '359'; hue.step = '1';
    hue.setAttribute('aria-label', t('spaces.picker.hue'));
    const hexRow = el('label', 'space-picker-hex-row');
    const hexLabel = el('span', 'space-picker-hex-label'); hexLabel.textContent = t('spaces.picker.hex');
    const hexInput = el('input', 'space-picker-hex');
    hexInput.type = 'text'; hexInput.maxLength = 7; hexInput.spellcheck = false; hexInput.autocomplete = 'off';
    hexRow.append(hexLabel, hexInput);
    element.append(square, hue, hexRow);

    const current = () => hsvToHex(hsv.h, hsv.s, hsv.v);
    function paint({ keepHexField = false } = {}) {
      const value = current();
      square.style.setProperty('--hue', String(Math.round(hsv.h)));
      square.style.setProperty('--x', `${(hsv.s * 100).toFixed(2)}%`);
      square.style.setProperty('--y', `${((1 - hsv.v) * 100).toFixed(2)}%`);
      square.style.setProperty('--pick', value);
      square.setAttribute('aria-valuetext', t('spaces.picker.squareValue', { saturation: Math.round(hsv.s * 100), brightness: Math.round(hsv.v * 100) }));
      hue.value = String(Math.round(hsv.h));
      if (!keepHexField) { hexInput.value = value.toUpperCase(); hexInput.setAttribute('aria-invalid', 'false'); }
    }
    const changed = (opts) => { paint(opts); onInput(current()); };

    function fromPointer(event) {
      const rect = square.getBoundingClientRect();
      hsv = { ...hsv, s: clamp((event.clientX - rect.left) / rect.width), v: 1 - clamp((event.clientY - rect.top) / rect.height) };
      changed();
    }
    let dragging = null;
    square.addEventListener('pointerdown', (event) => {
      dragging = event.pointerId;
      square.setPointerCapture?.(event.pointerId);
      square.focus?.();
      fromPointer(event);
    });
    square.addEventListener('pointermove', (event) => { if (dragging === event.pointerId) fromPointer(event); });
    const end = (event) => { if (dragging !== event.pointerId) return; dragging = null; onCommit(current()); };
    square.addEventListener('pointerup', end);
    square.addEventListener('pointercancel', end);
    square.addEventListener('keydown', (event) => {
      const step = event.shiftKey ? 0.1 : 0.01;
      const delta = { ArrowLeft: ['s', -step], ArrowRight: ['s', step], ArrowDown: ['v', -step], ArrowUp: ['v', step] }[event.key];
      if (!delta) return;
      event.preventDefault();
      hsv = { ...hsv, [delta[0]]: clamp(hsv[delta[0]] + delta[1]) };
      changed();
      onCommit(current());
    });
    hue.addEventListener('input', () => { hsv = { ...hsv, h: Number(hue.value) }; changed(); });
    hue.addEventListener('change', () => onCommit(current()));
    hexInput.addEventListener('input', () => {
      const value = normalizeHex(hexInput.value);
      hexInput.setAttribute('aria-invalid', String(!value && hexInput.value.replace('#', '').length >= 6));
      if (!value) return;
      hsv = hexToHsv(value);
      changed({ keepHexField: true });
      onCommit(value);
    });
    paint();
    return {
      element,
      /** Follow a colour chosen elsewhere (a preset swatch) without firing callbacks. */
      setHex(next) { const value = normalizeHex(next); if (!value) return; hsv = hexToHsv(value); paint(); },
      get hex() { return current(); },
    };
  }
  const api = { create, hsvToHex, hexToHsv };
  if (typeof module !== 'undefined') module.exports = api;
  else root.SpacePicker = api;
})(typeof window !== 'undefined' ? window : globalThis);
