# Private live Split View metadata — October 20, 2026

Snapshot generation now reads native split membership, focused member and column ratio directly from the current window. It no longer depends on persistence admission. Persistent tab markers still distinguish Split View from temporary Glance; unknown/ambiguous focus is omitted. CaptureNativeSpace continues to reject private profiles, and private focus metadata remains memory-only through MarkPersistentSplit's existing off-the-record guard.

## Runtime verification

The disposable-profile run passes seven recorded checks. Private split snapshots contain two exact tab IDs, focusedTabId, focusedIndex and 50/50 column widths. Changing the active pane updates focus to the second member; opening a loose private tab retains the inactive split's last focus. The imported Spaces capture adapter still returns null for that snapshot. Native private save/open/recover requests refuse; private fixture URLs remain absent from the Spaces store, and both regular split windows remain unchanged. Actual SIGKILL/session restart restores the two regular UUID-owned windows and excludes private tabs. A further journal-boundary kill and restart rolls back the source split while preserving the decoy split. Normal browser shutdown exits zero.

Eight focused capture/identity tests pass. Initial incremental compile failed on a signed index comparison; its log is retained and the comparison is fixed. The repair incremental build succeeds in 41.46 seconds (six steps), and the final no-build guard schedules zero actions. No upstream hook changes; prior authoritative footprint remains49 files/117 hunks within49/120. Only the experiment-owned native snapshot implementation changed.

## Limits

This qualifies one private two-pane split, focus changes and inactive metadata, not private visual/native-input acceptance, private multiple-split combinations, group/pin mutations or every document lifecycle. Multiwindow recovery remains bounded to two regular windows with one split each and the journal boundary. Private exclusion checks cover the Spaces store and restart behavior, not a forensic profile audit. Disposable crash restart uses the existing diagnostic crash-bubble bypass; physical Restore input remains pending. Latency deferred; Electron diagnostic build unapproved. Retained preview and permanent profiles untouched.

All pages are authored loopback fixtures; profiles are excluded from evidence. Harness local config/helper paths are explicit in test.mjs. Raw compiler/browser logs retained verbatim.
