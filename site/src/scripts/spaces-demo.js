// The Blanc Spaces demo on the homepage (SpacesDemo.astro). Choosing a sample
// space moves the menu's checkmark and repaints the Island's space mark, dots,
// favicon and domain the way renderer.js does in the app (renderSpaceMark,
// animateSpaceSwitch). Once mostly visible it walks through every space and
// back in under five seconds, then waits; any interaction stops the walk, and
// Reduced Motion skips it and only cross-fades.

const STEP_MS = 1100;
const EASING = 'cubic-bezier(.2, .9, .25, 1)';

// Scales the stage to its column (never past 1.8×) and lines the menu up
// with the mark's left edge. SpacesDemo also inlines this right after the
// element so the demo is sized while parsing; keep it self-contained,
// because it runs from its source text.
export function fitSpacesDemo(host, view) {
  const stage = host.shadowRoot?.querySelector('.native-stage');
  const mark = host.shadowRoot?.querySelector('.space-mark');
  if (!stage || !mark || !host.clientWidth) return;
  const width = parseFloat(view.getComputedStyle(host).getPropertyValue('--demo-width')) || 400;
  host.style.setProperty('--demo-scale', String(Math.min(1.8, host.clientWidth / width)));
  const ratio = stage.getBoundingClientRect().width / width;
  if (ratio > 0) stage.style.setProperty('--menu-x', `${(mark.getBoundingClientRect().left - stage.getBoundingClientRect().left) / ratio}px`);
}

export function initSpacesDemo(host, { view = window } = {}) {
  const root = host.shadowRoot;
  const rows = [...(root?.querySelectorAll('.ws-row-main') ?? [])];
  const mark = root?.querySelector('.space-mark');
  if (!rows.length || !mark) return;
  const symbol = mark.querySelector('.space-mark-symbol');
  const name = mark.querySelector('.space-mark-name');
  const dots = root.querySelector('[id$="pillDots"]');
  const favicon = root.querySelector('[id$="pillFavicon"]');
  const domain = root.querySelector('[id$="pillDomain"]');
  const motion = view.matchMedia('(prefers-reduced-motion: reduce)');
  let current = 0; // nativeSpacesArt draws the first space as current
  let stopped = false, walked = false, timer = 0;

  // A colour too close to the surface behind it gets the app's hairline
  // edge; which colours need it depends on the appearance.
  const paintEdges = () => {
    const key = host.dataset.appearance === 'dark' ? 'edgeDark' : 'edgeLight';
    for (const row of rows) row.querySelector('.ws-tile').dataset.edge = row.dataset[key];
    mark.dataset.edge = rows[current].dataset[key];
  };

  function animate(from, to, widthBefore) {
    if (motion.matches) {
      for (const node of [symbol, name]) node.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease-out' });
      return;
    }
    // Moving down the list, content moves up; the page cluster follows.
    const dir = to > from ? 1 : -1;
    for (const node of [symbol, name]) {
      node.animate([{ transform: `translateY(${7 * dir}px)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 300, easing: EASING });
    }
    for (const node of [dots, favicon, domain]) {
      node.animate([{ transform: `translateX(${10 * dir}px)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 300, easing: EASING });
    }
    const widthAfter = mark.offsetWidth;
    if (widthBefore && widthAfter && widthBefore !== widthAfter) {
      mark.animate([{ width: `${widthBefore}px` }, { width: `${widthAfter}px` }], { duration: 320, easing: EASING });
    }
  }

  function show(index) {
    if (index === current) return;
    const from = current, row = rows[index];
    const widthBefore = mark.offsetWidth;
    rows.forEach((other, i) => {
      other.classList.toggle('on', i === index);
      other.setAttribute('aria-pressed', String(i === index));
    });
    current = index;
    mark.style.setProperty('--space-fill', row.dataset.fill);
    mark.style.setProperty('--space-on', row.dataset.on);
    paintEdges();
    const glyph = row.querySelector('.ws-symbol').cloneNode(true);
    glyph.removeAttribute('class');
    symbol.replaceChildren(glyph);
    name.textContent = row.querySelector('.ws-row-name').textContent;
    dots.replaceChildren(...Array.from({ length: Number(row.dataset.tabs) }, (_, i) => {
      const dot = view.document.createElement('button');
      dot.className = i === 0 ? 'island-dot active' : 'island-dot';
      return dot;
    }));
    favicon.style.backgroundImage = `url(${row.dataset.favicon})`;
    domain.textContent = row.dataset.domain;
    animate(from, index, widthBefore);
  }

  const stop = () => { stopped = true; view.clearTimeout(timer); };
  // One pass through every space, ending where it began.
  function walk(step) {
    if (stopped || step > rows.length) return;
    timer = view.setTimeout(() => {
      if (stopped || view.document.hidden) return stop();
      show((current + 1) % rows.length);
      walk(step + 1);
    }, STEP_MS);
  }

  rows.forEach((row, index) => row.addEventListener('click', () => { stop(); show(index); }));
  for (const type of ['pointerdown', 'keydown', 'focusin']) host.addEventListener(type, stop);
  new view.MutationObserver(paintEdges).observe(host, { attributes: true, attributeFilter: ['data-appearance'] });
  new view.IntersectionObserver(entries => {
    if (walked || stopped || motion.matches || !entries.some(entry => entry.isIntersecting)) return;
    walked = true;
    walk(1);
  }, { threshold: 0.6 }).observe(host);
  const fit = () => fitSpacesDemo(host, view);
  new view.ResizeObserver(fit).observe(host);
  view.document.fonts?.ready.then(fit);
  paintEdges(); fit();
}

if (typeof document !== 'undefined') {
  document.querySelectorAll('blanc-spaces-demo').forEach(host => initSpacesDemo(host));
}
