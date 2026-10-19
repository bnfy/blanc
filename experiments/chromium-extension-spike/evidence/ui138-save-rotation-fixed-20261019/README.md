## Identity/rebuild/rotation rerun on the profile-persistence fix — 2026-10-19

Rerun against 6c1135a1, including its PrefService completion and readable-profile check. The same ten schedules cover clear-only and encrypted-only storage: identity replacement while acknowledgement is pending, and real SessionService reset/rotation before or during pending acknowledgement. A held first Session write proves no early journal. Identity change must refuse without source/store mutation and permit a fresh retry. Reset/rotation must complete after release. Actual process crash/restoration verifies source UUID and exact source URLs, decoy UUID/URLs, and absence of unfinished switch intent; rotation additionally requires a new Session filename.

Profiles are cleanly primed, matching the earlier matrix. Disposable restarts now explicitly use --hide-crash-restore-bubble because the fix correctly persists the Crashed exit marker. This is an automated restoration-engine test, not native Restore-button acceptance or a production prompt-policy change. The separate first-run checks remain at ui138-first-session-20261019.

Temporary test control is restricted to the exact disposable profile, removed byte-for-byte afterward, and the normal fixed binary rebuilt and smoke-tested. No product-source change. Upstream footprint remains the prior measured 49 files / 114 hunks within49/120; Blanc-owned temporary controls do not add upstream paths. No new inventory or unit-test count is claimed. All builds incremental in the existing output.

Remaining: physical recovery UI, arbitrary overlapping/external writers, real provider failures, hot profile deletion, wider lifecycle and power-loss qualification. Latency deferred; native input pending; Electron diagnostic build unapproved/unstarted. Plan remains in progress. Owned test profiles/server removed; retained preview untouched and unavailable, so original tabs not reverified.

Evidence: `evidence/ui138-save-rotation-fixed-20261019/`.

Ten final diagnostic schedules and one normal-binary smoke pass. Incremental wrapper times: diagnostic 38.36s, normal restore 38.86s. Final guard zero actions / 3.58s. 121 archived members verified against SHA-256. No new unit-test pass claimed for this evidence-only checkpoint.
