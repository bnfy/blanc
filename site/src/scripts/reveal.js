/* One-time reveal for the homepage feature grid and Patron card.
   State is added only when motion is welcome and a section starts below the
   viewport, so server HTML, no-script visitors, and reduced-motion visitors
   never meet a hidden section. Once revealed, a section stays put. */
const targets = [...document.querySelectorAll('.home-feature, .home-patron')];
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

if (targets.length && !reducedMotion.matches && 'IntersectionObserver' in window) {
  const waiting = targets.filter(el => el.getBoundingClientRect().top > innerHeight);
  const settle = el => { el.classList.remove('is-waiting'); };
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      settle(entry.target);
      entry.target.classList.add('is-revealed');
      observer.unobserve(entry.target);
    }
  }, { rootMargin: '0px 0px -10% 0px' });

  for (const el of waiting) {
    el.classList.add('is-waiting');
    observer.observe(el);
  }
  reducedMotion.addEventListener('change', () => {
    if (!reducedMotion.matches) return;
    observer.disconnect();
    waiting.forEach(settle);
  });
}
