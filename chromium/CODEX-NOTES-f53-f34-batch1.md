# F53/F34 batch 1 — verified, one item left genuinely open

2026-11-08, branch `chromium/s3-f53-f34-batch1`, rebased onto `chromium/s3-quiet-tabs`
after PR #1419 (F41-78) merged. Candidate: macos-593cbf5c187af246.

Sourced by sweeping `glance.feature`/`split-view.feature` for the next batch
of gaps. Drafted by Codex per a researched brief, reviewed, one real bug found
and fixed in review, then independently applied/built/verified.

## Fixed and verified

1. **Split persistence was never surfaced to the test diagnostic.** The
   production write/restore path (`kPersistentSplitKey`/`PersistentSplitData`,
   `AddTabExtraData`/`RestoreTabIdentity`) already worked. `TestSessionWindowsRead`
   (the `sessionWindows` native handler behind `persistedSessionData`) just
   never read it, so its `splits` array was always empty. Now it pairs
   adjacent tabs whose extra-data is complementary `"1"`/`"2"` into a `splits`
   entry with `tabIds`/`focusedIndex`, and stamps each `saved_tab` with its
   SessionID as `id` so the test can correlate. Fixes F53-12 and both F53-27
   examples. No change to the write/restore side.

2. **Glance's "move the main page to a new window" had no implementation.**
   `glance.feature:52` called `moveTabToNewWindow`, which host.js didn't
   define, so it hit the generic "Prototype does not implement" refusal.
   Added `host.js`'s `moveTabToNewWindow` plus a native handler that resolves
   the tab, guards with `chrome::CanMoveTabsToNewWindow`, and replies with the
   destination's SessionID-ordered runtime label (matching `windowRuntimes`'
   own "primary"/"window-N" scheme, computed independently rather than shared
   — a minor duplication, not a correctness issue for this scenario).
   **Found in review and fixed:** the first version called
   `chrome::MoveTabsToNewWindow` directly on the target tab without checking
   whether it's part of a live Glance pairing. Glance's main/reference tabs
   are joined by a *real* native Chromium split (`TabStripModel::AddToNewSplit`
   / `GetSplitForTab` — confirmed by reading `sessions::SessionTab::split_id`'s
   presence and Blanc's own split-based Glance implementation), and Chromium
   moves a split's tabs together. So moving "main" actually moved both tabs,
   leaving the original window empty and forcing in a blank fallback tab,
   instead of promoting the reference. Fixed by calling the existing
   `EndGlance(owner, stays)` helper (same one `switchTab`/group-close/etc.
   already use) to dissolve the split and restore/activate whichever tab is
   staying *before* resolving the moving tab's (possibly now-shifted) index
   and handing it to `chrome::MoveTabsToNewWindow`. Generalized to handle
   moving either side of the pair, not just main.

3. **No way to simulate background-tab keyboard focus for a test.**
   `glance.feature:144` needs a tab to hold keyboard focus *while in the
   background*, which the existing `focusTabContents` adapter explicitly
   refused unless the target was already the active tab. Added a gated
   (`BUILDFLAG(ENABLE_BLANC_TEST_HOOKS)`) native `testFocusTabContents` that
   calls `WebContents::Focus()` on the specific tab by id regardless of
   active state; `island.mjs`'s adapter now falls back to it only when the
   target isn't active. No production focus-handling code changed.

Also added `testNavigateTabAnyScheme` (same gating) and taught
`quietNative.navigateTab` to pick it for non-http(s) targets while keeping
`navigate` (the real, intentionally HTTP(S)-only production test hook)
unchanged for http(s) ones. This is correct in isolation — confirmed reachable
and working via its sibling `testFocusTabContents` on the same `HandleTest`
channel — but see below.

## Not fixed: F53-14, `split-view.feature:110`

"A pane's corner tab follows its page as it navigates" calls
`navigateTab(splitB, 'blanc://mahjong/')`, which now correctly routes to
`testNavigateTabAnyScheme`. The native handler runs (confirmed `HandleTest` is
reachable via the passing `testFocusTabContents` case) and calls
`target->GetController().LoadURL(url, ..., ui::PAGE_TRANSITION_TYPED, "")` —
identical to the already-working `navigate` method's call shape for http(s).
But the live snapshot after the call shows the pane's URL unchanged, not
loading, no pending navigation entry: the navigation silently never commits.

This only reproduces when the target tab is an active member of a native
split (`model->GetSplitForTab(index)` is set) — `testFocusTabContents`,
exercised on a non-split background tab, works fine on the same dispatch
path, which rules out a channel/gating problem. The only other caller of this
adapter path, `shared-spaces.steps.js:102`'s identical `navigateTab(secondTab,
'blanc://mahjong/')`, is on an *ordinary, non-split* tab, but that scenario
isn't in the step-file allowlist (`shipping-core.cjs`'s `stepFiles`) yet, so
it couldn't be run to confirm whether the restriction is split-specific or
general. That allowlist gap is unrelated to this batch; not touched here.

This reads as a genuine split-view/WebUI-navigation interaction, not a
test-hook gap — whether a split pane can host an internal `blanc://` page at
all is a real product question, and reverting the navigation with no visible
error is itself worth separately investigating (silent failures are bad even
if the restriction turns out to be intentional). Needs its own focused
investigation (likely real native debugging/logging in the actual build, not
more static reading) before another attempt. Do not re-delegate this specific
scenario without that.

## Verification

- `node chromium/tools/build.mjs ~/Projects/BlancChromium158/src --build`:
  succeeded, candidate macos-593cbf5c187af246, framework hash independently
  verified against `tracker.json`.
- `--only="glance.feature:52"`, `:144`: pass. `--only="split-view.feature:88"`
  (F53-12): pass.
- Full `glance.feature`: 39 pass / 2 fail (unchanged pre-existing: line 98
  "Closing Glance takes the Change picker with it", line 538 "The card stays
  put while a pushed Island slides in" — both untouched by this batch, were
  already failing before it, candidates for the next batch). A third failure
  seen in one run (line 127, a Glance-picker wake-cancellation timing
  scenario, unrelated to anything here) did not reproduce on rerun — treated
  as a pre-existing flake per project convention, not a regression.
- Full `split-view.feature`: 27 pass / 3 fail (lines 110 as above, 135 "says
  when a tab changes group", 159 "floating Island ... after a relaunch too"
  — both untouched, pre-existing, next-batch candidates).
- `node --test chromium/tests/*.test.mjs` (needs
  `NODE_PATH=<main repo>/node_modules` in this worktree, which has no
  `node_modules` of its own): 72/72 pass.
- `python3 chromium/tools/check-patches.py`: passed.

## Rebase note

This branch was cut from `chromium/s3-quiet-tabs` at 913720f3, before PR #1419
(F41-78) merged. Rebased onto the post-merge tip; `blanc_prototype_ui.cc` and
`host.js` auto-merged cleanly (no overlapping lines with F41-78's changes),
`source-map.json` (generated) was regenerated fresh via
`refresh-source-map.py` rather than hand-merged.
