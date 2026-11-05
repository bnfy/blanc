# A3 rulings

The decisions made while building A3 (blocking), each with what it costs if wrong. Plan: `docs/superpowers/plans/2026-11-04-android-a3-blocking.md`.

## Rulings

- Task 1: Ruling: the spike's hooks are kept as patch 0106, not thrown away — they needed no change and rewriting them would add risk — cost if wrong: none.
- Task 1: Ruling: the bundle ships as an uncompressed APK asset read through OpenApkAsset, kept out of git as on desktop (8.4 MB generated), hash-checked — cost if wrong: a fresh checkout needs ~/blanc-assets/blocker; the build fails without it.
- Task 1: Ruling: a private tab's exception goes in the shared list, the iPhone's and desktop fork's rule — cost if wrong: a site allowed in private is remembered.
- Task 1: Ruling: the service-worker update hook is left out; it only logs — cost if wrong: none.
- Task 2: Ruling: no separate :core target; :browser keeps one target with //extensions/browser desktop-only, since the research hooks already compile that code out — simpler, same result — cost if wrong: a later split. Shared changes are compiled for Android only here; the desktop lane's patch checks pass, but a desktop compile needs the Mac mini.
- Task 3: Ruling: Review Focus 3 cases (service worker fetch, prefetch, download) not yet in blocking.mjs — open, to do before the gate.
- Task 4: Ruling: on Android the engine restarts by itself after a disconnect, at most three times in ten minutes, holding requests (shipping's uBO limit), because Android ends background processes in normal use; desktop's fails at once — cost if wrong: in-flight requests are refused during a restart.
- Task 4: Ruling: "unavailable" shows in the Sunrise menu on any page, since a page the blocker stopped never commits (test red first); it uses shipped strings, newtab.startup.failed and .retry — cost if wrong: wording says "could not start" after a crash too.
- Task 4: Ruling: Quiet Tabs pause only while unavailable, not before the engine starts (desktop's pause unless ready) — the engine is lazy and a Start-Page-only session would never quiet — cost if wrong: none.
- Task 5: Ruling: with blocking off everywhere the row turns it back on and says so; the iPhone opens Settings, which Android lacks until A5 — cost if wrong: the row changes in A5.
- Task 5: Ruling: the count is a disabled row under the switch, using desktop's shield.count strings — cost if wrong: a row more than the iPhone.
- Task 5: Ruling: blocking choices commit at once on Android (CommitPendingWrite); a force-stop within about a second can still lose one (1 of 7 runs before a 2 s wait) — cost if wrong: a choice made in the last second is lost.
- Task 6: Ruling: no weekly count: Android's Start Page runs the iPhone's pinned ios-start-page.js, which clears the count and shows protection On or Off, so a count wouldn't show. mobileAdblockEnabled now reads the real setting; the per-page count stays in the Sunrise menu. This differs from the plan's Task 6 and its call on the Start Page — cost if wrong: showing a weekly count needs a change to the shipped page file and a counter.
- Task 7: Ruling: F12-5 and F12-6's "pill" and "shield popover" are the Sunrise menu's blocking row on Android, as the iPhone's (D2, D13) — cost if wrong: step wording only.
- Task 7: Ruling: F12-8 stays out: Android has no site-controls surface reporting HTTPS — cost if wrong: that scenario isn't covered until one exists.
- Final: Ruling: I6's tolerance stands: the desktop design lets a page's own document request go out, and NavigationResponseGate refuses the response — cost if wrong: a stopped page's first request reaches its server.
- Final: Ruling: no download or service-worker-update case; a download is a navigation (the response gate decides) and the worker's own script comes from the page's site — by reading, not tested — cost if wrong: a blocked host could serve a download.

## Fixed in the final review

- restart policy treating ordinary process deaths as crashes (Critical C1) — only an end within 10 s of starting counts, restart is lazy, in-flight decisions are asked again; blocking.mjs "endings long after starting never stop pages" and "a request held while the engine comes back" (this behavior had no test first; both pass, and the old policy would fail the first by design).
- no on-screen reason when pages are stopped (I1) — a snackbar with Retry on ERR_BLOCKED_BY_CLIENT while unavailable, and the Start Page reads health; blocking.mjs asserts the text without opening the menu.
- /block-ads on an allowed site not turning blocking back on (I2) — BlancBlockingTest.blockAdsOnAnAllowedSiteTurnsBlockingBackOnToo RED→GREEN.
- timeouts failing permanently (I3) — request and startup timeouts go through Recover on Android; no separate test, covered by reading only.
- hidden tabs scanning every 250 ms (I4), Android only: Update returns when the frame is hidden; a visible page's scan cost is unchanged and unmeasured.
- missing Focus 1-3 checks (I5): restored tabs, held requests, speculation rules. The speculation case found a real gap: such prefetches bypass the blocker, so page preloading is off by default on Android (patch 0106) — RED→GREEN on the emulator.
- I7 as far as a compile: blocker_proxy.cc and chrome_content_renderer_client.cc syntax-compile for desktop on Chromium 158 (Mac Studio, out/BlancRelease flags) with the changed files overlaid, nothing written to the live tree; a deliberate #error in the overlay failed both, proving they were compiled. Not linked and no smoke run.

## Deferred minors

- unavailable preempts the row even with blocking off or the site allowed; BlancTabKeeper pauses likewise.
- inflight over 256 refuses instead of queuing.
- other tabs on a site aren't reloaded after allow (iPhone reloads them; desktop doesn't).
- no test of an exception set from a private tab.
- fd leak on the oversize return in ReadBundle, unreachable with the pinned bundle.
- ChromeIsolatedWorldIds.java not patched in 0106; no value collision today.
- turning blocking off doesn't free the engine for the session.
- no build-time check of the bundle's hash; a stale bundle builds an APK that stops every page.
- per-process memory still owed from the Pixel.
