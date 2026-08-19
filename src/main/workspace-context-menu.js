// src/main/workspace-context-menu.js
// Electron glue for the workspace row's right-click menu (Rename/Delete).
// Deliberately a separate module from tab-context-menu.js — see
// workspace-context-menu-model.js's header for why. Same shape as that file:
// buildWorkspaceContextMenu is the pure template, attachWorkspaceRowMenu owns
// the webContents listener + Menu.popup, mirroring attachRowMenu.

const { Menu } = require('electron');
const { buildWorkspaceContextMenu } = require('./workspace-context-menu-model');

function runWorkspaceContextMenuItem(id, { workspace, actions }) {
  switch (id) {
    case 'rename': return actions.rename(workspace.id);
    case 'delete': return actions.remove(workspace.id);
  }
}

function toElectronTemplate(modelItems, { workspace, actions }) {
  return modelItems.map((item) => ({
    label: item.label,
    click: () => runWorkspaceContextMenuItem(item.id, { workspace, actions }),
  }));
}

// Read (and clear) the workspace id the renderer recorded at contextmenu-
// dispatch time. Same rationale as tab-context-menu.js's readRowTabId:
// deliberately NOT an elementFromPoint hit-test — the renderer's hold release
// can flush a deferred re-render between the click and this read, so stale
// coordinates could resolve to a neighbouring row, while the recorded
// e.target names the row the user visually clicked (and also serves
// keyboard-invoked menus, which carry no useful coordinates). The overlay is
// trusted chrome — browserAPI can already act on any workspace id — so a
// renderer-recorded id grants nothing new; main still re-validates it against
// live workspace state via resolveWorkspace.
async function readRowWorkspaceId(wc) {
  return wc.executeJavaScript(`(() => {
    const id = window.__blancCtxWorkspaceId ?? null;
    window.__blancCtxWorkspaceId = null;
    return id;
  })()`);
}

// Workspace rows live on the overlay webContents, same document as tab rows
// and the address input — shares that SAME blur guard (mutually exclusive by
// target: editable input vs. tab row vs. workspace row; the renderer only
// ever records one of the two row ids per right-click).
// deps: { isOverlayLive(), resolveWorkspace(rawId): workspace|null, getWindow(),
//         getOverlayBounds(), acquireMenuGuard(), releaseMenuGuard(ticket), actions }
function attachWorkspaceRowMenu(wc, deps) {
  wc.on('context-menu', async (_event, params) => {
    if (params.isEditable) return; // the address menu owns editable targets
    let rawId;
    try { rawId = await readRowWorkspaceId(wc); } catch { return; }
    if (rawId == null) return;
    if (!deps.isOverlayLive()) return;
    const workspace = deps.resolveWorkspace(rawId);
    if (!workspace) return;
    const template = buildWorkspaceContextMenu(workspace);
    const menu = Menu.buildFromTemplate(toElectronTemplate(template, { workspace, actions: deps.actions }));
    const bounds = deps.getOverlayBounds();
    const ticket = deps.acquireMenuGuard();
    try {
      menu.popup({
        window: deps.getWindow(),
        x: Math.round(bounds.x + params.x),
        y: Math.round(bounds.y + params.y),
        sourceType: params.menuSourceType,
        callback: () => deps.releaseMenuGuard(ticket),
      });
    } catch { deps.releaseMenuGuard(ticket); }
  });
}

module.exports = { runWorkspaceContextMenuItem, attachWorkspaceRowMenu };
