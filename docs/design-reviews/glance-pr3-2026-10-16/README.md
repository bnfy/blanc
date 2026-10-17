# Glance PR 3 — before/after captures

October 16, 2026. Captured from the dev build through the test hook
(`BLANC_TEST=1`, `capturePage()` of the element's own rectangle), full
resolution, light theme, before above after with a red divider. "Before" is
`main` at `57169b3d` (PRs 1 and 2 merged); "after" is this branch. Four
local fixture pages: "Project notes" (the main page), "Lisbon travel guide",
"Quarterly figures" (made quiet) and "Flight booking" (private).

Spec: `docs/superpowers/specs/2026-10-15-glance-refinement-design.md`.
Plan: `docs/superpowers/plans/2026-10-16-glance-pr3-polish.md`.

## picker-rows-before-above-after.png

The Glance picker at a 1200 × 800 window, opened with ⌘⇧G.

1. The highlighted row takes the ⌘L panel's edge-faded wash and weight
   instead of a solid fill, and the card and rows use the panel's radii.
2. "Quarterly figures" is quiet: the row is dimmed like the panel's quiet
   rows and the visible "· quiet" word is gone (it stays in the row's
   accessible name).
3. "Flight booking" is private: the panel's dashed `private` chip sits
   beside the title instead of a word in the secondary line.
4. The secondary line and the keyboard hints are 11 px, the title 13 px.
   Every row also carries a tooltip with its title and host (not visible in
   a capture).

## header-private-before-above-after.png

The reference header with a private reference ("Flight booking"), side by
side at a 1200 × 800 window.

1. After: the `private` chip beside the title, so the dashed border is no
   longer the only cue.
2. With the chip taking room at this width the title keeps its ten
   characters and **Make main** shows its swap icon (PR 2's rule); the
   name and tooltip are unchanged.

## Not captured

Motion (the header and divider sliding in, the picker growing out of its
anchor and shrinking back, Make main's cross-fade) and the Reduce Motion
form are pinned by scenarios reading the computed transitions, not by
stills.
