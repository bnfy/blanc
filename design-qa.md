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
