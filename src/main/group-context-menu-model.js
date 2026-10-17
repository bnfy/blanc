// src/main/group-context-menu-model.js
// Pure descriptor builder for a tab group header's right-click menu, in the
// ⌘L panel and on the vertical tabs rail (spec 2026-10-16-island-lower-section
// §9.3). Same split as workspace-context-menu-model.js: this file is the
// electron-free template; group-context-menu.js owns the listener and popup.
// A header is only right-clickable once it resolved to a live group, so every
// item is always valid.

function buildGroupContextMenu(t) {
  return [
    { id: 'rename', label: t('groupMenu.rename') },
    { type: 'separator' },
    { id: 'ungroup', label: t('groupMenu.ungroup') },
    { id: 'close-group', label: t('groupMenu.close') },
  ];
}

module.exports = { buildGroupContextMenu };
