/* Features bento: a tile opens the shared popover, which grows out of the
   tile and shrinks back into it. Tiles are real links, so without script,
   or on a modified click, they go to the feature's guide. Motion is a
   critically damped spring (damping 1.0, response 0.42 s) as a linear()
   easing; a close starts from the card's on-screen transform, so it can
   interrupt an opening. Reduced motion cross-fades instead. */
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
  const labelOf = tile => bodies.get(tile.dataset.pop)?.querySelector('.pop-eyebrow')?.textContent.trim() ?? '';
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

  function show(i) {
    index = wrap(i);
    const id = tiles[index].dataset.pop;
    for (const [key, body] of bodies) body.hidden = key !== id;
    dialog.setAttribute('aria-labelledby', `pop-${id}-title`);
    dialog.querySelector('[data-pop-prev]').textContent = labelOf(tiles[wrap(index - 1)]);
    dialog.querySelector('[data-pop-next]').textContent = labelOf(tiles[wrap(index + 1)]);
    content.scrollTop = 0;
    startDemo(bodies.get(id));
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
    if (reducedMotion.matches) {
      const fade = dialog.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 150, easing: 'ease-in' });
      fade.onfinish = done;
      running = [fade];
      return;
    }
    const shrink = card.animate([{ transform: live }, { transform: toTile(source) }], SPRING);
    running = [
      shrink,
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

// The Quiet Tabs tile's ambient dimming only runs while the tile is on screen.
const quietTile = document.querySelector('.bento-R1');
if (quietTile && 'IntersectionObserver' in window) {
  new IntersectionObserver(([entry]) => { quietTile.toggleAttribute('data-in-view', entry.isIntersecting); }).observe(quietTile);
}
