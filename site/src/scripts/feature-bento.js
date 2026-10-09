/* Features bento: a tile opens the shared popover, which grows out of the
   tile and shrinks back into it. Tiles are real links, so without script,
   or on a modified click, they go to the feature's guide. Motion is a
   critically damped spring (damping 1.0, response 0.42 s) as a linear()
   easing; a close starts from the card's on-screen transform, so it can
   interrupt an opening. Reduced motion cross-fades instead. */
import { initHorizonShield } from './horizon-shield.js';
import { initDragFigure } from './drag-figure.js';

const dialog = document.getElementById('feature-pop');

if (dialog && typeof dialog.showModal === 'function') {
  const card = dialog.querySelector('.pop-card');
  const content = dialog.querySelector('.pop-content');
  const scrim = dialog.querySelector('.pop-scrim');
  const tiles = [...document.querySelectorAll('[data-pop]')];
  const bodies = new Map([...dialog.querySelectorAll('[data-pop-body]')].map(body => [body.dataset.popBody, body]));
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const SPRING = spring(0.42);
  let index = -1;
  let source = null;
  let running = [];
  let demoTimer = null;
  let closing = false;

  function spring(response) {
    const omega = 2 * Math.PI / response;
    const settle = 9.2 / omega;
    const points = [];
    for (let k = 0; k <= 48; k++) {
      const t = settle * k / 48;
      points.push((1 - (1 + omega * t) * Math.exp(-omega * t)).toFixed(4));
    }
    return { easing: `linear(${points.join(', ')})`, duration: Math.round(settle * 1000) };
  }

  const wrap = i => (i + tiles.length) % tiles.length;
  const labelOf = tile => bodies.get(tile.dataset.pop)?.dataset.popLabel ?? '';
  const stop = () => { running.forEach(animation => animation.cancel()); running = []; };
  const toTile = tile => {
    const from = card.getBoundingClientRect();
    const to = tile.getBoundingClientRect();
    return `translate(${to.left - from.left}px, ${to.top - from.top}px) scale(${to.width / from.width}, ${to.height / from.height})`;
  };

  function startDemo(body) {
    clearInterval(demoTimer);
    const stage = body.querySelector('.pop-stage');
    const bars = [...stage.querySelectorAll('.pop-steps i')];
    if (!bars.length) return;
    const set = step => {
      stage.dataset.step = String(step);
      bars.forEach((bar, k) => bar.classList.toggle('is-on', k < step));
    };
    if (reducedMotion.matches) { set(3); return; }
    let step = 1;
    set(step);
    demoTimer = setInterval(() => { if (!document.hidden) set(step = step % 3 + 1); }, 2200);
  }

  // Popover images stay lazy (their articles are hidden until opened). Start
  // fetching them once a visitor reaches for a tile, and, while a popover is
  // open, for its neighbours too, so arrow navigation also lands complete.
  const warm = tile => bodies.get(tile.dataset.pop)?.querySelectorAll('img[loading="lazy"]').forEach(img => { img.loading = 'eager'; });

  function show(i) {
    index = wrap(i);
    const id = tiles[index].dataset.pop;
    for (const [key, body] of bodies) body.hidden = key !== id;
    dialog.setAttribute('aria-labelledby', `pop-${id}-title`);
    dialog.querySelector('[data-pop-prev]').textContent = labelOf(tiles[wrap(index - 1)]);
    dialog.querySelector('[data-pop-next]').textContent = labelOf(tiles[wrap(index + 1)]);
    content.scrollTop = 0;
    startDemo(bodies.get(id));
    for (const k of [index - 1, index, index + 1]) warm(tiles[wrap(k)]);
    history.replaceState(null, '', `#${id}`);
  }

  function open(i) {
    stop();
    closing = false;
    show(i);
    source = tiles[index];
    dialog.showModal();
    source.classList.add('is-source');
    if (reducedMotion.matches) {
      running = [dialog.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180, easing: 'ease-out' })];
      return;
    }
    running = [
      card.animate([{ transform: toTile(source) }, { transform: 'none' }], SPRING),
      scrim.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, easing: 'ease-out' }),
      content.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, delay: 140, easing: 'ease-out', fill: 'backwards' }),
    ];
  }

  // Shared by close() and a native dialog close: restore the tile, stop the
  // demo and drop the hash.
  function finish({ focus = false } = {}) {
    clearInterval(demoTimer);
    const tile = source;
    tile?.classList.remove('is-source');
    index = -1;
    closing = false;
    history.replaceState(null, '', location.pathname + location.search);
    if (focus) tile?.focus({ preventScroll: true });
  }

  function close() {
    if (index < 0 || closing) return;
    closing = true;
    const live = getComputedStyle(card).transform;
    const scrimNow = getComputedStyle(scrim).opacity;
    stop(); // also cancels an in-flight go() swap, so it cannot run after this
    clearInterval(demoTimer);
    const done = () => { finish({ focus: true }); dialog.close(); };
    // Show the tile again now, under the closing card, so the card hands
    // over to it instead of landing as an empty panel.
    source.classList.remove('is-source');
    if (reducedMotion.matches) {
      const fade = dialog.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 150, easing: 'ease-in' });
      fade.onfinish = done;
      running = [fade];
      return;
    }
    const shrink = card.animate([{ transform: live }, { transform: toTile(source) }], SPRING);
    running = [
      shrink,
      // The emptied card fades as it lands, crossfading into the tile.
      card.animate([{ opacity: 1 }, { opacity: 1, offset: .15 }, { opacity: 0, offset: .65 }, { opacity: 0 }], { duration: SPRING.duration, fill: 'forwards' }),
      scrim.animate([{ opacity: scrimNow }, { opacity: 0 }], { duration: 240, easing: 'ease-in', fill: 'forwards' }),
      content.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, fill: 'forwards' }),
    ];
    shrink.onfinish = done;
  }

  function go(direction) {
    if (index < 0 || closing) return;
    const swap = () => {
      if (closing || index < 0) return;
      source.classList.remove('is-source');
      show(index + direction);
      source = tiles[index];
      source.classList.add('is-source');
      source.scrollIntoView({ block: 'nearest' });
    };
    if (reducedMotion.matches) { swap(); return; }
    // Tracked in `running` so a close() mid-swap cancels it (onfinish never fires).
    const out = content.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: `translateX(${-direction * 16}px)` }], { duration: 110, easing: 'ease-in' });
    running.push(out);
    out.onfinish = () => {
      swap();
      running.push(content.animate([{ opacity: 0, transform: `translateX(${direction * 16}px)` }, { opacity: 1, transform: 'none' }], { duration: 220, easing: 'cubic-bezier(.2, .8, .2, 1)' }));
    };
  }

  tiles.forEach((tile, i) => {
    // Without script (or on a modified click) the tile is just a link, so
    // only announce a popup once this handler can open one.
    tile.setAttribute('aria-haspopup', 'dialog');
    tile.addEventListener('pointerenter', () => warm(tile), { once: true });
    tile.addEventListener('focus', () => warm(tile), { once: true });
    tile.addEventListener('click', event => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      // site.js reads data-track when this click reaches the document: name
      // the popover open, then restore the navigation event name.
      tile.dataset.track = 'feature_popover_open';
      setTimeout(() => { tile.dataset.track = 'feature_cta_click'; });
      open(i);
    });
  });
  dialog.addEventListener('click', event => {
    if (event.target.closest('[data-pop-close]')) close();
    const nav = event.target.closest('[data-pop-nav]');
    if (nav) go(Number(nav.dataset.popNav));
  });
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  // Chrome can close a modal dialog on Escape without a cancel event (no
  // user activation since it opened, e.g. after a deep link). Tidy up then.
  dialog.addEventListener('close', () => { if (index >= 0) { stop(); finish(); } });
  dialog.addEventListener('keydown', event => {
    if (event.key === 'ArrowRight') { event.preventDefault(); go(1); }
    if (event.key === 'ArrowLeft') { event.preventDefault(); go(-1); }
  });

  // A /features#<id> link opens that feature, on load or when only the hash changes.
  const openFromHash = () => {
    let id;
    try { id = decodeURIComponent(location.hash.slice(1)); } catch { return; }
    const i = tiles.findIndex(tile => tile.dataset.pop === id);
    if (i < 0 || index >= 0) return;
    tiles[i].scrollIntoView({ block: 'center' });
    open(i);
  };
  window.addEventListener('hashchange', openFromHash);
  if (location.hash) requestAnimationFrame(openFromHash);
}

// Ambient tile loops (Quiet Tabs dimming, the wallpaper's dayparts) only run
// while their tile is on screen.
if ('IntersectionObserver' in window) {
  const inView = new IntersectionObserver(entries => {
    for (const entry of entries) entry.target.toggleAttribute('data-in-view', entry.isIntersecting);
  });
  for (const tile of document.querySelectorAll('.bento-R1, .bento-R2')) inView.observe(tile);
}

// The ad-blocking demo draws the native Island and shield popover. As in the
// app, the popover's view starts at the shield chip's bottom edge, centred on
// the chip unless that would leave the window (here, the stage), and its
// pointer sits over the chip. Measure where things landed and convert back to
// the stage's own CSS pixels one axis at a time: the popover card opens with a
// non-uniform scale, and zoom applies on top, so screen distances on x and y
// are scaled differently while it runs.
for (const demo of document.querySelectorAll('.native-shield-demo')) {
  const root = demo.shadowRoot;
  const stage = root?.querySelector('.native-stage');
  if (!stage) continue;
  const chip = root.querySelector('[id$="pillShield"]'), pill = root.querySelector('[id$="islandPill"]');
  const view = root.querySelector('.native-shield-view');
  const place = () => {
    const s = stage.getBoundingClientRect(), c = chip.getBoundingClientRect(), p = pill.getBoundingClientRect();
    const v = view.getBoundingClientRect(), local = getComputedStyle(stage);
    if (!s.width || !s.height) return;
    const scaleX = s.width / parseFloat(local.width), scaleY = s.height / parseFloat(local.height);
    const center = c.left + c.width / 2;
    const left = Math.max(s.left, Math.min(center - v.width / 2, s.right - v.width));
    demo.style.setProperty('--view-x', `${((left - s.left) / scaleX).toFixed(2)}px`);
    demo.style.setProperty('--pointer-x', `${((center - left) / v.width * 100).toFixed(2)}%`);
    demo.style.setProperty('--chip-dy', `${((p.bottom - c.bottom) / scaleY).toFixed(2)}px`);
  };
  new ResizeObserver(place).observe(demo);
  document.fonts?.ready.then(place);
}

// The Blocker shield on the ad-blocking tile and in its popover turns on its
// own while on screen. Its WebGL renderer is the page's heaviest script, so it
// waits until the page has loaded and gone idle; the bronze artwork shows
// upright until then.
const idle = new Promise(resolve => {
  const settle = () => (window.requestIdleCallback ? requestIdleCallback(() => resolve(), { timeout: 4000 }) : setTimeout(resolve, 1500));
  if (document.readyState === 'complete') settle(); else addEventListener('load', settle, { once: true });
});
for (const shield of document.querySelectorAll('.bento-shield')) initHorizonShield(shield, { spin: 'time', ready: idle });

// The drag-to-reorder popover reuses the tab groups guide's drag figure; its
// CSS loop runs only while the popover shows it.
for (const demo of document.querySelectorAll('.pop-drag .drag-demo')) initDragFigure(demo);
