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

Space names (`stack-names.png`, before over after): the menu row's name and
the Island mark's name are clipped for their ellipsis, and both sat on a line
as tall as the font size (line-height 1), so the bottoms of g, p and y were
cut: "Typing gym" reached 14.66 px in a 14 px box. Both names now have a
1.3 line, and `@F41-32` measures every name's ink against its box.

The Spaces glyph (`stack-spaces-glyph.png`, before over after; decision D20):
the stacked windows became a ringed planet in outline, so people coming from
Arc recognise Spaces. It is our own drawing on the 24 grid (a 7-unit planet,
a flat ring tilted 27° down to the right, 2-unit line), shown at 17 px on the
⌘L footer button and 16 px on the Island's quiet mark, a touch larger than
their neighbours. Candidates tried with the owner: a small planet in a wide
ring (outline and solid; too small, read as a saucer), a solid planet with a
cut-out ring (liked, but the footer is line icons), an orbit (busy at this
size), a rocket (less clearly "Spaces"), and an outline with the planet cut
back where the ring crosses (the cuts read as breaks).

Space colours (`stack-colour-island.png` and `stack-colour-menu.png`, before
and after; decision D21): the readability guard adjusted a colour's lightness
per theme, so a custom colour was often not what was picked (white became
grey `#636363`), and no colour could be exact on both light and dark. Now a
space's tile is filled with exactly its colour in every theme, with a white or
black symbol on it, whichever contrasts more (at least 4.5:1; about 4.58:1 at
worst). On the Island the mark is quiet: the colour fills an 18 px square
behind the symbol and the name is the Island's ordinary text. A colour under
3:1 against the surface behind it gets a hairline edge (white on light; black
and graphite on dark). Chosen from mock-ups in the real app over a fully
filled mark (the boldest thing on the Island) and over keeping the tint with a
fixed palette. A long name ellipsizes and never squeezes the square
(`@F41-33`; before the fix it measured 12.6 × 20.7 px).
