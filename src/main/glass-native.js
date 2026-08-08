// EXPERIMENT — thin, failure-tolerant wrapper around the NSGlassEffectView
// addon (src/native/glass.mm). The addon is built out-of-tree by node-gyp and
// is absent on every non-mac platform and on any machine that hasn't run the
// rebuild, so nothing here may throw at require time.
'use strict';

const path = require('node:path');

let native = null;
let loadError = null;

if (process.platform === 'darwin') {
  try {
    // eslint-disable-next-line import/no-dynamic-require, global-require
    // native/glass/ has its own build dir on purpose: node-gyp treats `build/`
    // as scratch and wipes it, and the repo's own build/ holds the signing
    // entitlements, provisioning profile and app icons electron-builder needs.
    native = require(
      path.join(__dirname, '..', '..', 'native', 'glass', 'build', 'Release', 'glass.node')
    );
  } catch (err) {
    loadError = err;
  }
}

/** True only when the addon loaded AND the OS actually has macOS 26's glass. */
function isSupported() {
  try {
    return !!native && native.isSupported();
  } catch {
    return false;
  }
}

function why() {
  if (process.platform !== 'darwin') return 'not macOS';
  if (loadError) return `addon not built: ${loadError.message.split('\n')[0]}`;
  if (!isSupported()) return 'NSGlassEffectView unavailable (needs macOS 26+)';
  return 'ok';
}

/**
 * Frames arrive in CSS coordinates (origin top-left, matching how the rest of
 * main.js reasons about bounds) and are flipped to AppKit's bottom-left origin
 * here, so callers never have to think about it.
 */
function flip(rect, contentHeight) {
  return {
    x: rect.x,
    y: contentHeight - rect.y - rect.height,
    width: rect.width,
    height: rect.height,
  };
}

function attach(win, rect, opts = {}) {
  if (!isSupported()) return false;
  const { height } = win.getContentBounds();
  native.attach(win.getNativeWindowHandle(), {
    ...flip(rect, height),
    cornerRadius: opts.cornerRadius ?? rect.height / 2,
    style: opts.style ?? 'regular',
    interactive: opts.interactive ?? true,
    // Slot in beneath the topmost subview — the island's contents — so they
    // render on the glass rather than being refracted by it.
    belowTop: opts.belowTop ?? true,
    zOrder: opts.zOrder || process.env.BLANC_GLASS_Z || 'default',
  });
  return true;
}

function setFrame(win, rect, opts = {}) {
  if (!isSupported()) return;
  const { height } = win.getContentBounds();
  native.setFrame({
    ...flip(rect, height),
    cornerRadius: Number.isFinite(opts.cornerRadius) ? opts.cornerRadius : rect.height / 2,
  });
}

function raise() {
  if (isSupported()) native.raise();
}

function setHidden(hidden) {
  if (isSupported()) native.setHidden(!!hidden);
}

function detach() {
  if (isSupported()) native.detach();
}

module.exports = { isSupported, why, attach, setFrame, raise, setHidden, detach };

/** Diagnostic only — dumps the window's real AppKit subview tree. */
function describe(win) {
  if (!native) return ['<addon not loaded>'];
  return native.describe(win.getNativeWindowHandle()) || [];
}
module.exports.describe = describe;
