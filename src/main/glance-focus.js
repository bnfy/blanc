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
 * 2. Otherwise (a native menu click, a key in a chrome surface) the pane that
 *    really holds keyboard focus now, then the recorded focused pane if it is
 *    still a visible pane with a live page. Focus events alone are not
 *    enough: attaching a view can fire a transient focus on it and hand focus
 *    back to the other pane without an event.
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
  const live = livePaneId(runtime, contentsOf);
  if (live != null) return live;
  const focused = runtime.focusedPaneTabId;
  if (isVisiblePaneId(runtime, focused) && contentsOf(focused)) return focused;
  return runtime.activeTabId ?? null;
}

/** The visible pane whose webContents really holds keyboard focus, or null.
 * Focus can land on a pane without a webContents 'focus' event: on Linux,
 * activating the window restores focus to the last focused view. */
function livePaneId(runtime, contentsOf) {
  return visiblePaneIds(runtime).find((id) => contentsOf(id)?.isFocused?.() === true) ?? null;
}

/** Where a foreground tab opened from a page goes: into Glance when the
 * reference opened it, else it becomes the main page. Every opening path
 * (links, window.open, Search for…, View Page Source) uses this one rule. */
function foregroundOpenRole(runtime, openerTabId) {
  return runtime?.glanceTabId != null && runtime.glanceTabId === openerTabId ? 'glance' : 'main';
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

module.exports = { visiblePaneIds, isVisiblePaneId, livePaneId, commandTargetTab, focusedPane, glanceLayoutPayload, foregroundOpenRole };
