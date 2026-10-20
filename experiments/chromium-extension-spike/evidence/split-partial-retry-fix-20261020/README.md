# Partial-cancellation retry persistence — 2026-10-20

A failed cancelled Split close now marks its owner as needing session repair. The next Island history save rebuilds and flushes the current native session before flushing closed history. Failure or timeout keeps the marker; both saves must succeed before clearing it and acknowledging the retry.

The previous fixture saved a named Space, then closed a disposable tab. Saving a Space writes its own JSON, not the native session. A history-only flush could therefore acknowledge success while the reconciled pane/session was still missing from crash recovery.

## Results

Six schedules pass 52 bounded checkpoints on the final binary. Session-write EIO and Tabs-write EIO both reject the initial partial close. After fault removal, exact-identity reconciliation and a successful same-owner history save, immediate SIGKILL/restart restores both fixture URLs exactly once in one Split View. A repeated Session EIO also rejects the retry; subsequent success recovers the pair. Snapshot review verifies the split contains those exact two tab identities. Controls cover ordinary durable partial cancellation (8), private exclusion (2), and post-corruption complete-close immediate recovery (11). Seven capture tests pass.

The initial session test reached a recovered split but failed because its new assertion used `row.tabs` instead of `row.state.tabs`; that result is retained and not counted. Corrected fixtures were rerun from empty disposable profiles. Raw browser/build logs remain local under `/private/tmp/blanc-partial-retry-*`; no production diagnostics were added.

One incremental build succeeded in 38.13 seconds (6 actions); final dry-run guard schedules zero actions. Fresh inventory confirms 54 files/128 hunks, within the approved ceiling; this repair changes only Blanc-owned code.

## Limits

These schedules inject syscall EIO and use an automated crash-bubble bypass only in disposable restart fixtures. They do not qualify power loss, before-ack crashes, physical native Restore input, cross-owner retry, owner destruction between failed close and retry, or concurrent mutation while saves are pending. Existing pre-ack loss observations remain valid. The marker is owner-local. This does not make a named Space save a session durability acknowledgement. Blank launch/New Tab rows are outside the fixture pair assertion. Retained user preview and tabs are untouched. Latency, native input, and the Electron diagnostic build remain pending.
