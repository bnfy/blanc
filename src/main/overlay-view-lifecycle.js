'use strict';

function showOverlayView(window, view, platform = process.platform) {
  // Re-adding an existing child raises it without detaching its native view.
  window.contentView.addChildView(view);
  if (platform === 'linux') view.setVisible(true);
}

function hideOverlayView(window, view, platform = process.platform) {
  if (platform === 'linux') {
    // Electron 44 / Wayland can leave a detached-and-reattached renderer
    // hidden forever, even while its View is visible and it holds focus.
    // Keep the overlay window-owned; hiding it suppresses paint and input.
    view.setVisible(false);
  } else {
    window.contentView.removeChildView(view);
  }
}

module.exports = { showOverlayView, hideOverlayView };
