# F53/F34 batch 1 — source changes, verification incomplete

2026-11-08, branch `chromium/s3-f53-f34-batch1`, based on `913720f3`.

## Implemented

1. `TestSessionWindowsRead` exposes tab SessionIDs as strings and always emits
   `splits`, pairing adjacent complementary `1`/`2` extra-data values without
   overlapping pairs. `focusedIndex` identifies the `2`. Persistence writers
   and restore logic are unchanged. Covers F53-12 and both F53-27 examples.
2. `host.js` forwards `moveTabToNewWindow` with a native tab ID. Native code
   resolves that ID, checks count and `CanMoveTabsToNewWindow`, invokes the
   actual two-argument `void` Chromium command, then finds the destination via
   the moved WebContents and returns the same SessionID-ordered ordinal label
   used by `windowRuntimes`. F34-1, glance.feature:52. Existing MainIndex clears
   Glance identity when either member leaves; runtime promotion remains untested.
3. `testNavigateTabAnyScheme` validates GURL and loads the explicit tab without
   activating it. `quietNative.navigateTab` retains `navigate` for HTTP(S) and
   uses the test hook otherwise, covering both split and shared-space callers.
   The production HTTP(S) guard is unchanged.
4. `testFocusTabContents` calls Focus on the explicitly identified WebContents.
   The existing adapter uses it only for a background tab; active-tab rail and
   open-Glance paths are unchanged. The existing scenario step already calls
   that adapter. Tags: @F34-1 @F34 @D11. Scenario: “A reference that already holds
   keyboard focus when Glance opens is the focused pane”. The Then compares the
   recorded pane with the reported focus holder, but permits a null holder;
   it is unchanged. Actual background focus must still be observed at runtime.

Both new test operations live directly in HandleTest, behind
ENABLE_BLANC_TEST_HOOKS and its existing --blanc-test requirement. They are
absent in release-disabled preprocessing and cannot be called via production
Handle dispatch. No production focus handling was changed.

## Checks

- refresh-source-map.py: refreshed, 441 custom files.
- check-patches.py: passed, 128 upstream / 441 custom files; reconstruction only.
- check-hook-gates.py: all four preprocessing checks passed.
- node --check chromium/blanc/island/host.js and git diff --check: passed.
- node --test chromium/tests/*.test.mjs: initial invocation had 45 pass and
  3 file-load failures because @cucumber/cucumber-expressions is absent here.
  Rerun with NODE_PATH=/Users/anthonyjloria/Projects/BlancChromium158/repo/node_modules:
  69 pass, 0 fail. Logs: /tmp/blanc-batch1-node-tests{,-deps}.log.

## Blockers and follow-up

No native build or acceptance scenario ran. apply.py --apply, using HEAD's
source map as --previous-map, stopped before any mutation:
`Unrecognized cached source; preserve and reconcile: blanc/browser/ui/blanc_prototype_ui.cc`.
Do not overwrite that source: reconcile the shared checkout and its current
owner/candidate first. This session's writable roots also exclude that source
and build tree. chromium/CLAUDE.md is absent in this worktree.

Git add/commit failed because the linked worktree index lives outside writable
roots: `repo/.git/worktrees/s3-f53-f34-codex/index.lock: Operation not permitted`.
No commits were made. Four sequential, separate patches are preserved at
/tmp/blanc-batch1-fix1.patch through /tmp/blanc-batch1-fix4.patch, including each
stage's source-map hashes, for recreating the requested readable commit history.
They apply to the starting HEAD in order; the working tree already contains
all four, so do not apply them again here. STATUS and this note are additional
uncommitted documentation changes.

After reconciling source and filesystem access: apply, guarded incremental
build, targeted F53-12/F53-27/F53-14 and glance.feature:52/:144 runs, then both
full feature files. No candidate/tracker verification promotion was made.
Open Link in Space, Batch Close and existing blocked work are untouched.
