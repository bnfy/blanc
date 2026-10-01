/* Shared local-clock policy; the browser adapter only loads bundled artwork. */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.blancNewtabWallpaper = factory();
})(typeof self !== 'undefined' ? self : this, () => {
  'use strict';
  const ARTWORK = Object.freeze({
    dawn: 'start-page-sunrise.png', day: 'start-page-day.png',
    dusk: 'start-page-dusk.png', night: 'start-page-night.png',
  });
  function phaseForTime(date) {
    const hour = date.getHours();
    if (hour >= 5 && hour < 8) return 'dawn';
    if (hour >= 8 && hour < 17) return 'day';
    if (hour >= 17 && hour < 20) return 'dusk';
    return 'night';
  }
  function createController({ now = () => new Date(), isVisible, loadImage, render,
    reducedMotion = () => false, schedule = setTimeout, cancel = clearTimeout }) {
    let enabled = false, timer = null, generation = 0, applied = null;
    function stop() {
      if (timer !== null) cancel(timer);
      timer = null;
      generation += 1;
    }
    function refresh() {
      stop();
      if (!enabled || !isVisible()) return;
      const date = now();
      // A new local Date on each tick handles timezone and wall-clock changes.
      timer = schedule(refresh, 60_000 - (date.getSeconds() * 1000 + date.getMilliseconds()));
      const phase = phaseForTime(date);
      if (phase === applied) return;
      const token = generation;
      Promise.resolve().then(() => loadImage(ARTWORK[phase])).then(() => {
        if (token !== generation || !enabled || !isVisible()) return;
        render({ phase, image: ARTWORK[phase], animate: applied !== null && !reducedMotion() });
        applied = phase;
      }).catch(() => {
        if (token !== generation) return;
        applied = null;
        render(null); // Existing static Sunrise always remains underneath.
      });
    }
    return {
      setEnabled(value) {
        const next = value === true;
        enabled = next;
        if (!enabled) { stop(); applied = null; render(null); }
        else refresh();
      },
      refresh,
      suspend: stop,
      visibilityChanged() { if (isVisible()) refresh(); else stop(); },
      dispose() { enabled = false; stop(); render(null); },
    };
  }
  function mount(doc, win) {
    let viewVisible = false;
    const motion = win.matchMedia('(prefers-reduced-motion: reduce)');
    const layers = [0, 1].map(() => {
      const layer = doc.createElement('div');
      layer.className = 'start-wallpaper-layer';
      layer.setAttribute('aria-hidden', 'true');
      doc.body.prepend(layer);
      return layer;
    });
    let active = 0, fadeTimer = null;
    function settle() {
      if (fadeTimer !== null) win.clearTimeout(fadeTimer);
      fadeTimer = null;
      layers.forEach((layer, index) => {
        layer.classList.remove('is-fading');
        if (index !== active) layer.classList.remove('is-visible');
      });
    }
    const controller = createController({
      isVisible: () => viewVisible && !doc.hidden,
      reducedMotion: () => motion.matches,
      schedule: (fn, delay) => win.setTimeout(fn, delay),
      cancel: (id) => win.clearTimeout(id),
      loadImage: (file) => new Promise((resolve, reject) => {
        const img = new win.Image();
        img.onload = () => resolve();
        img.onerror = reject;
        img.src = file;
      }),
      render(frame) {
        settle();
        if (!frame) {
          layers.forEach((layer) => layer.classList.remove('is-visible'));
          delete doc.body.dataset.wallpaperPhase;
          return;
        }
        const next = 1 - active;
        const layer = layers[next];
        layer.style.setProperty('--wallpaper-image', `url("${frame.image}")`);
        layer.classList.remove('is-visible');
        // Ensure both images exist before beginning an opacity transition.
        void layer.offsetWidth;
        if (frame.animate) {
          layers[active].style.zIndex = '-2';
          layer.style.zIndex = '-1';
          layer.classList.add('is-fading');
        } else layers[active].classList.remove('is-visible');
        layer.classList.add('is-visible');
        active = next;
        doc.body.dataset.wallpaperPhase = frame.phase;
        if (frame.animate) fadeTimer = win.setTimeout(settle, 2000);
      },
    });
    doc.addEventListener('visibilitychange', () => { settle(); controller.visibilityChanged(); });
    win.addEventListener('pageshow', () => controller.refresh());
    win.addEventListener('focus', () => controller.refresh());
    motion.addEventListener('change', settle);
    win.addEventListener('pagehide', () => { settle(); controller.suspend(); });
    return {
      ...controller,
      setVisible(value) {
        viewVisible = value === true;
        doc.body.dataset.wallpaperVisible = String(viewVisible);
        settle(); controller.visibilityChanged();
      },
    };
  }
  return { ARTWORK, phaseForTime, createController, mount };
});
