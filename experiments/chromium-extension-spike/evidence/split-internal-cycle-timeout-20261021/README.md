

# Deterministic internal-cycle mutation timeout — October21

Two diagnostic schedules pass26 checkpoints: clear and encrypted retries complete8,817 and8,658 session/history save cycles respectively, with a synchronous ratio mutation after each completed cycle and before signature comparison. No write delays are injected. Initial Session EIO only establishes the partial-close repair marker; its arm is removed before retry and no new interception record exists. Both requests refuse acknowledgement at the existing ten-second deadline (10,039/10,024ms observed functional bounds, not latency qualification).

A fresh stable retry after timeout acknowledges and immediate SIGKILL/restart restores exactly one35/65 split with each original pane once. Fresh history close remains usable. The temporary native hook targets only the first saved retry request; subsequent callbacks are gated by the normal pending-request guard. A settled JavaScript promise is not exhaustive native duplicate-reply tracing. This qualifies deterministic internal-cycle deadline refusal and recovery, not natural user-driven starvation or throughput. Mock keychain and disposable crash-bubble bypass used.

Initial diagnostic attempt failed a UI-thread blocking DCHECK from marker-file access (zero completed cycles), and the first replacement failed compilation due to a static string exit-time destructor. Both retained and excluded from acceptance. Corrected diagnostic uses an in-memory request identifier; no production repair was needed. Diagnostic patch retained as evidence only. Native input, latency and Electron diagnostic build remain pending; pre-ack/powerloss and broader lifecycle remain open.

Evidence: evidence/split-internal-cycle-timeout-20261021.

Final verification: diagnostic removed byte-for-byte (native source equals saved normal source, no native git diff); normal incremental rebuild38.53s, six steps. Fresh normal-binary smoke passes12 checkpoints; seven capture tests pass; final guard zero scheduled actions. All disposable test processes exited and their profiles removed. Retained dev/upgrade baseline and permanent profiles/tabs untouched. Production patch footprint remains prior54/128; no upstream patch edits. Initial diagnostic build38.73s and corrected diagnostic build are retained in logs; all native builds incremental.
