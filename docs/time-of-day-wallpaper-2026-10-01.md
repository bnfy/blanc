# Time-of-day wallpaper — October 1, 2026

The owner changed the approved plan during implementation: this feature is free for everyone, with no Patron label or entitlement requirement. It is optional, defaults off, and only the boolean preference syncs. Phases use the device’s local clock: dawn 05:00–08:00, day 08:00–17:00, dusk 17:00–20:00, night 20:00–05:00. No location permission or remote artwork requests.

The existing start-page-sunrise.png remains byte-for-byte unchanged as dawn. Day/night are 1586 × 992; dusk is 1584 × 993. CSS uses the existing shared cover crop and theme/private overlays. Evening light mode strengthens its ivory veil for content readability while retaining the selected light theme.

The owner approved the day, dusk and night artwork on October 1, 2026 after reviewing the full image files and in-app previews ("artwork looks good"). The local review includes all four full artwork files and 48 real Electron screenshots (four phases × four layouts × light/dark/private). Generate screenshots with BLANC_WALLPAPER_REVIEW_DIR pointing to output/playwright/wallpaper-review when running node test/desktop/newtab-wallpaper-smoke.mjs.

Implementation uses a local-clock controller, image-load fallback, two-second crossfade and immediate reduced-motion switching. It suspends its minute timer on hidden documents and explicit main-owned tab/window visibility signals; Electron can leave a detached view reporting visible. Status and initial data carry the effective opt-in. Activation, window restore and system resume recheck the current time. The Settings sheet also reflects preference changes from Sync.

Validation covers local boundaries/timezones, clock jumps, hidden timers, reduced motion, missing-image recovery, stale load cancellation, strict preference sanitation, persistence and sync. Electron acceptance covers 48 render combinations, a non-Patron’s real Settings toggle, private tabs, hidden-tab/window signals, live opt-in/out and resume. The full unit suite passed 1,979 tests; lint, substrate checks and acceptance wiring passed. The startup-layout smoke passed recovery checks in all four layouts at two sizes, saved-session restoration and queued external URL selection. Platform package/release gates remain separate; these checks do not establish a released capability.

The native window’s completed close event also sends the main-owned hidden signal to retained macOS start pages. The Electron regression failed before this fix and passed afterward: minimize and Dock close cancel the actual minute timer, resume while closed keeps it suspended, and Dock reopen preserves the same WebContents while refreshing the current phase and starting exactly one timer. The 25 focused lifecycle/clock/settings unit tests, lint, substrate guards and startup-layout smoke with `--reopened-window` passed for this follow-up.

## Footer control

A compact wallpaper switch in the shared start-page footer changes the same synced, free `newtabDynamicWallpaper` preference as Settings. Its pressed state reflects initial data and live status, including changes from other normal/private start tabs and Sync. The dedicated newtab-only IPC action accepts a strict boolean and returns only the effective boolean; it exposes no general settings or entitlement records. Switching off immediately restores the original static Sunrise artwork. Narrow windows wrap the footer before its controls overlap.

The updated macOS Electron smoke passed mouse and Space-key toggling in every layout under light, dark and private styling, all 48 phase/layout/style render combinations, 60 footer geometry checks at 640/800/1040/1041/1200 px, settings-file persistence, reload, cross-tab state, Settings parity and malformed IPC writes. The existing minimize, resume and Dock close/reopen timer checks also passed. The full unit suite, lint, substrate consistency and acceptance wiring passed. Review captures live under `output/playwright/wallpaper-footer-review/` (ignored). These are development checks; installed Windows/Linux wallpaper acceptance remains a release gate.

## Artwork provenance

The built-in image generator edited the existing Sunrise image in three separate calls. Source composition was requested to remain fixed; no original was overwritten. Final files: src/renderer/pages/start-page-day.png, src/renderer/pages/start-page-dusk.png, src/renderer/pages/start-page-night.png.

### day

Use case: lighting-weather edit. Edit target: the supplied Blanc Sunrise landscape. Create the DAY lighting variant of this exact wallpaper. Preserve the exact terrain silhouettes, valley/fog geometry, camera position, horizon height, crop and wide 8:5 composition. Change only sunlight, sky and atmospheric color: calm late-morning daylight, soft pale blue/ivory sky, natural gentle green-brown mountain detail, bright mist. Remove the low sunrise disc and let daylight illuminate the landscape without a dominant sun in the content area. Retain the large quiet sky as negative space. No text, UI, logos, buildings, people or added objects. Full opaque wallpaper, same composition and aspect ratio as input.

### dusk

Use case: lighting-weather edit. Edit target: the supplied Blanc Sunrise landscape. Create the DUSK lighting variant of this exact wallpaper. Preserve the exact terrain silhouettes, valley/fog geometry, camera position, horizon height, crop and wide 8:5 composition. Change only sunset lighting, sky and atmospheric color: muted warm rose and copper near the horizon blending to quiet mauve overhead, soft darkened mountain ridges and lavender mist. The low sun is fading rather than bright white. Retain the large calm sky as negative space. No text, UI, logos, buildings, people or added objects. Full opaque wallpaper, same composition and aspect ratio as input.

### night

Use case: lighting-weather edit. Edit target: the supplied Blanc Sunrise landscape. Create the NIGHT lighting variant of this exact wallpaper. Preserve the exact terrain silhouettes, valley/fog geometry, camera position, horizon height, crop and wide 8:5 composition. Change only nighttime lighting, sky and atmosphere: deep subdued indigo sky, soft cool moonlit mist, discernible dark blue mountain layers, a very faint sparse natural star field. Remove the bright sunrise disc; no dominant moon or new object. Calm and legible, not pitch black. Retain the large quiet sky as negative space. No text, UI, logos, buildings, people. Full opaque wallpaper, same composition and aspect ratio as input.
