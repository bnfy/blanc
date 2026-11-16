# Find capsule automated evidence

## October 18 find-capsule checkpoint

The copied Electron 1.38 find capsule now uses Chromium WebContents Find/StopFinding and
window-local result events. Native Find and Find Next/Previous route through the capsule;
/find is restored. Stale request IDs, inactive/foreign tabs and navigation resets are guarded.
The query limit is 4096 UTF-8 bytes; case-insensitive search uses Chromium's engine.

Automated final-binary checks match installed Electron 1.38 on four matches including a
same-origin iframe, next/previous/wrap, Unicode and zero results. Rapid query replacement,
cross-document reset, tab switch/closure, same-document preservation, private isolation,
foreign/inactive rejection, slash listing and empty host status pass. Command helper calls
exercise the Cmd-G destination, not physical shortcuts. Capsule bounds pass at actual native
1280/800/500px widths. Component screenshots are not full composed visual parity.

Two incremental builds: 62.04s and 60.37s wrapper (58.06s and 55.07s Siso), 15 steps each.
Final guard zero actions; footprint 40 upstream files / 96 hunks, within 40/120. Four focused
regressions, syntax and focused host lint pass. No cold build, GN/toolchain change or latency run.

Failed harness attempts retained: private context requested on page endpoint instead of browser
endpoint; immediate post-restart connection before browser readiness; Node 20 invocation without
experimental WebSocket support. Final matrix and commands pass. Diagnostic background flags
were used only in disposable instances because the Mac is locked. Profiles removed and fixture
server stopped; original preview New Tab and Store restored on final binary with empty status.

Native Cmd-F/Cmd-G/Enter/Shift-Enter/Escape/button clicks, focus/passthrough, IME, VoiceOver,
DPI/full composed visual comparisons, PDF/cross-origin frames and crash/BFCache remain untested.
Native input stays pending unlock. Plan visual item 4 remains incomplete; prior F12/Task0 gates
unchanged. Latency deferred; Electron diagnostic build remains unapproved/unstarted.

Archive: `evidence.tar.gz`; all 36 members verified against `manifest.json`. No profiles or private keys included.
