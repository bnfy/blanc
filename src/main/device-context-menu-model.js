// src/main/device-context-menu-model.js
// Pure descriptor builder for a device header's right-click menu in the ⌘L
// panel's Other devices drawer (spec 2026-10-16-island-lower-section §6, §7.1).
// Same split as group-context-menu-model.js: this file is the electron-free
// template; device-context-menu.js owns the listener and popup.

function buildDeviceContextMenu(t) {
  return [{ id: 'rename', label: t('deviceMenu.rename') }];
}

module.exports = { buildDeviceContextMenu };
