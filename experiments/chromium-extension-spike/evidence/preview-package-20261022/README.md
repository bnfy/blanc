# Self-contained local preview package and isolation — October22

Source parent ffb67fdd plus preview/package.py and launcher.c in this commit. Existing native Chromium157 output reused; only the small launcher compiled. No Chromium/Electron rebuild, no GN change, no latency measurement. Upstream footprint unchanged58/137.

## Package

Local ZIP: /private/tmp/blanc-package-20261022-canonical/Blanc-Chromium-Preview-local.zip. Digest/size in removal.json. This is an ad-hoc local test artifact, NOT a signed/notarized release. No valid Developer ID identity was visible in the local security query; signing acceptance remains open.

Bundled UI/styles/fonts from generated plus digest-checked pinned blocker engine and licenses. Native bridge and engine unchanged. Bundle-relative canonical paths; default profile HOME/Library/Application Support/Blanc Chromium Preview. All prototype framework/helper bundle-ID prefixes replaced with me.bnfy.blanc.chromium.preview. Duplicate helper roles retain Chromium's existing suffix grouping; no helper identifier overlaps prototype or shipping Blanc. Outer name/ID/entrypoint changed. URL/document registration removed. No shipping updater settings modified; no updater keys found in outer plist. Keychain service naming is compiled native behavior and not yet qualified by these plist changes.

## Tests and limitations

- Initial launcher compile failed signed/unsigned warnings; corrected with warnings-as-errors retained.
- Initial relative resource paths containing /../ produced two fresh/restart crashes in native FindEvent/CanExecuteJavaScript. Control without blocker started. Canonical-path package with blocker starts, relocates and restarts; causality is not proven and the earlier crash remains a risk requiring follow-up rather than erased evidence.
- Final package fresh-profile startup, relocated restart, and separate HOME default-profile startup succeeded. Native start-page AX contains Customize/Billboard; host bridge returns one tab. Same URL survives restart (native IDs change).
- Browser resource fetch probes refused fetch, including after correcting the fixture font filename. They are not counted as resource-load passes. Bundled bytes are in the manifest; rendered page/bridge evidence is separate.
- Removed only the disposable installed app after clean shutdown and ZIP retention. Both disposable profiles remain. Original dev two New Tabs/selected second and Google baseline one New Tab/selected first remained unchanged after removal. Baseline was not restarted or mutated.
- Launcher test compiles actual source and verifies canonical bundle paths, default profile, foreign asset-override rejection and invalid HOME refusal. Python syntax/diff checks pass; py_compile initially tried an inaccessible host cache, so AST parse used instead.

This is bounded local profile/app coexistence, relocation/restart/removal evidence, not full L2 acceptance. Existing dev/shipping app profiles were not restarted. Mock keychain was used only for disposable tests; real keychain/service isolation, Developer ID/notarization, quarantined install and shipping-update ownership remain open. L1 remains accepted;1/12(8.3%), delta0. Latency deferred; Electron diagnostic build pending.
