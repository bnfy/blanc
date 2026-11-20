
// Small text over your image (owner, 2026-11-13): no backing and no wash.
// Blanc looks at the part of your image right behind each piece of small
// text (the date, the blocked line, tile names, group chips), mixes in the
// page's own wash there, and gives that text whichever ink, light or dark,
// stands out more against it, as the iPhone Lock Screen does. Only while your
// image is the wallpaper (body[data-wallpaper-style]). Ported unchanged in
// method from the fork's newtab-adapter.js (chromium/next, 2026-11-13).
(() => {
  'use strict';
  const TARGETS = '.start-brand-date, #bbBlocked, .bb-fav .label, .bb-groups .group-chip';
  const INK = {dark: [18, 16, 11], light: [247, 240, 229]};
  const lin = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const images = new Map();
  function image(url) {
    // A new photo gets a new versioned URL; keep only the last few.
    if (!images.has(url) && images.size >= 4) images.delete(images.keys().next().value);
    if (!images.has(url)) images.set(url, new Promise(resolve => {
      const img = new Image();
      img.onload = () => resolve(img); img.onerror = () => resolve(null);
      img.src = url;
    }));
    return images.get(url);
  }
  // Where `cover` puts the image in the window, with the layer's own position.
  function placement(img, layer) {
    const W = innerWidth, H = innerHeight;
    const scale = Math.max(W / img.naturalWidth, H / img.naturalHeight);
    const w = img.naturalWidth * scale, h = img.naturalHeight * scale;
    const position = getComputedStyle(layer).backgroundPosition.split(',').pop().trim().split(/\s+/);
    const axis = (v, spare, horizontal) => {
      if (v === undefined || v === 'center') return spare / 2;
      if (v === (horizontal ? 'left' : 'top')) return 0;
      if (v === (horizontal ? 'right' : 'bottom')) return spare;
      if (v.endsWith('%')) return spare * parseFloat(v) / 100;
      return parseFloat(v) || 0;
    };
    return {x: axis(position[0], W - w, true), y: axis(position[1] ?? position[0], H - h, false), scale};
  }
  // The page's wash at a point: each gradient of --start-wallpaper-overlay,
  // its stops scaled by the Fade slider, combined as layers over each other.
  function wash(layer, px, py) {
    const css = getComputedStyle(layer).getPropertyValue('--start-wallpaper-overlay');
    const body = getComputedStyle(document.body);
    const fade = Number.parseFloat(body.getPropertyValue('--start-wallpaper-wash'));
    const k = Number.isFinite(fade) ? fade : 1;
    let color = null, through = 1;
    for (const part of css.split(/(?=(?:radial|linear)-gradient\()/)) {
      const stops = [...part.matchAll(/rgba\(\s*([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*(?:calc\(\s*([\d.]+)\s*\*[^)]*\)|([\d.]+))\s*\)\s*(-?[\d.]+)?(px|%)?/g)]
        .map(m => ({rgb: [+m[1], +m[2], +m[3]], a: (m[4] !== undefined ? +m[4] * k : +m[5]), at: m[6] === undefined ? null : +m[6], unit: m[7]}));
      if (!stops.length) continue;
      color ??= stops[0].rgb;
      let t;
      if (part.startsWith('radial')) {
        const m = /ellipse\s+([\d.]+)%\s+([\d.]+)%\s+at\s+([\d.]+)%\s+([\d.]+)%/.exec(part);
        const [rx, ry, cx, cy] = m ? m.slice(1).map(Number) : [50, 50, 50, 50];
        t = Math.hypot((px / innerWidth * 100 - cx) / rx, (py / innerHeight * 100 - cy) / ry) * 100;
      } else t = null;
      const pos = s => s.at === null ? null : s.unit === 'px' ? (t === null ? s.at / innerHeight * 100 : s.at) : s.at;
      const along = t ?? py / innerHeight * 100;
      stops.forEach((s, i) => { if (s.at === null) s.at = i === 0 ? 0 : i === stops.length - 1 ? 100 : null; s.p = pos(s); });
      let a = stops.at(-1).a;
      for (let i = 0; i < stops.length - 1; i++) {
        const s0 = stops[i], s1 = stops[i + 1];
        if (s0.p === null || s1.p === null) continue;
        if (along <= s0.p) { a = s0.a; break; }
        if (along <= s1.p) { a = s0.a + (s1.a - s0.a) * (along - s0.p) / Math.max(1e-6, s1.p - s0.p); break; }
      }
      through *= 1 - Math.max(0, Math.min(1, a));
    }
    return {color: color ?? [247, 240, 229], alpha: 1 - through};
  }
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 16;
  const ctx = canvas.getContext('2d', {willReadFrequently: true});
  function backdrop(img, at, layer, rect) {
    const sx = (rect.left - at.x) / at.scale, sy = (rect.top - at.y) / at.scale;
    const sw = Math.max(1, rect.width / at.scale), sh = Math.max(1, rect.height / at.scale);
    ctx.clearRect(0, 0, 16, 16);
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, 16, 16);
    const data = ctx.getImageData(0, 0, 16, 16).data;
    const mean = [0, 0, 0];
    for (let i = 0; i < data.length; i += 4) for (let c = 0; c < 3; c++) mean[c] += data[i + c];
    for (let c = 0; c < 3; c++) mean[c] /= data.length / 4;
    const w = wash(layer, rect.left + rect.width / 2, rect.top + rect.height / 2);
    return mean.map((v, c) => v * (1 - w.alpha) + w.color[c] * w.alpha);
  }
  let pending = 0;
  async function update() {
    pending = 0;
    const targets = [...document.querySelectorAll(TARGETS)];
    const layer = document.querySelector('.start-wallpaper-layer.is-visible');
    const url = layer?.dataset.wallpaperImage;
    if (!document.body.dataset.wallpaperStyle || !url) { for (const el of targets) delete el.dataset.ink; return; }
    const img = await image(url);
    if (!img || !img.naturalWidth) { for (const el of targets) delete el.dataset.ink; return; }
    const at = placement(img, layer);
    for (const el of targets) {
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      try {
        const back = backdrop(img, at, layer, rect);
        el.dataset.ink = contrast(INK.light, back) > contrast(INK.dark, back) ? 'light' : 'dark';
      } catch { delete el.dataset.ink; }
    }
  }
  const schedule = () => { if (!pending) pending = requestAnimationFrame(() => setTimeout(update, 60)); };
  function start() {
    new MutationObserver(schedule).observe(document.body, {attributes: true, attributeFilter: ['data-wallpaper-style', 'style', 'class', 'data-wallpaper-phase'], subtree: false});
    for (const id of ['bbFavorites', 'bbGroups', 'layoutBillboard'])
      { const el = document.getElementById(id); if (el) new MutationObserver(schedule).observe(el, {childList: true, subtree: true}); }
    const watched = new WeakSet();
    const watchLayers = () => document.querySelectorAll('.start-wallpaper-layer').forEach(l => {
      if (watched.has(l)) return; watched.add(l);
      new MutationObserver(schedule).observe(l, {attributes: true, attributeFilter: ['class', 'data-wallpaper-image']});
    });
    watchLayers();
    new MutationObserver(watchLayers).observe(document.body, {childList: true});
    addEventListener('resize', schedule);
    schedule();
  }
  // What the chooser sees behind one element (for checks and debugging).
  async function explain(el) {
    const layer = document.querySelector('.start-wallpaper-layer.is-visible');
    const img = await image(layer?.dataset.wallpaperImage);
    if (!img) return null;
    const rect = el.getBoundingClientRect();
    const at = placement(img, layer);
    const w = wash(layer, rect.left + rect.width / 2, rect.top + rect.height / 2);
    return {at, wash: w, back: backdrop(img, at, layer, rect).map(Math.round), ink: el.dataset.ink ?? null};
  }
  window.blancStartInk = {update, explain};
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
