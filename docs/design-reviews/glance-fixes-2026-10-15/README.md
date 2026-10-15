# Glance fixes (PR 1 of 3) — before/after captures

October 15, 2026. Strip band captured from the dev build through the
acceptance harness (`BLANC_TEST=1`, `webContents.capturePage()` of the chrome
strip), full resolution, before above after with a red divider. "Before" is
`origin/main` at `eee07041`; "after" is this branch.

Spec: `docs/superpowers/specs/2026-10-15-glance-refinement-design.md`.
Plan: `docs/superpowers/plans/2026-10-15-glance-fixes.md`.

## stacked-island-centre-before-above-after.png

Window content 700 × 800, Glance stacked.

1. Before: the Island is centred at about 34 % of the width (the strip
   centred it over 68 % of the page).
2. After: the Island is centred over the full page width, which is what the
   stacked main page occupies.

## window-controls-over-header-before-above-after.png

Window content 1200 × 800, Glance side by side, a dark page tint forced on
the strip (`tint-dark`, `--page-bg: #1b2340`) and three Windows-style
buttons placed in `#windowControls` so the cascade can be seen on macOS.
Right-hand 550 CSS px of the strip.

1. Before: the minimise / maximise / close glyphs are near-invisible white
   over the header's neutral surface.
2. After: they take the theme's ink (`--text-dim`) and the header reserves
   the Windows control width (`--window-controls-w`). The before row keeps
   macOS spacing because the old code decided the inset from the real OS
   platform at runtime; the after row shows the `data-platform="win32"`
   layout.
