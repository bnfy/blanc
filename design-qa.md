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

# Bring Your Tabs design QA

**Final result:** passed for the corrected direct-open-tab flow

## Comparison target

- Approved source-card direction: `docs/superpowers/specs/assets/tab-import-source-option-3.png`
- Reference/live comparison: `docs/superpowers/specs/assets/tab-import-source-design-qa-current.jpg`
- Desktop live states:
  - `docs/superpowers/specs/assets/tab-import-source-live-final.jpg`
  - `docs/superpowers/specs/assets/tab-import-tabs-live-final.jpg`
  - `docs/superpowers/specs/assets/tab-import-organize-live-final.jpg`
  - `docs/superpowers/specs/assets/tab-import-review-live-final.jpg`
  - `docs/superpowers/specs/assets/tab-import-quit-gate-live-final.jpg`
- Compact 700×600 states:
  - `docs/superpowers/specs/assets/tab-import-source-narrow-final.jpg`
  - `docs/superpowers/specs/assets/tab-import-tabs-narrow-final.jpg`
  - `docs/superpowers/specs/assets/tab-import-organize-narrow-final.jpg`
  - `docs/superpowers/specs/assets/tab-import-review-narrow-final.jpg`

## Normalization

- Desktop implementation capture: 1229×768 macOS Electron content, light appearance, no page zoom.
- The approved source-card direction was normalized to 1229×768 and placed beside the desktop
  source capture in a 2458×768 comparison image.
- Compact capture: the real Electron window was set to 700×600 through the acceptance-only main
  process hook; the utility sheet retained its production 24px scrim margin and vertical scrollport.
- Data is synthetic but structurally realistic: two source windows, six HTTP(S) tabs, a duplicate,
  a pin, two named source groups, one ungrouped tab, and one unsupported internal URL.
- The old mock's Folder step, bookmark-oriented profile copy, and HTML fallback were treated as
  superseded semantics. The approved visual direction—official-logo cards, profile rows, spacing,
  and restrained monochrome shell—remains the visual target.

## Findings

There are no remaining actionable P0, P1, or P2 findings in the implemented desktop flow.

- Source: official bundled Brave, Chrome, Edge, Vivaldi, and Chromium artwork is crisp and
  consistently framed. Available, selected, permission-needed, and profile-count states preserve
  the approved card hierarchy without implying that Favorites are involved.
- Tabs: source windows, duplicate tabs, pin/group metadata, selected count, and unsupported-tab
  copy are readable without exposing full URLs. The sheet scrolls vertically at compact heights.
- Organize: preserved group names are visibly labelled **from source**; group rename, create,
  remove, and move controls use the existing Blanc form language. Compact group headers remain
  one line and row actions stack without stretching header controls.
- Review: exact tab/group/ungrouped consequences are prominent. Desktop uses three compact metric
  columns; the 700×600 layout stacks them and exposes a clear scroll affordance.
- Quit safeguard: the prompt appears only with a proven saved/restorable session count, asks for a
  normal quit, says Blanc only reads and never removes source tabs, and avoids promising automatic
  reopening. While the gate is open, every profile row is disabled and the selected row replaces
  its chevron with **Waiting…**, leaving the explicit **check again** button as the sole primary
  continuation. Post-quit verification refuses an incomplete newest session rather than falling
  back.
- Accessibility: the wizard exposes labelled steps, browser radios, profile buttons, selected-tab
  checkboxes, labelled group-name inputs, move selects, live status text, and a persistent close
  control. Step changes reset the sheet scrollport so the next heading remains visible.

## Comparison history

### Iteration 1 — blocked

- [P1] The implemented feature still used a bookmarks-folder source, contradicting the requested
  open-tab migration outcome.
- [P1] Source profiles were plain text rows without the selected official-logo visual direction.

Fix: replaced the source with explicit Chromium restorable-session reads and retained the approved
official-logo browser-card/profile-row layout.

### Iteration 2 — blocked

- [P1] Advancing from a long Tabs panel carried its scroll position into Organize, clipping the
  Organize heading beneath the sticky navigation.
- [P2] At 700×600, the group-name flex basis became vertical blank space and the remove-group
  action stretched across the card.
- [P2] Preserved source groups were incorrectly labelled **new**.

Fix: reset the sheet scrollport immediately and on the next animation frame at every step change;
kept group headers horizontal at the compact breakpoint; scoped full-width controls to row actions;
and mapped high-confidence preserved groups to **from source**.

### Iteration 3 — passed

The desktop and 700×600 captures show complete headings, consistent card rhythm, usable scrolling,
compact group controls, accurate source provenance, and no clipped or horizontally overflowing UI.

### Final cleanup — passed

The quit-safeguard profile row is now visibly dimmed, disabled, and labelled **Waiting…** while
the retry gate is active. The rejected bookmark-folder renderer was removed rather than retained
as a second dead F39 UI, and its design and plan are explicitly non-normative superseded records.

## Functional evidence

- Unit: 1,088/1,088 passed after the direct-session and scroll-transition changes.
- Focused F39 Electron acceptance with retries disabled: 11/11 scenarios, 63/63 steps passed.
- Full Electron acceptance before the final presentation-only fixes: 127/127 scenarios and
  766/766 steps passed; the focused no-retry run was repeated afterward.
- Substrate: token, settings, generated copy, and pinned adblock checks pass; the production
  dependency audit reports zero vulnerabilities.

## Remaining release evidence

- Packaged macOS, Windows, and Linux source-session reads remain release-operator gates.
- The signed unpacked macOS app passes post-sign verification and contains no ONNX, MiniLM,
  Transformers, embedding, or `.wasm` payload. F39 remains `PLANNED` until the platform reads pass.

final result: passed
