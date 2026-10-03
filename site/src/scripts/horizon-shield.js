// Scroll position owns the turn: no autoplay, scroll interception or hidden copy.
const horizonStudy = document.querySelector('.horizon-study');
if (horizonStudy) {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let frame = 0;
  let visible = false;
  const renderShield = () => {
    frame = 0;
    if (reducedMotion.matches) {
      horizonStudy.style.removeProperty('--shield-turn');
      horizonStudy.style.removeProperty('--shield-shadow');
      return;
    }
    const bounds = horizonStudy.getBoundingClientRect();
    // One full turn between entering the lower and leaving the upper viewport.
    const travel = bounds.height + window.innerHeight * 0.6;
    const progress = Math.max(0, Math.min(1, (window.innerHeight * 0.8 - bounds.top) / travel));
    horizonStudy.style.setProperty('--shield-turn', `${progress * 360}deg`);
    horizonStudy.style.setProperty('--shield-shadow', String(0.45 + 0.55 * Math.abs(Math.cos(progress * Math.PI * 2))));
  };
  const scheduleShield = () => {
    if (!frame && visible && !reducedMotion.matches) frame = requestAnimationFrame(renderShield);
  };
  const observer = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    // Also settle at the clamped endpoint on exit or a direct anchor jump.
    renderShield();
  }, { rootMargin: '15% 0px' });
  observer.observe(horizonStudy);
  window.addEventListener('scroll', scheduleShield, { passive: true });
  window.addEventListener('resize', scheduleShield);
  reducedMotion.addEventListener('change', renderShield);
  renderShield();
}
