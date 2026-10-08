// Pauses the tab groups drag figure while it is out of view or the page is
// hidden, so its CSS loop only runs when someone can see it. Motion itself is
// CSS-only and already off under prefers-reduced-motion.
export function initDragFigure(root, { view = window } = {}) {
  if (!root || !('IntersectionObserver' in view)) return;
  let visible = false;
  const sync = () => root.toggleAttribute('data-paused', !visible || view.document.hidden);
  const observer = new view.IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    sync();
  }, { rootMargin: '10% 0px' });
  observer.observe(root);
  view.document.addEventListener('visibilitychange', sync);
  view.addEventListener('pagehide', () => observer.disconnect());
  sync();
}
