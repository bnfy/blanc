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
 * @param {function} input.t - the interface translator
 * @returns {Array<{id:string,label:string,accelerator?:string,enabled:boolean}|{type:'separator'}>}
 */
function buildAddressMenu({ editFlags = {}, clipboardText = '', fieldText = '', t }) {
  return [
    { id: 'undo', label: t('menu.undo'), accelerator: 'CmdOrCtrl+Z', enabled: !!editFlags.canUndo },
    { id: 'redo', label: t('menu.redo'), accelerator: 'Shift+CmdOrCtrl+Z', enabled: !!editFlags.canRedo },
    { type: 'separator' },
    { id: 'cut', label: t('menu.cut'), accelerator: 'CmdOrCtrl+X', enabled: !!editFlags.canCut },
    { id: 'copy', label: t('menu.copy'), accelerator: 'CmdOrCtrl+C', enabled: !!editFlags.canCopy },
    // Cleans the VISIBLE text, not the tab URL — identical while the field is
    // untouched, and never silently acts on an object other than the one on
    // screen once the user has typed (see the design spec).
    { id: 'copy-clean-link', label: t('menu.copyCleanLink'), enabled: cleanLink(fieldText) !== null },
    { id: 'paste', label: t('menu.paste'), accelerator: 'CmdOrCtrl+V', enabled: !!editFlags.canPaste },
    { id: 'paste-and-go', label: t('addressMenu.pasteAndGo'), enabled: !!editFlags.canPaste && clipboardText.trim().length > 0 },
    { id: 'delete', label: t('menu.delete'), enabled: !!editFlags.canDelete },
    { type: 'separator' },
    { id: 'select-all', label: t('menu.selectAll'), accelerator: 'CmdOrCtrl+A', enabled: !!editFlags.canSelectAll },
  ];
}

module.exports = { buildAddressMenu };
