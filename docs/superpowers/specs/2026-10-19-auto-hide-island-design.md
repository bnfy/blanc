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
- **Reveal:** the pointer within 10px of the window's top edge, or just above
  it, while that window is focused. On a floating window the band continues
  16px above its top border, since an upward move usually overshoots it; on a
  window against the top of the work area (under the macOS menu bar) it
  reaches to the top of the screen. While the strip is hidden, the focused
  window samples the cursor every 120ms rather than waiting for the page's
  mouse moves: hand testing on a floating macOS window found the page's moves
  alone never revealed it, and a pointer outside the window sends none.
  Below that edge, resting the pointer for 300ms within 40px of the top (it may
  drift up to 8px) also reveals it: hand testing found the 10px edge alone too
  high a reach on a floating window. The dwell keeps a quick reach for a
  website's own top links from revealing the strip and moving the page under
  the pointer. Both bands start at the page pane's left edge: in the vertical
  layout the rail keeps its column and its top rows (the layout button, the
  first tab) never reveal the strip (acceptance F1-27, added 2026-10-19 after
  review).
  Pages move down to make room, exactly as with the setting
  off. They are not overlaid, because the strip is the window's own
  webContents and always draws beneath child views.
- **Motion:** the page slides rather than snaps: down over 160ms when the
  Island appears, up over 200ms when it hides, eased out. Mid-slide the page
  view only moves (it keeps the taller of its two heights and the window clips
  its bottom), so the page lays out once at the end, not on every frame. A
  reveal first asks the strip for two animation frames (capped at 120ms):
  under xvfb the first reveal after a long hide otherwise jumped. Reduce Motion
  snaps. Turning the setting on keeps that window's strip up for the intro, so
  its page never jumps up only to slide back.
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
- **Turning it on:** in the window where it was turned on, the strip stays
  shown for 5 seconds with a tip under the pill: "Point at the top edge, or
  press ⌘L (Ctrl+L), to bring the Island back." Without the tip, the Island
  would disappear with no word on how to get it back, and Windows and Linux
  have no native menu bar to fall back on. The tip reuses the pill's tooltip
  view (`tooltip.html`) with a wrapping `.intro` style, measured in that view
  (`width: max-content`, so not by the view's width), and is pinned like any
  other Island surface until it ends. Any other pill tooltip, an overlay or a
  resize replaces it.

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
- The strip is the window's own page, and its `-webkit-app-region: drag`
  hit-tests above every child view. `syncStripHidden` (end of
  `resizeActiveView`, and once the chrome has loaded) sends
  `chrome:strip-hidden`; the strip adds `.strip-hidden`, which is `no-drag`.
  Without it, the page's top band dragged the window while the strip was
  hidden (found 2026-10-19; it also kept native Wayland from passing pointer
  moves there to the page).
- **Native Wayland (added 2026-10-19).** `screen.getCursorScreenPoint()` reads
  0,0 wherever the pointer is (measured on GNOME 50 with Electron 44), which
  held the strip up for good. `cursorSamplingUnavailable()` (Linux with the
  Wayland ozone platform, `linuxWaylandOzone()`) makes `sampledWindowCursor`
  use `runtime.lastPointer`, the last move a Blanc view saw (`watchCursorFor`),
  instead. The top edge, the rest band and leaving all work from those moves.
- `revealGeometry(runtime)` reads the window's content bounds, the page
  pane's left edge and the band above the window once per reveal tick, hide
  check or edge move; `revealIslandAtPoint` runs on every pointer move, so it
  rejects any move below the 10px edge before reading anything native.
- Hover-open: `updateIslandHover` counts a move as inside the address only
  while the strip is shown. A hidden pill cannot be hovered; counting moves
  over its hidden position disarmed hover-open before the rest band revealed
  the Island under the pointer (acceptance F1-26).

## Known limits

- Revealing resizes the page (68px shorter) in the push style. The float
  style, the default since `2026-10-20-floating-island-design.md`, draws the
  revealed Island in views above the page so the page never moves.
- The hidden strip now keeps a 6px drag band at the page pane's top in both
  styles (same follow-up), so the window can be dragged while it is hidden.
- On native Wayland the pointer outside the window cannot be seen, so the
  band above a floating window's top edge does not reveal the strip, and a
  pointer that leaves the window over the strip keeps it shown until it comes
  back into the window. Point just inside the top edge instead.
- On Windows the drag band drags the window but does not maximise on a
  double-click, in either style (hand check of 2026-10-20). A transparent
  6px drag view behaves the same, so it is how Windows resolves a
  double-click on an app-region, not the band. Pressing just below the band
  zooms but does not drag.
- On Linux in the float style the window's own document (the strip) reports
  `visibilityState 'hidden'` while the page covers it whole and stops
  tracking the window's size, so after a maximise the floating pill and the
  window controls are placed from a stale report and the controls' clicks
  miss. Found in the 2026-10-20 hand check (X11 and Wayland); a fix is
  pending before the next release. Keeping one strip row uncovered avoids it.
- No slash command yet. `/hide-island` would need the `copy/slash-commands.json`
  substrate and every language's copy.

## Tests

- Unit: `test/unit/island-autohide.test.js` (policy, layout, wiring) and
  `test/unit/island-autohide-settings.test.js` (default, sanitising, never
  synced, Settings placement).
- Desktop acceptance: F1-15…F1-27 in `spec/acceptance/island-and-commands.feature`
  (F1-24 runs with no global pointer position, as on Wayland; F1-25 checks the
  hidden strip's drag region; F1-26 hover-open after resting where the hidden
  address will appear; F1-27 the vertical rail)
  (`test/desktop/steps/island-autohide.steps.js`), checking the real native
  view bounds. Divergence D29.
