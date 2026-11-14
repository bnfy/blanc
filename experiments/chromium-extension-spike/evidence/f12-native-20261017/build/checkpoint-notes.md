Native integration checkpoint in progress. All build invocations are guarded incremental; no --allow-large-build, environment recording, toolchain change, args change, cold output or competing build.

Build 01: UTF-8 adapter unsafe-span/header errors; 7 actions, failed.
Build 02: missing complete Mojo response structs; 3 actions, failed.
Build 03: 44.33 s Siso, 9 steps, passed.
Runtime probe 01: internal WebUI error then Owner ExecuteJavaScript assertion. No-blocker launch control proves WebUI works without interception. Fixed by gating on is_for_network_service and bypassing non-HTTP requests directly.
Build 04: 44.11 s Siso, 7 steps, passed.
Runtime probe 02: DCL timeout; real engine initialized and issued decisions. Probe 03 retained CDP partials, terminated owned stalled browser after 83.8 seconds; six ERR_FAILED allowed loads alongside nine expected ERR_BLOCKED_BY_CLIENT. Cross-pipe loader disconnect could beat client completion. Removed remote-loader disconnect failure and retained proxy until downstream endpoints close.
Build 05: 31.64 s Siso, 6 steps, passed.
No-referrer probe 04: all four paired runs pass with 24 candidates, 9 block/15 allow; 34 total hook observations each; no context differences.
Full comparison pending completion when these notes were written.
