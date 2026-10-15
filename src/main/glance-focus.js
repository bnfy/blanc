'use strict';

// Which page a "current page" browser command acts on while Glance shows two
// panes (spec: Commands follow focus). Pure — no Electron — so the routing
// rule is unit-tested; main.js owns the runtime and passes a liveness lookup.

/** The window's visible page tab ids: the main page, then the reference. */
function visiblePaneIds(runtime) {
  if (!runtime) return [];
  return [runtime.activeTabId, runtime.glanceTabId].filter((id) => id != null);
}

function isVisiblePaneId(runtime, tabId) {
  return tabId != null && visiblePaneIds(runtime).includes(tabId);
}

/**
 * 1. The pane whose live webContents sent the key event.
 * 2. Otherwise (a native menu click, a key in a chrome surface) the focused
 *    pane, if it is still a visible pane with a live page.
 * 3. Otherwise the main page.
 * @param {object|null} runtime window runtime
 * @param {object|null} sender the key event's webContents, or null
 * @param {(tabId: unknown) => object|null} contentsOf a tab's live webContents
 */
function commandTargetTab(runtime, sender, contentsOf) {
  if (!runtime) return null;
  if (sender) {
    const hit = visiblePaneIds(runtime).find((id) => {
      const wc = contentsOf(id);
      return !!wc && wc === sender;
    });
    if (hit != null) return hit;
  }
  const focused = runtime.focusedPaneTabId;
  if (isVisiblePaneId(runtime, focused) && contentsOf(focused)) return focused;
  return runtime.activeTabId ?? null;
}

/** What the strip may know: whether the reference holds focus. */
function focusedPane(runtime) {
  return runtime?.glanceTabId != null && runtime.focusedPaneTabId === runtime.glanceTabId
    ? 'glance'
    : 'main';
}

/** The chrome:glance-layout payload: Glance geometry plus focusedPane. */
function glanceLayoutPayload(layout, pane) {
  return layout ? { ...layout, focusedPane: pane === 'glance' ? 'glance' : 'main' } : null;
}

module.exports = { visiblePaneIds, isVisiblePaneId, commandTargetTab, focusedPane, glanceLayoutPayload };
