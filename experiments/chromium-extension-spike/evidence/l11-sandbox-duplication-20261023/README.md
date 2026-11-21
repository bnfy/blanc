# L11 sandboxed-tab duplication: supported clone rejected

Current source head `1f99393dc42fea222e84820eced0bde578dc714d`; official precompiled Electron 44.9.1. This is a failed repair investigation, **not a sandbox pass or L11 acceptance**.

The unchanged real desktop regression uses a native middle-click from a CSP-sandboxed source. Its original child refuses localStorage. The browser Duplicate action must preserve that restriction. Existing URL/history recreation loses it because the inherited document policy is not exported in the recorded web preferences.

The supported native `webContents.clone()` API was evaluated as a possible replacement. A temporary three-line change cloned the live contents, adopted it through WebContentsView and reloaded its native history. The unchanged full regression again failed at line168: duplicate storage was `allowed`, expected `SecurityError`. Group reopen is after this assertion and was not reached. The trial was reverted byte-for-byte; no product code from the unsuccessful repair remains.

Official Electron44.9.1 native source sets `starting_sandbox_flags` when opening a deferred link child, but its clone delegates to Chromium's clone. The inspected Chromium implementation creates fresh params and consults the native opener, without copying the original frame policy. The deferred link child has no native opener relationship from which to recover the flags. The source excerpt is supporting diagnosis; the runtime regression is the behavioral evidence. The archived Chromium excerpt is fetched from official tag152.0.7977.167, matching Electron44.9.1’s embedded Chromium version.

- [Unchanged regression failure](native-clone-regression.log.gz)
- [Native clone plus history-navigation failure](native-clone-history-regression.log.gz)
- [Outcome and owner decision](status.json)
- [Electron44.9.1 implementation](https://github.com/electron/electron/blob/v44.9.1/shell/browser/api/electron_api_web_contents.cc)
- [Supported clone API](https://www.electronjs.org/docs/latest/api/web-contents#contentsclone)
- [Previous metadata/history diagnosis](../l11-repair-20261023/remaining-sandbox-failure.json)

No guessed sandbox masks, restrictive-policy relaxation, test suppression or renderer-provided policy inference is accepted. A second trial used native clone plus navigationHistory.goToIndex(activeIndex), rather than reload; it failed the same unchanged assertion and was also reverted. The owner explicitly chose “Keep Electron builds pending; record L11 blocked.” No runtime repair/build is authorized. L11 remains open,9/12 gates,delta0. Prior artifact acceptance remains byte-specific. Google baseline/permanent profiles unchanged; latency deferred.
