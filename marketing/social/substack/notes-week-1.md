# Notes, week one (week of October 13, 2026)

Status: **drafts for owner review.** None has been posted. Each Note goes out
only after the owner's yes on its exact text.

## Note 1: the publication is now Blanc

Post right after the profile refresh
([`profile-2026-10-13.md`](profile-2026-10-13.md)) is live.

> This publication is now simply Blanc. We make Blanc Browser, a free, open-source desktop browser, and Blanc Mail, a native Gmail app for Mac, is coming soon.
>
> Here you'll find the story behind each release, an essay about every two weeks on who your software works for, and the occasional note on how we build.
>
> Less is more.

## Note 2: the Arc import

Post the day the v1.32 post ([`v1.32-release-post.md`](v1.32-release-post.md))
goes out, linking to it.

> Moving on from Arc? Blanc Browser 1.32 can bring your Arc Spaces over, with their pinned tabs, their Today tabs, and their folders as tab groups.
>
> Type /bring-tabs in the ⌘L panel and choose Arc. Your sign-ins and history stay in Arc.
>
> [link to the v1.32 post]

## Note 3: one box for everything

Later in the week.

> Blanc tip: press ⌘L (Ctrl+L on Windows and Linux) and start typing. One box searches the web, your open tabs, your Favorites and your history, so you can get back to a page without hunting for it.
>
> Type / to see every command.

## Claim check (public baseline v1.32.0)

| Claim | Evidence | Limit kept | Verdict |
| --- | --- | --- | --- |
| Blanc Browser is free and open source | `v1.32.0:site/src/pages/about.astro` | Mail not called open source | verified |
| Blanc Mail is a native Gmail app for Mac, coming soon | live [blanc.day/mail](https://blanc.day/mail) | Not launched | verified |
| Arc import brings Spaces with pinned tabs, Today tabs and folders as tab groups; `/bring-tabs`; sign-ins and history stay in Arc | `docs/press/release-notes/v1.32.0.md`; `docs/website-v1.32-claims.json` (`arcImport`) | — | verified |
| ⌘L / Ctrl+L opens one box that searches the web, open tabs, Favorites and history | `site/src/pages/arc-alternative.astro` ("search the web, switch tabs, find history and favorites, or run slash commands"); `docs/marketing-claims.md` (Quick Switcher) | Doesn't promise Enter always searches the typed text | verified |
| Typing / lists the commands | `src/renderer/overlay.js` (slash commands show when the input starts with `/`) | — | verified |
