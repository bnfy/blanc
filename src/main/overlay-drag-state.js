'use strict';
// Main-side half of the island drag guard (drag-reorder spec §2). While the
// flag is true, Escape reaches the overlay so it can cancel the drag, and
// overlay blur is not a dismissal. Only the runtime's own registered overlay
// webContents may set it; everything else is ignored.

function acceptOverlayDragState(runtime, sender, value) {
  if (!runtime || typeof value !== 'boolean') return false;
  const overlayContents = runtime.overlayView?.webContents;
  if (!overlayContents || overlayContents.isDestroyed?.() || sender !== overlayContents) return false;
  if (value && runtime.overlayMode !== 'panel' && runtime.overlayMode !== 'palette') return false;
  runtime.overlayDragging = value;
  return true;
}

function resetOverlayDragState(runtime) {
  if (runtime) runtime.overlayDragging = false;
}

function overlayDragActive(runtime) {
  return runtime?.overlayDragging === true;
}

module.exports = { acceptOverlayDragState, resetOverlayDragState, overlayDragActive };
