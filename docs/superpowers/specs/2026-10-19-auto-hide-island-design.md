# Auto-hide the Island

Oct 19, 2026 · From r/blancbrowser feedback: "no hiding menu bar yet … still
using Vivaldi for the full hiding UI." Spec and implementation land together.

## Problem

Blanc's only window chrome is the Island strip: a 68px band above the page
(`frame: false` on every platform, so there is no native title or menu bar to
hide). Vivaldi, Arc and Zen users expect a mode where the page fills the window
and the toolbar comes back on demand. Blanc has no such mode.

## Behaviour

- **Setting:** Settings → General → **Auto-hide the Island**, directly after
  *Open the Island on hover*. Off by default. Device-local (`islandAutoHide`
  in `settings.js`; listed in the schema's `internalDefaults`, never in
  `SYNCED_KEYS`).
- **Toggle:** View → **Auto-hide the Island** (checkbox), ⌘⌥B on macOS and
  Ctrl+Alt+B on Windows and Linux. The shortcut is handled before page dispatch,
  like ⌘⌥V for vertical tabs, so it works whichever view has focus.
- **Hidden:** the active tab, Glance panes and the utility sheet start at
  `y = 0` and take the whole window height. The strip is still loaded
  underneath; only the child-view bounds change. In the vertical layout the
  rail keeps its column. Only the page pane's top band is given back.
- **Reveal:** the pointer within 6px of the window's top edge, while that
  window is focused. Pages move down to make room, exactly as with the setting
  off. They are not overlaid, because the strip is the window's own
  webContents and always draws beneath child views.
- **Pinned:** every surface drawn from the Island keeps it shown: an
  `overlayMode` (panel, ⌘L palette, find, shield, capture, Spaces, group menu,
  Glance picker), an open Glance, or a uBO popup. `showOverlay` reveals before it
  computes overlay bounds, so find and the popovers anchor under a real strip.
- **Hide:** once revealed, a 450ms check samples the cursor
  (`screen.getCursorScreenPoint`) and hides the strip after the pointer leaves
  the strip plus 24px of slack, or leaves the window, and nothing pins it.
  Sampling rather than move events matters: a pointer that leaves the window
  sideways, or rests over an overlay, sends no moves to Blanc.
- **macOS window buttons:** `hiddenInset` draws the traffic lights over the
  top-left corner. While the strip is hidden in the Island layout they would
  sit on the page, so `setWindowButtonVisibility(false)` hides them with the
  strip. In the vertical layout the rail owns that corner and they stay.
- **Hover-open (F1-3…14):** never eligible while the strip is hidden.

## Code

- `src/main/island-autohide.js`: pure policy (`pointHoldsIsland`,
  `islandPinned`, `stripHidden`, constants). No `require('electron')`.
- `src/main/main.js`: `currentChromeLayout()` passes `chromeHeight: 0` while
  `islandStripHidden()`, so every bounds calculation (`resizeActiveView`,
  `currentTabBounds`, Glance, the utility sheet, cursor offsets) follows from
  one place. `revealIslandAtPoint` runs from `watchCursorFor`;
  `scheduleIslandAutoHideCheck` owns the hide; `syncWindowButtons` runs at the
  end of `resizeActiveView`; `applyIslandAutoHide` runs from the settings
  fan-out.
- Runtime fields (`window-runtime-registry.js`): `islandRevealed`,
  `islandAutoHideTimer`, `windowButtonsVisible`, cleared on window close.

## Known limits

- Revealing resizes the page (68px shorter). A smooth slide, or overlaying the
  strip, would need the strip drawn in a view above the page. That is a larger
  follow-up.
- With the strip hidden in the Island layout, the window has no drag region
  until it is revealed.
- No slash command yet. `/hide-island` would need the `copy/slash-commands.json`
  substrate and every language's copy.

## Tests

- Unit: `test/unit/island-autohide.test.js` (policy, layout, wiring) and
  `test/unit/island-autohide-settings.test.js` (default, sanitising, never
  synced, Settings placement).
- Desktop acceptance: F1-15…F1-18 in `spec/acceptance/island-and-commands.feature`
  (`test/desktop/steps/island-autohide.steps.js`), checking the real native
  view bounds. Divergence D29.
