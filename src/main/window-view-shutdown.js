'use strict';

// Aura focus teardown needs the native window to outlive its WebContents.
// Drain even detached/background views before allowing BrowserWindow close.
// Resume on the next turn, after the last native destruction stack returns.
function createWindowViewShutdown({ window, getViews, resume, defer = setImmediate }) {
  let draining = false;
  let drained = false;
  return (event) => {
    if (drained) return false;
    event.preventDefault();
    if (draining) return true;
    draining = true;
    const contents = new Set();
    for (const view of new Set(getViews().filter(Boolean))) {
      const wc = view.webContents;
      if (!wc || wc.isDestroyed()) continue;
      view.setVisible(false);
      if (!window.contentView.children.includes(view)) window.contentView.addChildView(view);
      contents.add(wc);
    }
    if (!window.webContents.isDestroyed()) window.webContents.focus();
    const finish = () => {
      if (contents.size) return;
      defer(() => {
        drained = true;
        if (!window.isDestroyed()) resume();
      });
    };
    // Register the complete set before close(): a destroyed event may be
    // synchronous, and must not resume while another view is still alive.
    for (const wc of contents) wc.once('destroyed', () => {
      contents.delete(wc);
      if (!contents.size) finish();
    });
    const pending = [...contents];
    if (!pending.length) finish();
    for (const wc of pending) if (!wc.isDestroyed()) wc.close();
    return true;
  };
}

module.exports = { createWindowViewShutdown };
