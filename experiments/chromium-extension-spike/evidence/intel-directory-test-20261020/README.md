# Intel directory test repair

Current-head Intel CI failed the directoryRows wall-clock assertion at 190ms versus 150ms during the full unit prerequisite. Replace that machine-dependent assertion with isolated instrumentation of the real module: one Intl.Collator reused across two full-directory sorts, exact code membership, complete locale/tie ordering, and a generous n log n comparison bound. Production sorting code is unchanged. This is a deterministic algorithm regression check, not a latency qualification.

All 11 tests in site-bangs-logic pass; scoped ESLint passes. An injected per-comparison collator regression fails the new assertion (87397 constructions versus one). Temporary negative-test file removed. No native rebuild needed for this test change. The adjacent Split ratio fix already passed four schedules/47 checkpoints, seven capture tests and its incremental build/zero-action guard.

Latency deferred; Electron diagnostic build pending approval. Intel CI confirmation remains pending push.
