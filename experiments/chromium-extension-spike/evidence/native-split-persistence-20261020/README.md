# Native Split View persistence and Spaces recovery

Based on Electron PR #993 at `98ea48fc01d79759cfef40009b18cf69715eaed8`. This is bounded native persistence acceptance, not full Split View UI parity.

## Implemented

- Native snapshots expose explicit persistent split membership, layout and focus with the same string tab IDs used by the Island and pinned Electron capture model.
- Native Spaces records use `splits` and parallel `splitIds`, translating the existing native `tabs` records. This checkpoint admits one active, contiguous, two-pane, side-by-side split with widths between 0.2 and 0.8. Pins and mixed-group membership are refused. The record-local ID is `split-0`; this is not a general cross-window split identity implementation.
- Split-bearing stores use version 2 and switch journals use version 4. Existing unsplit store/journal versions remain readable; older prototypes refuse the new versions rather than silently dropping layout.
- Staged restore reconstructs the split before final focus. The source-recovery journal carries the same validated data and existing window/tab identities.
- Explicit tab metadata distinguishes persistent Split View from temporary Glance, including session rebuild and Recently Closed metadata capture. Private captures remain refused.
- Internal `previewSplitPair` creates equal panes for tests. Public Split View controls remain hidden.

## Runtime evidence

`runtime-final.json`: fresh native pair; exact native snapshot consumed by the pinned PR993 adapter; save/reopen with right-pane focus; Split/Plain round trip; actual browser SIGKILL and native session restoration.

`recovery-final.json`: seven malformed records (missing columns, orphan member, foreign ID, inconsistent focus, bad widths, pinned member, mixed groups) refused with store bytes unchanged. A filesystem observer killed the disposable browser when its actual version-4 switch journal appeared. The journal remained on disk. Restart recovered the source split, cleared the journal and preserved right-pane focus. Both recovered panes were visible at equal widths. This is a journal-boundary crash test, not an exact inside-write or later staging-boundary interruption.

`boundaries.json`: saved 40/60 layout restores; temporary Glance cannot be saved; a subsequent clean restart does not promote Glance to persistent Split View.

All runtime fixtures use authored localhost pages and a disposable profile. Crash restart uses `--hide-crash-restore-bubble` only for this test profile; physical Restore interaction is not claimed. The retained development preview was not restarted or modified.

## Retained failures and repairs

- First compile failed on two Chromium API mismatches, corrected without configuration changes.
- First runtime attempt tried to switch again before restored tabs settled and was refused; the completed test waits for settling.
- Repeat-launch testing exposed loss of the persistent marker during session rebuild. Existing session/closed-tab hooks now carry it; final tests include repeated launch and recovery.
- The hook inventory unit test initially expected six edits. Updated to eight and explicitly checks both persistent-marker paths. Final eight focused tests pass.

## Limits

Multiple/inactive splits, three/four panes, stable global split identity, group-policy parity, divider interaction, pane headers, rail clustering, whole-split Recently Closed runtime restoration, partial/closed-history split reconstruction, later staging/removal crash boundaries and session/provider fault matrices remain unqualified. Temporary Glance session presentation itself is not implemented by this change. Unacknowledged state and power-loss durability are not promised. Latency remains deferred; Electron diagnostic build remains unapproved.

Build logs retain one failed compile and four successful guarded incremental builds (6, 6, 18 and 6 executed steps). No cold build, GN/toolchain changes or cache reset. Final guard and patch-budget results are archived alongside the tests. Profiles and browser caches are excluded from evidence.
