# Restored-tab renderer repair — October 22, 2026

Uncommitted initial GET navigation records contained PageState item/document sequence -1. Restoring that state caused Chromium to reject the renderer commit with bad IPC 332. The fix excludes PageState only when serializing pending initial GET entries and repairs legacy HTTP(S) GET records only when both sequence numbers are -1, there are no child frames and no request body. Chromium's IPC validation remains intact. Committed history and POST handling retain their normal paths.

## Verification

- Incremental native build: 31.90 seconds, eight steps; final build guard zero. Eleven counter tests and scoped lint pass. Fresh upstream footprint 62 files/153 hunks under standing owner authorization.
- Original failing profile copy: 11 checks pass over two restarts, including actual document rendering.
- Newly pending GET tabs: 14 checks pass, including two restarts and exact order/selection.
- Committed navigation and held POST controls pass; POST is not replayed.
- Signed side-by-side isolation: all 12 checks pass. Independent restart preserves each app's tabs and selection, restored preview documents render, removing only the preview app copy preserves its data and leaves shipping Blanc intact. Both fixture processes exit cleanly.
- Real keychain, macOS 27.2, Apple Silicon. Shipping updater disabled only in disposable acceptance via unsupported channel; this is not a runtime updater-ownership qualification.
- Initial legacy cached-marker/readiness mismatches and POST target-closed fixture response retained separately, not counted as product failures or passes.

Replacement is Developer ID signed; Apple notarization 39ccbbec-c003-4849-97f6-9e26361a0abe Accepted, stapled, strict signature and Gatekeeper accepted. Final archive SHA256: 6c2bbae590f312d7f112f7c0acd871946812f34b92852582582ece6bc0b7528c. Tested code members are unchanged after stapling.

Google baseline remains one New Tab selected 0; dev remains two New Tabs selected 1. Neither permanent profile was copied or modified. Earlier security checks were not all rerun on this changed framework. Remaining L2 owner hand check and broader artifact acceptance stay open: 1/12 gates, delta 0. Latency deferred; Electron build pending. Restricted signing access retained under owner preference for remaining candidate work.
