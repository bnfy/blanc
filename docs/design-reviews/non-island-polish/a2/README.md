# Non-island polish A2: visual review

Before: `origin/main` at `c9a873d3` (A1 merged). After: branch
`claude/non-island-polish-a2`. Both sets were made with
`node test/desktop/surface-captures.mjs` on the same seeded test profile
(fake favorites, history across three days, and downloads in every state; an
empty browser home). Images are 1024px wide window captures. The seeded sites
have no saved icons, so rows show the Island's letter tile; a site you have
visited shows its own icon.

| Surface | Before | After | Review point |
| --- | --- | --- | --- |
| Favorites | [Before](before/bookmarks-light-1280x800-01.png) | [After](after/bookmarks-light-1280x800-01.png) | Each row leads with the site's icon (or its letter). |
| History | [Before](before/history-light-1280x800-01.png) | [After](after/history-light-1280x800-01.png) | Today, Yesterday, then weekday and date; times like "4:54 PM" in one right-aligned column. |
| History, dark 640×480 | [Before](before/history-dark-640x480-01.png) | [After](after/history-dark-640x480-01.png) | Day headings and icons hold at the minimum window. |
| Downloads | [Before](before/downloads-light-1280x800-01.png) | [After](after/downloads-light-1280x800-01.png) | Every status ends at the same edge (spec finding 7); site instead of full URL; state marks; Clear finished beside the title. |
| Downloads, dark | [Before](before/downloads-dark-1280x800-01.png) | [After](after/downloads-dark-1280x800-01.png) | The interrupted row reads in the danger color. |
| Settings, Privacy | [Before](before/settings-light-1280x800-03.png) | [After](after/settings-light-1280x800-03.png) | Privacy & Security begins with its Blocking card. |
| Settings, calls and DNS | [Before](before/settings-light-1280x800-04.png) | [After](after/settings-light-1280x800-04.png) | Five titled cards; long explanations fold to two lines with More (same text). |
| Settings, dark | [Before](before/settings-dark-1280x800-04.png) | [After](after/settings-dark-1280x800-04.png) | Cards and folds in dark. |
| Bring Your Tabs, no browser | [Before](before/tab-import-light-1280x800-01.png) | [After](after/tab-import-light-1280x800-01.png) | Names the five browsers it reads and points to Favorites → Import HTML…. |
