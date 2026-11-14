
### Shaded Purple dev restart — 2026-10-20

Native toolbar artwork now uses a scoped theme resource; foreground reads the supplier with a safe toolbar fallback. The initial unsupported default-color lookup caused a startup fatal and was repaired. The incremental repair build passed; twelve focused tests pass and final build guard has zero actions. Styling belongs in prototype.css because the base renderer stylesheet is a pinned reviewed asset.

Retained profile restarted. Automatic --restore-last-session stalled in SessionRestore; session/Preferences backup retained at /private/tmp/blanc-theme-session-backup. Reopened the recorded three URLs (New Tab, Shaded Purple listing, New Tab) in order and restored listing selection. This is URL-list recovery, not proof of automatic restoration or preservation of back/forward history. Verification confirms active theme ID, decoded1920x120 toolbar artwork, computed Island image and visible/aria Remove from Blanc label. Native AX confirms all three tabs and the label. No theme uninstall or reinstall performed.

Evidence: evidence/shaded-purple-restart-20261020. Theme changes are included in this checkpoint. Latency and Electron diagnostic build remain pending; automatic restoration stall and previous Split ratio persistence gap remain open.

Final styling verification:14px radius and no top inset highlight; three tab IDs/URLs and selection preserved during UI-only refresh. Twelve focused tests, scoped lint, token-source/generated consistency and audit inventory pass. Token source and generated outputs updated to resolve prior substrate drift. No build this commit checkpoint.

Prior-head CI eddfbe35 also failed site /mail overflow at320px and Intel unit directoryRows timing (166ms); these separate failures remain pending current-head CI. CodeQL on that prior head reports no new alerts.
