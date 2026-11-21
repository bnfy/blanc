## October 19 live persistence crash and group/window restoration

Two-tab named group closes into one entry and reopens with both URLs, group name and membership
preserved. Moving that group into its own window, orderly browser shutdown, normal launch and
Recently Closed window restoration also preserves both URLs and group membership. Native bridge
calls only; no physical menu/button acceptance or arbitrary group/window combinations claimed.

One live run SIGKILLs the exact owned browser PID when fs.watch reports Tabs_* creation/rotation
during repeated tab closure. A second content-change-only attempt observes no qualifying event
after40 closures and its bounded wait; it does not kill the browser and is not an interruption pass. The event,
file size, acknowledged-close count and PID/command are recorded. No offline mutation is used.
Notifications can arrive after a completed write: this is live persistence-adjacent crash recovery,
NOT proof of an interrupted write syscall or a torn record. The actual mid-write/power-loss gate
remains open; prior offline truncation simulations remain separate.

| Trigger | Acknowledged closes at event | Live-close entries exposed after recovery |
| --- | --- | --- |
| rename | 7 | 7 |

The crashed browser and the non-triggering second run remain usable; new closed entries survive a subsequent clean restart
and reopen at the expected URL. No fatal/dangling diagnostics. These counts are exposed entries,
not proof of durable completion of every issued write. No general storage-integrity claim.

No production change/compile; guard zero3.74s and unchanged native hashes.40files/97hunks not
re-enumerated. Disposables removed, original preview preserved. Native input pending unlock,
latency deferred, Electron diagnostic build unapproved. Larger/mixed/private groups, group color
and collapsed-state parity, disk-full/permissions, true syscall interruption and OS restart remain
gaps. Plan item4 and earlier F12/Task0 gates remain open; cold-build column unchanged.

26 hashed members; profiles/raw browser logs excluded.
