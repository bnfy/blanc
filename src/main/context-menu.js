const { Menu, clipboard } = require('electron');
const settings = require('./settings');
const { VIEW_SOURCE_PREFIX, canViewSource } = require('./view-source');

/**
 * Right-click menu for tab web content. Electron ships NO default context
 * menu — without this, right-click does nothing at all.
 *
 * `actions` supplies tab-model callbacks so this module doesn't import
 * main.js (which requires this file — avoid the cycle):
 *   openBackgroundTab(url) — new tab, not activated
 *   openTab(url)           — new tab, activated
 *   t(key, params)         — the interface translator
 */
function attachContextMenu(wc, actions, menuGate = null) {
  const { t } = actions;
  const showContextMenu = (params) => {
    const items = [];
    const push = (item) => items.push(item);
    const sep = () => {
      if (items.length && items[items.length - 1].type !== 'separator') push({ type: 'separator' });
    };

    if (params.linkURL) {
      push({ label: t('contextMenu.openLinkInNewTab'), click: () => actions.openBackgroundTab(params.linkURL) });
      push({ label: t('contextMenu.copyLinkAddress'), click: () => clipboard.writeText(params.linkURL) });
      sep();
    }

    if (params.mediaType === 'image' && params.srcURL) {
      push({ label: t('contextMenu.openImageInNewTab'), click: () => actions.openBackgroundTab(params.srcURL) });
      push({ label: t('contextMenu.copyImage'), click: () => wc.copyImageAt(params.x, params.y) });
      push({ label: t('contextMenu.copyImageAddress'), click: () => clipboard.writeText(params.srcURL) });
      push({ label: t('contextMenu.saveImageAs'), click: () => wc.downloadURL(params.srcURL) });
      sep();
    }

    if (params.isEditable) {
      for (const suggestion of (params.dictionarySuggestions ?? []).slice(0, 5)) {
        push({ label: suggestion, click: () => wc.replaceMisspelling(suggestion) });
      }
      if (params.misspelledWord) {
        push({
          label: t('contextMenu.addToDictionary'),
          click: () => wc.session.addWordToSpellCheckerDictionary(params.misspelledWord),
        });
      }
      sep();
      // Explicit calls (not menu roles) so edits always target this tab's
      // webContents, never whatever happens to hold focus.
      push({ label: t('menu.undo'), accelerator: 'CmdOrCtrl+Z', click: () => wc.undo() });
      push({ label: t('menu.redo'), accelerator: 'Shift+CmdOrCtrl+Z', click: () => wc.redo() });
      sep();
      push({ label: t('menu.cut'), accelerator: 'CmdOrCtrl+X', enabled: !!params.selectionText, click: () => wc.cut() });
      push({ label: t('menu.copy'), accelerator: 'CmdOrCtrl+C', enabled: !!params.selectionText, click: () => wc.copy() });
      push({ label: t('menu.paste'), accelerator: 'CmdOrCtrl+V', click: () => wc.paste() });
      push({ label: t('menu.selectAll'), accelerator: 'CmdOrCtrl+A', click: () => wc.selectAll() });
      sep();
    } else if (params.selectionText.trim()) {
      push({ label: t('menu.copy'), accelerator: 'CmdOrCtrl+C', click: () => wc.copy() });
      const query = params.selectionText.trim().slice(0, 100);
      const shown = query.length > 30 ? `${query.slice(0, 30)}…` : query;
      push({ label: t('contextMenu.searchFor', { query: shown }), click: () => actions.openTab(settings.searchUrlFor(query)) });
      sep();
    }

    // Plain page background: navigation controls.
    if (!params.linkURL && !params.isEditable && !params.selectionText.trim() && params.mediaType === 'none') {
      push({ label: t('contextMenu.back'), enabled: wc.navigationHistory.canGoBack(), click: () => wc.navigationHistory.goBack() });
      push({ label: t('contextMenu.forward'), enabled: wc.navigationHistory.canGoForward(), click: () => wc.navigationHistory.goForward() });
      push({ label: t('menu.reload'), click: () => wc.reload() });
      // New tab, NOT in-place — and don't "simplify" this to wc.loadURL().
      // Chromium REPLACES the current history entry when navigating to
      // view-source: of the page you're already on (measured: entry count
      // stays flat), so Back would silently skip the article you were
      // reading and land on whatever preceded it. A fresh tab leaves Back
      // dead instead, which the pill's "source" chip exists to escape.
      // `pageURL` is the top-level document even when the right-click
      // landed inside a subframe.
      if (canViewSource(params.pageURL)) {
        push({
          label: t('contextMenu.viewSource'),
          click: () => actions.openTab(`${VIEW_SOURCE_PREFIX}${params.pageURL}`),
        });
      }
      sep();
    }

    push({ label: t('contextMenu.inspect'), click: () => wc.inspectElement(params.x, params.y) });
    const extensionItems = actions.extensionItems?.(params) ?? [];
    if (extensionItems.length) { sep(); for (const item of extensionItems) push(item); }

    Menu.buildFromTemplate(items).popup();
  };
  wc.on('context-menu', (_event, params) => {
    if (menuGate?.(params) === false) return;
    showContextMenu(params);
  });
}

module.exports = { attachContextMenu };
