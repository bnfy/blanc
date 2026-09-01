'use strict';

/**
 * Detach the page views that are children of the primary macOS window before
 * the native window is destroyed. Background tabs are already detached.
 * Keeping these views alive lets Dock activation rebuild only the chrome and
 * reattach the exact active document.
 */
function preservePrimaryTabViews({
  platform,
  runtime,
  primaryRuntime,
  window,
  tabs,
  liveContents,
  isQuitting,
}) {
  if (
    platform !== 'darwin' || isQuitting || runtime !== primaryRuntime ||
    !window || window.isDestroyed()
  ) return [];

  const preserved = [];
  const ids = new Set([runtime.activeTabId, runtime.glanceTabId].filter(Boolean));
  for (const id of ids) {
    const tab = tabs.get(id);
    if (!tab?.view || !liveContents(tab)) continue;
    window.contentView.removeChildView(tab.view);
    tab.view.setVisible(false);
    preserved.push(id);
  }
  return preserved;
}

/** Return an active tab that can be reattached or woken on Dock reopen. */
function reusableDockTabId({ activeTabId, tabs, liveContents }) {
  if (!activeTabId) return null;
  const tab = tabs.get(activeTabId);
  if (!tab) return null;
  return tab.asleep || liveContents(tab) ? activeTabId : null;
}

/**
 * Own the two halves of a primary-window Dock reopen as one testable unit.
 * Electron still owns event registration; callers bind these handlers to the
 * runtime before installing them on BrowserWindow and its chrome WebContents.
 */
function createDockReopenLifecycle({
  platform,
  runtime,
  primaryRuntime,
  window,
  tabs,
  liveContents,
  getIsQuitting,
  ensureStartTab = false,
  createStartTab,
  activateTab,
  flushExternalUrls,
}) {
  return {
    onWindowClose() {
      runtime.closing = true;
      return preservePrimaryTabViews({
        platform,
        runtime,
        primaryRuntime,
        window,
        tabs,
        liveContents,
        isQuitting: getIsQuitting(),
      });
    },

    onChromeReady() {
      let id = reusableDockTabId({
        activeTabId: runtime.activeTabId,
        tabs,
        liveContents,
      });
      if (!id && ensureStartTab) id = createStartTab();
      if (!id) return null;
      runtime.activeTabId = null; // force activation to perform a fresh attach
      activateTab(id);
      flushExternalUrls();
      return id;
    },
  };
}

module.exports = {
  createDockReopenLifecycle,
  preservePrimaryTabViews,
  reusableDockTabId,
};
