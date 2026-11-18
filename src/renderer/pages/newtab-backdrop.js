// The Island's band continues this Start Page's wallpaper (owner, 2026-11-13
// in the fork; 2026-11-18 for this build, the top band only). The page sends
// each wallpaper layer's computed background; main checks it
// (start-backdrop.js), paints the band's slice of the same layers in the
// strip, and answers with how far above this page the band reaches (0 where
// it stands aside: a private page, a split, Glance, auto-hide, full screen,
// Match site colors off). The page then lays its wallpaper out from the
// band's top (pages.css [data-island-band]) so the two meet without a seam.
// Ported from the fork's newtab-adapter.js (islandBackdrop).
(() => {
  'use strict';
  const start = window.bowserPages?.start;
  if (!start?.reportBackdrop || new URLSearchParams(location.search).has('private')) return;
  const root = document.documentElement;
  let band = -1, sent = '', timer = 0, busy = false, again = false, forceNext = false;

  function applyBand(value) {
    const next = Math.max(0, Number(value) || 0);
    if (next === band) return;
    band = next;
    root.style.setProperty('--island-band-h', `${band}px`);
    root.toggleAttribute('data-island-band', band > 0);
  }
  const painter = (style, opacity, fade) => ({
    color: style.backgroundColor, image: style.backgroundImage, size: style.backgroundSize,
    position: style.backgroundPosition, repeat: style.backgroundRepeat, opacity, fade,
  });
  // The body's background (Sunrise's own image, a Color fill), then the
  // wallpaper layers over it, in the order they paint.
  function spec() {
    const layers = [painter(getComputedStyle(document.body), 1, false)];
    for (const layer of document.querySelectorAll('.start-wallpaper-layer')) {
      const style = getComputedStyle(layer);
      if (style.display === 'none') continue;
      layers.push(painter(style, layer.classList.contains('is-visible') ? 1 : 0, layer.classList.contains('is-fading')));
    }
    // Zoom is main's to know (the page's zoom factor); width and height are
    // this page's own CSS pixels.
    return { zoom: 1, width: innerWidth, height: innerHeight, layers: layers.slice(0, 4) };
  }
  async function publish(force) {
    if (busy) { again = true; forceNext ||= force; return; }
    busy = true;
    try {
      const next = spec();
      const text = JSON.stringify(next);
      if (!force && text === sent) return;
      const reply = await start.reportBackdrop(next);
      sent = text;
      applyBand(reply?.band);
    } catch {
      // Main unavailable: the band keeps its sampled color.
    } finally {
      busy = false;
      if (again) { again = false; const now = forceNext; forceNext = false; schedule(now); }
    }
  }
  function schedule(force = false) {
    forceNext ||= force;
    clearTimeout(timer);
    timer = setTimeout(() => { const now = forceNext; forceNext = false; publish(now); }, 40);
  }
  // Main tells this page when the band above it changes without the page
  // changing (another tab took over, a split or Glance opened).
  start.onBackdropBand?.((value) => applyBand(value));
  function watch() {
    const observer = new MutationObserver(() => schedule());
    const watched = new WeakSet();
    const watchLayers = () => {
      for (const layer of document.querySelectorAll('.start-wallpaper-layer')) {
        if (watched.has(layer)) continue;
        watched.add(layer);
        observer.observe(layer, { attributes: true, attributeFilter: ['class', 'style', 'data-wallpaper-phase', 'data-wallpaper-image'] });
      }
    };
    observer.observe(document.body, { attributes: true });
    new MutationObserver(() => { watchLayers(); schedule(); }).observe(document.body, { childList: true });
    watchLayers();
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => schedule());
    // A tab switch back, a new window size or Island size re-asks: main
    // knows the band only for this moment.
    addEventListener('resize', () => schedule(true));
    document.addEventListener('visibilitychange', () => { if (!document.hidden) schedule(true); });
    schedule(true);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch);
  else watch();
})();
