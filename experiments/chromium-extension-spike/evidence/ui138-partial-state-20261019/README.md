# Partial Spaces page-state recovery evidence

## Partial Spaces page-state recovery by durable tab identity — October 19, 2026

Version-3 switch journals now carry source tab UUIDs. The existing session metadata acknowledgement includes those UUIDs, and two hooks in already-patched session files preserve them through session rebuild/restoration. Recovery reuses only session-restored tabs whose durable identity and URL both match the source record; missing tabs are reconstructed and staging/imposter tabs removed. The durable window UUID, restore-in-progress, live-tab/capture and completion checks remain. No form contents are extracted into the Spaces store. Versions 1/2 remain supported; only v3 can supply validated tab identities, and malformed/duplicate source identity lists fail closed.

The final binary preserves the authored surviving form and 700px scroll in a partially reconstructed source window containing a missing New Tab, an extra destination tab and a same-URL imposter with different form contents. The imposter is excluded, the missing tab reconstructed, the decoy window unchanged and the journal cleared. The journal is captured from a real switch after acknowledged metadata persistence; the partial session shape is deliberately constructed and cleanly persisted, not a claim of crashing at every staging instruction. Five malformed identity-list cases retain their exact journals/windows/store, and a legacy v2 journal with an unvalidated extra v3 field is handled by the legacy path. The grouped variant also preserves the blue collapsed group and pinned slot. Its follow-on switch exposed an order regression; a native trace showed an old pinned tab still present after asynchronous close, constraining absolute moves. Final staging uses the returned WebContents directly and orders desired tabs at the unpinned end before assigning pins/groups, while completion still waits for the exact final capture. Ordinary and grouped A/B switching pass through journal completion. Five focused capture/identity tests pass.

Three fresh immediate-crash probes on the final normal binary (ordinary restoration plus two legacy-v2 Spaces repeats) restore the expected two-window structure without timeout. All lose the edits made just before the crash, including the no-Spaces control. The original three-window immediate timeout remains unreproduced and unresolved; these observations do not establish its cause. Observed restart completion intervals are diagnostic timestamps, not latency qualification. Recovery still cannot restore document state absent from Chromium's persisted session, including removed source tabs or very recent edits. Nonowner recovery-status errors and wider lifecycle/identity corruption coverage remain open.

Build record: initial incremental compile failed on a missing WebContents forward declaration (13.08s); repaired incremental build63.18s wrapper/59.34s Siso/18steps; validation hardening incremental39.05s/35.15s/sixsteps. Final guard zero actions/4.51s. The complete build invocation table, including the ordering repair and diagnostic iteration, is recorded in the evidence README. Fresh inventory49files/116hunks within approved49/120, two additional hunks in existing paths. Temporary native ordering logs were removed before the final build. No cold output, GN/toolchain changes or native-input/latency runs. The local ESLint invocation was unavailable because this checkout lacks its eslint dependency; module syntax and focused tests passed, with CI pending. Failed fixture API/background-target and stale-marker attempts are retained, not counted as acceptance.

Native input remains pending; latency deferred; Electron diagnostic build unapproved/unstarted. Test-only crash-prompt bypass and mock keychain are confined to disposable profiles. Evidence: `evidence/ui138-partial-state-20261019/`. Plan item4 and broader Spaces acceptance remain in progress.

## Build ledger

All rows below are incremental repair/diagnostic work in the existing output. None belongs in Task 0’s cold-build column. Helper dylib compilation is separate.

| Invocation | Wrapper seconds | Exit |
| --- | ---: | ---: |
| incremental-build | 13.08 | 1 |
| incremental-repair | 63.18 | 0 |
| incremental-validation | 39.05 | 0 |
| incremental-order | 40.76 | 0 |
| incremental-diagnostic | 38.93 | 0 |
| incremental-final | 40.12 | 0 |

Final normal guard: zero actions, 4.51s. Temporary SPACEORDER logs absent from both source copies; normal-source-proof.json records matching hashes.

324 archive members verified against manifest.json; archive SHA-256 `a626b1994f6d371e2d38b62c2d9e7b871ee92f1e82893a3f2fcee1a6501a5ce3`. No profiles, native binaries, helper dylibs or keys are committed. Owned disposable profiles/servers removed; retained preview untouched, host unavailable and original tabs not reverified.
