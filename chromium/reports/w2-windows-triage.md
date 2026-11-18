# W2 triage: every non-passing Windows case

W2 Task B4 (`docs/superpowers/plans/2026-11-18-windows-fork-w2.md`). W1's last
baseline (`windows-x64-e42f9e5a532cdf96`, run 44236176647) had 70 non-passing
cases: 47 fail, 23 undefined. The W2 build's full run (`windows-x64-5d4ff5898abbe899`,
run 44329065487) passed 610 of 667 (W1: 591), with 27 failing, 1 undefined and
29 excluded. A subset rerun of the failures on `windows-x64-13dec630bc1b996c`
(run 44357790872) after the harness fixes below is the latest state.

## Fixed in W2

| Cases | Cause | Fix |
| --- | --- | --- |
| `tab-migration` 12 of 14 | The import steps wrote Chrome's profile in the Mac layout; the app on Windows never recognized a running Chrome (it looked for `SingletonLock`) | Harness uses `chromeProfileRoot`; the app treats Chrome's `lockfile` as running on Windows (B3) |
| `tab-migration:109`, `F41:69` | The harness read files the running browser holds open, which Windows refuses (EBUSY) | `readHeldFile` copies them through a shadow copy |
| `interface-language` 18, 26, 34 | The language step read the catalog from a disk folder the compiled-in Island doesn't have | The step reads the embedded catalog from the fork tree (B2) |
| `local-profiles:27`, `link-routing:28` | The profile-card lookup matched `/Default`; Windows profile paths use backslashes | Either separator matches |
| `arc-spaces-import` 7, 23, 39, 46, 60 | Shipping's steps write Arc's file in the Mac layout | On Windows the adapter links Arc's Store folder to it (B3) |
| `vertical-tabs:74`, `glance:498`, `newtab-layouts:240` | The runner had Windows animations off | The workflow turns them on (B2) |

## Excluded by an owner decision (26)

The owner's product decisions (1Password fill, Reading Mode, Dark Reader, the
updater, V12, V18), the Electron listener counts, a private-window passkey
(Windows Hello, a hand check), Linux's own Arc import, and the Island's
floating window buttons (W1: Windows' own caption buttons), and the three app
icon cases (no icon catalog on Windows, owner 2026-10-19; approved 2026-11-18). The list and its
reasons: `chromium/tests/windows-fork-exclusions.mjs`.

## Fixed while diagnosing (runs 44369847666 and 44374484719, `windows-x64-7edd9da4f45532ea`)

| Cases | Cause | Fix |
| --- | --- | --- |
| `downloads` 7, 13 | The download step joined its folder with `/` and never created it; Chrome ended the download at 0 B | `path.join` and the folder created |
| `split-view:53`, `newtab-layouts:21` | Chromium's default window on the runner's 1920x1080 display is 929x1004; shipping's steps assume its 1280x800 window | Windows cases start at `--window-size=1280,800` |
| `interface-language:10` | The step faked the OS language with macOS's `-AppleLanguages` | `--lang` on Windows |
| `vertical-tabs:239` | The fork host kept no record of main-menu requests | The host keeps shipping's record |
| `tab-migration:116` | The host gave every native call 10 s; applying 500 tabs takes longer on a slow PC, and the import was reported failed while it went on | `importApply` has no host limit, like `importArcRead` (a product fix) |
| `tabs-and-groups:292` | The runner's `%TEMP%` is `C:\Users\RUNNER~1\...`; Node writes the file URL with `%7E`, Chromium shows `~`, and shipping compares the strings | The suite runs with a temporary folder without a short name |
| `browser-migration:7` (and sometimes 14, 28) | The Favorites tab attaches its import button's handler after two calls to the browser; an early click did nothing | The button stays disabled until then (a declared edit in `tools/favorites-page.mjs`; a product fix) |

## Open

| Case | What happens | Cause | Outcome |
| --- | --- | --- | --- |
| `arc-spaces-import` 14, 31 | The Arc import says "Created 2 spaces" and the Space list shows them, but the saved Spaces file read right after lacks them (on a retry it read back empty) | A Windows-only loss or misdirection of the store write: `importSpaces`'s atomic write reports success. Not yet traced; needs native logging of the store path and its writers | Open, W2 (likely a real bug) |
| `browser-migration` 14, 28, 35 | Intermittently, the import dialog is closed and empty when read after Find | Not found; the early-click race is fixed, so something else closes or resets the dialog on the runner | Open, W2 |
| `F41-named-workspaces:203` | The Spaces menu fades at left 0 px instead of 44 px | Not found; it began failing with the final build (`windows-x64-7edd9da4f45532ea`), which has both the 1280x800 window and the merged Favorites work; the next Mac nightly tells which | Open, W2 |
| `supporter-and-session:18` | "No new tab" when Become a Patron opens its checkout | Not Windows: the Favorites work's V30 step for "exactly one new tab opens on {string}" asserts that no new tab opens, and the Patron scenario uses the same step | Open, for the Favorites work |
| `F41-named-workspaces:236`, `island-and-commands:61` | Failed in the final run | Intermittent: both pass on a rerun (run 44393930687) | Open, runner-variable |
