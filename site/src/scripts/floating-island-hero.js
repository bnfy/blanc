// The homepage's floating Island window (FloatingIslandWindow.astro).

// Scales the app's pill to the box the capture ledger gives it and reveals it
// (float-window.css keeps it hidden until fitted). The component inlines this
// right after the Island so it is fitted during parsing; keep it
// self-contained, because it runs from its source text.
export function fitFloatIsland(stage, view) {
  const model = stage.querySelector('.hero-native-model');
  const pill = model?.shadowRoot?.querySelector('[id$="islandPill"]');
  if (!pill) return;
  const zoom = parseFloat(view.getComputedStyle(pill).getPropertyValue('--pill-zoom'));
  model.style.setProperty('--art-scale', String(model.clientWidth / (pill.offsetWidth * zoom)));
  model.style.setProperty('--art-visibility', 'visible');
}

// The peek, in milliseconds: the Island hidden while the drawn pointer rests in
// the page, the pointer's trip to the top edge, the Island shown, the pointer's
// trip back, and how long a visitor's own pointer or focus holds the loop.
export const TIMING = Object.freeze({ rest: 1600, approach: 1000, shown: 2600, leave: 500, resumeAfterVisitor: 2400 });
// The share of the window's height that counts as its top edge for a visitor's pointer.
export const TOP_BAND = 0.07;
// Where the drawn pointer goes, in percent of the window: resting in the page,
// and at the top edge under the Island.
const IN_PAGE = { x: 62, y: 58 };
const AT_EDGE = { x: 50, y: 1 };

export function initFloatingIslandHero(root, { view = window } = {}) {
  if (!root) return { stop() {} };
  const pointer = root.querySelector('.float-window-pointer');
  const motion = view.matchMedia('(prefers-reduced-motion: reduce)');
  let timer = null, onScreen = !view.IntersectionObserver, focused = false, visitor = false, stopped = false;

  const setState = state => { root.dataset.state = state; };
  const movePointer = ({ x, y }) => {
    pointer?.style.setProperty('--pointer-x', `${x}%`);
    pointer?.style.setProperty('--pointer-y', `${y}%`);
  };
  const clear = () => { if (timer !== null) view.clearTimeout(timer); timer = null; };
  const after = (ms, next) => { clear(); timer = view.setTimeout(() => { timer = null; next(); }, ms); };
  const canLoop = () => !stopped && onScreen && view.document.visibilityState !== 'hidden' && !motion.matches;

  // One step at a time; each schedules the next, so every pause clears the one timer.
  const rest = () => { setState('hidden'); movePointer(IN_PAGE); root.dataset.loop = ''; after(TIMING.rest, approach); };
  const approach = () => { movePointer(AT_EDGE); after(TIMING.approach, show); };
  const show = () => { setState('shown'); after(TIMING.shown, leave); };
  const leave = () => { movePointer(IN_PAGE); after(TIMING.leave, rest); };

  const pause = () => { clear(); delete root.dataset.loop; };
  const start = () => {
    pause();
    if (motion.matches) { setState('shown'); return; }
    if (canLoop() && !focused) rest();
  };
  // The visitor (pointer or keyboard) has the Island; the loop picks up again later.
  const takeOver = state => {
    pause();
    setState(state);
    if (state === 'hidden' && !focused && canLoop()) after(TIMING.resumeAfterVisitor, rest);
  };

  const onPointerMove = event => {
    if (event.pointerType === 'touch' || motion.matches) return;
    const box = root.getBoundingClientRect();
    const inBand = (event.clientY - box.top) / box.height <= TOP_BAND;
    if (!inBand && !visitor) return;
    visitor = inBand;
    takeOver(inBand || focused ? 'shown' : 'hidden');
  };
  const onPointerLeave = event => {
    if (event.pointerType === 'touch' || !visitor || motion.matches) return;
    visitor = false;
    takeOver(focused ? 'shown' : 'hidden');
  };
  const onFocusIn = () => { if (motion.matches) return; focused = true; takeOver('shown'); };
  const onFocusOut = () => { if (motion.matches) return; focused = false; takeOver(visitor ? 'shown' : 'hidden'); };
  const onVisibility = () => (canLoop() && !visitor ? start() : pause());

  root.addEventListener('pointermove', onPointerMove);
  root.addEventListener('pointerleave', onPointerLeave);
  root.addEventListener('focusin', onFocusIn);
  root.addEventListener('focusout', onFocusOut);
  view.document.addEventListener('visibilitychange', onVisibility);
  motion.addEventListener?.('change', start);
  const observer = view.IntersectionObserver && new view.IntersectionObserver(entries => {
    onScreen = entries[entries.length - 1].isIntersecting;
    onVisibility();
  });
  observer?.observe(root);
  const refit = () => fitFloatIsland(root, view);
  const resize = view.ResizeObserver && new view.ResizeObserver(refit);
  const model = root.querySelector('.hero-native-model');
  if (model) resize?.observe(model);
  view.document.fonts?.ready.then(refit);
  start();

  return {
    stop() {
      stopped = true;
      pause();
      root.removeEventListener('pointermove', onPointerMove);
      root.removeEventListener('pointerleave', onPointerLeave);
      root.removeEventListener('focusin', onFocusIn);
      root.removeEventListener('focusout', onFocusOut);
      view.document.removeEventListener('visibilitychange', onVisibility);
      motion.removeEventListener?.('change', start);
      observer?.disconnect();
      resize?.disconnect();
    },
  };
}
