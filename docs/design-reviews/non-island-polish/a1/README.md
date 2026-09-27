# Non-island polish A1: visual review

Before: `origin/main` at `4fbe89fc`. After: branch `claude/non-island-polish-a1`.
Both sets were made with `node test/desktop/surface-captures.mjs` on the same
seeded test profile (fake favorites, history and downloads; an empty browser
home). Images are 1024px wide window captures.

| Surface | Before | After | Review point |
| --- | --- | --- | --- |
| Settings, light | [Before](before/settings-light-1280x800-01.png) | [After](after/settings-light-1280x800-01.png) | Ivory card over a warm scrim; gold marks the current tab and section. |
| Settings, scrolled | [Before](before/settings-light-1280x800-03.png) | [After](after/settings-light-1280x800-03.png) | The section marker now follows scrolling (spec finding 1). |
| Settings, dark | [Before](before/settings-dark-1280x800-01.png) | [After](after/settings-dark-1280x800-01.png) | Warm dusk card; gold stays readable (≥ 7:1). |
| Settings, 640×480 | [Before](before/settings-light-640x480-01.png) | [After](after/settings-light-640x480-01.png) | Same layout at the minimum window; warm palette holds. |
| Favorites, light | [Before](before/bookmarks-light-1280x800-01.png) | [After](after/bookmarks-light-1280x800-01.png) | Secondary buttons at full contrast. |
| Favorites, dark | [Before](before/bookmarks-dark-1280x800-01.png) | [After](after/bookmarks-dark-1280x800-01.png) | Dark sheet on the Sunrise dusk palette. |
| History | [Before](before/history-light-1280x800-01.png) | [After](after/history-light-1280x800-01.png) | Palette only; day grouping and icons come in A2. |
| Downloads, light | [Before](before/downloads-light-1280x800-01.png) | [After](after/downloads-light-1280x800-01.png) | Palette only; the shifting status column is fixed in A2. |
| Downloads, dark 640×480 | [Before](before/downloads-dark-640x480-01.png) | [After](after/downloads-dark-640x480-01.png) | Small-window dark sheet. |
| Keyboard Shortcuts | [Before](before/shortcuts-light-1280x800-01.png) | [After](after/shortcuts-light-1280x800-01.png) | "CommandH" becomes ⌘H (finding 2); nav matches the other sheets. |
| Bring Your Tabs | [Before](before/tab-import-light-1280x800-01.png) | [After](after/tab-import-light-1280x800-01.png) | Shared four-link nav and the shared 900px width. |
