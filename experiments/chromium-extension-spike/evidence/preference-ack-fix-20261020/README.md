## October 20 — Stale preference acknowledgement repaired

Owner approval: **"Raise to 50 files; keep 120 hunks"**. A prototype-only preference is registered through Chromium's normal profile registration. Both initial-window and Spaces-switch acknowledgements now write a process-unique epoch plus increasing sequence through PrefService and require that marker (or a later sequence from the same process) in Preferences after completion. An old readable file no longer satisfies a fresh request. Later coalesced writes can satisfy earlier requests; owner/capture/timeout/retry validation remains. No direct writes to Preferences from the prototype.

Clear and encrypted-only tests inject actual Preferences rename EIO. An old-process marker refuses initial acknowledgement and switching with source/store unchanged; removing the fault permits automatic retry. A previous marker from the same process also refuses a later switch under EIO, then explicit retry succeeds and crash restart restores the exact authored-page owner. Twelve checkpoints across these two schedules pass.

The first clear run retained a separate failure: a successful Source switch produced two blank New Tabs and restart restored one. Its five acknowledgement checkpoints passed before the final exact-tab assertion failed. The final clear/encrypted recovery runs remove blank tabs before saving the fixture; they do not close this blank-tab lifecycle discrepancy. First-attempt evidence is retained.

This verifies the ordinary Preferences write marker, not Secure Preferences, all preference freshness under arbitrary concurrent edits, or hardware/power-loss durability. Broader provider/rebuild/lifecycle gates remain open. Native input pending, latency deferred, Electron diagnostic build unapproved/unstarted.

Concurrent creation/replacement/pending-close crash recovery also passes all six checkpoints, restoring four remaining window identities and preserving the source grouped split. Total final schedules:18 checkpoints plus eight focused tests. One42.21s/seven-step guarded incremental build; final guard zero. Fresh authoritative footprint50files/118hunks within owner-approved50/120. All four disposable profiles removed; preview untouched. Evidence: `evidence/preference-ack-fix-20261020/`.

Only authored loopback fixtures are used. Automated crash restart uses disposable-only crash-bubble bypass; physical Restore is not qualified. No raw profiles or keys are committed.
