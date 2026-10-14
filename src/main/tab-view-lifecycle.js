'use strict';

// Electron 44 on Linux (Wayland and X11) stops drawing a tab's
// WebContentsView once it is removed from its window and added back: after
// switching back, Glance, Reopen Closed Tab or returning to a space the page
// stays hidden or draws only when something else forces a frame, and a
// storage-bearing quiet tab woken in its kept view never draws at all. So, as
// overlay-view-lifecycle.js does for the overlay surfaces, Linux keeps tab
// views window-owned; the caller has already hidden the view.
function releaseTabView(window, view, platform = process.platform) {
  if (platform === 'linux') return false;
  window.contentView.removeChildView(view);
  return true;
}

// A view can still arrive from another window (Move Tab to New Window, a
// space opened in a different window). On Linux such a view draws again only
// once another child view is added to its new window after it, so a 1x1
// transparent View with no web contents is added and removed a tick later.
// Showing or hiding a view that is already there, including the tab view
// itself, does not help, so the View is new every time.
function nudgeWindow(window, { createView, defer = setImmediate }) {
  const nudge = createView();
  nudge.setBackgroundColor('#00000000');
  nudge.setBounds({ x: 0, y: 0, width: 1, height: 1 });
  window.contentView.addChildView(nudge, 0);
  defer(() => {
    if (!window.isDestroyed()) window.contentView.removeChildView(nudge);
  });
}

/** Attach (or re-raise) a tab view. Returns true when the view was not
 * already one of this window's children. */
function attachTabView(window, view, { platform = process.platform, createView, defer } = {}) {
  const arriving = !window.contentView.children.includes(view);
  window.contentView.addChildView(view);
  if (platform === 'linux' && arriving) nudgeWindow(window, { createView, defer });
  return arriving;
}

module.exports = { attachTabView, releaseTabView };
