# Repeated high-concurrency prefetch shutdown veto — October 22, 2026

Three consecutive eight-consumer cycles pass in each regular and private-only last-window schedule. Across six cycles, 48 acknowledged native Exit requests coalesce into 12 actual beforeunload prompts; all 48 original prefetched consumptions remain pending through cancellation and recover after utility resume. Every URL has native allow with the expected private flag and exactly one server prefetch arrival; fresh navigation passes each cycle. Extra consumers close between cycles, dialog listeners detach, and new cycle URLs prevent cache ambiguity. No readiness timeout or runtime failure occurred in this run.

Temporary native visibility/Exit probes are removed byte-for-byte and the normal binary restored incrementally with final guard zero. Production code and prior upstream footprint of 56 files/135 hunks are unchanged. This qualifies three repeated cycles at eight consumers per window, not maximum capacity, indefinite repetition, simultaneous cross-profile shutdown, physical native input, crash or power-loss recovery. Google baseline remains separate; disposable profiles and certificate keys removed; permanent profiles untouched. Latency deferred; Electron diagnostic build pending approval and unstarted. F12/Decision 2 remains open.

The temporary probes are archived in ../f12-prefetch-readiness-reconciliation-20261022/temporary-native-probes.patch. Raw runtime logs remain at /private/tmp/blanc-prefetch-repeat-high-01. Run `python3 validate.py` and verify `SHA256SUMS` for archived evidence.

Guarded incremental builds: diagnostic 37.60 seconds; normal restoration 36.43 seconds. Final guard: zero actions. Syntax, scoped lint and report validation pass.
