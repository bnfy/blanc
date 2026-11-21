// The Blanc Spaces demo on the homepage (SpacesDemo.astro): the open Island
// with its Spaces menu. Choosing a sample space moves the menu's checkmark,
// lists that space's tabs in the panel and puts its tile on the footer's
// Spaces button, as switching does in the app (the window's tabs swap in
// place; workspace-ui.js syncIdentity names and paints the button). Once mostly visible it walks through every
// space and back in under five seconds, then waits; any interaction stops the
// walk, and Reduced Motion skips it and only cross-fades.

const STEP_MS = 1100;
const EASING = 'cubic-bezier(.2, .9, .25, 1)';

// Scales the stage to its column (never past 1.8×) and lines the menu up
// under the footer's Spaces button, 85% across it, where the app puts the
// menu's transform origin (styles.css --ws-origin for data-side="below").
// SpacesDemo also inlines this right after
// the element so the demo is sized while parsing; keep it self-contained,
// because it runs from its source text.
export function fitSpacesDemo(host, view) {
  const stage = host.shadowRoot?.querySelector('.native-stage');
  const button = host.shadowRoot?.querySelector('[id$="footerWorkspace"]');
  const menu = host.shadowRoot?.querySelector('.ws-switcher');
  if (!stage || !button || !menu || !host.clientWidth) return;
  const width = parseFloat(view.getComputedStyle(host).getPropertyValue('--demo-width')) || 620;
  host.style.setProperty('--demo-scale', String(Math.min(1.8, host.clientWidth / width)));
  const box = stage.getBoundingClientRect();
  const ratio = box.width / width;
  if (!(ratio > 0)) return;
  const b = button.getBoundingClientRect();
  const center = (b.left + b.width / 2 - box.left) / ratio;
  const x = center - (menu.getBoundingClientRect().width / ratio) * 0.85;
  stage.style.setProperty('--menu-x', `${Math.max(0, x)}px`);
}

export function initSpacesDemo(host, { view = window } = {}) {
  const root = host.shadowRoot;
  const rows = [...(root?.querySelectorAll('.ws-row-main') ?? [])];
  const list = root?.querySelector('[id$="islandList"]');
  const address = root?.querySelector('[id$="addressInput"]');
  if (!rows.length || !list || !address) return;
  // The footer's Spaces button: the current space's tile and its name.
  const trigger = root.querySelector('[id$="footerWorkspace"]');
  const triggerTile = trigger?.querySelector('.ws-trigger-tile');
  const triggerLabel = host.dataset.triggerLabel;
  const motion = view.matchMedia('(prefers-reduced-motion: reduce)');
  let current = 0; // nativeSpacesArt draws the first space as current
  let stopped = false, walked = false, timer = 0;

  // A colour too close to the surface behind it gets the app's hairline
  // edge; which colours need it depends on the appearance.
  const paintEdges = () => {
    const key = host.dataset.appearance === 'dark' ? 'edgeDark' : 'edgeLight';
    for (const row of rows) row.querySelector('.ws-tile').dataset.edge = row.dataset[key];
    if (triggerTile) triggerTile.dataset.edge = rows[current].dataset[key];
  };

  function showTrigger(row) {
    if (!triggerTile) return;
    const tile = row.querySelector('.ws-tile');
    triggerTile.setAttribute('style', tile.getAttribute('style'));
    triggerTile.innerHTML = tile.innerHTML;
    triggerTile.dataset.edge = tile.dataset.edge;
    if (!triggerLabel) return;
    const named = triggerLabel.replace('{name}', row.querySelector('.ws-row-name').textContent);
    trigger.dataset.tooltip = named;
    trigger.setAttribute('aria-label', named);
  }

  // The rows overlay.js draws for tabs at rest: favicon and title, the
  // current tab's in bold.
  function tabRow(page, active) {
    const row = view.document.createElement('div');
    row.className = active ? 'island-row tab-row active' : 'island-row tab-row';
    row.setAttribute('role', 'group');
    const primary = view.document.createElement('button');
    primary.type = 'button';
    primary.className = 'row-primary';
    const wrap = view.document.createElement('span');
    wrap.className = 'row-favicon-wrap';
    const favicon = view.document.createElement('span');
    favicon.className = 'favicon has-icon';
    favicon.style.backgroundImage = `url(${page.favicon})`;
    wrap.append(favicon);
    const title = view.document.createElement('span');
    title.className = 'row-title';
    title.textContent = page.title;
    primary.append(wrap, title);
    row.append(primary);
    return row;
  }

  function show(index) {
    if (index === current) return;
    const from = current, row = rows[index];
    rows.forEach((other, i) => {
      other.classList.toggle('on', i === index);
      other.setAttribute('aria-pressed', String(i === index));
    });
    current = index;
    showTrigger(row);
    const pages = JSON.parse(row.dataset.pages);
    list.replaceChildren(...pages.map((page, i) => tabRow(page, i === 0)));
    address.value = pages[0].url;
    // Moving down the list, content moves up, as the app's switch does.
    if (motion.matches) {
      for (const node of [list, address]) node.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease-out' });
      return;
    }
    const dir = index > from ? 1 : -1;
    for (const node of [list, address]) {
      node.animate([{ transform: `translateY(${7 * dir}px)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 300, easing: EASING });
    }
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
