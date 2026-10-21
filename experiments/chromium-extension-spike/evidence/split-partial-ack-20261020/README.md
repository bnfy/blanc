# Partial Split cancellation durability — 2026-10-20

The previous Island closeSplit rejected while the beforeunload dialog was pending and never flushed the eventual partial state. The request now observes native unload cancellation, waits for a resolved close outcome, rebuilds/saves/flushes the surviving session for a cancelled batch, then saves/flushes native closed history before reporting cancellation. Complete closure retains its existing history-only persistence path. Native owner references are weak; observer ownership is released with the WebUI handler. The dialog has no renderer timeout; persistence after the outcome has a nine-second failure bound.

## Final acceptance

Fresh disposable profiles: immediate crash after durable cancellation with either left or right survivor restores exactly one live survivor, then explicit native history reconciliation restores the pair once and reuses that survivor. Both schedules pass eight checkpoints each. Private whole-split close preserves regular history and creates no private history (two checkpoints). Complete split close after corruption followed by immediate crash restores both panes, ratio and focus once (eleven checkpoints). Seven capture tests pass; JavaScript syntax/diff checks pass.

Only the fixture restart uses the existing hide-crash-restore-bubble flag. Native physical Restore acceptance remains pending. These checks crash immediately after the close operation's durable cancellation result, not before its asynchronous disk acknowledgement; crashes while the save itself is in progress and power loss are not qualified. Multiple simultaneous unload dialogs, cancellation-specific provider/write faults and hot profile destruction remain unqualified.

## Retained iterations

First incremental compilation failed on a shadowed contents variable; corrected. Initial repair passed both partial checks but unnecessarily rebuilt the session for complete closes and failed the corrupted-history regression. Final repair limits session rebuild to cancellation; the final full-close regression passes. Initial runtime failure JSON is retained, raw logs local. Incremental successful builds37.89s and41.46s; final guard zero. Upstream footprint54files/128hunks, unchanged within54/128. Retained developer preview untouched. Latency deferred; Electron diagnostic build pending approval.

Eleven-second unload decision also passes eight checkpoints, including immediate-crash restoration after durable cancellation. Final total:five schedules,37 checkpoints. Disposable profiles removed after process exit; raw logs retained locally.
