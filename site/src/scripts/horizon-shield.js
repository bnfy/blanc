const defaultLoader = () => import('./horizon-shield-renderer.js');

// spin: 'scroll' ties one full turn to the artwork's passage through the
// viewport; 'time' turns continuously, one turn per `period` ms, while visible.
export function initHorizonShield(study, { view = window, loadRenderer = defaultLoader, spin = 'scroll', period = 9000 } = {}) {
  if (!study) return;
  const reducedMotion = view.matchMedia('(prefers-reduced-motion: reduce)');
  let frame = 0, visible = false, loading = false, failed = false, renderer;
  // Time spin advances only by on-screen frame time (each step capped), so it
  // resumes where it paused instead of jumping after being offscreen.
  let elapsed = 0, last = 0;
  const angle = () => {
    if (reducedMotion.matches) return 0;
    if (spin === 'time') return (elapsed % period) / period * Math.PI * 2;
    const bounds = study.getBoundingClientRect();
    // Begin just inside the viewport; finish when the bottom reaches its upper fifth.
    const start = view.innerHeight * 0.9;
    const end = view.innerHeight * 0.2;
    const travel = bounds.height + start - end;
    return Math.max(0, Math.min(1, (start - bounds.top) / travel)) * Math.PI * 2;
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
    } catch (error) {
      console.warn('Shield renderer could not start:', error);
      // Unsupported WebGL, failed assets or context creation leave the original
      // artwork upright. Never substitute a rotating cardboard cutout.
      failed = true;
    } finally { loading = false; }
  };
  // A time spin stops for good once 3D fails (the artwork stays upright), and
  // holds still while the study is visibility-hidden, as a Features tile is
  // behind its own open popover.
  const shown = () => study.checkVisibility?.({ visibilityProperty: true }) ?? true;
  const schedule = () => {
    if (!frame && visible && !reducedMotion.matches && !(spin === 'time' && failed)) {
      frame = view.requestAnimationFrame(time => {
        frame = 0;
        if (spin === 'time') {
          if (last && shown()) elapsed += Math.min(time - last, 50);
          last = time;
          if (shown()) render();
          schedule();
        } else render();
      });
    }
  };
  const restart = () => { last = 0; if (spin === 'time') schedule(); };
  const observer = new view.IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    render(); ensureRenderer(); restart();
  }, { rootMargin: '15% 0px' });
  observer.observe(study);
  if (spin === 'scroll') {
    view.addEventListener('scroll', schedule, { passive: true });
    view.addEventListener('resize', schedule);
  }
  reducedMotion.addEventListener('change', () => { render(); ensureRenderer(); restart(); });
  render();
}
