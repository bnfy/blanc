const { Menu, clipboard } = require('electron');
const { buildAddressMenu } = require('./address-menu-model');
const { cleanLink } = require('./clean-link');

/**
 * Right-click menu for the island's address input. Wired to the OVERLAY
 * webContents, not tabs — the overlay renderer suppresses contextmenu on
 * everything except #addressInput, so this handler only ever fires for it.
 *
 * `deps` supplies main.js state so this module doesn't import main.js
 * (same cycle-avoidance as context-menu.js):
 *   isOverlayLive()      — window + overlay alive, mode is panel/palette
 *   getWindow()          — the BrowserWindow (popup anchor)
 *   getOverlayBounds()   — overlay view bounds, window-relative
 *   setMenuOpen(bool)    — toggles main's blur-guard flag
 *   onMenuClosed()       — main's refocus-or-dismiss policy
 *   actions.pasteAndGo(text) — navigate active tab + dismiss overlay
 */

/** Execute one menu item. Exported separately so the acceptance test hook can
 * drive the exact action path a native popup click runs (a native Menu can't
 * be driven by Playwright). */
function runAddressMenuItem(id, { wc, fieldText, actions }) {
  switch (id) {
    // Explicit calls (not menu roles) so edits always target the overlay,
    // never whatever happens to hold focus — same reasoning as context-menu.js.
    case 'undo': return wc.undo();
    case 'redo': return wc.redo();
    case 'cut': return wc.cut();
    case 'copy': return wc.copy();
    case 'paste': return wc.paste();
    case 'delete': return wc.delete();
    case 'select-all': return wc.selectAll();
    case 'copy-clean-link': {
      const cleaned = cleanLink(fieldText);
      if (cleaned !== null) clipboard.writeText(cleaned);
      return;
    }
    case 'paste-and-go': {
      const text = clipboard.readText().trim();
      if (text) actions.pasteAndGo(text);
      return;
    }
  }
}

function attachAddressMenu(wc, deps) {
  wc.on('context-menu', async (_event, params) => {
    if (!params.isEditable) return;

    // params carries editFlags but not the input's value; read it with one
    // awaited round-trip into Blanc's own chrome document. (A renderer-side
    // "report value on contextmenu" send would travel a different pipe than
    // this event, with no ordering guarantee between them.)
    let fieldText;
    try {
      fieldText = await wc.executeJavaScript(
        'document.getElementById("addressInput")?.value ?? ""');
    } catch {
      return; // overlay destroyed or mid-navigation — no menu, no fallback
    }
    // The await opened a lifecycle window: Escape can race the right-click
    // and dismiss the overlay. Revalidate before popping, or the menu would
    // float over nothing.
    if (!deps.isOverlayLive()) return;

    const items = buildAddressMenu({
      editFlags: params.editFlags,
      clipboardText: clipboard.readText(),
      fieldText,
    });
    const menu = Menu.buildFromTemplate(items.map((item) =>
      item.type === 'separator' ? item : {
        label: item.label,
        accelerator: item.accelerator,
        enabled: item.enabled,
        click: () => runAddressMenuItem(item.id, { wc, fieldText, actions: deps.actions }),
      }
    ));

    const bounds = deps.getOverlayBounds();
    // The blur-guard flag is set HERE, beside popup(), never across the await
    // above — an abort path there would leak it set and permanently disarm
    // blur dismissal.
    deps.setMenuOpen(true);
    try {
      menu.popup({
        window: deps.getWindow(),
        // params.x/y are overlay-webContents-relative; popup wants
        // window-relative. Explicit coordinates also make keyboard invocation
        // (Shift+F10 / menu key) land at Chromium's caret-anchored position
        // instead of the mouse.
        x: Math.round(bounds.x + params.x),
        y: Math.round(bounds.y + params.y),
        // Electron's context-menu guide recommends forwarding sourceType so
        // Windows/Linux can adjust for keyboard vs. mouse invocation.
        sourceType: params.menuSourceType,
        frame: params.frame ?? undefined,
        callback: () => {
          deps.setMenuOpen(false);
          deps.onMenuClosed();
        },
      });
    } catch {
      // A synchronous popup failure would otherwise leave the flag set and
      // permanently disarm blur dismissal. Same abort-silently policy as the
      // executeJavaScript rejection above.
      deps.setMenuOpen(false);
    }
  });
}

module.exports = { attachAddressMenu, runAddressMenuItem };
