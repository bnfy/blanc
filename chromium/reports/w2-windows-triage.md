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

## Excluded by an owner decision (23)

The owner's product decisions (1Password fill, Reading Mode, Dark Reader, the
updater, V12, V18), the Electron listener counts, a private-window passkey
(Windows Hello, a hand check), Linux's own Arc import, and the Island's
floating window buttons (W1: Windows' own caption buttons). The list and its
reasons: `chromium/tests/windows-fork-exclusions.mjs`.

## Open

| Case | What happens | Cause | Outcome |
| --- | --- | --- | --- |
| `settings-and-theming:12`, `supporter-and-session:7`, `:12` | Settings has no app icon control on Windows | Shipping Blanc for Windows has no icon catalog (owner, 2026-10-19), so the fork shows none | Exclusion proposed; needs the owner's approval |
| `browser-migration` 7, 14, 28, 35 | After Find, the Favorites import offers nothing and its status stays empty | Not found: an empty status with Find still showing means the page reset or the lookup never ran, not "nothing found" | Open, W2 |
| `arc-spaces-import` 14, 31 | The Arc import creates no Spaces | Not found (the file is now read: the earlier five cases pass) | Open, W2 |
| `downloads` 7, 13 | A download ends "Interrupted · 0 B" | Not found | Open, W2 |
| `split-view:53` | Closing the focused pane's tab leaves the other at half width (929 of the window) | Not found; may be a Windows-only layout bug in the fork | Open, W2 |
| `tabs-and-groups:292` | A local-file home page never loads | Not found; Windows `file:` paths in the local-file gate are the suspect | Open, W2 |
| `newtab-layouts:21` | Mahjong's control rail ends outside the board frame | Not found | Open, W2 |
| `interface-language:10` | "System" resolves to English, not the faked OS language | The step fakes the OS language for the app; on Windows Chromium takes it from Windows itself (to be confirmed) | Open, W2 |
| `tab-migration:116` | The 500-candidate import exceeds the harness's CDP timeout | The runner is slower than the Mac Studio (to be confirmed by timing) | Open, W2 |
| `vertical-tabs:239` | Undefined: "the fork host keeps no record of main-menu requests" | The fork adapter needs a native record of the main-menu request (C2) | Open, W2 |
| `glance:337`, `vertical-tabs:146` | Fail on some runs | Runner-variable since W1 Part A (see `reports/w1-windows.json`) | Open |
