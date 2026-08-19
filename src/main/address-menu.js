const { Menu, clipboard } = require('electron');
const { buildAddressMenu } = require('./address-menu-model');
const { cleanLink } = require('./clean-link');

/**
 * Right-click menu for the island's address input. Wired to the OVERLAY
 * webContents, not tabs — the overlay renderer suppresses contextmenu on
 * everything except #addressInput, and the handler independently re-verifies
 * the target in its field-read round-trip (main is the authority; the
 * renderer listener is cosmetic suppression).
 *
 * `deps` supplies main.js state so this module doesn't import main.js
 * (same cycle-avoidance as context-menu.js):
 *   isOverlayLive()      — window + overlay alive, mode is panel/palette
 *   getWindow()          — the BrowserWindow (popup anchor)
 *   getOverlayBounds()   — overlay view bounds, window-relative
 *   acquireMenuGuard()   — arm main's blur guard; returns a ticket
 *   releaseMenuGuard(t)  — disarm + run close policy, iff t is still current
 *   actions.pasteAndGo(text) — navigate active tab + dismiss overlay
 */

/** The overlay document's address input id — single main-process definition;
 * the test hook imports this so a rename in overlay.html breaks tests instead
 * of silently reading "" forever. */
const ADDRESS_INPUT_ID = 'addressInput';

/** Plain value read, shared with the acceptance binding (test-hook) so the
 * path tests exercise is the production read, not a reimplementation. */
function readAddressFieldText(wc) {
  return wc.executeJavaScript(
    `document.getElementById(${JSON.stringify(ADDRESS_INPUT_ID)})?.value ?? ''`);
}

let attachedCount = 0;
/** Was attachAddressMenu() actually wired to an overlay? The acceptance
 * binding asserts this so deleting the createOverlay() call can't stay green. */
function isAddressMenuAttached() { return attachedCount > 0; }

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
  attachedCount += 1;
  wc.on('context-menu', async (_event, params) => {
    if (!params.isEditable) return;

    // params carries editFlags but not the input's value; read it with one
    // awaited round-trip into Blanc's own chrome document. (A renderer-side
    // "report value on contextmenu" send would travel a different pipe than
    // this event, with no ordering guarantee between them.) The same
    // round-trip verifies the click actually landed on the address input:
    // the renderer's suppression listener should make any other editable
    // unreachable, but if it ever fails to register this menu must not pop
    // for the wrong field with the address bar's text.
    let fieldText;
    try {
      fieldText = await wc.executeJavaScript(`(() => {
        const input = document.getElementById(${JSON.stringify(ADDRESS_INPUT_ID)});
        if (!input) return null;
        const hit = document.elementFromPoint(${Math.round(params.x)}, ${Math.round(params.y)});
        if (!hit || (hit !== input && !input.contains(hit))) return null;
        return input.value;
      })()`);
    } catch {
      return; // overlay destroyed or mid-navigation — no menu, no fallback
    }
    if (typeof fieldText !== 'string') return; // not the address input
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
    // The blur guard is armed HERE, beside popup(), never across the await
    // above — an abort path there would leak it armed and permanently disarm
    // blur dismissal.
    const ticket = deps.acquireMenuGuard();
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
        callback: () => deps.releaseMenuGuard(ticket),
      });
    } catch {
      // A synchronous popup failure would otherwise leave the guard armed and
      // permanently disarm blur dismissal. Same abort-silently policy as the
      // executeJavaScript rejection above.
      deps.releaseMenuGuard(ticket);
    }
  });
}

module.exports = {
  attachAddressMenu,
  runAddressMenuItem,
  readAddressFieldText,
  isAddressMenuAttached,
  ADDRESS_INPUT_ID,
};
