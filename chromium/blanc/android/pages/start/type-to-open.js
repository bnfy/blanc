// Shared by the chrome strip (renderer.js) and the start page (newtab.js):
// both have to decide whether a keystroke on a blank tab means "open the
// island and start typing there". Written once so the two documents cannot
// drift, and kept pure (no DOM, no IPC) so test/unit can run it in a vm.
//
// Served to blanc://newtab flat out of this directory, and to the chrome
// document via SHARED_ASSETS in chrome-protocol.js.
(() => {
  'use strict';

  /**
   * @param {KeyboardEvent} event
   * @param {boolean} isMac
   * @returns {boolean} true when the keystroke is text the user means to
   *   search with, rather than a shortcut or a navigation key.
   */
  function isTypeToOpenKey(event, isMac) {
    if (event.isComposing) return false;
    // Code points, not UTF-16 units — one astral character is one character,
    // and this must agree with island-typing.js on the main side.
    if ([...event.key].length !== 1) return false;
    if (!event.key.trim()) return false;

    if (event.metaKey) return false;

    // AltGr reports ctrlKey AND altKey on Windows and Linux. Rejecting those
    // blanket would drop the whole AltGr layer ("@" on German, "ą" on
    // Polish) — ordinary characters people start searches with.
    const altGraph = typeof event.getModifierState === 'function'
      && event.getModifierState('AltGraph');
    if (altGraph) return true;

    if (event.ctrlKey) return false;
    // Bare Option on macOS is text entry (ø, ∑). Blanc reserves nothing under
    // it: every Alt accelerator it registers is CmdOrCtrl+Alt+… and metaKey
    // already rejects those. Off macOS, bare Alt is command intent.
    if (event.altKey && !isMac) return false;

    return true;
  }

  globalThis.blancTypeToOpen = { isTypeToOpenKey };
})();
