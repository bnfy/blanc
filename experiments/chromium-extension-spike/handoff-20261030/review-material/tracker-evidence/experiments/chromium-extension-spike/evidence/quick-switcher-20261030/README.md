# Quick Switcher scoped Chromium checks

Reference: shipping Blanc v1.45.1 source `85883b1afa11375e1300130914d6f40c5388af21`. Its F6 contract includes loose in-order matching across tabs, Favorites, history and groups, with groups ranked above tabs. Isolated Chromium 158 regular and confirmed non-default private profiles passed scripted checks that a matching group ranks above a matching tab, an in-order query finds that tab, and clicking the result activates the existing tab. The tested framework was `237242c7e2ddfab4d8fa49528b98a130c1e11dff9f80ffa1db39c0cdc8c06fa1`, with the scoped-tested slash-settings candidate manifest `f482193993d267d949d796a607baf5528cdbfe145e2c43dcf422befff1798d80`. Both owned browser processes exited zero and passed profiles were removed.

The private v1 fixture failed before the host had initialized; v2 dispatched input before the panel-show callback and was overwritten by its prefill. Both failure logs and exited profiles are preserved. Private v3 waits for panel mode before dispatching input. This does not prove physical keyboard/Cmd-L, Favorites/history, visual/accessibility, complete private isolation or Windows/Linux parity. Proxy/resolver fixture controls do not establish host-wide network isolation. No new application build or development-browser promotion occurred.

Raw evidence: `Chromium Preview/evidence/quick-switcher-20261030/result-regular.json` and `result-private-v3.json`.

## Favorites and history results

A separate isolated regular-profile browser test created local synthetic Favorite and history pages, closed their tabs, and queried the actual Quick Switcher. The Favorite ranked above History, the Favorite URL did not also appear as a duplicate history result, and selecting the history row navigated to its saved URL. `Chromium Preview/evidence/quick-switcher-20261030/result-sources-v3.json` records the three rendered rows. The owned browser exited zero and the passed fixture profile was removed. The test uses scripted input, not physical input or accessibility validation; it does not establish account bookmark storage, private-profile behavior or cross-platform parity. Existing tab/group checks were not repeated.
