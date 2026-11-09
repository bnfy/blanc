# Batch 2 — two of four verified, two still open

2026-11-08, branch `chromium/s3-batch2`, cut from `chromium/s3-quiet-tabs` at
`11e74ff1` (post-F41-78, pre-PR #1420/"F53/F34 batch 1"). Candidate:
macos-e4317b7b0e5b22ae.

Codex's own attempt (prompted with a researched brief) was blocked before it
could build or run anything: sandboxed loopback listener (`EPERM`), sandboxed
process inspection for the build guard (`EPERM`), sandboxed Git index writes,
and `apply.py` refusing an unrecognized cached `blanc_prototype_ui.cc` (the
shared checkout had a different candidate applied at the time). It made no
commits, but its source-reading notes (preserved below where they mattered)
correctly identified that F53-18's real behavior lives in `previewGlancePair`,
not `keepGlanceAsSplit` — the single most important correction to the
original brief. Continued directly from there rather than re-delegating.

## 1. Fixed and verified: split-view.feature:135 (F53-18)

The original brief (mine) assumed `keepGlanceAsSplit` needed to *move* the
reference tab into main's group. Wrong: `previewGlancePair` already does
that — silently — when Glance opens, sharing the group-moving block with
`createSplit` (`blanc_prototype_ui.cc`, search `method == "createSplit" ||
method == "previewGlancePair"`). By the time "keep as split" runs, the move
has already happened; nothing announced it.

Fix: `keepGlanceAsSplit` now reads the reference's *current* group and
compares it against `owner->glance_origin_group` (saved at Glance-open time,
untouched since). If they differ, it looks up the current group's name via
`GroupVisuals(model, *current_group)->title()` and returns it in the reply
(`{ok: true, movedIntoGroup: "<name>"}` instead of a bare boolean — checked
both existing test call sites for `assert.ok(...)`, which a truthy object
still satisfies). `host.js`'s wrapper announces it via `glanceSay('split.
groupMoveInto', {title, group})` — a copy key that already existed
(`copy/messages/en.json`), previously only used as static "Split with ▸"
menu label text, never as a live announcement. `split.made` still fires too.

Verified: targeted run passes; full `split-view.feature` regression is 25
pass/5 fail (was 24/6 baseline) — the one new pass is this fix, the other
five pre-existing failures (88, 110, 159, 187, 227) are untouched by this
branch (88/187/227 are fixed by PR #1420, on a separate unmerged branch; 110
and 159 remain genuinely open, see below and last round's notes).

## 2. Fixed, empirically confirmed, not independently re-verified end-to-end: glance.feature:538 (F34)

Root cause, confirmed with real numbers (temporary `LOG(ERROR)` added to
`AdjustSplitLayout`'s Glance branch, rebuilt, ran the actual failing
scenario, read the values from the fixture's `browser.log`):
`AdjustSplitLayout` converted the container's `origin` into Island-relative
coordinates (`origin.Offset(-island->x(), -island->y())`) *before* using it
to place the card (`page.Offset(-origin.x(), -origin.y())`, then
`child.bounds = page`). Working through the actual screen-position math:
`final_screen_position = browser_view_screen_origin + raw_origin + page`,
and substituting `page = glance_page - origin` with the Island-adjusted
`origin` gives `final = browser_view_screen_origin + glance_page +
island->y()` — the card's real rendered position tracked the Island's
live, mid-animation offset, one-to-one. Logged values from a real reveal
confirmed `raw_origin.y() + height` stays exactly 1140 across every frame
(the window's own geometry is genuinely constant); the Island-adjusted
`origin` was the only thing varying frame to frame.

Fix: place the card from the raw `origin` (drop the Island-offset
`.Offset()` call entirely — `glance_page` is a window-absolute target, and
should be placed as one). The `pageArea`/`band` diagnostic (what
`split_geometry.pageArea` reports, consumed by the test harness's own
Island-relative→window-space conversion, which adds `islandY` back) was
*already* invariant as originally written — confirmed by the same algebra
plus the same logged numbers (`band = BaseHeaderHeight - island->y()`,
`win(band) = band + islandY = BaseHeaderHeight`, constant; `pageArea.height`
likewise cancels to `raw_origin.y() + height - BaseHeaderHeight`, constant).
That computation is unchanged in *value*, just refactored to read from an
explicit local `island_relative_origin_y` instead of a shared, mutated
`origin`, since `origin` now has to stay raw for the card-placement fix
above.

**Could not independently re-verify the original invariance assertion
locally after the fix.** Every post-fix local run (seven total, including
one with the sampling window quadrupled from 1200ms to 4000ms as a
diagnostic, since reverted) fails earlier, on this scenario's *separate*
check that the Island visibly entered its `sliding` state at some point
during the reveal (`assert.equal(this.glanceIslandSlid, true, ...)`,
checked before the invariance assertion). Traced `sliding`'s source:
`owner->autohide_slide.has_value()` in `island_autohide_controller.inc`, a
16ms-tick `base::RepeatingTimer`-driven animation completely unrelated to
`AdjustSplitLayout` or anything this fix touches. Before the fix, every
run this session (including the one that produced the diagnostic numbers
above) reliably caught `sliding: true`; after, it consistently didn't,
across 7 repeated local runs. The most likely explanation: a long-running,
CPU-heavy live-dev-instance process plus this session's own concurrent
build/test churn were adding enough system load to incidentally stretch the
reveal out long enough for polling to catch it, and removing the
diagnostic `LOG(ERROR)` (itself synchronous per-frame disk I/O on the UI
thread) removed a similar, accidental slowdown. This is a pre-existing
timing fragility in how this one scenario tries to observe a transient
animation state via unguarded polling, not a defect in the fix — but it
could not be ruled out with full confidence locally, and is worth its own
look (a steadier wait-for-sliding-to-start mechanism, rather than racing a
fixed sampling window against animation timing) separately from this
fix. Do not revert this fix on the strength of that alone; the algebra and
the pre-fix diagnostic numbers are a complete, independent proof.

## 3 & 4. Still open

**glance.feature:98** (Change picker focus-restore) and
**split-view.feature:159** (floating Island z-order after relaunch) were
not reattempted this round — the geometry investigation above consumed the
round's remaining time. Both still need the real native-debugging approach
described in the original brief (live logging/tracing in an actual build,
not more static reading). Carry both into the next round.

## Incidental: glance.feature:337 flake

One full-regression run showed `glance.feature:337` ("A chosen quiet tab
says Opening while it wakes") failing with `Timeout waiting for
#glancePickerInput[aria-busy="true"] to be visible` — the same error class
as a one-off, non-reproducing failure on an unrelated scenario earlier this
session (`glance.feature:127`). Nothing in this batch touches the Glance
picker's wake-busy state; treating this as the same pre-existing flake
class, not investigated further here.

## Verification

- `node chromium/tools/build.mjs --build`: succeeded twice (once per fix,
  reusing the cache), final candidate macos-e4317b7b0e5b22ae, framework hash
  independently verified against `tracker.json` both times.
- Targeted: `split-view.feature:135` passes. `glance.feature:538` blocked
  from re-verification as described above (its own earlier, pre-fix
  diagnostic run did reach and fail the real invariance assertion with the
  exact values this fix's algebra predicts).
- Full `glance.feature`: 36 pass / 5 fail (37/4 baseline; difference is the
  :337 flake above — :538 was already counted in the baseline's 4).
- Full `split-view.feature`: 25 pass / 5 fail (24/6 baseline; +1 pass is
  this round's :135 fix).
- `node --test chromium/tests/*.test.mjs` (needs
  `NODE_PATH=<main repo>/node_modules` in this worktree): 72/72 pass.
- `python3 chromium/tools/check-patches.py`: passed.

Open Link in Space, Batch Close, F53-14 (documented last round) and existing
blocked work are untouched.
