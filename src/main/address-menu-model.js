// Pure descriptor builder behind the address bar's context menu — extracted
// so enabled-state logic is unit-testable without Electron (address-menu.js
// holds the Menu/clipboard/webContents plumbing). Same split as
// tabicons-model.js / tabicons.js.

const { cleanLink } = require('./clean-link');

/**
 * @param {object} input
 * @param {object} input.editFlags - Blink's flags from the context-menu event
 * @param {string} input.clipboardText - clipboard.readText() at menu time
 * @param {string} input.fieldText - the address input's visible value
 * @returns {Array<{id:string,label:string,accelerator?:string,enabled:boolean}|{type:'separator'}>}
 */
function buildAddressMenu({ editFlags = {}, clipboardText = '', fieldText = '' }) {
  return [
    { id: 'undo', label: 'Undo', accelerator: 'CmdOrCtrl+Z', enabled: !!editFlags.canUndo },
    { id: 'redo', label: 'Redo', accelerator: 'Shift+CmdOrCtrl+Z', enabled: !!editFlags.canRedo },
    { type: 'separator' },
    { id: 'cut', label: 'Cut', accelerator: 'CmdOrCtrl+X', enabled: !!editFlags.canCut },
    { id: 'copy', label: 'Copy', accelerator: 'CmdOrCtrl+C', enabled: !!editFlags.canCopy },
    // Cleans the VISIBLE text, not the tab URL — identical while the field is
    // untouched, and never silently acts on an object other than the one on
    // screen once the user has typed (see the design spec).
    { id: 'copy-clean-link', label: 'Copy Clean Link', enabled: cleanLink(fieldText) !== null },
    { id: 'paste', label: 'Paste', accelerator: 'CmdOrCtrl+V', enabled: !!editFlags.canPaste },
    { id: 'paste-and-go', label: 'Paste and Go', enabled: !!editFlags.canPaste && clipboardText.trim().length > 0 },
    { id: 'delete', label: 'Delete', enabled: !!editFlags.canDelete },
    { type: 'separator' },
    { id: 'select-all', label: 'Select All', accelerator: 'CmdOrCtrl+A', enabled: !!editFlags.canSelectAll },
  ];
}

module.exports = { buildAddressMenu };
