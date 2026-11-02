# Trusted Types and private diagnostics repair — October 22, 2026

Candidate: `/private/tmp/blanc-preview-security-final/Blanc Chromium Preview.app`, Developer ID signed with team XYGUCY4498, strict deep verification passes. Runtime checks on macOS 27.2, real preview-only keychain, disposable profiles. **Replacement notarization complete:** Apple accepted submission `1cd794f4-ae75-4342-bfa9-f2c7662f4192`; stapling, ticket validation, strict deep signature verification and Gatekeeper all pass. Earlier 1Password authorization timeouts remain recorded. Full security signoff is still open. Final ZIP SHA256 `7725b7886208b1aa047609cf0b48e9bb03604447238edb384208fd459fd51923`; all six tested executable/framework/asset member hashes remain identical after stapling.

## Changes and results

- Restore privileged WebUI Trusted Types enforcement. Three named, closure-private policies accept only exact packaged static SVGs and row skeletons; dynamic shortcut text uses textContent. No permissive/default policy. Four focused tests pass, including all allowlisted values and unknown markup rejection.
- Native diagnostic recording rejects private metadata before serialization/disk writes; expired WebSocket/WebTransport owners default to suppression. Private HTTP fixture emits only one engine metadata record, no fixture URLs or private request records. Regular control retains request records. Private History fixture URL count is zero.
- Final private security schedule: 16 assertions pass. Regular positive-control schedule: 17 assertions pass. Raw HTML assignments and unapproved policy names rejected; icons render; ordinary web bridge, privileged iframe and internal/file fetch restrictions remain effective.
- Six real-keychain recovery assertions pass: fresh isolated profile, three settled tabs, encrypted record, encrypted-only clean restart/order/selection, loading-tab close, immediate post-ack crash recovery.
- One native incremental build: 43.70 seconds / 7 steps. Final zero-action guard. Final icon correction is generated-assets-only, no additional native build.

## Retained failed attempt and limits

Initial runtime script reported its narrow checks successful but console inspection caught `Unapproved static markup` for the download SVG assembled from a packaged constant. That attempt is **not** a UI pass. Final generation resolves the exact constant at build time; final fixtures also reject this console failure. Initial report/log and authorization timeout retained. A transient evidence hashing script used an unavailable Python API; corrected before manifest generation.

These bounded checks address SR1/SR2; they do not finish every privileged method, private-store, platform or denial-of-keychain case. No L7 closure or public release approval. Latency deferred; Electron build pending. Google upgrade baseline remains separate and unchanged. Restricted MacBook signing access is retained through remaining candidate repairs/acceptance at the owner's request to avoid repeated setup, then removed when complete or requested.

Raw logs containing trailing whitespace are stored losslessly as .txt.gz; original bytes are preserved.
