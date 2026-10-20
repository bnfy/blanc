# Narrow Split View and full-height divider repair

Unapplied two-hunk hook in one new upstream file: chrome/browser/ui/views/frame/multi_contents_view.cc. Projected footprint51 files/120 hunks from50/118. Keep120-hunk ceiling; request only51-file ceiling.

The hook calls prototype-only AdjustSplitLayout after native child layout calculation. Non-Blanc and nonpersistent/Glance layouts remain unchanged. Blanc helper adjusts actual page rectangles and publishes the same rectangles to Island headers and transparent hit regions. At sufficient width, use saved column proportions with300px minimum; below612px stack equal rows when height permits; at very short height use focused pane plus other header. Fallback does not mutate saved ratio or native split membership.

Hide the native resize hit area only for this prototype-managed persistent layout and let the full-height Island separator own its exact gutter. Pointer/keyboard/reset share existing native ordered-pair validation. Stacked/focus fallback dividers do not rewrite saved column proportions. Preserve page input outside header/gutter regions; keep extension and Island overlay hit testing intact.

Validation: regular/private five widths by three saved ratios; native page rectangles versus header rectangles; top/middle/bottom drag and double-click reset; focus-only/stacked restore to wide columns preserving saved proportions; page input outside gutter, pane actions, Spaces save/reopen. Guarded incremental build only. Native interaction remains pending if CUA cannot select disposable window; no retained-preview input. Latency and Electron diagnostic build remain deferred.
