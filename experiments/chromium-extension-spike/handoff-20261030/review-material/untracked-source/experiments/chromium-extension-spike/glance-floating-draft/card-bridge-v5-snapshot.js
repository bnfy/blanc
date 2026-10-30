'use strict';
// Transport only. The native receiver must authenticate this exact document,
// window, profile, current card generation and action before any mutation.
(() => {
  if (window.blancGlanceCardBridge || typeof window.chrome?.send !== 'function') return;
  const actions = new Set(['back', 'reload', 'stop', 'change', 'openAsTab', 'keepSplit', 'close', 'move', 'resize', 'reset']);
  const edges = new Set(['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']);
  const pending = new Map();
  let nextId = 0;
  let closed = false;
  function valid(action, data) {
    if (!actions.has(action) || !data || typeof data !== 'object' || Array.isArray(data) ||
        !Number.isSafeInteger(data.generation) || data.generation <= 0) return false;
    const keys = action === 'move' ? ['generation', 'dx', 'dy'] :
      action === 'resize' ? ['generation', 'edge', 'dx', 'dy'] : ['generation'];
    if (Object.keys(data).length !== keys.length || !keys.every(key => Object.hasOwn(data, key))) return false;
    if (action === 'move' || action === 'resize') {
      if (![data.dx, data.dy].every(x => typeof x === 'number' && Number.isFinite(x) && Math.abs(x) <= 1000000)) return false;
      if (action === 'resize' && !edges.has(data.edge)) return false;
    }
    return true;
  }
  window.blancGlanceCardReply = (id, ok, value) => {
    if (typeof id !== 'string' || typeof ok !== 'boolean') return;
    const entry = pending.get(id);
    if (!entry) return;
    pending.delete(id);
    clearTimeout(entry.timer);
    if (ok) entry.resolve(value); else entry.reject(new Error('Glance action was rejected'));
  };
  window.addEventListener('pagehide', () => {
    closed = true;
    for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(new Error('Glance card closed')); }
    pending.clear();
  }, {once: true});
  window.blancGlanceCardBridge = {
    invoke(action, data) {
      if (closed || !valid(action, data)) return Promise.reject(new Error('Invalid Glance action'));
      if (pending.size >= 64 || nextId >= Number.MAX_SAFE_INTEGER) return Promise.reject(new Error('Glance action limit reached'));
      const id = String(++nextId);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pending.delete(id); reject(new Error('Glance action timed out')); }, 15000);
        pending.set(id, {resolve, reject, timer});
        try { window.chrome.send('blancGlanceCard', [id, action, data]); }
        catch (error) { pending.delete(id); clearTimeout(timer); reject(error); }
      });
    },
  };
})();
