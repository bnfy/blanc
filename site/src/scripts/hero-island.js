// Fits the enlarged pill to its stage and reveals it (hero-island.css keeps it
// hidden until fitted). NativeIslandHero also inlines this right after the
// island markup so it appears during parsing, not after this deferred module;
// keep it self-contained, because it runs from its source text.
export function fitHeroIsland(stage, view) {
  const model = stage.querySelector('.hero-native-model');
  const pill = model?.shadowRoot?.getElementById('islandPill');
  if (!pill) return;
  const zoom = parseFloat(view.getComputedStyle(pill).getPropertyValue('--pill-zoom'));
  model.style.setProperty('--art-scale', String(model.clientWidth / (pill.offsetWidth * zoom)));
  model.style.setProperty('--art-visibility', 'visible');
}

export function initHeroIsland(stage, {view = window} = {}) {
  const model = stage.querySelector('.hero-native-model');
  const pill = model?.shadowRoot?.getElementById('islandPill');
  if (!pill) return;
  const toggle = stage.querySelector('.hero-island-motion');
  const motion = view.matchMedia('(prefers-reduced-motion: reduce)');
  let visible = false, pausedByUser = false;
  const resize = () => fitHeroIsland(stage, view);
  const updateMotion = () => {
    const playing = visible && !view.document.hidden && !motion.matches && !pausedByUser;
    stage.style.setProperty('--island-motion-state', playing ? 'running' : 'paused');
    toggle.hidden = motion.matches;
    toggle.setAttribute('aria-pressed', String(pausedByUser));
    toggle.setAttribute('aria-label', pausedByUser ? 'Resume Island animation' : 'Pause Island animation');
  };
  toggle.addEventListener('click', () => {
    pausedByUser = !pausedByUser;
    updateMotion();
  });
  motion.addEventListener('change', updateMotion);
  new view.ResizeObserver(resize).observe(model);
  new view.IntersectionObserver(entries => {
    visible = entries[0].isIntersecting;
    updateMotion();
  }).observe(stage);
  view.document.addEventListener('visibilitychange', updateMotion);
  resize(); updateMotion();
  view.document.fonts.ready.then(resize);
}

if (typeof document !== 'undefined') {
  document.querySelectorAll('[data-native-island]').forEach(stage => initHeroIsland(stage));
}
