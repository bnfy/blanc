'use strict';

function installOwnedCosmetics(blocker, allowed) {
  const entries = new Map();
  const original = blocker.onInjectCosmeticFilters;
  const clear = wc => {
    const entry = entries.get(wc);
    if (!entry) return;
    for (const key of entry.keys) if (!wc.isDestroyed()) wc.removeInsertedCSS(key).catch(() => {});
    entry.keys.clear();
  };
  blocker.onInjectCosmeticFilters = (event, ...args) => {
    const wc = event.sender;
    if (!allowed(wc)) return;
    if (!entries.has(wc)) {
      const entry = { keys: new Set(), generation: 0 };
      entries.set(wc, entry);
      wc.on('did-navigate', () => { entry.generation++; entry.keys.clear(); });
      wc.once('destroyed', () => entries.delete(wc));
    }
    const entry = entries.get(wc);
    const generation = entry.generation;
    return original({
      frameId: event.frameId, processId: event.processId,
      sender: {
        insertCSS: async (...options) => {
          if (!allowed(wc) || entry.keys.size >= 1024) return;
          const key = await wc.insertCSS(...options);
          if (wc.isDestroyed() || entry.generation !== generation) return;
          if (!allowed(wc)) await wc.removeInsertedCSS(key);
          else entry.keys.add(key);
        },
        executeJavaScript: (...options) => allowed(wc) ? wc.executeJavaScript(...options) : Promise.resolve(),
      },
    }, ...args);
  };
  return { clear, clearSession: session => { for (const wc of entries.keys()) if (wc.session === session) clear(wc); }, clearAll: () => { for (const wc of entries.keys()) clear(wc); } };
}
module.exports = { installOwnedCosmetics };
