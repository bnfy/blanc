# Quiet tabs: dim-only marker (remove the "quiet" text labels)

**Date:** 2026-08-18
**Status:** Approved

## Problem

The ⌘L panel and the vertical rail render a lowercase mono "quiet" text
marker on every quiet row. After a session restore most tabs are quiet, so
the list shows a column of repeated labels at ragged x-positions — visual
junk (user report with screenshot).

## Decision

Remove the visual "quiet" markers everywhere. The whole-row dim (0.5 opacity,
hover/focus restores) becomes the only visual signal, in the panel and rail
alike.

This knowingly re-accepts the trade-off PR #123 avoided: right after a
relaunch every restored row is dim at once, and a uniformly dim list doesn't
read as a state. Accepted 2026-08-18 because the stakes are low — clicking a
quiet tab just wakes it with a brief reload; nothing is lost or hidden.

## What stays

- The row dim in both surfaces, including hover/focus restore.
- The word "quiet" in every **accessible name** (panel `Switch to …, quiet`,
  rail states list) — screen-reader users keep the state.
- The Glance picker's sub-metadata line (`domain · group · quiet`) — that is
  descriptive text in a picker, not a per-row badge, and the picker rows do
  not dim.
- The `/sleep` command name and all "quiet" terminology. (F31's visible-state
  clause in `spec/features.md` is **updated** in this change — it mandated the
  word marker and now records the dim-only decision; the rest of the F-series
  is untouched.)
- "private" keeps its chip (panel) and bare-text marker (rail): it is rare
  and identity-class, not row metadata. The "quiet must not drift from
  private" style comments are deleted along with the shared selectors.

## Changes

- `src/renderer/overlay.js` — delete the `.row-quiet` tag block; keep the
  row's `quiet` class and aria word.
- `src/renderer/vertical-tabs.js` — delete the `.vertical-tab-quiet` marker
  block; keep the aria states entry.
- `src/renderer/styles.css` — drop `.row-quiet` / `.vertical-tab-quiet` from
  their shared chip/marker blocks; comments updated.
- `test/unit/quiet-tabs-chrome.test.js` — the marker-presence guards flip to
  a whole-source absence guard in the same commit (deliberate policy change).
- `spec/features.md` — F31's visible-state clause rewritten to the dim-only
  contract, so the platform-neutral spec and the reference implementation
  agree (same-commit rule, applied to the contract layer too).
- `test/desktop/steps/quiet-tabs.steps.js` — the panel naming assertion is
  comma-anchored (`/,\s*quiet/`); the bare `/quiet/` form matched the
  fixture's own "quietable" title and could never fail.
- `.design-sync/NOTES.md` — records that the Design System mirror
  (`Island.jsx`'s `.bw-row-quiet`) is stale until the next approved push.
