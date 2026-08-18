// Electron glue for the shared tab context menu. The pure template is
// tab-context-menu-model.js; runTabContextMenuItem routes a clicked item id
// through the injected `actions` (incl. clipboard, so this stays electron-free
// and testable). attachPillMenu/attachRowMenu own the webContents listener +
// Menu.popup, mirroring address-menu.js.

const { Menu } = require('electron');
const { buildTabContextMenu } = require('./tab-context-menu-model');
const { cleanLink } = require('./clean-link');

const TAB_ROW_SELECTOR = '.island-row[data-tab-id]';
const PILL_SELECTOR = '#islandPill';

function runTabContextMenuItem(id, { tab, groupId, actions }) {
  switch (id) {
    case 'copy-link': return actions.copy(tab.url || '');
    case 'copy-clean-link': { const c = cleanLink(tab.url); if (c) actions.copy(c); return; }
    case 'reload': return actions.reload(tab.id);
    case 'duplicate': return actions.duplicate(tab.id);
    case 'toggle-pin': return actions.togglePin(tab.id);
    case 'toggle-mute': return actions.toggleMute(tab.id);
    case 'toggle-favorite': return actions.toggleFavorite(tab.id);
    case 'group-move': return actions.setGroup(tab.id, groupId);
    case 'group-none': return actions.setGroup(tab.id, null);
    case 'group-new': return actions.beginNewGroup(tab.id);
    case 'glance': return actions.glance(tab.id);
    case 'quiet': return actions.quiet(tab.id);
    case 'new-tab': return actions.newTab();
    case 'new-private-tab': return actions.newPrivateTab();
    case 'close-others': return actions.closeOthers(tab.id);
    case 'move-new-window': return actions.moveToNewWindow(tab.id);
    case 'reopen-closed': return actions.reopenClosed();
    case 'close': return actions.close(tab.id);
  }
}

function toElectronTemplate(modelItems, { tab, actions }) {
  return modelItems.map((item) => {
    if (item.type === 'separator') return { type: 'separator' };
    const el = { label: item.label };
    if (item.accelerator) el.accelerator = item.accelerator;
    if (item.enabled === false) el.enabled = false;
    if (item.type === 'radio') { el.type = 'radio'; el.checked = !!item.checked; }
    if (item.submenu) {
      el.submenu = toElectronTemplate(item.submenu, { tab, actions });
    } else {
      el.click = () => runTabContextMenuItem(item.id, { tab, groupId: item.groupId, actions });
    }
    return el;
  });
}

// Read the right-clicked tab id from the overlay DOM at the click point, with a
// hit-test re-verification (a renderer suppression can regress; main is the
// authority — same discipline as address-menu.js).
async function readRowTabId(wc, params) {
  return wc.executeJavaScript(`(() => {
    const hit = document.elementFromPoint(${Math.round(params.x)}, ${Math.round(params.y)});
    const row = hit && hit.closest && hit.closest(${JSON.stringify(TAB_ROW_SELECTOR)});
    return row ? row.dataset.tabId : null;
  })()`);
}

async function isInPill(wc, params) {
  return wc.executeJavaScript(`!!(document.elementFromPoint(${Math.round(params.x)}, ${Math.round(params.y)})
    ?.closest(${JSON.stringify(PILL_SELECTOR)}))`);
}

// The resting pill lives on the chrome window's own webContents; its coords are
// already window-relative and the overlay is closed, so no blur-guard here.
// deps: { resolveActiveTab(): ctx|null, getWindow(), actions }
function attachPillMenu(wc, deps) {
  wc.on('context-menu', async (_event, params) => {
    let inPill = false;
    try { inPill = await isInPill(wc, params); } catch { return; }
    if (!inPill) return;
    const ctx = deps.resolveActiveTab();
    if (!ctx) return;
    const template = buildTabContextMenu({ ...ctx, surface: 'pill' });
    const menu = Menu.buildFromTemplate(toElectronTemplate(template, { tab: ctx.tab, actions: deps.actions }));
    try {
      menu.popup({ window: deps.getWindow(), x: Math.round(params.x), y: Math.round(params.y), sourceType: params.menuSourceType });
    } catch { /* window died mid-popup */ }
  });
}

// Tab rows live on the overlay webContents (shared with the address menu). Coords
// are overlay-relative → offset by overlay bounds; reuse the overlay blur-guard.
// deps: { isOverlayLive(), resolveTab(rawId): ctx|null, getWindow(),
//         getOverlayBounds(), acquireMenuGuard(), releaseMenuGuard(ticket), actions }
function attachRowMenu(wc, deps) {
  wc.on('context-menu', async (_event, params) => {
    if (params.isEditable) return; // the address menu owns editable targets
    let rawId;
    try { rawId = await readRowTabId(wc, params); } catch { return; }
    if (rawId == null) return;
    if (!deps.isOverlayLive()) return;
    const ctx = deps.resolveTab(rawId);
    if (!ctx) return;
    const template = buildTabContextMenu({ ...ctx, surface: 'row' });
    const menu = Menu.buildFromTemplate(toElectronTemplate(template, { tab: ctx.tab, actions: deps.actions }));
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

module.exports = {
  runTabContextMenuItem, toElectronTemplate, attachPillMenu, attachRowMenu,
  TAB_ROW_SELECTOR, PILL_SELECTOR,
};
