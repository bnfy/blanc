# Native theme accessibility observations — October 23, 2026

Observed with the macOS accessibility and keyboard automation tools on the signed candidate in `summary.json`. This is a transcription of those tool observations, not a raw VoiceOver transcript. Browser accessibility dumps are separately retained in `runtime/two-themes.json`, `cancel.json` and `restart.json`.

1. Installed Cherry Blossom Tree HD Wallpapers Theme (`lelfanicbadaahlibeimcpfpedfjccnk`) and Shaded Purple (`ilncmopnkmdbmioemmookjmhcelhlklf`) using their official Google Web Store pages and native Add to Blanc confirmation in a disposable profile.
2. The native AX tree exposed a container named Installed themes, a heading, and each labelled theme group with separate Apply and Remove buttons. Active Shaded Purple had a disabled Apply button. Both enabled actions on inactive Cherry Blossom appeared as native buttons, rather than being flattened into a list-box option.
3. With search focused, native Tab reached Apply Cherry Blossom. Native Return applied it; native AX and the DOM showed Remove Cherry Blossom focused after Apply became disabled. Chromium discarded the replaced, unused Shaded Purple theme normally.
4. Native Shift-Tab skipped disabled Apply and returned to the search field. A nonmatching query hid the theme group and exposed zero theme buttons. Clearing the query, Tab and Space opened the native theme removal dialog. Cancel kept the active theme installed.
5. A clean restart retained active Cherry Blossom, its labelled group and enabled Remove/disabled Apply states. Tab and Space reopened the native removal dialog; confirming Remove removed the theme. The empty section hid, and focus returned to search.
6. Ordinary extension search still worked: native typing, Down and Return opened the selected Bitwarden Web Store result. Bitwarden was not installed as part of this fixture.

The checks use real macOS keyboard events and native AX observations. They do not claim human physical-input acceptance, spoken VoiceOver verification, or completion of the entire L5 checklist. No permanent profile or Google upgrade-baseline profile was used.
