# Multiple and inactive native Split View persistence

Continues the migration from Electron #993 at `98ea48fc01d79759cfef40009b18cf69715eaed8`. Extends the prior single-active-split path; public Split View controls remain hidden.

## Change

Native Spaces capture now assigns a record-local ID to each split and validates membership independently. Each split remains two contiguous, unpinned, same-group panes in columns layout. Inactive splits no longer need to contain the window's active tab. The window active index and each split's focusedIndex remain separate.

Native tab metadata remembers which member was last focused. Selection changes update only the active split; unchanged polling does not write focus repeatedly. Session rebuild and closed-tab metadata preserve the focus state. Native restore reconstructs each saved split, applies its saved focus metadata, then selects the saved window tab. Snapshot membership is filtered by each split ID, so the PR993 adapter receives distinct member lists.

The existing version-2 store/version-4 journal carry this extension. Unknown/missing or contradictory inactive focus is refused, not invented. In particular, legacy boolean-only metadata may require activating its split before capture; this is not a guarantee of migrating unknown historical inactive focus. IDs are record-local, not a global cross-window identity system.

## Verified on the final native binary

`recovery.json`:
- Two inactive splits retain right-pane focus while a loose tab is active; the pinned PR993 adapter captures both.
- Save/Plain/Multi round trip restores both splits and the loose active tab.
- Selecting the first pane of the second split updates only that split's focus.
- Actual browser SIGKILL and session restore preserve focus `[1,0]` and the loose active tab.
- An actual switch-journal appearance triggers SIGKILL. The journal remains on disk; restart recovers both source splits, retains their independent focus and loose active tab, and clears the journal.

`boundaries-final.json`:
- Duplicate split IDs, missing split records, orphan members, interleaved membership, foreign IDs, invalid inactive focus and focus conflicting with the active tab are refused; store bytes remain unchanged.
- Independent 30/70 and 65/35 layouts restore with focus `[1,0]` and exact PR993 parallel splitIds.
- An active split and an inactive split preserve independent focus through another clean restart, including both saved layouts.

The first unequal-width test edited its current source record and was correctly rejected as no longer durably saved. That result is retained in `boundaries-first.json`; the completed test uses a separate destination record. No product repair or weakened guard was needed.

Eight focused tests and three-file scoped lint pass. One guarded incremental build: 56.47 seconds Siso, 18 executed steps. Repeat preparation is idempotent and final guard schedules zero actions. Fresh budget: **49 files / 117 hunks**, within **49 / 120**.

## Limits

Tests use two splits in a disposable regular profile with authored localhost pages. They do not establish arbitrary split counts, private/multiwindow movement, grouped/pinned mutation policy, partial/closed-history reconstruction, later staging/removal crash boundaries, malformed native session metadata, delayed providers or power-loss durability. Three/four-pane splits remain unsupported. Public controls, pane headers, rail clustering and whole-split Recently Closed runtime parity remain open.

Crash restarts use the diagnostic crash-bubble bypass only in the disposable profile; physical Restore interaction is not claimed. Retained preview untouched. Latency deferred; Electron diagnostic build unapproved/unstarted. Profiles and caches are excluded from evidence and removed after verification.
