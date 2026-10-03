'use strict';
const { calculateShieldBounds } = require('./chrome-layout');
function popupGeometry(runtime, anchor, naturalHeight = 490) {
  const [windowWidth, windowHeight] = runtime.window.getContentSize();
  const bounds = calculateShieldBounds({ windowWidth, windowHeight, stripHeight: runtime.chromeHeight,
    anchorRight: anchor?.right, anchorCenter: anchor?.center, anchorBottom: anchor?.bottom });
  bounds.height = Math.min(Math.ceil(naturalHeight) + 22, Math.max(0, windowHeight - bounds.y));
  return { bounds, state: {
    pointer: Math.max(32, Math.min(bounds.width - 32, (anchor?.center ?? bounds.x + bounds.width / 2) - bounds.x)),
    connected: Number.isFinite(anchor?.center), maxHeight: Math.max(0, windowHeight - bounds.y - 22),
  } };
}
function validPopupSender(event, popup, session) {
  const wc = popup?.view?.webContents;
  return !!wc && !wc.isDestroyed() && event.sender === wc && event.senderFrame === wc.mainFrame
    && wc.session === session && wc.getURL() === popup.url
    && popup.runtime.activeTabId === popup.tabId && !popup.runtime.window.isDestroyed();
}
function validPopupMessage(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (value.action === 'layout') return Object.keys(value).length === 2
    && Number.isFinite(value.height) && value.height >= 0 && value.height <= 20000;
  return ['close', 'back'].includes(value.action) && Object.keys(value).length === 1;
}
// A view blur can be caused by a navigation completing under the popup.
// Dismiss only for native user input outside it or actual window deactivation.
function wirePopupDismissal({ window, outsideContents, dismiss }) {
  const listeners = [];
  const on = (target, event, callback) => {
    target.on(event, callback);
    listeners.push(() => target.removeListener(event, callback));
  };
  on(window, 'blur', dismiss);
  for (const wc of new Set(outsideContents.filter(wc => wc && !wc.isDestroyed()))) {
    on(wc, 'before-mouse-event', (_event, input) => { if (input.type === 'mouseDown') dismiss(); });
    on(wc, 'before-input-event', (_event, input) => { if (input.type === 'keyDown') dismiss(); });
  }
  return () => { for (const off of listeners.splice(0)) off(); };
}
module.exports = { popupGeometry, validPopupSender, validPopupMessage, wirePopupDismissal };
