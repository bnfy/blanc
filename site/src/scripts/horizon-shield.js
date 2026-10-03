const defaultLoader = () => import('./horizon-shield-renderer.js');

export function initHorizonShield(study, { view = window, loadRenderer = defaultLoader } = {}) {
  if (!study) return;
  const reducedMotion = view.matchMedia('(prefers-reduced-motion: reduce)');
  let frame = 0, visible = false, loading = false, failed = false, renderer;
  const angle = () => {
    if (reducedMotion.matches) return 0;
    const bounds = study.getBoundingClientRect();
    const travel = bounds.height + view.innerHeight * 0.05;
    return Math.max(0, Math.min(1, (view.innerHeight * 0.25 - bounds.top) / travel)) * Math.PI * 2;
  };
  const render = () => {
    const rotation = angle();
    renderer?.turn(rotation);
    // Also recorded on the element for diagnostics without reading WebGL pixels.
    study.style.setProperty('--shield-turn', `${rotation * 180 / Math.PI}deg`);
    study.style.setProperty('--shield-shadow', String(0.45 + 0.55 * Math.abs(Math.cos(rotation))));
  };
  const ensureRenderer = async () => {
    if (loading || renderer || failed || !visible || reducedMotion.matches) return;
    loading = true;
    try {
      const { createShieldRenderer } = await loadRenderer();
      renderer = await createShieldRenderer(study.querySelector('.horizon-turn'));
      render();
    } catch {
      // Unsupported WebGL, failed assets or context creation leave the original
      // artwork upright. Never substitute a rotating cardboard cutout.
      failed = true;
    } finally { loading = false; }
  };
  const schedule = () => {
    if (!frame && visible && !reducedMotion.matches) {
      frame = view.requestAnimationFrame(() => { frame = 0; render(); });
    }
  };
  const observer = new view.IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    render(); ensureRenderer();
  }, { rootMargin: '15% 0px' });
  observer.observe(study);
  view.addEventListener('scroll', schedule, { passive: true });
  view.addEventListener('resize', schedule);
  reducedMotion.addEventListener('change', () => { render(); ensureRenderer(); });
  render();
}
