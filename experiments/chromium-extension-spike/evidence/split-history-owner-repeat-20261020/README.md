## Unloaded-history owner destruction and repeated requests — October 20

On the unchanged native binary, five Restore Tab requests while an actual Tabs read is held coalesce into exactly one split restoration, preserving 35/65 ratio and right focus (six checkpoints). Closing the requesting window through Target.closeTarget before release leaves the surviving window unchanged and the browser exits cleanly (seven checkpoints). These are automated disposable-profile checks, not physical native input.

The owner-close first attempt used Island closeTab and timed out because that path retained the last tab/window; it does not establish an owner-destruction failure. A Node WebSocket runtime mismatch and stale release-marker timeout also preceded the fresh successful fixture. Failed results are retained. Closed history was isolated by removing only disposable open-session records from both clear/encrypted stores while stopped, retaining Tabs records. Combined session priority, post-load repeated requests, replacement-owner requests and full profile destruction remain unqualified.

No product changes or native compile. Read-only build guard schedules zero actions; sandbox ps denial retained before successful escalated guard. Prior upstream footprint 52 files/124 hunks unchanged. Retained preview untouched. Latency deferred; native input and Electron diagnostic build pending.
