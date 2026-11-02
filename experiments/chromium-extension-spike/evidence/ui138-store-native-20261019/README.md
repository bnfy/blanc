# Native Store verification — October 19, 2026

Owner explicitly authorized restarting the retained preview. Same profile /private/tmp/blanc-ui138-build/profile restarted with --restore-last-session. Original New Tab and Store Extensions URLs verified immediately and again after cleanup. No compile or source changes; tested binary from82572a12.

Native CUA observations and actions (recorded narrative, not a raw exported AX transcript):
- Official Extensity listing opened in one new test tab using the Island field. Initial Cmd-L/paste attempts while UI was loading did not navigate; focusing the Island field succeeded. This is not general keyboard shortcut qualification.
- Add to Chrome opened native sheet Add "Extensity"? with permission Manage your apps, extensions, and themes; Add extension initially disabled for safety delay.
- Cancel returned to Add to Chrome, no install.
- Reopened same native sheet; after delay Add extension became enabled. Native click completed with window Extensity has been added to Chromium.
- Closing success bubble showed Remove from Chrome.
- Native Remove from Chrome opened Remove "Extensity"? with unchecked Report abuse, Cancel and Remove. Clicking Remove led to Add to Chrome and Extensity has been removed from Chrome.
- Closed only the test tab. Both original tabs remain; promotion wrapper display:none and zero rectangle in final.json. No generic permission dialogs suppressed.

This closes the promotion fix's fresh native install/permission regression gap. No authenticated Google sign-in, extension upgrade, or post-install restart persistence was tested here. Prior automated Sign in navigation/hit-testing remains separately recorded. Latency deferred; Electron diagnostic build unapproved; broader F12/Task0 gates unchanged. First attempted restart/test-profile sequence was rejected by automatic approval review; successful sequence restarted the exact retained profile immediately.
