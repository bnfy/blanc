/Users/anthonyjloria/.rvm/scripts/rvm:29: operation not permitted: ps
# Mahjong Burst momentum and hint design QA — 2026-08-31

**Final result:** passed

## Comparison and live evidence

- Native reference app: Mahjong Blast on macOS, observed through live play rather than static marketing media.
- Reference combo evidence: `/private/tmp/mahjong-blast-combo-3.jpg` and `/private/tmp/mahjong-blast-combo-3-settled.jpg`.
- Reference board-to-rack and match recording: `/private/tmp/mahjong-blast-tray-match-detailed.mov`; frame-level evidence in `/private/tmp/blast-match-detailed-frames/` captures lift, flight, landing, pair separation, fragment burst, score count-up, and combo callout.
- Reference hint evidence: `/private/tmp/mahjong-blast-hint.jpg` and `/private/tmp/mahjong-blast-hint-pulse.jpg`.
- Blanc Burst hint: `/private/tmp/blanc-burst-hint.jpg`.
- Blanc animated ×5 milestone: `/private/tmp/blanc-burst-combo-5-final.jpg`.
- Blanc final prominent score and high-visibility rack: `/private/tmp/blanc-burst-score-rack-final.png`.
- Blanc final layered score material and ambient twinkle treatment: `/private/tmp/blanc-burst-score-depth-final.png`.
- Blanc filled-slot ink regression check, including a vector character tile beside raster faces: `/private/tmp/blanc-burst-filled-ink-final.png`.
- Blanc final icon-first desktop rail: `/private/tmp/blanc-mahjong-icon-rail-final.png`; keyboard-focus tooltip and live score/wind-badge check: `/private/tmp/blanc-mahjong-icon-tooltip-final.png`.
- Blanc elevated rescue and setup surfaces: `/private/tmp/blanc-mahjong-dialog-polish-final.png` and `/private/tmp/blanc-mahjong-setup-polish-final.png`.
- Final header polish: `/private/tmp/blanc-mahjong-header-polish-final.png`; the live reload confirms the enlarged Daily/layout/Burst identity and grouped pairs, time, score, and combo lacquer status surface remain balanced above the board.
- Rebuilt hidden-footer state: `/private/tmp/blanc-mahjong-footer-hidden-final.png`; the device-local preference survives a full Electron restart, the game reclaims the full 64px band, and the ivory `SHOW FOOTER` handle remains visible and keyboard accessible.
- Blanc reduced-motion hint and ×5 milestone: `/private/tmp/blanc-burst-hint-reduced-motion.jpg` and `/private/tmp/blanc-burst-combo-5-reduced-motion-final.jpg`.

## Findings

There are no remaining actionable P0, P1, or P2 findings.

- Mahjong Blast makes consecutive matches legible through rising points, a white-to-gold score transition, persistent sparkles, and broad tile-fragment bursts. Blanc now gives every Burst pair a lighter particle impact, heats the score and rack as the combo grows, and retains stronger FLOWING, BRILLIANT, and MASTERFUL milestones with automatic clears.
- Mahjong Blast treats the board-to-rack move as a full-size, high-z tile flight into a brightly acknowledged well; matching tiles briefly hold, separate, then shatter at the rack. Blanc now follows that readable sequence with a 320ms arcing tile flight, mint/brass receiving glow, pair separation, and a locally bundled rack-centered fragment burst. The interaction remains immediate under reduced motion.
- Mahjong Blast's rack tiles are proportionally larger and far higher contrast than Blanc's prior miniature faces. Burst now uses 64×74px desktop tiles with complete ivory bodies, lacquer-edge depth, stronger ink, more separation, and a deeper inset rack. A live pass also caught and fixed the vector character tiles inheriting the empty-slot color at 22% opacity; every filled rack tile now uses full-strength face ink.
- Rotated compass artwork alone did not distinguish opposing wind-seal variants at rack size. Each seal now carries a high-contrast, direction-colored N/E/S/W badge so similar silhouettes cannot be mistaken for a pair.
- The score now sits directly above the Burst rack as a large tabular number, counts upward during the arrival, receives a visible `+points` flight, and turns increasingly gold and sparkled as the streak heats. Its ivory-to-brass face, outlined engraving, dark extruded edge, soft halo, ambient twinkles, and point-impact lift give the number depth even before a streak begins. The redundant large `SCORE` label was removed after live visual review; the compact header keeps the semantic label and the rack number remains assistively hidden to avoid duplicate announcements.
- The desktop control rail is now icon-first: labels remain in the accessibility tree, the SVG icons grow from 22px to 34px inside the circles, and styled lacquer tooltips appear on hover or keyboard focus. Sound tooltip/name state follows the toggle.
- Setup, rescue, and win surfaces now share presentation-scale type, larger 48–52px action targets, more dimensional layered lacquer cards, stronger selected/primary controls, and a clearer headline/body/stat hierarchy instead of utility-scale dialog text.
- The celebration pass now avoids expensive full-surface screen blending and per-slot layout flushes. Particle/glint motion stays on isolated transform/opacity layers, the rack burst attacks in 60ms and clears in 500ms, and ordinary/milestone tails finish in 560–760ms instead of lingering for 820–1250ms.
- The animated combo callout is now a tier-aware reward capsule with a separate uppercase label and dimensional `×N`, rather than a single flat text string. The persistent header uses larger numeric type, grouped lacquer surfaces, stronger dividers, and a thicker countdown rail to match the elevated board and rack.
- Mahjong mode can now collapse the start-page footer and expand into the recovered space. The choice is device-local, survives restart, exposes a reversible show/hide control only in Mahjong, and uses a 260ms snapshot transition so the embedded game lays out only at stable endpoints instead of reflowing every animation frame. Hover and focus retain high-contrast ivory text and icon color.
- Mahjong Blast hints both members of a pair with a bright cyan underglow and a repeated lift/rock gesture. Blanc now uses an equivalently distinct cyan pair pulse for two board tiles and for a board tile paired with one already in the Burst rack.
- Mahjong Blast resets its multiplier on a blocked-tile mistake but does not expose a timer. Blanc deliberately keeps its five-second actionable-time window because speed is the differentiating promise of Burst; blocked taps gain a clear red × and shake without adding a second hidden combo-reset rule.
- The public label is now **Burst** everywhere visible and assistive. The persisted/internal identifier remains `tray` so existing saves, records, duplicate-tab recovery, and telemetry stay compatible.
- Reduced motion removes travel, particles, glints, shaking, and pulsing while retaining static cyan hint rings, heated score color, milestone labeling, and the red blocked mark.

# Glance design QA

**Final result:** passed

## Comparison target

- Source visual truth: `docs/superpowers/specs/assets/glance-focused-island.png`
- Rendered implementation: `docs/superpowers/specs/assets/glance-picker-final-pass.png`
- Final full-view comparison: `docs/superpowers/specs/assets/glance-design-qa-final.jpg`
- Focused header comparison: `docs/superpowers/specs/assets/glance-design-qa-header-final.png`
- Focused picker comparison: `docs/superpowers/specs/assets/glance-design-qa-picker-final.png`
- Responsive/theme evidence:
  - `docs/superpowers/specs/assets/glance-stacked-final.png`
  - `docs/superpowers/specs/assets/glance-dark-picker-final.png`
  - `docs/superpowers/specs/assets/glance-private-reference-final-isolated.png`

## Normalization

- Source pixels: 1586×992.
- Implementation pixels and CSS viewport: 1229×768, captured from the live
  macOS Electron window with no browser or page zoom. The Computer Use capture
  is normalized to one output pixel per reported app-content point.
- Density normalization: the source was downsampled to 1229×768; the
  implementation was left unchanged. The source and implementation are shown
  together in the 2458×768 final comparison. Their original aspect ratios
  differ by less than 0.1 percent.
- Focused header evidence normalizes both header regions to 474×61. Focused
  picker evidence compares 402×430 source and implementation regions at the
  same output size.
- State: macOS, light appearance, Postel as the main tab, Nintendo as the
  Glance reference, and the Change picker open. Dynamic Nintendo carousel
  content and the eligible local-tab list differ from the generated mock by
  design; pane ownership and picker state match.

## Findings

There are no remaining actionable P0, P1, or P2 findings.

- Fonts and typography: the final header uses the approved single-row
  `GLANCE | favicon + title` hierarchy. Picker heading, filter, rows, metadata,
  and keyboard hint now match the source's comfortable density while retaining
  Blanc's bundled UI and mono families. Long live titles truncate without
  moving the actions.
- Spacing and layout rhythm: the Island remains centered over the dominant
  pane; the reference has one flat header; the picker is a compact 420px-max
  popover anchored 24px from the reference edge; list rows end cleanly before
  the footer; the 12px divider and 4px grip remain visually quiet. The written
  approved rule intentionally governs the live 62/38 split even though the
  generated source image is slightly closer to 58/42.
- Colors and tokens: the implementation uses the existing surface, border,
  text, accent-dim, private, shadow, and focus tokens. Light, dark, and private
  captures preserve hierarchy and contrast without introducing a Glance-only
  color system.
- Image quality and asset fidelity: no source imagery was recreated in CSS or
  replaced with placeholders. Live page content stays live, and the header and
  picker reuse each tab's real cached favicon. No new raster UI asset ships.
- Copy and content: `GLANCE`, `Make main`, `Change`, `Choose a tab for Glance`,
  `Filter open tabs`, empty/error strings, and keyboard hints are coherent and
  match the approved interaction contract. Extra dynamic metadata (`quiet`,
  host) is real tab state rather than design-prompt leakage.
- Icons and affordances: existing Blanc close, direction, favicon, and private
  marks retain the product's stroke and sizing language. The small visible
  picker close control is an intentional accessibility/usability refinement;
  Escape and outside-click cancellation remain available.
- Responsiveness: the live 700×800 capture stacks the panes, reserves the 44px
  reference header, and keeps Make main, Change, and close inside the viewport.
  Desktop side-by-side and stacked acceptance assertions also prove the action
  cluster never escapes its header.
- Accessibility: the header is a labelled group; the picker is a focused
  combobox/listbox using `aria-activedescendant`; result changes and outcomes
  use polite live regions; all controls have visible focus; the divider exposes
  orientation, min/max/current value, and keyboard resizing. Escape returns
  focus to Change, and focusing the interactive reference never promotes it.

## Comparison history

### Iteration 1 — blocked

Evidence: `docs/superpowers/specs/assets/glance-design-qa-picker-pass-1.jpg`

- [P1] The Change picker occupied almost the entire reference pane instead of
  reading as the compact, attached popover in the selected direction.
- [P1] The reference identity stacked `GLANCE` above the favicon/title instead
  of using the source's single horizontal identity row.

Fixes: restored a 420px maximum, right-anchored the Change picker, added the
active Change anchor, and rebuilt the header flow as a single row with a quiet
separator and progressive truncation.

### Iteration 2 — blocked

Evidence: `docs/superpowers/specs/assets/glance-design-qa-picker-pass-2.jpg`

- [P2] Picker typography and icon scale remained materially denser than the
  selected mock.
- [P2] The scroll viewport exposed a clipped partial row above the keyboard
  footer, making the surface look unfinished.
- [P2] The black input focus outline was visually heavier than the source.

Fixes: increased picker heading/input/row/metadata sizing, increased favicon
size, aligned the list viewport to complete rows, and changed the focus outline
to a visible but quieter token-based ring.

### Iteration 3 — passed

Post-fix evidence:

- `docs/superpowers/specs/assets/glance-design-qa-final.jpg`
- `docs/superpowers/specs/assets/glance-design-qa-header-final.png`
- `docs/superpowers/specs/assets/glance-design-qa-picker-final.png`

The final full view and focused regions show no actionable P0/P1/P2 drift.
Remaining differences are expected live-data differences, the approved 62/38
responsive rule, and the intentional visible picker-cancel affordance.

## Functional evidence

- Primary interactions tested: native shortcut entry, filter + Enter
  selection, Change replacement, Escape focus return, explicit Make main,
  interactive reference focus without promotion, divider keyboard resize,
  header close, underlying reference-tab close, quiet-tab wake, dark/private
  appearance, and the 700px stacked breakpoint.
- Focused Electron acceptance: 4 scenarios and 32 steps passed.
- Complete Electron acceptance: 102 scenarios and 629 steps passed. The full
  run exposed and verified a slow-loading-tab identity fix that the focused
  slice alone could not reproduce.
- The live development terminal showed no renderer or main-process errors
  during the final visual pass.

## Follow-up polish

No P3 visual follow-up is required for this release candidate.

final result: passed

---

# Mahjong unified 14-design lacquer theme — 2026-08-31

**Final result:** passed

## Comparison target

- Primary source visual truth:
  `/Users/anthonyjloria/Desktop/Screenshot 2026-08-31 at 12.05.42 AM.png`.
- Button-state issue reference:
  `/Users/anthonyjloria/Desktop/Screenshot 2026-08-31 at 1.01.15 AM.png`.
- Fresh Turtle implementation:
  `/private/tmp/mahjong-unified-turtle.png`.
- Fresh Arch implementation:
  `/private/tmp/mahjong-unified-arch.png`.
- Fresh Peaks implementation:
  `/private/tmp/mahjong-unified-peaks.png`.
- Full source-and-three-layout comparison:
  `/private/tmp/mahjong-unified-full-comparison.png`.
- Focused source-and-board comparison:
  `/private/tmp/mahjong-unified-focus-comparison.png`.
- Post-fix button-state implementation:
  `/private/tmp/mahjong-hover-focus-final.png`.
- Viewport: isolated live Blanc development window at 1229×768 CSS px,
  light chrome, lacquer game surface, 1× capture density.

## Normalization

- The source mockup is 862×1140 pixels. A normalized 1229×768 comparison copy
  preserves aspect ratio, centers the complete two-panel catalog, and pads with
  white; the source itself was not cropped or distorted.
- Turtle, Arch, and Peaks are each browser-rendered 1229×768 captures at the
  same 1× density and viewport. Full-view evidence uses the complete windows.
- Focused comparison uses native board crops—760×540 Turtle, 830×540 Arch, and
  560×540 Peaks—scaled uniformly into 900×600 panels. The layout-specific crop
  widths preserve each board's intended tile scale rather than forcing the
  three layouts into an artificial common width.
- State: fresh random Classic deals at 72, 48, and 36 pairs remaining. Unit
  verification separately exercises both Classic and Tray exact-pair behavior.

## Findings

The tile theme and completion actions have no remaining actionable P0, P1, or
P2 findings.

- Fonts and typography: black character numerals remain bold, optically
  centered, and dominant at game scale. The compact mono status system and
  Inter action labels keep their established hierarchy. No letter tiles were
  reintroduced.
- Spacing and layout rhythm: all seven landscape/emblem faces retain the
  larger 42×48 treatment; compasses and seals sit in 40×40 boxes. Turtle, Arch,
  and Peaks preserve centered playing surfaces, clear layer depth, and the
  left control rail without shrinking their native layouts.
- Colors and visual tokens: motif and seal artwork shares the same ink, jade,
  oxblood, bone-ivory, and brass vocabulary. Blocked tiles desaturate all
  variants consistently without erasing their silhouettes or orientation.
- Image quality and asset fidelity: the four new local transparent raster
  assets have clean alpha edges and no background halos. The compass source is
  rotated at 0°, 90°, 180°, and 270° without resampling separate derivatives;
  circular red/green seals and the square white seal stay sharp at live size.
- Copy and content: every variant has a distinct accessible name, including
  `north wind, mountain`, `north wind, compass`, `red dragon, flame`, and
  `red dragon, seal`. Visual identity and announced identity remain aligned.
- Full-view evidence confirms the complete family integrates with the lacquer
  board and remains readable through free, blocked, and raised tile states.
- Focused evidence confirms the supplied 14-design catalog's scale, materials,
  compass orientations, and mixed rectangular/circular seal silhouettes carry
  into all three layouts.

## Comparison history

### Iteration 1 — tile collection passed

The first live unified-theme pass showed all 14 exact-pair designs at strong
game scale across fresh Turtle, Arch, and Peaks boards. No P0/P1/P2 tile-art,
layout, color, typography, image-quality, or copy mismatch remained.

### Iteration 2 — button interaction blocked

- [P2] The completion dialog's outlined `choose board` action inherited the
  shared utility-page hover text color. Its label became black against a dark
  green hover fill, making a live secondary action look disabled.

Fix: the Mahjong button component now owns hover and `:focus-visible` color,
border, fill, elevation, and translation at higher specificity. Secondary
actions keep ivory text with a brass edge and lacquer lift; primary actions
retain dark ink on the ivory surface; active state presses back down by 1px.

Post-fix evidence: a dedicated isolated Electron instance rendered the actual
completion card and hovered `choose board`. The live computed state confirms
ivory text, the brass border, the layered lacquer fill, and elevated shadow;
the matching screenshot is
`/private/tmp/mahjong-hover-focus-final.png`.

## Functional evidence

- 74 focused Mahjong tests pass, including exact variant matching through
  hints, Classic selection, Tray auto-match, undo, shuffle, serialization,
  legacy V2 restoration, and duplicate-tab forking.
- Each layout contains exactly two of every stable special variant across 200
  deterministic seeds per layout, while every generated deal remains solvable.
- The complete 907-test unit suite passes with ordinary local permissions. Its
  two loopback tests were also observed to fail only under the filesystem
  sandbox's `listen EPERM` restriction, then pass unchanged outside it.
- `git diff --check` passes.
- All artwork remains local to the flat-served internal-pages directory; no
  state version, network path, theme picker, release version, or telemetry was
  added.

## Follow-up polish

No P3 tile-theme follow-up is required.

final result: passed

---

# Mahjong complete lacquer tile family — 2026-08-31

**Final result:** passed

## Comparison target

- User-reported thin-bamboo capture:
  `/Users/anthonyjloria/Desktop/Screenshot 2026-08-31 at 12.41.39 AM.png`.
- Seven-motif art-direction source:
  `/var/folders/4x/r7mr2b5d4q53x8nbf_trvcxw0000gn/T/codex-clipboard-09c20896-38cb-4e96-a41f-126a7b888db9.png`.
- Final live Blanc capture:
  `/private/tmp/mahjong-complete-lacquer-suits.png`.
- Final board crop:
  `/private/tmp/mahjong-complete-lacquer-board-crop.png`.
- Normalized thin-to-substantial comparison:
  `/private/tmp/mahjong-bamboo-number-focus-before-after.png`.
- Final local-asset-and-live-board comparison:
  `/private/tmp/mahjong-complete-lacquer-comparison.png`.
- Final asset contact sheet:
  `/private/tmp/mahjong-final-lacquer-assets.png`.
- Viewport: live Blanc development window at 1229×768 CSS px, Turtle layout,
  Classic mode, light chrome and lacquer game surface.

## Normalization

- The user's bamboo capture and the live result were normalized to the same
  visual height, then the live board was cropped to its playing surface so tile
  faces can be compared at a similar scale rather than against app chrome.
- The final asset comparison places the transparent flower, ginkgo leaf, ring
  pip, panda, jade bamboo, and brass bamboo sprites beside the uncropped live
  Electron capture. No sprite or board was redrawn for QA.
- The live app was fully restarted after changing the same-filename local PNGs,
  avoiding stale iframe or image-cache evidence.

## Findings

There are no remaining actionable P0, P1, or P2 findings.

- Typography: character numerals use an exact `(22, 30)` SVG center with
  `text-anchor: middle` and `dominant-baseline: central`. The Inter variable
  face is 42px at weight 850, with an ink fill, restrained brass engraved
  keyline, and two-level inset/raised shadow. There are no underline marks.
- Bamboo scale: the jade and brass stalk sprites now have tight alpha bounds,
  a deliberately substantial 96×244 silhouette, and larger per-rank image
  boxes. Two-bamboo reads as a bold pair, while eight and nine remain separated
  instead of collapsing into hairlines.
- Material consistency: flower, leaf, dots, panda, and bamboo all use the same
  glossy lacquer, engraved brass, deep jade/ink, and bone-ivory vocabulary as
  the large wind and dragon motifs.
- Hierarchy and spacing: larger numerals and thicker stalks occupy the tile face
  without touching its inset border or colliding with neighboring pips.
- Accessibility and copy: semantic names remain rank-and-suit based; decorative
  material changes do not alter matching rules, hints, or keyboard navigation.
- Full-view evidence confirms the revised marks remain legible on free, blocked,
  and layered tiles across the complete Turtle board.

## Comparison history

### Iteration 1 — failed

- [P2] Square transparent padding forced the tall bamboo sprites to scale by
  width, reducing detailed lacquer stalks to one- or two-pixel hairlines.
- [P2] Character numerals were centered but visually lighter and smaller than
  the rest of the refreshed engraved family.

### Iteration 2 — passed

The final focused comparison shows materially thicker bamboo at every visible
rank and larger, bolder, geometrically centered ink numerals. The asset/contact
sheet comparison confirms consistent lacquer and brass detailing across the six
new local sprite families.

## Functional evidence

- 71 focused Mahjong engine, renderer, sound, persistence, and duplicate-tab
  tests pass.
- The complete 904-test unit suite passes.
- The live Electron accessibility tree reports rank-and-suit names for every
  tile after the visual changes.
- The development terminal showed no renderer or main-process errors during
  the final visual pass.

## Follow-up polish

No P3 implementation follow-up is required.

final result: passed

---

# Mahjong seven-motif wind and dragon set — 2026-08-31

**Final result:** passed

## Comparison target

- Source visual truth:
  `/var/folders/4x/r7mr2b5d4q53x8nbf_trvcxw0000gn/T/codex-clipboard-09c20896-38cb-4e96-a41f-126a7b888db9.png`.
- Rendered implementation:
  `/private/tmp/mahjong-large-black-numerals-normalized.png`.
- Full-view combined evidence:
  `/private/tmp/mahjong-final-design-comparison.png`.
- Focused source-and-board evidence:
  `/private/tmp/mahjong-final-focus-comparison.png`.
- Viewport: live Blanc development window at 1229×768 CSS px and 1× capture
  density, Turtle layout, Classic mode, light chrome and lacquer game surface.
- State: a solvable shuffle exposes the mountain, sunrise, sun, moon-and-wave,
  flame, jade flourish, and Blanc-mark motifs across free and blocked tiles.

## Normalization

- The source is 1536×1024 pixels. The full source and 1229×768 implementation
  were independently scaled to 640 pixels high and joined without non-uniform
  distortion; the resulting comparison is 1984×640.
- The focused source crop is 1220×770 from `(150, 140)` and the focused board
  crop is 980×560 from `(170, 120)`. Each was uniformly scaled to 560 pixels
  high before being joined; no tile or artwork was stretched.
- Each motif is a separate transparent 256×256 RGBA sprite. Its visible bounds
  are trimmed, enlarged to 244×244, centered, and stripped of metadata.
- Every sprite renders in a 42×48 face box inside the 44×60 tile viewBox. This
  gives the motifs the mockup's confident face coverage while retaining a safe
  ivory margin and the artwork's original aspect ratio.

## Findings

There are no remaining actionable P0, P1, or P2 findings.

- Fonts and typography: the four wind letters and two dragon letters are gone.
  Character numerals now use 42px ink-black faces without the old underline,
  giving their single digits the substantial scale requested in the final
  visual pass. Accessible names still announce semantic rank and suit.
- Spacing and layout rhythm: the seven artworks share the same substantial
  42×48 image box. Their baselines align, visual centers remain balanced, and
  neither the tallest mountain nor widest moon-and-wave clips the tile face.
- Colors and visual tokens: ink-black, warm brass, oxblood, and deep jade match
  the supplied mockup and the existing lacquer board. The established blocked
  filter produces an intentional subdued state without losing motif identity.
- Image quality and asset fidelity: all seven visible designs are real local
  transparent raster assets, not text glyphs or code-drawn approximations.
  Alpha edges are clean at actual game scale and the Blanc mark remains
  recognizable.
- Copy and content: no user-facing copy changed. The semantic names `north
  wind`, `east wind`, `south wind`, `west wind`, and the three dragon names are
  preserved for assistive technology.
- Full-view evidence confirms the complete set integrates with the existing
  board, tile depth, free/blocked states, bamboo, dot, character, and bonus
  families without shifting board geometry.
- Focused evidence confirms the motifs use the same confident proportion as
  the mockup rather than the undersized first implementation.

## Comparison history

### Iteration 1 — blocked

- [P2] The first implementation used only the later compass-seal option and
  rendered its shared compass and dragon medallions in 34–35px square boxes.
  It omitted the seven explicitly expected motifs and looked visibly smaller
  than the selected mockup.

Fix: replaced that set with seven separate source-matched assets—mountain,
sunrise, sun, moon-and-wave, flame, jade flourish, and Blanc mark—and increased
their common image box to 42×48.

### Iteration 2 — passed

The post-restart, post-shuffle capture shows all seven motifs at the expected
scale, with clean margins, readable blocked states, and no clipping or layout
regression.

## Functional evidence

- The Electron development app was fully restarted before the final capture so
  the embedded Mahjong renderer loaded the new flat-served assets.
- A live solvable shuffle was exercised; the final settled board was captured
  after the cascade completed.
- `node --check src/renderer/pages/mahjong.js` passes.
- All 71 focused Mahjong renderer, engine, sound, state, and storage tests pass.
- `git diff --check` passes.
- The live development terminal showed no renderer or main-process errors
  during the final visual pass.

## Follow-up polish

No P3 implementation follow-up is required.

final result: passed

---

# Asset 2 bamboo silhouette and board-accent palette — 2026-08-30

**Final result:** passed

## Comparison target

- Exact silhouette source:
  `/Users/anthonyjloria/Desktop/SVG/Asset 2.svg`.
- Rendered implementation:
  `/private/tmp/mahjong-asset2-jade-gold.png`.
- Focused implementation crop:
  `/private/tmp/mahjong-asset2-implementation-crop.png`.
- Combined source-and-implementation evidence:
  `/private/tmp/mahjong-asset2-design-comparison.png`.
- Viewport: live Blanc development window at 1229×768 CSS px, Turtle layout,
  Classic mode, light chrome and lacquer game surface.

## Normalization

- The source is a self-contained SVG with viewBox `0 0 10.85 28.38`. Its sole
  path is preserved verbatim in separate jade and seasonal-gold local copies;
  only `fill` differs.
- The full implementation capture is 1229×768 pixels at the live window's 1×
  capture density. The 780×555 board crop is shown at native pixel dimensions
  beside 90×229 normalized source, jade, and gold silhouette renderings. No
  non-uniform scaling, path editing, or edge processing was used.
- State: the panda remains one-bamboo. Ranks two through nine use Asset 2 with
  board-native jade `#1f6d50` as the primary color and seasonal gold `#8a5a18`
  as the restrained accent.

## Findings

There are no remaining actionable P0, P1, or P2 findings.

- Fonts and typography: unaffected; all adjacent numeral, wind, dragon, dot,
  and bonus faces retain their established hierarchy and optical weight.
- Spacing and layout rhythm: Asset 2 preserves the existing rank arrangements
  and fills the same measured pip boxes without clipping or merging.
- Colors and visual tokens: the former blue/red pair is fully removed. Jade and
  seasonal gold reuse the board's authoritative bamboo and season accents, so
  the suit now belongs to the lacquer palette rather than introducing two new
  colors.
- Image quality and asset fidelity: each numbered bamboo mark is the exact
  supplied vector path, rendered locally with aspect-ratio preservation and a
  restrained tile-face shadow. The SVGs contain no scripts, links, external
  references, images, or foreign objects.
- Copy and content: unaffected. Accessibility continues to announce game rank
  and suit rather than decorative color.
- Full-view evidence confirms the updated suit remains legible across free,
  blocked, layered, and partially obscured tiles without affecting board scale.
- Focused comparison confirms the asymmetric rounded ends and subtle organic
  sides of Asset 2 survive at actual game size in both palette variants.

## Comparison history

### Asset 1 blue/red treatment — superseded by user direction

The prior implementation used Asset 1 with blue and red artwork. The user
selected Asset 2 instead and requested existing board accent colors.

### Asset 2 jade/gold implementation — passed

The first live comparison shows the exact replacement shape with a cohesive
jade/gold palette, clean edges, readable ranks, and no P0/P1/P2 mismatch.

## Functional evidence

- The Electron development app was fully restarted before capture so the
  embedded Mahjong renderer loaded the replacement flat SVG assets.
- SVG guards verify the exact source viewBox/path and palette, and reject
  scripts, links, external references, and foreign objects.
- `node --check src/renderer/pages/mahjong.js` passes.
- 41 focused Mahjong renderer and engine tests pass.
- `git diff --check` passes.

## Follow-up polish

No P3 implementation follow-up is required.

final result: passed

---

# Home intro and demo separation — 2026-08-28

**Final result:** passed

## Comparison target

- Problem reference:
  `/Users/anthonyjloria/Desktop/Screenshot 2026-08-28 at 6.03.55 PM.png`.
- Revised desktop implementation:
  `/private/tmp/blanc-home-separation-desktop.png`.
- Side-by-side full-view comparison:
  `/private/tmp/blanc-home-separation-comparison.png`.
- Responsive evidence:
  `/private/tmp/blanc-home-separation-mobile-top.png`.
- Viewport and normalization: source and desktop implementation are both
  1810×1322 pixels at a matching 1810×1322 CSS viewport. No density or crop
  normalization was required. Mobile was checked separately at 390×844.
- State: light appearance, Glance resize chapter paused. The implementation
  intentionally changes the surrounding composition while retaining the same
  chapter copy and demo content.

## Findings

There are no remaining actionable P0, P1, or P2 findings.

- Fonts and typography: the stable product claim remains the sole large text
  block before the demo. The platform support line is now a small mono eyebrow,
  while scene-specific copy retains its existing UI type hierarchy inside the
  demo surface.
- Spacing and layout rhythm: the former long product-description paragraph has
  been removed from the visible intro. A 58px desktop handoff separates the
  stable claim from a softly bordered demo container, turning the changing
  headline, stage, timeline, and supporting feature summary into one unit.
- Colors and tokens: the new `#fafafa` demo surface and `#e9e9e9` boundary are
  deliberately close to the existing white page so separation is clear without
  introducing a card-heavy visual language.
- Image quality and asset fidelity: all existing page captures, favicons, and
  island visuals are unchanged. No new or substitute image asset was introduced.
- Copy and content: search-relevant product context remains in the H1, platform
  eyebrow, metadata, structured data, and compact feature summary after the
  timeline. It no longer creates a second paragraph before the demo.
- Responsiveness: at 390×844 the claim and demo container stack cleanly with no
  horizontal overflow. The container creates the same visual handoff while the
  existing mobile stage and controls remain unchanged.

The full view was sufficient for this hierarchy change because all modified
surfaces—the intro, inter-section gap, demo boundary, and opening scene copy—are
legible together. No focused crop was needed. Browser console verification
returned no warnings or errors.

## Comparison history

### Iteration 1 — blocked

- [P1] The stable H1, long SEO paragraph, changing demo headline, and changing
  demo subtext read as two consecutive hero blocks with no visual ownership.

Fixes: replaced the visible SEO paragraph with a small platform eyebrow, moved
the compact feature summary below the demo controls, and enclosed the live
sequence in a subtle surface with its own padding and radius.

### Iteration 2 — passed

The desktop side-by-side shows one concise product claim followed by a clearly
owned demo unit. The 390px capture confirms the same hierarchy without overflow
or clipped controls.

final result: passed

---

# Quiet Tabs vertical wake scene — 2026-08-28

**Final result:** passed

## Comparison target

- Source visual truth: `marketing/article-assets/ai-clean-browser/expanded-source.jpeg`,
  corroborated by the released `v1.9.1` expanded-Island markup and styles in
  `src/renderer/overlay.html`, `src/renderer/overlay.js`, and
  `src/renderer/styles.css`.
- Rendered implementation: `/tmp/quiet-tabs-expanded-island-final-10.1.png`,
  extracted from the final vertical video at 10.1 seconds.
- Focused side-by-side evidence: `/tmp/quiet-tabs-panel-qa-side-by-side.png`.
- Viewport: 1080×1920 video frame; focused implementation crop is 830×414.
- Source pixels: 1229×768. Its expanded-Island crop was normalized to 830px
  wide and padded to 830×414 for comparison. The implementation remained at
  native output density.
- State: expanded Island at rest. The campaign intentionally adapts the source
  from light to shipped dark tokens and adds two ordinary tab rows so the
  released Quiet state can be demonstrated.

## Findings

There are no remaining actionable P0, P1, or P2 findings.

- Fonts and typography: row titles retain Blanc's Inter hierarchy, with the
  active row at weight 600 and ordinary rows at 400. The Quiet row changes
  opacity only; it gains no label or alternate type treatment.
- Spacing and layout rhythm: the 620px shipped panel proportions are scaled to
  the video's 830px evidence slot. Address field, list rows, separator, primary
  and private launchers, and right-side action cluster preserve the expanded
  Island's ordering and visual rhythm.
- Colors and visual tokens: the campaign uses the shipped dark surface,
  raised-surface, border, text, and text-dim values. The Quiet row is exactly
  50% opacity, matching `.island-row.quiet` in v1.9.1.
- Image quality and asset fidelity: the Blanc, MDN, and Notion favicons are
  raster source assets. The Blanc mark remains black on white. No accent color
  was applied to the Blanc mark or surrounding campaign treatment.
- Copy and content: the invented “PAGE UNLOADED → RELOAD” card is gone. The
  visual now supports the release-backed instruction “Click the dimmed tab to
  wake it up” with the real dim-only row convention.

## Comparison history

### Iteration 1 — blocked

- [P1] The scene used a generic status card with an invented ring glyph,
  “PAGE UNLOADED,” a reload arrow, and a “RELOAD” label. None represented how
  Quiet Tabs appear in the expanded Island.

Fix: replaced the card with the released expanded-Island anatomy and applied
the real whole-row 50% Quiet state to a normal favicon-and-title row.

### Iteration 2 — passed

The focused comparison shows the same address, row, divider, launcher, and
action hierarchy as the released Island. The only state treatment on the MDN
row is the shipped full-row dimming.

final result: passed

---

# Home demo native Move to Group flow — 2026-08-25

**Final result:** passed

## Comparison target

- Source visual truth:
  `/Users/anthonyjloria/Desktop/Screenshot 2026-08-25 at 9.55.40 PM.png`.
- Rendered implementation states:
  `/private/tmp/blanc-accurate-group-menu-qa/existing-group-choice.png` and
  `/private/tmp/blanc-accurate-group-menu-qa/checked-group-state.png`.
- Focused side-by-side evidence:
  `/private/tmp/blanc-accurate-group-menu-qa/source-vs-demo-focused.jpg`.
- Viewport: 912×802 CSS pixels at device scale 1 for the implementation. The
  source is a 1404×1602 native Blanc capture.
- State: light appearance, an inactive tab row's native context menu open,
  Move to Group expanded, followed by the checked membership state.

## Normalization

- The source menu region was cropped to 825×620 pixels from the original
  1404×1602 capture.
- The implementation's visible menu region was cropped to 372×317 pixels from
  the 912×802 browser capture and normalized to 825×620 for the focused
  structural comparison.
- Group names and page content intentionally differ. The comparison target is
  the native menu hierarchy, radio/check state, separator structure, and move
  outcome rather than the user's live tabs.

## Findings

There are no remaining actionable P0, P1, or P2 findings.

- Interaction fidelity: the demo now right-clicks an inactive loose tab, opens
  the full shipped row menu, selects the existing Social radio item, and shows
  Netflix inside Social without switching away from the current Scroll page.
  The next beat reopens the same menu with Social checked before choosing New
  Group… and entering the real `/group ` handoff.
- Spacing and layout rhythm: the root-menu width remains proportional to the
  scaled Island panel, all native sections fit inside the demo stage, the
  submenu aligns with Move to Group, and its check gutter remains stable across
  checked and unchecked rows.
- Fonts and typography: the menu uses the macOS system stack, compact native
  row sizing, muted accelerator labels, and the same sentence casing and
  ellipsis treatment as the shipped menu model.
- Colors and visual tokens: the translucent native surface, fine border,
  macOS blue hover selection, separator contrast, shadow, and subdued
  accelerators match the source hierarchy.
- Image quality and asset fidelity: page captures and favicons remain bundled
  source assets. The menu is browser-rendered UI; no new raster placeholder or
  decorative asset was introduced.
- Copy and content: every shipped row-menu section shown in the source is now
  present: Copy Link; reload/duplicate; pin/mute/favorite/group; Glance/Quiet;
  new/private; close-others/new-window; reopen/close. The submenu lists existing
  groups, current membership, Remove from Group, and New Group… according to
  the real tab-context-menu model.
- Accessibility and runtime: scene copy describes the result rather than the
  simulated pointer mechanics, the timeline remains keyboard reachable, and
  browser console verification returned no warnings or errors.

## Comparison history

### Iteration 1 — blocked

- [P1] The demo used an abbreviated context card and jumped directly to New
  Group…, so it neither taught the existing-group move nor represented the
  checked radio state and conditional Remove from Group action.

Fixes: rebuilt the context menu from the shipped menu model, added the full
inactive-row sections and accelerators, represented group radio/check state,
and inserted an explicit Social move before the New Group… branch.

### Iteration 2 — passed

The post-fix captures show the direct Social choice, Social's checked state,
Remove from Group, New Group…, and the complete menu around them. The Astro
production build and `git diff --check` pass, and the browser console is clean.

final result: passed

---

# Home demo Named Groups target visibility — 2026-08-25

**Final result:** passed

## Comparison target

- Source visual truth: the pre-fix Named Groups submenu capture at
  `/private/tmp/blanc-named-group-audit/12-revised-choice.jpg`, corroborated by
  the user's attached 9:47:54 PM screenshot. In both, Netflix follows three
  loose tabs and falls at the panel's clipped lower edge.
- Rendered implementation:
  `/private/tmp/blanc-grouping-visibility-qa/implementation-submenu-top.png`.
- Normalized full-view comparison:
  `/private/tmp/blanc-grouping-visibility-qa/normalized-old-vs-new.jpg`.
- Focused interaction evidence:
  `/private/tmp/blanc-grouping-visibility-qa/implementation-root.png` and
  `/private/tmp/blanc-grouping-visibility-qa/implementation-submenu.png`.

## Normalization

- Source pixels: 912×2048 from an earlier half-scale full-page capture. Its
  first 912×802 CSS viewport was normalized to 1824×4096 pixels, then cropped
  back to 912×802 so the hero, demo frame, and panel match the live capture's
  CSS scale and crop.
- Implementation pixels and CSS viewport: 912×802 at device scale 1.
- State: desktop light appearance, Named Groups chapter, Netflix active, native
  tab context menu open, followed by the Move to Group submenu.

## Findings

There are no remaining actionable P0, P1, or P2 findings.

- Spacing and layout rhythm: Netflix is now the first loose tab directly below
  the Social group, fully visible before the cursor arrives. The panel resets to
  scrollTop 0 for both context-menu scenes, eliminating retained-scroll drift.
- Interaction hierarchy: the right-click target remains visible beside the
  root menu, and the same row anchors the submenu beat. The menu no longer reads
  as detached from an offscreen or clipped tab.
- Fonts and typography: existing UI, mono, native-menu typography, weights,
  truncation, and active-tab emphasis are unchanged.
- Colors and visual tokens: existing panel, group-band, menu blur, border,
  shadow, and macOS blue selection treatments are unchanged.
- Image quality and asset fidelity: the real bundled Netflix page capture and
  favicon remain unchanged; no placeholder or synthetic visual asset was added.
- Copy and content: the chapter's instructional headline and menu labels are
  unchanged. Only tab ordering inside this isolated demonstration state changed.
- Responsiveness and accessibility: no control size, timeline target, semantic
  label, or reading order changed. Browser console verification returned no
  warnings or errors.

## Comparison history

### Iteration 1 — blocked

- [P1] Netflix appeared after Scroll, Nintendo, and MS NOW. At the demonstrated
  panel height its row was partially clipped by the footer, so the context menu
  did not have an obvious visual origin.

Fixes: added a Named-Groups-specific layout with Netflix first among the loose
tabs, used it throughout the setup/name beats, and reset the list scroll before
the staged right-click.

### Iteration 2 — passed

Post-fix evidence shows the complete Netflix row directly under Social in both
the root-menu and submenu states. Every other tab and group retains its state;
the Astro production build and `git diff --check` pass.

final result: passed

---

# Home demo design QA — 2026-08-25

**Final result:** passed

## Comparison target

- Source: the deployed home demo captured before this revision.
- Implementation: the revised local Astro home demo at matching viewport and
  Glance-resize state.
- Side-by-side evidence:
  `docs/superpowers/specs/assets/home-demo-glance-sequence-qa.png`.

## Findings

There are no remaining actionable P0, P1, or P2 findings.

- Narrative hierarchy: the 20-scene, roughly 85-second loop is now a 15-scene,
  roughly 59-second story. Island, Glance, and Blanc Blocker arrive first;
  command search, Named Groups, and Patron Workspaces follow. The expected
  private-tab beat is intentionally omitted in favor of Blanc-specific proof.
- Interaction fidelity: the Glance pane appears directly after the row action,
  the cursor continues toward the divider, resizing begins without an idle
  beat, and Make main remains a separate readable action. The Blocker popover
  stays closed until the shield click, then its switch reloads the same
  editorial page from an ad-heavy layout into a clean, reflowed reading view.
- Content: the low-impact `/pin` beat and duplicate search sequence are gone.
  The command directory begins at `/favorites`; the same `watch` group is named
  and folded; the private-tab chapter has been removed from the loop.
- Timeline and control: each chapter has a 24px target, the active chapter is
  named persistently, `aria-current="step"` follows playback, and pause/play
  freezes the loop on a complete representative state.
- Responsiveness: all six chapters fit without horizontal overflow at
  390×844. Glance uses the stacked mobile direction, the panel remains inside
  the 354px stage, and the 333px chapter control remains usable.
- Reduced motion: animation preference initializes playback paused, hides the
  staged cursor, disables progress and transition motion, and exposes complete
  static chapter states for manual selection.
- Runtime: the Astro production build passes, the command directory stays at
  scrollTop 0, group/workspace outcomes match their messages, and the
  browser console has no warnings or errors attributable to the demo.

final result: passed

---

# Mahjong supplied bamboo artwork — 2026-08-30

**Final result:** passed

## Comparison target

- Source visual truth:
  - `/Users/anthonyjloria/Downloads/bamboo.png`
  - `/Users/anthonyjloria/Downloads/bamboo2.png`
  - `/Users/anthonyjloria/Downloads/bamboo3.png`
- Rendered implementation: `/private/tmp/mahjong-bamboo-source-final.png`.
- Focused implementation crop: `/private/tmp/mahjong-bamboo-source-final-crop.png`.
- Combined source-and-implementation evidence:
  `/private/tmp/mahjong-bamboo-design-comparison.png`.
- Viewport: live Blanc development window at 1229×768 CSS px, Turtle layout,
  Classic mode, light chrome and lacquer game surface.

## Normalization

- Each supplied source is a 512×512 RGBA PNG. Temporary comparison copies of
  the transparent black artwork were flattened onto white only so it remained
  visible in the evidence image; the three bundled assets are byte-identical
  to the supplied files.
- The implementation capture is 1229×768 pixels at the live window's 1×
  capture density. The focused board crop was enlarged uniformly to 1440×1120
  for asset inspection; no non-uniform scaling or color adjustment was used.
- One-bamboo uses the leafy color emblem, two-bamboo uses the black circular
  emblem, and ranks three through nine repeat the single-stalk source in their
  traditional pip arrangements.

## Findings

There are no remaining actionable P0, P1, or P2 findings.

- Fonts and typography: unaffected; the existing hierarchy and optical weights
  remain unchanged.
- Spacing and layout rhythm: the supplied motifs balance inside the 44×60 face,
  retain clear pip separation from three through nine, and do not clip.
- Colors and visual tokens: the supplied green/cyan and black/white treatments
  are preserved. Only the existing restrained tile-material shadow is applied.
- Image quality and asset fidelity: the exact local PNGs render with
  `preserveAspectRatio="xMidYMid meet"`; edges and transparency are clean. The
  previous handcrafted SVG bamboo artwork and its palette rules are removed.
- Copy and content: unaffected.
- Full-view evidence confirms the suit integrates with free, blocked, and
  layered tile states without changing board scale or composition.
- Focused evidence confirms the source silhouettes, leaf shapes, color blocks,
  negative space, and transparency are preserved at actual tile size.

## Comparison history

### Iteration 1 — blocked

The first outer-page reload left the embedded Mahjong renderer cached, so the
capture still showed the previous generated bamboo artwork. No visual judgment
was made from that stale state.

Fix: fully restarted the Electron development app so the embedded game loaded
the new local PNG assets.

### Iteration 2 — passed

Post-restart evidence shows the three supplied designs mapped across the full
bamboo suit with no remaining P0/P1/P2 mismatch. The renderer and engine tests
also pass.

## Functional evidence

- The live Electron board restored successfully after restart and rendered the
  updated suit across blocked, free, and layered tiles.
- `node --check src/renderer/pages/mahjong.js` passes.
- 41 focused Mahjong renderer and engine tests pass.
- `git diff --check` passes.

## Follow-up polish

No P3 implementation follow-up is required. A preference change to any source
motif would be a new visual direction rather than an implementation correction.

final result: passed

---

# Mahjong panda one-bamboo emblem — 2026-08-30

**Final result:** passed

## Comparison target

- Source visual truth: `/Users/anthonyjloria/Downloads/animal.png`.
- Initial rendered implementation: `/private/tmp/mahjong-panda-implementation.png`.
- Final rendered implementation:
  `/private/tmp/mahjong-panda-implementation-final.png`.
- Focused final crop: `/private/tmp/mahjong-panda-focus-final.png`.
- Combined source-and-implementation evidence:
  `/private/tmp/mahjong-panda-design-comparison.png`.
- Viewport: live Blanc development window at 1229×768 CSS px, Turtle layout,
  Classic mode, light chrome and lacquer game surface.

## Normalization

- The source is a 512×512 RGBA PNG. A temporary comparison copy was flattened
  onto an ivory background so the transparent black panda remained visible;
  the bundled game asset is byte-identical to the supplied PNG.
- The final implementation capture is 1229×768 pixels at the live window's 1×
  capture density. The focused 300×260 board region was enlarged uniformly to
  840×728 beside a 500×500 normalized source rendering. No non-uniform scaling,
  recoloring, crop of the asset itself, or edge processing was used.
- State: a blocked panda one-bamboo tile is visible near the right edge of the
  central stack, surrounded by dot, wind, character, and higher bamboo tiles.

## Findings

There are no remaining actionable P0, P1, or P2 findings.

- Fonts and typography: unaffected; the surrounding tile labels retain their
  established family, weight, scale, and hierarchy.
- Spacing and layout rhythm: the panda is centered in the 44×60 tile face and
  has enough margin for its ears, back, foot, and bamboo leaves without clipping.
- Colors and visual tokens: the source's pure black silhouette and transparent
  negative space are preserved against the existing bone-ivory tile material.
- Image quality and asset fidelity: the exact source file replaces the former
  green one-bamboo image. Its silhouette, bamboo sprig, antialiasing, and alpha
  edges remain intact under `preserveAspectRatio="xMidYMid meet"`.
- Copy and content: unaffected. Accessibility continues to announce the tile
  by its game identity (`one bamboo`) rather than adding decorative copy.
- Full-view evidence confirms the panda integrates with the complete board and
  blocked/free rendering without changing layout or tile scale.
- Focused evidence confirms the panda remains recognizable at actual game size
  and that no part of the supplied image is substituted or redrawn.

## Comparison history

### Iteration 1 — blocked

- [P2] The first 38px-wide rendering was recognizable but visually lighter than
  the adjacent high-density tile faces because the square source includes its
  own transparent perimeter.

Fix: increased only the one-bamboo image box from 38×44 to 42×48 while retaining
center alignment and aspect-ratio preservation.

### Iteration 2 — passed

Post-restart evidence shows the panda with a confident visual weight, clean
margins, and no clipping. The rest of the bamboo suit and board remain unchanged.

## Functional evidence

- The Electron development app was fully restarted after each asset/scale pass
  so the embedded Mahjong renderer did not reuse a cached image.
- The source and bundled asset share SHA-256
  `6f3d925c19f739e79e11f92921f4d020bb6f7be9fe2527be033f3bac12ea79d9`.
- `node --check src/renderer/pages/mahjong.js` passes.
- 41 focused Mahjong renderer and engine tests pass.
- `git diff --check` passes.

## Follow-up polish

No P3 implementation follow-up is required.

final result: passed

---

# Mahjong Blast-inspired bamboo suit — 2026-08-30

**Final result:** passed

## Comparison target

- Style reference:
  `/Users/anthonyjloria/Desktop/Screenshot 2026-08-30 at 6.36.49 PM.png`.
- Exact individual-pip shape:
  `/Users/anthonyjloria/Desktop/SVG/Asset 1.svg`.
- Rendered implementation:
  `/private/tmp/mahjong-supplied-bamboo-shape.png`.
- Focused reference crop:
  `/private/tmp/mahjong-blast-bamboo-reference-crop.png`.
- Focused implementation crop:
  `/private/tmp/mahjong-supplied-bamboo-implementation-crop.png`.
- Combined source-and-implementation evidence:
  `/private/tmp/mahjong-bamboo-blast-design-comparison.png`.
- Viewport: live Blanc development window at 1229×768 CSS px, Turtle layout,
  Classic mode, light chrome and lacquer game surface.

## Normalization

- The style reference is 1470×1950 pixels. Its bamboo-rich 520×620 region was
  cropped and enlarged uniformly to 780×930 for focused comparison.
- The implementation is a 1229×768 1× live-window capture. Its 520×560
  bamboo-rich region was enlarged uniformly to 780×840 and centered on a
  780×930 comparison panel. The different crop heights preserve each board's
  native tile proportions rather than forcing non-uniform scaling.
- The supplied SVG uses viewBox `0 0 10.35 27.08`. Its sole path is preserved
  verbatim in separate blue and red local copies; only `fill` differs.
- State: the panda remains one-bamboo. Ranks two through nine use the supplied
  pip silhouette, with blue as the primary color and restrained red accents.

## Findings

There are no remaining actionable P0, P1, or P2 findings.

- Fonts and typography: unaffected; adjacent character, wind, dragon, dot, and
  bonus faces retain their established families, weights, and optical scale.
- Spacing and layout rhythm: two bamboo is a parallel pair; three remains one
  over two; six uses two rows of three; seven uses one over three over three;
  eight and nine fill their faces without merging into rails.
- Colors and visual tokens: deep blue dominates the suit while red accents the
  center/top sticks of selected ranks, matching the reference's visual rhythm
  without copying its exact palette or graphics.
- Image quality and asset fidelity: every individual stick uses the exact
  user-supplied SVG path. The raster generation experiment was discarded after
  the SVG arrived; no generated approximation ships.
- Copy and content: unaffected. Tile accessibility names continue to communicate
  game identity rather than decorative color or shape.
- Full-view evidence confirms the stronger sticks remain readable on free,
  blocked, and layered tiles without changing board geometry.
- Focused comparison confirms the new suit now has the reference's bold upright
  marks, clear blue/red grouping, and at-a-glance rank legibility.

## Comparison history

### Selected-source change — superseded before implementation

An original raster stick draft was explored after the Mahjong Blast reference
arrived. The user then supplied `Asset 1.svg` as the authoritative pip shape, so
the generated draft was removed before it reached the live game or PR.

### Supplied-shape implementation — passed

The first live comparison using the supplied SVG shows clear, substantial
sticks across ranks two through nine with no clipping, collisions, or remaining
P0/P1/P2 mismatch.

## Functional evidence

- The Electron development app was fully restarted before capture so the
  embedded Mahjong renderer loaded the new flat SVG assets.
- SVG guards verify the exact source viewBox/path and reject scripts, links,
  external references, and foreign objects.
- `node --check src/renderer/pages/mahjong.js` passes.
- 41 focused Mahjong renderer and engine tests pass.
- `git diff --check` passes.

## Follow-up polish

No P3 implementation follow-up is required.

final result: passed

---

# Mahjong ring-pip dot suit — 2026-08-31

**Final result:** passed

## Comparison target

- Source visual truth:
  `/Users/anthonyjloria/Desktop/Screenshot 2026-08-30 at 11.52.51 PM.png`.
- Source-derived, normalized pip preview:
  `/private/tmp/mahjong-dot-pip-preview.png`.
- Initial rendered implementation:
  `/private/tmp/mahjong-dot-ring-suit.png`.
- Final rendered implementation:
  `/private/tmp/mahjong-dot-ring-suit-final.png`.
- Focused final crop:
  `/private/tmp/mahjong-dot-ring-implementation-crop.png`.
- Combined source-pip-and-implementation evidence:
  `/private/tmp/mahjong-dot-ring-design-comparison.png`.
- Viewport: live Blanc development window at 1229×768 CSS px, Turtle layout,
  Classic mode, light chrome and lacquer game surface.

## Normalization

- The 158×190 source screenshot was opened at original resolution. Its visual
  target is a flat jade ring with a small ivory center and a vertically stacked
  two-dot composition.
- A transparent 256×256 local pip was generated from that attached source,
  flattened to the authoritative board jade `#1f6d50`, and stripped of gradient,
  background, shadow, and metadata. The final alpha silhouette has minimal
  transparent padding so its measured SVG image boxes correspond to visible
  pip diameter.
- The full implementation captures are 1229×768 pixels at the live window's 1×
  capture density. The focused 800×540 board crop remains at native density
  beside the 320×320 source-derived pip preview; no board scaling was applied.
- State: ranks one through nine are visible across free and blocked tiles. Two
  uses a vertical pair; three uses a vertical trio; seven uses a balanced 3–1–3
  composition; eight and nine use compact, evenly spaced grids.

## Findings

There are no remaining actionable P0, P1, or P2 findings.

- Fonts and typography: unaffected. Character, wind, dragon, bamboo, and bonus
  faces retain their established family, weights, and optical hierarchy.
- Spacing and layout rhythm: the diagonal domino two/three arrangements are
  removed. Ring sizes step down by density while retaining visible separation,
  centered alignment, and consistent outer margins from one through nine.
- Colors and visual tokens: every ring uses the existing Mahjong jade rather
  than the prior black/current-color domino marks. Blocked-tile desaturation
  continues to communicate availability without erasing the ring center.
- Image quality and asset fidelity: each mark is a shared local RGBA sprite with
  smooth alpha edges, a true transparent center, no halo, and no code-drawn
  substitute. It remains crisp at actual tile scale.
- Copy and content: unaffected. Accessibility names still announce rank and
  suit (`two dot`, `nine dot`) rather than decorative appearance.
- Full-view evidence confirms the refreshed suit is immediately distinct from
  dominoes and remains readable across the layered Turtle board.
- Focused evidence confirms the source's ring weight and center opening survive
  on free, blocked, single-pip, vertical, and dense-grid tile states.

## Comparison history

### Iteration 1 — blocked

- [P2] The first live rendering retained too much transparent padding around
  the sprite, making two through nine visually smaller than the supplied
  reference and weaker than neighboring tile faces.

Fix: trimmed the generated alpha bounds, enlarged the visible ring to 244×244
inside its 256×256 sprite, and preserved only six pixels of safety padding.

### Iteration 2 — passed

The post-restart capture shows substantial reference-weight rings, a clear
vertical two-dot tile, readable dense ranks, and no clipping or collisions.

## Functional evidence

- The Electron development app was fully restarted after each sprite-scale pass
  so the embedded Mahjong renderer did not reuse a cached image.
- The controller has no dot-suit `circle` primitive and loads the bundled PNG
  for every dot pip.
- `node --check src/renderer/pages/mahjong.js` passes.
- 42 focused Mahjong renderer and engine tests pass.
- `git diff --check` passes.
- The live development terminal showed no renderer or main-process errors
  during the final visual pass.

## Follow-up polish

No P3 implementation follow-up is required.

final result: passed
