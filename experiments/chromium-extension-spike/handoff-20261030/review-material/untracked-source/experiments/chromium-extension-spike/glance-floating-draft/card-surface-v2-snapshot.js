'use strict';
// This document is inert until a window-owned native bridge is provided. The
// bridge must validate the sender, current owner, profile and generation.
(() => {
  const bridge = window.blancGlanceCardBridge;
  if (!bridge || typeof bridge.invoke !== 'function') return;
  const $ = id => document.getElementById(id);
  const card = $('glanceCard'), header = $('glanceHeader'), move = $('glanceMove');
  const title = $('glanceTitle'), privacy = $('glancePrivate'), favicon = $('glanceFavicon');
  const back = $('glanceBack'), reload = $('glanceReload'), status = $('glanceCardStatus');
  const icons = {
    back: '<svg viewBox="0 0 16 16"><path d="M9.75 3.5 5.25 8l4.5 4.5"/></svg>',
    reload: '<svg viewBox="0 0 16 16"><path d="M12.42 10.35a5 5 0 1 1-4.42-7.35c1.4 0 2.74.56 3.74 1.53L13 5.78"/><path d="M13 3v2.78h-2.78"/></svg>',
    stop: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="5"/><rect class="stop-mark" x="6.05" y="6.05" width="3.9" height="3.9" rx="0.8"/></svg>',
  };
  back.innerHTML = icons.back;
  let current = null, latestGeneration = 0, retiredGeneration = 0, announceTimer = 0, announceAt = 0;
  // Match the shipping card's progressive header compaction.
  const headerSteps = ['compact-actions', 'no-eyebrow', 'no-host'];
  function fitHeader() {
    header.classList.remove(...headerSteps);
    if (header.hidden) return;
    const crowded = () => header.scrollWidth > header.clientWidth + 1 ||
      (title.scrollWidth > title.clientWidth + 1 && title.getBoundingClientRect().width < 64);
    for (const step of headerSteps) {
      if (!crowded()) break;
      header.classList.add(step);
    }
  }
  const tr = (key, vars) => window.blancI18n?.t?.(key, vars) ?? key;
  const finite = x => typeof x === 'number' && Number.isFinite(x) && Math.abs(x) <= 1000000;
  const validRect = r => r && ['x','y','width','height'].every(k => finite(r[k])) && r.width >= 0 && r.height >= 0;
  const send = async (action, data = {}) => {
    if (!current) return null;
    try { return await bridge.invoke(action, {generation: current.generation, ...data}); }
    catch { return null; }
  };
  const announce = text => {
    clearTimeout(announceTimer);
    announceTimer = setTimeout(() => { announceAt = Date.now(); status.textContent = text; }, Math.max(0, announceAt + 500 - Date.now()));
  };
  const drag = window.GlanceCardDrag.createCardDrag({
    send: (kind, input) => {
      if (!current || input.generation !== current.generation) return Promise.resolve(null);
      const {generation: _generation, ...data} = input;
      return send(kind, data);
    },
    schedule: fn => requestAnimationFrame(fn),
  });
  function begin(event, edge) {
    if (event.button !== 0 || !current) return;
    event.preventDefault();
    drag.start({pointerId: event.pointerId, edge, generation: current.generation,
      x: event.screenX, y: event.screenY, frame: {...current.frame}});
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  const moved = e => drag.move(e.pointerId, e.screenX, e.screenY);
  const ended = e => { drag.end(e.pointerId, e.screenX, e.screenY); if (e.currentTarget.hasPointerCapture?.(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); };
  const bareHeader = e => !e.target.closest('button, [role="button"], a, input');
  header.addEventListener('pointerdown', e => { if (bareHeader(e)) begin(e, null); });
  header.addEventListener('pointermove', moved);
  header.addEventListener('pointerup', ended);
  header.addEventListener('pointercancel', ended);
  header.addEventListener('dblclick', e => { if (bareHeader(e)) { drag.cancel(); void send('reset'); } });
  for (const target of [move, ...document.querySelectorAll('.glance-card-edge[data-edge]')]) {
    target.addEventListener('pointerdown', e => begin(e, target.dataset.edge ?? null));
    target.addEventListener('pointermove', moved);
    target.addEventListener('pointerup', ended);
    target.addEventListener('pointercancel', ended);
  }
  move.addEventListener('keydown', async e => {
    if (!current) return;
    const generation = current.generation;
    if (e.key === 'Enter') {
      e.preventDefault();
      if (await send('reset') && current?.generation === generation) announce(tr('glance.status.reset'));
      return;
    }
    const arrows = {ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
    const direction = arrows[e.key];
    if (!direction) return;
    e.preventDefault();
    const step = e.shiftKey ? 64 : 16, dx = direction[0]*step, dy = direction[1]*step;
    const frame = await send(e.altKey ? 'resize' : 'move', e.altKey ? {edge:'se',dx,dy} : {dx,dy});
    if (frame && current?.generation === generation) announce(e.altKey ? tr('glance.status.resized', {width:frame.width,height:frame.height}) : tr('glance.status.moved'));
  });
  for (const [id, action] of [['glanceBack','back'],['glanceChange','change'],['glanceOpenAsTab','openAsTab'],['glanceKeepSplit','keepSplit'],['glanceClose','close']]) {
    $(id).addEventListener('click', e => { e.stopPropagation(); void send(action); });
  }
  reload.addEventListener('click', e => { e.stopPropagation(); void send(reload.dataset.mode === 'stop' ? 'stop' : 'reload'); });

  // Trusted native owner should call this only for this exact card document.
  window.blancGlanceCardApplyState = state => {
    if (state?.closed === true) {
      if (!current || state.generation !== current.generation) return false;
      retiredGeneration = current.generation;
      drag.cancel(); current = null; card.hidden = true; header.hidden = true;
      clearTimeout(announceTimer); status.textContent = '';
      return true;
    }
    if (!state || !Number.isSafeInteger(state.generation) || state.generation <= 0 || state.generation < latestGeneration ||
        state.generation <= retiredGeneration ||
        !validRect(state.frame) || !validRect(state.chrome) || typeof state.title !== 'string' || state.title.length > 4096 ||
        typeof state.private !== 'boolean' || typeof state.canGoBack !== 'boolean' || typeof state.isLoading !== 'boolean') return false;
    const ringTop = state.frame.y - state.chrome.y;
    if (ringTop < 0 || ringTop > 12 || state.frame.x - state.chrome.x !== 20 ||
        state.chrome.width !== state.frame.width + 40 || state.chrome.height !== state.frame.height + ringTop + 28) return false;
    latestGeneration = state.generation;
    drag.cancelUnless(state.generation);
    current = {generation:state.generation,frame:{...state.frame}};
    document.documentElement.style.setProperty('--glance-ring-top', `${ringTop}px`);
    document.documentElement.style.setProperty('--glance-card-w', `${state.frame.width}px`);
    document.documentElement.style.setProperty('--glance-card-h', `${state.frame.height}px`);
    title.textContent = state.title;
    privacy.hidden = !state.private;
    back.disabled = !state.canGoBack;
    reload.dataset.mode = state.isLoading ? 'stop' : 'reload';
    reload.innerHTML = icons[reload.dataset.mode];
    const label = tr(state.isLoading ? 'pill.stop' : 'pill.reload');
    reload.setAttribute('aria-label', label);
    reload.setAttribute('data-tooltip', label);
    favicon.className = 'favicon' + (state.isLoading ? ' loading' : '');
    favicon.style.backgroundImage = '';
    favicon.textContent = '';
    if (!state.isLoading && typeof state.favicon === 'string' && /^data:image\/png;base64,[a-z0-9+/]+=*$/i.test(state.favicon) && state.favicon.length <= 8192) {
      favicon.classList.add('has-icon');
      favicon.style.backgroundImage = `url("${state.favicon}")`;
    } else if (!state.isLoading) {
      favicon.classList.add('fallback');
      favicon.textContent = (state.title.trim().charAt(0) || '?').toUpperCase();
    }
    card.classList.toggle('focused', !!state.focused);
    header.classList.toggle('focused', !!state.focused);
    card.hidden = false;
    header.hidden = false;
    fitHeader();
    return true;
  };
})();
