# Installed uBO acceptance — October 3, 2026

These are sanitized observations from real installed v1.27.0 candidates (macOS bundle build 1270), not results from the unpackaged desktop suite. Production fuses and sandbox settings remained intact. Disposable profiles and local fixtures were used; no browsing URLs, personal data, credentials or raw Chromium logs are retained.

- `macos-1270-failed.json`: signed, notarized arm64 DMG installed in an isolated Applications folder. The first Blanc → uBO restart, request/cosmetic blocking, original Dashboard and Logger, private isolation and quiet/wake passed. The later uBO → Blanc restart quit without reopening. Repeated with the same outcome.
- `windows-1270-failed.json`: signed NSIS installed in an isolated folder in the existing Windows 11 ARM64 VM. The x64 app launched under emulation; its first Blanc → uBO restart quit without reopening. Repeated, including a detached launch. This is not native Windows x64 certification.

The new installed suite drives the real shield CTA and requires a different process and a ready provider after each restart. Unit and unpackaged UI tests alone did not detect these failures. The provisional change to prepare relaunch during `will-quit` did not fix the failure and has been removed. The prior irreversible-quit scheduling is restored. Failed records are retained until rebuilt signed candidates pass.

The owner required the existing installed Linux VM and prohibited creating another VM. That VM is Ubuntu 26.04 ARM64; the available candidate is x86-64. Its direct launch returned `Exec format error`. A normal-user namespace probe also failed. This combination cannot certify Linux x86-64 installed acceptance. No VM, kernel policy, sandbox bypass or runtime adaptation was created to turn this into a pass.

Platform acceptance and public enablement remain pending. No release, public updater metadata, CodeQL dismissal or platform flag was changed by these tests.

## Native crash diagnosis and build 1271

- `macos-1271-failed.json`: rebuilt signed, notarized DMG-installed arm64 candidate repeats the second-restart failure despite the provisional relaunch timing change.
- `windows-native-1271-failed.json`: real signed NSIS installation on hosted Windows x64, [validation run 37156979685](https://github.com/bnfy/blanc/actions/runs/37156979685), fails its first provider restart. The ordinary four-platform and package suite [passed at the same head](https://github.com/bnfy/blanc/actions/runs/37157091518); that is distinct from this installed failure.
- `native-crash-summary.json`: official Electron symbols resolve the Mac trap to native child-view removal, entered from a WebContents focus-loss callback. The signed and diagnostic crashes have matching native offsets. No raw crash identifiers or personal paths are committed.
- `macos-blur-fix-diagnostic.json`: deferring production overlay blur dismissal until the native callback returns, and rejecting callbacks after window shutdown or a newer surface generation, passes the provider round trip and native close/reopen/Quit in an instrumented, ad-hoc signed disposable copy. This is causal diagnostic evidence, not signed acceptance.

The usual unpackaged UI harness intentionally skips production overlay blur dismissal, so it could not detect this path. The new production-handler unit regression and installed suite cover it. Rebuilt signed build 1272 and Windows candidate acceptance are still pending; no platform is cleared by the diagnostic result.

Local verification of the merged source and fix passed: full lint, 2,213 unit tests, substrate/compliance checks, the real-blocking uBO desktop suite, and the shield provider desktop suite. The new blur regression fails against the previous synchronous handler. These are local checks; signed installed acceptance is still a separate gate.
