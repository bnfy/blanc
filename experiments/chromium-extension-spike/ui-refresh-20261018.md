# Electron 1.38 UI migration follow-up

Owner requested this next on October 18, after the native recovery checkpoint.
Source inventory: `origin/main` at `7f57544b` (package version 1.38.0), compared
with the fork's last reconciled main `01cf07d7`. A partial preview is implemented; see `evidence/ui138-preview-20261018/`.
The inventory below remains the full target, not a claim of complete parity.

## Port and verify

1. Shared Island presentation: address-only hover opening, larger row icons,
   Glance icon, custom tooltips, matching reload/favorite/close geometry,
   quieter private chip and borders. Reference commits `379bb5fb`, `7422c94e`,
   `6e37b112`, `559e3aa3`. Check native Extensions slot alignment and preserve
   focus return and keyboard shortcuts.
2. Side-list ordering and groups: interleaved loose runs, Recently Closed,
   group colors/tinted blocks, rename/menu actions, new-tab-in-group and move
   group to a new window. Native Chromium contiguous groups and prohibition
   on grouped pins remain constraints, not silently emulated guarantees.
   Port the actual tab-sections helper and test every exposed bridge method.
3. Tab context menu: New Tab Below, Close Above/Below and site mute. Native
   model actions must preserve tab IDs, pin/group boundaries and private scope.
4. Start Page: wallpaper-blended footer, owner-selected image (F49) and Spaces
   color (F50). Image selection/storage requires an actual native implementation;
   do not show a working picker backed only by an Electron IPC stub.
5. Fixed-size before/after screenshots in regular/private, Island collapsed/open,
   grouped/ungrouped and Start Page states; actual pointer/keyboard checks where
   available. Record any unsupported feature alongside the UI diff.

Work stays in the isolated prototype. Prefer copying reviewed shared sources
from the pinned release commit over duplicate hand edits. Do not wholesale merge
shipping main into the active F12 checkpoint without reviewing its broader diff.
Use asset preparation for renderer-only changes and the existing guarded warm
157 output for necessary native changes. The upstream patch budget is already
40 files / 92 hunks; no new upstream file without consolidation or owner decision.
Latency remains deferred, Electron diagnostic build remains unapproved, and
neither this work nor its visual comparison promotes 157 past the upgrade gate.

## October 18 preview checkpoint

Reviewed renderer/assets, group colors and menus, rename/new-tab/ungroup/move-to-window,
bounded tab context actions, custom wallpaper and fixed color presets are ported.
79 reviewed pure-module tests, scoped lint, native bridge and browser automation
checks pass. Physical interaction and matched visual comparison remain pending.
Vertical rail, Recently Closed, site-wide mute, Glance and Spaces remain gaps.
The image adapter stores a bounded re-encoded JPEG in profile-local WebUI storage;
see evidence for limits and unsupported format/sync coverage.

Owner-reported Start Page overlap exposed a separate 157 preparation bug: a broad
`present` marker matched the separator patch and skipped the native 68px header
reservation. The marker is now unique, with an idempotence/regression test. This
fix touches an already-inventoried file; final build/geometry evidence is recorded
in the preview archive. No CSS spacer was added to web content.

## October 18 rail, Recently Closed, site mute and Store follow-up

Implemented native page-width reservation and hit testing for the reviewed vertical rail,
profile-local layout/width preferences, native TabRestoreService entries/restore/forget/clear,
and exact-host session-only site mute with independent private policies and per-tab unmute.
No new upstream path: 40 files / 94 hunks. Native rail switching, page click-through,
keyboard width change, menu site mute and Recently Closed row restore were exercised.
Bridge tests cover new/existing same-host tabs, host transitions, private isolation,
restore/forget and native viewport resize. Restart preserved rail width and closed entries,
cleared site mute, and showed an empty error status. Forget All passes on the final binary.

The owner-requested Chrome Web Store promotion rule is exact-origin and download-campaign
scoped, runs in Chromium's internal isolated world, and hides only the promotional container.
Normal Google installation of Extensity 1.14.0 passed through the native permission sheet
and success bubble; persistence and native removal passed. Test profile removed; original
preview New Tab and Store tabs restored. This is not a UA spoof or permission bypass.

Evidence: `evidence/ui138-rail-store-20261018/` (31 hashed archive members).
Four focused tests and scoped lint pass. Incremental successful wrapper times:
39.57, 57.36 and 41.97 seconds; failed 14.66/35.98-second attempts retained. Final guard zero.
Remaining: full matched visuals, broader rail drag/group/window restoration qualification,
and reconciliation of Chromium's profile-wide Recently Closed list with Electron's window-local
semantics. Glance/Spaces remain unported. The promotion may briefly paint before load callbacks;
its empty wrapper remains labelled in AX, and the separate inline Chrome-install banner is
outside the popover rule. Latency stays deferred; Electron diagnostic build remains unapproved.
Task 0 promotion/upgrade gate and F12 acceptance gaps are unchanged.
