// src/main/workspace-context-menu-model.js
// Pure descriptor builder for a workspace row's right-click menu — Rename and
// Delete only. Deliberately a SEPARATE module from tab-context-menu-model.js:
// that file models TAB actions (close, pin, mute, move-to-group), and
// grafting workspace verbs onto it would muddle both vocabularies. Same
// split as tab-context-menu-model.js/tab-context-menu.js: this file is the
// electron-free template (no `require('electron')`), workspace-context-
// menu.js owns the webContents listener + Menu.popup.
//
// No conditional items: a row is only ever right-clickable when it already
// resolved to a real, existing workspace (workspace-context-menu.js's
// resolveWorkspace gate), so Rename/Delete are always valid.

function buildWorkspaceContextMenu(_workspace) {
  return [
    { id: 'rename', label: 'Rename…' },
    { id: 'delete', label: 'Delete…' },
  ];
}

module.exports = { buildWorkspaceContextMenu };
