const { Menu, clipboard } = require('electron');
const settings = require('./settings');

/**
 * Right-click menu for tab web content. Electron ships NO default context
 * menu — without this, right-click does nothing at all.
 *
 * `actions` supplies tab-model callbacks so this module doesn't import
 * main.js (which requires this file — avoid the cycle):
 *   openBackgroundTab(url) — new tab, not activated
 *   openTab(url)           — new tab, activated
 */
function attachContextMenu(wc, actions) {
  wc.on('context-menu', (_event, params) => {
    const items = [];
    const push = (item) => items.push(item);
    const sep = () => {
      if (items.length && items[items.length - 1].type !== 'separator') push({ type: 'separator' });
    };

    if (params.linkURL) {
      push({ label: 'Open Link in New Tab', click: () => actions.openBackgroundTab(params.linkURL) });
      push({ label: 'Copy Link Address', click: () => clipboard.writeText(params.linkURL) });
      sep();
    }

    if (params.mediaType === 'image' && params.srcURL) {
      push({ label: 'Open Image in New Tab', click: () => actions.openBackgroundTab(params.srcURL) });
      push({ label: 'Copy Image', click: () => wc.copyImageAt(params.x, params.y) });
      push({ label: 'Copy Image Address', click: () => clipboard.writeText(params.srcURL) });
      push({ label: 'Save Image As…', click: () => wc.downloadURL(params.srcURL) });
      sep();
    }

    if (params.isEditable) {
      for (const suggestion of (params.dictionarySuggestions ?? []).slice(0, 5)) {
        push({ label: suggestion, click: () => wc.replaceMisspelling(suggestion) });
      }
      if (params.misspelledWord) {
        push({
          label: 'Add to Dictionary',
          click: () => wc.session.addWordToSpellCheckerDictionary(params.misspelledWord),
        });
      }
      sep();
      // Explicit calls (not menu roles) so edits always target this tab's
      // webContents, never whatever happens to hold focus.
      push({ label: 'Undo', accelerator: 'CmdOrCtrl+Z', click: () => wc.undo() });
      push({ label: 'Redo', accelerator: 'Shift+CmdOrCtrl+Z', click: () => wc.redo() });
      sep();
      push({ label: 'Cut', accelerator: 'CmdOrCtrl+X', enabled: !!params.selectionText, click: () => wc.cut() });
      push({ label: 'Copy', accelerator: 'CmdOrCtrl+C', enabled: !!params.selectionText, click: () => wc.copy() });
      push({ label: 'Paste', accelerator: 'CmdOrCtrl+V', click: () => wc.paste() });
      push({ label: 'Select All', accelerator: 'CmdOrCtrl+A', click: () => wc.selectAll() });
      sep();
    } else if (params.selectionText.trim()) {
      push({ label: 'Copy', accelerator: 'CmdOrCtrl+C', click: () => wc.copy() });
      const query = params.selectionText.trim().slice(0, 100);
      const shown = query.length > 30 ? `${query.slice(0, 30)}…` : query;
      push({ label: `Search for “${shown}”`, click: () => actions.openTab(settings.searchUrlFor(query)) });
      sep();
    }

    // Plain page background: navigation controls.
    if (!params.linkURL && !params.isEditable && !params.selectionText.trim() && params.mediaType === 'none') {
      push({ label: 'Back', enabled: wc.navigationHistory.canGoBack(), click: () => wc.navigationHistory.goBack() });
      push({ label: 'Forward', enabled: wc.navigationHistory.canGoForward(), click: () => wc.navigationHistory.goForward() });
      push({ label: 'Reload', click: () => wc.reload() });
      sep();
    }

    push({ label: 'Inspect Element', click: () => wc.inspectElement(params.x, params.y) });

    Menu.buildFromTemplate(items).popup();
  });
}

module.exports = { attachContextMenu };
