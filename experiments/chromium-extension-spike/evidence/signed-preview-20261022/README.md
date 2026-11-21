# Signed preview candidate — October 22, 2026

Completed bounded signing/isolation checkpoint. Source checkpoint 7c5d6bb58845c2fb22c03e61488e3d2a1ab9740a, existing incremental native output. No Chromium or Electron rebuild. The self-contained package includes its own UI/fonts/blocker and distinct preview bundle IDs. Signing scripts are candidate-preparation tooling, not publication approval.

Owner identified the MacBook Pro as the shipping signing host and installed a task-specific restricted SSH key. Its keychain contains Developer ID Application: Anthony Loria (XYGUCY4498), SHA1 55283A84D3706D5A22386D5F002A0CD4845ECFD4. The private key remains there. SSH-session codesign failed errSecInternalComponent; the same prepared signing script succeeds from a desktop Terminal session with strict nested verification. The initial failed log remains evidence.

Chromium app entitlements apply to the real browser executable and outer launcher; renderer/GPU helpers use their respective upstream JIT entitlements. Other executable parts use hardened runtime, kill, restrict and library validation as appropriate; all nested code is signed before sealing the outer app. No Electron entitlements, get-task-allow or blanket disable-library-validation entitlement are introduced.

The MacBook's 1Password desktop integration failed before notarization. Credential transfer to that host was rejected by automatic approval review and did not execute. The signed artifact is brought back for local notarization using the already-authenticated local release environment instead.

The isolated fixture uses an explicit test HOME and mock keychain; it cannot qualify real-keychain namespace behavior or the approved macOS 26 target (both observed hosts are macOS 27.2). Google baseline and dev remain separate. No public release or launch-gate closure is implied.

The first signed launcher inherited minimum macOS 27.0 from the host toolchain. Packaging now explicitly compiles the launcher for macOS 26.0 and sets the bundle minimum to 26.0. The corrected candidate was re-signed; all 17 Mach-O files were inspected and none requires above 26.0. This is static compatibility evidence, not a macOS 26 runtime pass. The initial archive/submission attempt was superseded; only the final accepted artifact will identify the candidate.


## Final artifact and results

Apple accepted submission `bd03e98b-64b0-4573-a106-00ab9122220b`. Staple, ticket validation, strict deep codesign and Gatekeeper assessment all pass. The manually quarantined relocated copy is also assessed as `Notarized Developer ID`. Final archive SHA-256: `1e2204deaad59d050171ea88f18fc0b789ee39e7435b58b414cd7b5e51d62e78` (243328100 bytes). `final-manifest.json` binds its bundled files and source/packaging provenance. This is a review candidate, not public-release approval or a frozen CI-qualified RC.

`report.json` has five passing assertions: separate default profile under disposable HOME; three settled tabs; exact order/selection on clean restart; acknowledged close of an uncommitted loading tab; exact surviving order/selection after immediate post-ack crash. All final exits are clean except the intentional crash.

`signed-veto.json` passes the previously validated native shutdown-veto fixture on the relocated app: real beforeunload prompt, Cancel preserves original tabs and process, subsequent clean shutdown and restart retain the original three URLs including the previously pending GET. The browser-created quit target leaves a transient blank fixture tab after Cancel; it is absent after restart. This result does not assert exact post-Cancel tab count or selection preservation. The final restart selected the guard tab, consistent with its activation for the prompt.

Three new cancellation-fixture attempts are retained separately: premature button lookup; automation shutdown with no answerable dialog; native quit assertion wrongly demanding exactly two tabs despite its own quit target. They are not three product passes. The final run reuses the prior validated fixture and does not hide the extra transient target.

Both suites use mock keychain and diagnostic CDP only in explicit launch arguments. No production provider fault injection was added. Real keychain namespace/access, physical UI input, full feature/privacy acceptance and clean supported macOS 26 execution remain open. Tested host is macOS 27.2. The broader prior recovery evidence is not relabeled as signed-artifact testing.

## Preservation and cleanup

Google baseline retains its single NewTab/selection0; dev retains two NewTabs/selection1. Neither was restarted or copied. Seven task-only app/profile directories were removed after confirming no test app process remained. The final signed app/ZIP are retained locally. The temporary SSH authorized-key entry was removed, a connection using it was rejected (exit255), its local private/public files were deleted, and remote task staging was removed. No signing private key was exported or keychain ACL changed.

No Chromium or Electron rebuild occurred: only the small launcher was rebuilt for macOS26. Latency remains deferred. A process diagnostic inadvertently exposed the notarization app-specific password in private tool output; it is not in archived evidence. The owner was notified to replace it after notarization.

Launch tracker remains 1/12; signed/notarized artifact preparation is now complete, while full L2/L8 acceptance still needs the specified remaining checks.
