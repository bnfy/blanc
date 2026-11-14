# Signed preview real-keychain preflight — October 22, 2026

Result: **isolation blocker found; real-keychain recovery not executed**.

The signed candidate framework contains the null-terminated `Chromium Safe Storage` literal and not `Blanc Chromium Preview Safe Storage`. Source inspection confirms the unbranded service/account defaults are `Chromium Safe Storage` / `Chromium`. The async provider uses `KeychainPassword` with the real KeychainV2 unless mock-keychain is requested. KeychainPassword looks up this service/account and creates a random password when absent. Separate bundle IDs and profile paths do not change these defaults. This proves a namespace-isolation defect, not that another app's credential has actually been accessed or damaged.

No credential lookup, keychain mutation, real-keychain launch, build, signing or notarization was performed. The signed candidate was left intact. Existing mock-keychain recovery results remain bounded evidence and are not relabeled as production-keychain acceptance. The Google baseline and dev CDP snapshots match the previous one-tab/selected0 and two-tab/selected1 state. Initial snapshot was sandbox-denied; read-only retry succeeded. Initial framework probe assumed Versions/A; the actual versioned framework was then located and inspected.

## Required repair and finite acceptance

1. Assign a stable preview-only service/account namespace before any encryption provider starts. Preserve generic Chromium and shipping Blanc credentials; do not migrate permanent profiles. Cover both creation and reads, not just displayed branding.
2. Incrementally rebuild and produce a newly signed/notarized artifact. The existing signature cannot qualify modified native code. Temporary SSH signing access from the previous task was revoked as requested.
3. Using only a disposable preview profile, verify real-keychain initialization and clean/crash restart of encrypted session data. Verify cancellation/denied or unavailable provider behavior preserves saved records and recovery resumes without empty-session overwrite. Do not lock the owner's shared login keychain or delete shared credentials to inject faults.
4. Inspect only preview-item metadata where needed; never publish password values. Confirm Google/dev/shipping data remains separate. Retain artifact-bound evidence and clean only task-owned fixtures.

L2 remains open. Progress: 1/12 (8.3%), delta 0 gates. macOS26 acceptance is still pending; this host is macOS27.2. Latency deferred and Electron diagnostic build pending approval.
