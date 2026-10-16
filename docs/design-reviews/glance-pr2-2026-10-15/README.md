# Glance PR 2 — header before/after captures

October 15, 2026. Glance header captured from the dev build through the
test hook (`BLANC_TEST=1`, `webContents.capturePage()` of the header's own
rectangle), full resolution, light theme, before above after with a red
divider. "Before" is `origin/main` at `3fa7c7e4`; "after" is this branch.
In both, the reference pane holds keyboard focus. The reference is a local
fixture page titled "Lisbon travel guide" with no favicon, so the fallback
letter shows.

Spec: `docs/superpowers/specs/2026-10-15-glance-refinement-design.md`.
Plan: `docs/superpowers/plans/2026-10-15-glance-pr2-reference-page.md`.

## header-side-by-side-before-above-after.png

Window content 1200 × 800, Glance side by side.

1. Back and Reload now sit between the GLANCE label and the title. Back is
   greyed out because the reference has nothing to go back to.
2. With the reference focused, the GLANCE label is the full text colour and
   the bottom hairline is darker. Before, the header looked the same whichever
   pane had focus.
3. The title truncates sooner because the two buttons take its room; the full
   title stays in the header's tooltip.

## header-stacked-before-above-after.png

Window content 700 × 800, Glance stacked below the main page.

1. Back and Reload lead the stacked header.
2. The bottom hairline is darker with the reference focused. The stacked
   header still hides the GLANCE label at this width, as before.

## island-clearance-macos-side-by-side-before-above-after.png

Window content 1200 × 800, Glance side by side, macOS. The Island is forced to
its maximum width with a filler, so the result does not depend on how many
tabs are open; the crop is the main pane's strip. "Before" is `origin/main`
at `3fa7c7e4`.

1. Before: the Island reached to within a few pixels of the window's left
   edge, where macOS draws the traffic lights (they are native and do not
   appear in a page capture). This dates from Glance's first release (#139).
2. After: the Island keeps the same 85 px each side it keeps without Glance.

## island-clearance-windows-stacked-vertical-tabs-before-above-after.png

Window content 900 × 800, vertical tabs on, Glance stacked, the strip set to
`data-platform="win32"` with three stand-in buttons in `#windowControls`. The
crop is the page area's strip, right of the rail.

1. Before: the Island ran under minimize, maximize and close.
2. After: it reserves the controls' width on both sides and stays centred.

## island-slim-narrow-main-pane-before-above-after.png

Window content 820 × 800, 13 tabs, Glance side by side with the divider
dragged as far left as it goes, macOS. "Before" is `96fe63cc` (the clearance
fix alone); "after" is the next commit. The crop is the main pane's strip plus
the start of the Glance header.

1. Before: the divider went down to a 404 px main pane, and the Island's
   "+5", favicon and new-tab button ran out of it toward the Glance header.
2. After: the divider stops at a 480 px main pane on macOS. The Island shows
   one dot and folds the rest into "+12", then hides Forward and Favorite.
   Back, new tab, the shield, Reload and Close stay.
