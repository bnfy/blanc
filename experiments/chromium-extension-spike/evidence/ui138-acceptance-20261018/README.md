# Rail, Recently Closed and scoped visual acceptance

October 18, 2026 EDT (logs October 19 UTC). Installed Electron 1.38.0 versus Chromium 157; disposable profiles only. This is a bounded UI acceptance checkpoint, not full visual parity or tranche acceptance.

## Fixes

The full-height embedded renderer painted an opaque body over the page. Its root/body now remain transparent. Removing the redundant rail top offset restores the copied renderer's own header spacing. Native loose-tab moves now reach the end of a strip after a trailing group and accept insertion before a group's first tab, while rejecting interior targets and pinned/group violations.

## Native input and bridge evidence

Actual native CUA mouse drags passed: pinned reorder, within-group reorder, group reorder, loose tab into a group, pinned-to-group refusal. After keyboard focus traversal, Alt-Shift-Down reordered a group tab and retained focus. Native Recently Closed band drag and row-click restore passed; its placement preference survived restart. Native window close followed by bridge restore recovered both grouped tabs. Bridge close-group/restore recovered Alpha/Beta and their group. Private closed history stayed empty and refused reopen.

Final binary: native New Tab drag before Research and then after Research both announced Moved New Tab; native page button changed to Clicked, proving visible page input beside the rail. `final-native.json` independently checks end-of-strip placement, first-group boundary admission, interior refusal, pin preservation, saved closed-band preference and transparent paint. `window-restore.json` records actual closed-window restore.

## Visual measurements and limits

At 1280x800, DPR 2, both rails are (0,0,248,800), with 36px rows and pinned rows at y101/139. Both expanded panels are (330,12,620,341). Private rail backgrounds match rgb(10,10,10). Both Billboard content viewports are 1280x732; footer (0,678,1280,54), confirming the 68px native header reservation.

Renderer captures are component evidence, not whole-window pixel parity: Chromium transparent backing appears black in CDP captures; the final native screenshot shows actual composed content. Native Extensions is absent from renderer captures. Pill widths differ with unported controls/native slot. Electron's restored lazy Alpha briefly reads New Tab. Start-page histories differ (six versus one recent site), and group chips, blocker statistics, footer/version/What's New and Mahjong differ or remain unported. Private tab contents differ. Narrow widths, multiple DPI, long overflow, palette/find and complete matching states remain unqualified. Item 4 is now started, not complete; VoiceOver is not claimed.

## Retained failed attempts

The initial host window.close() did not close its native window; restore.json retains that failed window assertion and successful group proof. Actual native close plus window-restore.json supersedes it. A fixture server initially exited with its parent shell, causing connection refused; detached restart corrected the harness. First visual attempt used CSP-blocked eval; direct DOM inspection corrected it without bypassing CSP. Unmatched viewport attempt and private:true createTab rejection are retained. A combined fast Cmd-L/Escape input did not qualify rapid-key ordering; separate Escape after panel readiness worked. The Mac locked only after final native checks; preview restoration was verified by CDP, not a new physical-input pass.

## Validation, budget and cleanup

79 shared renderer tests, three promotion tests and four-file scoped lint pass. Two guarded incremental builds: 44.17s/43.66s wrapper, 39.58s/39.01s Siso, six final steps each. Final guard zero actions. Footprint remains 40 upstream files / 94 hunks; no budget increase used. No GN/toolchain/cold-output change. Disposable Chromium/Electron profiles and fixture server removed/stopped. Original preview New Tab and Chrome Web Store restored with empty host error status. Permanent Electron instance and 156 baseline untouched.

Recently Closed remains profile-wide rather than Electron window-local. Wider cross-window drag/restore combinations and Spaces/Glance remain open. Earlier F12/Task 0 gates unchanged. Latency deferred; Electron diagnostic build unapproved/unstarted. The installed Electron binary was used unchanged.

Archive members are individually SHA-256 verified using sha256.json; no profiles, cookies or keys included. Harness scripts retain their original /private/tmp paths and are evidence, not a portable test runner.
