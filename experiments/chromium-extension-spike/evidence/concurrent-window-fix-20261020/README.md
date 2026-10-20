# Concurrent-window recovery repair

## October 20 — Concurrent-window crash restoration repaired

The fresh-profile reproduction contained all three window UUIDs in its native session streams, but no `Preferences` file. Restart therefore treated the profile as new and skipped restoration. Initial-window acknowledgement now orders the profile preference write and requires a readable dictionary before marking the window saved, retaining the existing owner/capture validation and retry handling. PrefService completion does not itself report write errors; this is a restart-prerequisite check, not a power-loss guarantee.

Creation-only crash recovery passes with all three exact UUIDs and normalized contents. The combined overlapping-creation, completed-close/replacement and genuine beforeunload-pending-close schedule passes with all four remaining windows restored; the closed window stays excluded and source grouped split state is preserved. Ten recorded runtime checkpoints across these two runs and eight focused tests pass. Before-fix failure and decoded session evidence are retained in `evidence/concurrent-window-fix-20261020/`.

One 36.09-second/six-step guarded incremental build; final guard zero. No upstream hook changes; prior authoritative footprint 49 files/117 hunks remains within 49/120. Fresh profile directories removed; retained preview untouched. Broader provider/write-error/rebuild interleavings, failed preference writes, power loss and unpersisted recent edits remain unqualified. Native input pending, latency deferred, Electron diagnostic build unapproved/unstarted.

The harness uses authored loopback pages and disposable profiles. Restart uses --hide-crash-restore-bubble only in the disposable test; physical Restore interaction is not qualified. Raw profile/session copies are not committed. session-records.json contains only window identities and record counts from those authored fixtures. Fixed creation-only and combined runs exited normally.
