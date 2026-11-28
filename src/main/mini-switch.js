'use strict';

// Mini window: switch to tabs and Spaces (#1734 part 2, spec
// docs/superpowers/specs/2026-11-28-mini-window-switch-design.md). The rows a
// mini window's Quick Switcher adds for the profile's tabs elsewhere, and the
// opaque keys a pick sends back. Pure: main assembles the inputs and resolves
// a key again when it is picked.

const NEW_TAB_URL = 'blanc://newtab/';

/** Only inert PNG pixels cross into the chrome (splitCornerModel's rule). */
const pngOnly = (favicon) => (typeof favicon === 'string' && favicon.startsWith('data:image/png;base64,') ? favicon : null);
const listed = (url) => typeof url === 'string' && url !== '' && url !== NEW_TAB_URL;

/**
 * `windows`: every window runtime of the profile, `{ self, mini, place, tabs }`
 * (`place` is its Space's name, or null for a window in no Space; a held
 * Space's runtime is a window here too). The mini window itself (`self`) and
 * other mini windows list nothing; private tabs and start pages never list.
 * `saved`: Space records no runtime holds, `{ id, name, urls, meta }`.
 */
function miniSwitchRows({ windows = [], saved = [] } = {}) {
  const rows = [];
  for (const window of windows) {
    if (window.self || window.mini) continue;
    for (const tab of window.tabs ?? []) {
      if (tab.private || !listed(tab.url)) continue;
      rows.push({ key: `t:${tab.id}`, title: tab.title || tab.url, url: tab.url, favicon: pngOnly(tab.favicon), place: window.place ?? null });
    }
  }
  for (const space of saved) {
    (space.urls ?? []).forEach((url, index) => {
      if (!listed(url)) return;
      const meta = space.meta?.[index] ?? {};
      rows.push({ key: `s:${space.id}:${index}`, title: meta.title || url, url, favicon: pngOnly(meta.favicon), place: space.name });
    });
  }
  return rows;
}

/** A row's key back from the renderer, or null when it isn't one we made. */
function parseMiniSwitchKey(key) {
  if (typeof key !== 'string') return null;
  const tab = /^t:(.+)$/.exec(key);
  if (tab) return { kind: 'tab', tabId: tab[1] };
  const saved = /^s:([^:]+):(\d+)$/.exec(key);
  if (saved) return { kind: 'saved', spaceId: saved[1], index: Number(saved[2]) };
  return null;
}

module.exports = { miniSwitchRows, parseMiniSwitchKey };
