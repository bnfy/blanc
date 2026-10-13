# Blanc Spaces redesign — before/after (PR 2)

Captured 2026-10-13 on a scratch profile with three spaces (Work, Reading,
Travel). "Before" is `main` at ec751f7c; "after" is `feat/spaces-redesign`.
Each image is a full-resolution crop, before above after.

| Image | Shows |
| --- | --- |
| `stack-island-light.png`, `stack-island-dark.png` | The Island with the space mark (symbol and name on its colour) |
| `stack-mark-menu.png` | The Spaces menu opened from the mark, hanging below the Island |
| `stack-footer-menu.png` | The ⌘L Spaces menu: over the Island before, below it after; the footer button is icon-only |
| `stack-switch-prompt.png` | The switch prompt (private theme, a private tab is open) |
| `stack-editor-picker.png` | The editor with the custom picker and `#F5E663` typed |
| `stack-tints.png` | The shipping mark beside the dev-only `island` and `frame` tints (spec D2) |

## Measured Island clearance (spec D18)

Window 1100×760 CSS px, measured in the running app.

| Placement | Island edge | Menu top | Clearance |
| --- | --- | --- | --- |
| From the space mark (`'spaces'` mode) | pill bottom 55.5–56 px | 62 px | 6 px below |
| From the ⌘L footer button, after | panel bottom 204 px | 210 px | 6 px below |
| From the ⌘L footer button, before (`main`) | panel bottom 204 px | 8 px | covered the Island |

Also measured: the hovered and selected menu rows are 3 px apart (they never
touch); the footer's Spaces button has no text (its name is in the tooltip);
the editor reads "Kept readable: shown as #6D6400 in light mode." for
`#F5E663`. Acceptance pins the clearance: `@F41-18` asserts the mark's menu
clears the Island and `@F41-4` that the ⌘L menu stays 6 px below the panel as
it reshapes; reverting the anchor fails `@F41-18`.

The editor's colour row (`stack-swatches.png`, before over after): the nine
circles were 22 px with 8 px gaps, leaving the selected ring 2.5 px from its
neighbour. They are now 20 px, spread across the 266 px row with 10.75 px
gaps, and the ring sits 3 px out, so it keeps 6.25 px of clear air.
