export function islandPose(scroll, hovering = false) {
  const clamp = value => Math.max(-1, Math.min(1, value));
  return {
    pitch: hovering ? 0 : 60 + clamp(scroll) * 5,
    x: 0,
    y: hovering ? 0 : clamp(scroll) * -18,
  };
}

export function initHeroIsland(stage, {view = window} = {}) {
  const model = stage.querySelector('.hero-native-model');
  const hoverTarget = stage.querySelector('[data-island-hover]');
  const pill = model?.shadowRoot?.getElementById('islandPill');
  if (!pill) return;
  const motion = view.matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = view.matchMedia('(hover: hover) and (pointer: fine)');
  let visible = true, frame = 0, hovering = false;
  const resize = () => {
    const zoom = parseFloat(view.getComputedStyle(pill).getPropertyValue('--pill-zoom'));
    const scale = model.clientWidth / (pill.offsetWidth * zoom);
    model.style.setProperty('--art-scale', String(scale));
    stage.style.setProperty('--island-hover-height', `${pill.offsetHeight * zoom * scale}px`);
  };
  const render = () => {
    frame = 0;
    const bounds = stage.getBoundingClientRect();
    const scroll = (view.innerHeight * .55 - bounds.top - bounds.height / 2) / view.innerHeight;
    const pose = islandPose(motion.matches ? 0 : scroll, hovering);
    stage.style.setProperty('--island-pitch', `${pose.pitch}deg`);
    stage.style.setProperty('--island-pan-x', `${pose.x}px`);
    stage.style.setProperty('--island-pan-y', `${pose.y}px`);
  };
  const request = () => {
    if (visible && !view.document.hidden && !frame) frame = view.requestAnimationFrame(render);
  };
  // A stable, unrotated hit area prevents the tilting plane from flickering in/out.
  hoverTarget?.addEventListener('pointerenter', event => {
    if (!finePointer.matches || event.pointerType === 'touch') return;
    hovering = true;
    request();
  });
  hoverTarget?.addEventListener('pointerleave', () => {hovering = false; request();});
  view.addEventListener('scroll', () => {if (!motion.matches) request();}, {passive:true});
  motion.addEventListener('change', render);
  new view.ResizeObserver(() => {resize(); request();}).observe(model);
  new view.IntersectionObserver(entries => {
    visible = entries[0].isIntersecting;
    if (!visible && frame) {view.cancelAnimationFrame(frame); frame = 0;}
    if (visible) request();
  }).observe(stage);
  view.document.addEventListener('visibilitychange', request);
  const daylight = stage.closest('#hero-daylight');
  if (daylight) {
    const appearance = () => {model.dataset.appearance = daylight.dataset.appearance;};
    new view.MutationObserver(appearance).observe(daylight, {attributes:true, attributeFilter:['data-appearance']});
    appearance();
  }
  resize(); render();
  view.document.fonts.ready.then(resize);
}

if (typeof document !== 'undefined') {
  document.querySelectorAll('[data-native-island]').forEach(stage => initHeroIsland(stage));
}
