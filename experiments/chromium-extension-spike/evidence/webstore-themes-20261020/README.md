# Web Store themes — 2026-10-20

Implemented native installed-theme palette for the Island and bounded profile-scoped NTP image resources. Customize offers Sunrise, Color, Your image, Theme in one row; Theme is also the accessibility label. Theme artwork runs through the existing wash and Fade renderer, preserving Dark and Spotlight readability overlays. Choosing a personal wallpaper does not uninstall the theme or overwrite the saved personal wallpaper.

## Acceptance

Official Store fixture: Cherry Blossom Tree HD Wallpapers Theme, lelfanicbadaahlibeimcpfpedfjccnk. Native install succeeds; a pure theme does not request extension permissions. Native removal confirmation Cancel leaves it installed; Remove resets Island and start page. Native Undo after reinstall restores the previous Sunrise selection. Removal remains effective after restart. Installed theme, 1920x1080 wallpaper, Spotlight and Fade55 survive restart; opting out to Sunrise also survives restart. Native four-choice layout visually inspected on one row with Theme. Dark and Spotlight computed gradients retained; Spotlight screenshot visually inspected. Three palette unit tests pass. No claim of a complete accessibility/contrast, localization, platform or theme-catalog matrix.

JSON captures are bounded assertions from the disposable profile. check-final.mjs is the final runner (undo expects the final Sunrise baseline). dark-overlay and spotlight-overlay captures precede the label-only one-row revision. Screenshots and raw logs remain local at /private/tmp/blanc-store-theme-20261020.

## Implementation iterations and limits

Retained initial compile failure (Reply signature), missing asset allowlist, CSP-blocked dynamic style, and oversized base64 CSS image failure. Corrected with approved stylesheet and short native image URLs; CSP was not weakened. Incremental successful builds:38.94s,49.24s,52.16s; later assets-only edits. Final guard schedules zero compilation. Initial fixed-delay restart sample was premature; final readiness-based restart passes. No latency or Electron diagnostic build.

Resources are limited to8MiB from the native theme pack, scoped to current theme ID and refused for private profiles. Color-only palette has unit coverage; no live color-only Store fixture. Same-ID theme update while a start page remains open is not qualified. Custom browser-frame bitmap parity is not implemented. Retained developer preview and tabs were not restarted or modified. Unrelated immediate partial-cancellation crash gap remains open.

Fresh upstream inventory:54files/128hunks, within approved54/128. Test browser exited and disposable profile/app copies removed. Raw logs retained locally.
