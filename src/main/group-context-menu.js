// src/main/group-context-menu.js
// Electron glue for a tab group header's right-click menu. Mirrors
// workspace-context-menu.js: the renderer records the header it was invoked
// on (window.__blancCtxGroupId) at contextmenu time, and main reads and
// clears it rather than hit-testing coordinates a re-render may have moved.
// Both renderers are trusted chrome that can already act on any group id;
// main re-validates the id against the window's live groups.

const { Menu } = require('electron');
const { buildGroupContextMenu } = require('./group-context-menu-model');

function runGroupContextMenuItem(id, { group, actions }) {
  switch (id) {
    case 'rename': return actions.rename(group.id);
    case 'ungroup': return actions.ungroup(group.id);
    case 'close-group': return actions.closeGroup(group.id);
  }
}

function toElectronTemplate(items, context) {
  return items.map((item) => (item.type === 'separator'
    ? { type: 'separator' }
    : { label: item.label, click: () => runGroupContextMenuItem(item.id, context) }));
}

async function readHeaderGroupId(wc) {
  return wc.executeJavaScript(`(() => {
    const id = window.__blancCtxGroupId ?? null;
    window.__blancCtxGroupId = null;
    return id;
  })()`);
}

// deps: { isLive(), resolveGroup(rawId): group|null, getWindow(), getOffset(): {x, y},
//         acquireMenuGuard?(), releaseMenuGuard?(ticket), actions: { rename, ungroup, closeGroup }, t }
function attachGroupHeaderMenu(wc, deps) {
  wc.on('context-menu', async (_event, params) => {
    if (params.isEditable) return; // the address menu owns editable targets
    let rawId;
    try { rawId = await readHeaderGroupId(wc); } catch { return; }
    if (rawId == null || !deps.isLive()) return;
    const group = deps.resolveGroup(rawId);
    if (!group) return;
    const menu = Menu.buildFromTemplate(toElectronTemplate(buildGroupContextMenu(deps.t), { group, actions: deps.actions }));
    const offset = deps.getOffset();
    const ticket = deps.acquireMenuGuard?.();
    try {
      menu.popup({
        window: deps.getWindow(),
        x: Math.round(offset.x + params.x),
        y: Math.round(offset.y + params.y),
        sourceType: params.menuSourceType,
        callback: () => deps.releaseMenuGuard?.(ticket),
      });
    } catch { deps.releaseMenuGuard?.(ticket); }
  });
}

module.exports = { runGroupContextMenuItem, attachGroupHeaderMenu };
