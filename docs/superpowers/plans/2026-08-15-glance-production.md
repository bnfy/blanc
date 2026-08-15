# Glance production implementation plan

**Source spec:** `docs/superpowers/specs/2026-08-15-glance-design.md`
**Selected visual:** `docs/superpowers/specs/assets/glance-focused-island.png`
**Status:** Complete — implementation, runnable acceptance, responsive/theme
captures, and blocking Product Design QA passed on 2026-08-15.

This plan turns the approved Focused Island direction into a production-ready
feature. Each implementation task has its verification beside it so visual
polish cannot outrun behavior, focus, or lifecycle correctness.

## 1. Lock executable geometry

- Change the pure Glance layout default to 62/38 and the owned divider gap to
  12px.
- Return explicit `glanceHeader` and `glanceContent` regions. In horizontal
  mode the header occupies the reference's top strip and content keeps the
  ordinary page bounds below it; in stacked mode reserve a 44px header between
  divider and lower content.
- Keep main ratio clamped to 50–78 percent and make coordinate-to-ratio math use
  the same constants as layout.
- Update runtime-default and geometry units first, including zero-size and
  narrow-height cases.

**Checkpoint:** `node --test test/unit/glance-layout.test.js test/unit/window-runtime-registry.test.js`

## 2. Make the picker a distinct trusted mode

- Add a dedicated `glance` overlay mode and bounds for initial and change
  anchors. Do not overload the normal `panel` mode or address input.
- Add purpose-built picker markup: heading, combobox, listbox, empty/error
  state, keyboard hint, and live status.
- Filter only eligible local tabs. Keep result state stable across the frequent
  `tabs:updated` broadcasts, including when the highlighted tab closes.
- Make selection await a successful main-process wake/attach result. Preserve
  the picker and expose the failure if attachment fails.
- Add the allowlisted `openGlancePicker` preload call and a sender-validated IPC
  handler for the header's Change action.

**Checkpoint:** Electron DOM assertions prove the picker has no normal Island
footer, search, history, Favorite, command, or remote result path.

## 3. Replace the floating chip with the flat Glance header

- Refactor the existing trusted strip Glance element into a semantic header
  with eyebrow, favicon, title, Make main, Change, and close controls.
- Position the header from main-owned geometry. Keep sampled page tint local to
  the main pane and use existing neutral surface/border tokens on the reference.
- Add compact states and native control clearance. Keep Change and close
  reachable at the minimum supported width.
- Preserve private treatment without making it the only state cue.

**Checkpoint:** renderer DOM/CSS inspection at the reference viewport, stacked
width, and Windows/Linux control-clearance widths shows no overlap or clipping.

## 4. Correct reference interaction and lifecycle

- Stop auto-promoting when the Glance WebContentsView receives focus. Reference
  pages must be fully interactive without changing roles.
- Keep explicit Make main as the only role-swap control and verify the old main
  becomes the new reference without reload.
- Await quiet-tab wake before selecting it for Glance.
- When the underlying reference tab closes, collapse Glance, resize the main
  view immediately, broadcast geometry, and restore a valid focus target.
- Keep close-without-tab-close, main-tab-close promotion, window teardown,
  overlays, utility sheets, and permission restacking correct.

**Checkpoint:** main-process state and real page interaction verify each
lifecycle transition with no detached focus or wrong-window attachment.

## 5. Complete keyboard and assistive behavior

- Implement combobox/listbox focus and `aria-activedescendant` behavior,
  Up/Down/Enter/Escape controls, pointer selection, and stable result IDs.
- Add status announcements for open/change/select/error/promote/close.
- Keep the divider's orientation/value semantics and support 2 percent,
  Shift+5 percent, limits, and reset.
- Verify visible focus treatment for every header and picker action.

**Checkpoint:** acceptance assertions cover role/name/value semantics and focus
return after selection, cancel, close, promotion, and underlying-tab close.

## 6. Expand automated acceptance

- Update `spec/features.md` and `spec/acceptance/glance.feature` to the approved
  interaction contract.
- Replace the implementation-shortcut-only scenario with real picker behavior;
  retain direct main hooks only for lower-level lifecycle cases.
- Add change-reference, interactive-reference-no-promotion, close-underlying-
  tab, quiet selection, stacked layout, and runtime-isolation coverage.
- Run the focused desktop slice, then all unit and substrate checks.

**Checkpoint:** focused Glance acceptance, `npm run test:unit`, and
`npm run substrate:check` all pass after a clean app relaunch.

## 7. Perform blocking visual and release QA

- Launch a clean dev instance and create the same two-pane state at the selected
  image's viewport.
- Capture actual horizontal, picker-open, stacked, light, dark, and private
  states.
- Run the Product Design QA rubric against the approved image, record every
  discrepancy in root `design-qa.md`, and fix all P0/P1/P2 findings.
- Re-run behavioral suites after visual fixes, inspect the final diff, and
  update the draft PR only when `design-qa.md` says `final result: passed`.

**Checkpoint:** clean git diff review, passing checks, live preview left open,
and PR summary that names any genuine residual risk instead of declaring
production readiness by assumption.

## Completion record

- Focused Electron acceptance: 4 scenarios / 32 steps passed.
- Complete Electron acceptance: 102 scenarios / 629 steps passed.
- Unit suite: 750 tests passed.
- Token, settings, copy, and bundled-adblock substrate checks passed.
- Live evidence covers horizontal, Change-picker, 700px stacked, light, dark,
  and private-reference states.
- Root `design-qa.md` records three comparison iterations and ends with
  `final result: passed`.
