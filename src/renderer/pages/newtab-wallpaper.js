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
    if (hour >= 17 && hour < 19) return 'dusk';
    return 'night';
  }
  function createController({ now = () => new Date(), isVisible, loadImage, render,
    reducedMotion = () => false, schedule = setTimeout, cancel = clearTimeout }) {
    let enabled = false, timer = null, generation = 0, applied = null;
    let receivedPreference = false, animateEnable = false;
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
        render({ phase, image: ARTWORK[phase], animate: (applied !== null || animateEnable) && !reducedMotion() });
        applied = phase;
        animateEnable = false;
      }).catch(() => {
        if (token !== generation) return;
        applied = null;
        render(null); // Existing static Sunrise always remains underneath.
      });
    }
    return {
      setEnabled(value) {
        const next = value === true;
        const changed = next !== enabled;
        const animate = receivedPreference && changed && isVisible() && !reducedMotion();
        const first = !receivedPreference;
        receivedPreference = true;
        enabled = next;
        if (!enabled) {
          stop();
          animateEnable = false;
          // Repeated status broadcasts must not interrupt a fade to static.
          if (changed || first) render(null, { animate: animate && applied !== null });
          applied = null;
        } else {
          if (changed) animateEnable = animate;
          refresh();
        }
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
    let active = null, fadeTimer = null;
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
      render(frame, { animate = false } = {}) {
        if (fadeTimer !== null) win.clearTimeout(fadeTimer);
        fadeTimer = null;
        if (!frame) {
          layers.forEach((layer) => {
            layer.classList.toggle('is-fading', animate);
            layer.classList.remove('is-visible');
          });
          active = null;
          delete doc.body.dataset.wallpaperPhase;
          if (animate) fadeTimer = win.setTimeout(settle, 2000);
          else settle();
          return;
        }
        // Reuse the same layer when reversing an off fade, so CSS continues
        // from its current opacity instead of flashing the static background.
        const previous = layers.findIndex((layer) => layer.dataset.wallpaperPhase === frame.phase);
        const next = active === null && previous !== -1 ? previous : active === 0 ? 1 : 0;
        const layer = layers[next];
        const reversing = active === null && previous === next;
        if (!reversing) {
          layer.classList.remove('is-fading', 'is-visible');
          layer.style.setProperty('--wallpaper-image', `url("${frame.image}")`);
          layer.dataset.wallpaperPhase = frame.phase;
        }
        // Flush the starting opacity before transitioning a freshly loaded layer.
        void layer.offsetWidth;
        if (active !== null) layers[active].style.zIndex = '-2';
        layer.style.zIndex = '-1';
        layer.classList.toggle('is-fading', frame.animate);
        layer.classList.add('is-visible');
        active = next;
        doc.body.dataset.wallpaperPhase = frame.phase;
        if (frame.animate) fadeTimer = win.setTimeout(settle, 2000);
        else settle();
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
        const next = value === true;
        const changed = next !== viewVisible;
        viewVisible = next;
        doc.body.dataset.wallpaperVisible = String(viewVisible);
        if (changed || !viewVisible) settle();
        controller.visibilityChanged();
      },
    };
  }
  return { ARTWORK, phaseForTime, createController, mount };
});
