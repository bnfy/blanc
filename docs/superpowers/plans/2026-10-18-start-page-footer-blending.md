# Start page footer blending: implementation plan

Spec: `docs/superpowers/specs/2026-10-18-start-page-footer-blending-design.md`.
Almost all changes are in `src/renderer/pages/pages.css`. `newtab.js` and
`newtab-wallpaper.js` already provide `--start-footer-h`, `body.has-underflow`
and `body[data-wallpaper-phase]`.

## Task 1: Capture the before state

1. `npm start`, open a start page, and take screenshots at 1440 × 900 and
   900 × 900 of each phase (sunrise default, then day, dusk and night forced by
   setting `data-wallpaper-phase` and the layer image in DevTools) in light,
   dark and private. Also one Ledger capture with enough favorites to set
   `has-underflow`.
2. Keep them in the scratchpad for the before/after comparison.

## Task 2: Sample the twelve tints

1. Write a one-off script (scratchpad, run under Electron) that loads each
   `start-page-*.png` with `nativeImage`, averages the bottom 8% of rows, and
   composites the bottom stop of each theme's overlay
   (`--start-wallpaper-overlay`, or `--start-wallpaper-evening-overlay` for
   dusk and night) over it.
2. Record the twelve resulting colors in the spec's Design §2 as a table.
3. For each, compute the contrast of `--text-dim`; where it is under 4.5:1,
   pick the nearest `--start-footer-ink` that passes and record it.

## Task 3: Failing test

Add `test/unit/newtab-footer-blend.test.js`, reading `pages.css`:

- `.ledger-footer` has no `background` or `backdrop-filter` outside the
  `has-underflow`, reduced-transparency and more-contrast rules;
- `--start-footer-tint` is defined for the default and for each of
  `dawn|day|dusk|night` in light, dark and private;
- `@property --start-footer-tint` is registered with `syntax: '<color>'`;
- every tint and ink pair reaches 4.5:1 (a small WCAG helper in the test);
- `--start-footer` is no longer defined or read.

Run `node --test test/unit/newtab-footer-blend.test.js` and see it fail.

## Task 4: Scrim in the wallpaper stack

1. Define the default tint (and ink, where needed) in the three `.ledger-body`
   theme blocks, next to `--start-wallpaper-overlay`.
2. Prepend the bottom scrim gradient (spec §1) to `background-image` in those
   three blocks and in `.start-wallpaper-layer`; add matching
   `background-position`/`size`/`repeat` entries.
3. Add the phase tints on `.start-wallpaper-layer[data-wallpaper-phase=…]`
   and on `body[data-wallpaper-phase=…]` for each theme.
4. Register `@property --start-footer-tint`, transition it on `body` for 2 s,
   and drop the transition under `prefers-reduced-motion`.

## Task 5: Transparent footer, feathered frost on underflow

1. In the `.ledger-footer` rule near line 3074, remove `background` and
   `backdrop-filter`; set `color: var(--start-footer-ink, var(--text-dim))`.
2. Delete the `::before` fade rules near line 3535.
3. Add the `body.has-underflow .ledger-footer` rule from spec §4, with the
   extra top padding equal to the feather and a 160 ms transition on
   `background-color` and `backdrop-filter`.
4. Leave the reduced-transparency and more-contrast blocks giving the footer
   the solid `--onboarding-surface`, now set directly instead of through
   `--start-footer`; remove `--start-footer` everywhere.
5. Check the four pills and the Customize button still read as objects on
   all twelve backgrounds; adjust only their existing fill tokens if one
   disappears.

## Task 6: Checks

1. `node --test test/unit/newtab-footer-blend.test.js` passes.
2. `npm run test:unit`, `npm run lint`, `npm run substrate:check`.
3. Relaunch `npm start` (chrome-level CSS is not live-reloaded for pages
   either when cached) and repeat Task 1's captures; compare side by side.
   Also check: reduced transparency, increased contrast, reduced motion, the
   narrow two-row footer, the Customize and checklist popovers opening above
   the footer, and a phase change during the 2 s crossfade.
4. Run the start page desktop scenarios
   (`npm run test:acceptance:desktop -- --tags @newtab` or the closest tag).

## Task 7: PR

Open one PR with the spec, plan, CSS and test, including the before/after
captures. No website or marketing changes until a release ships it.
