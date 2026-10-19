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
