## Malformed Spaces recovery journals — 2026-10-19

Eight bounded native checks pass on the normal f45e4107 binary. Synthetic truncated JSON, unsupported version, missing window identity, non-string identity, out-of-range active tab, unsafe file URL and invalid group index are refused with an error. Each retains the exact journal bytes, preserves both source and decoy UUIDs/URLs and the saved store, and refuses a save while recovery is unresolved. A valid v2 control recovers the source and clears its journal while preserving the decoy and store.

The encrypted-session disposable profile uses the mock keychain and cleanly persisted two-window state. Restarts explicitly use the diagnostic crash-bubble bypass only in this test profile; no native recovery-button acceptance is claimed. Invalid journals are replaced only while the test browser is stopped. These are authored serialization negatives, not physical disk corruption, power loss, or exhaustive parser/lifecycle qualification.

Two initial seed attempts failed in the harness: the shell selected Node20 without global WebSocket, and the helper caught that error as host-not-ready. Both failures are preserved. The complete matrix uses bundled Node24.19.0. No product changes or native compilation; final check-only guard schedules zero actions (4.81s). Prior measured footprint49files/114hunks is unchanged within49/120, not re-enumerated. Owned profile/server removed; retained preview untouched and host unavailable, so original tabs not reverified.

Remaining: actual OS provider faults, hot profile deletion, arbitrary overlapping restore/writers, unsaved state and power-loss qualification; full Spaces acceptance remains open. Native input pending, latency deferred, Electron diagnostic build unapproved/unstarted. Evidence: `evidence/ui138-journal-validation-20261019/`.

66 archived members verified against SHA-256. No new unit-test count claimed.
