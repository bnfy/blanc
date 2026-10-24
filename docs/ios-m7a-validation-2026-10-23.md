# M7a implementation and validation — 2026-10-23

M7a is implemented but unreleased. This does not complete M7: Send to device is M7b, with its own Worker/desktop/iPhone plan. No release or deployment is part of this change.

## Scope

- Join existing Profile Sync by pairing code, recovery code, or name/passphrase; never create a new sync from iPhone.
- Device-only Keychain storage, compatible scrypt/HKDF/AES-GCM, settings and device names, read-only Favorites, Tab Sync and other-device results.
- Shared Settings capability gates for creation/server deletion, and visible read-only Favorites.
- Existing pages refresh when Favorites change. Native bridge replies and events check the live document origin before delivering data.

## Evidence

- Full Node unit suite: 4,266 passed, one skipped, no failures (4,267 tests).
- Real Chromium shared-page suite: seven passed.
- Standalone macOS XCTest of the actual pure Swift protocol files: 34 passed, including desktop-generated vectors and RFC 7914 vectors.
- Follow-up portable macOS XCTest of the actual engine and transport: 30 passed after `2e6217c`, including the new conflict-retry deletion regression for both settings and session stores. Removing the deleted-store guard in a temporary copy made that test fail for both stores. Only the UI catalog adapter is substituted in this host harness; it does not claim iOS Keychain or WebKit validation.
- Portable UI checks: 14 passed (actual extracted native JavaScript guards in JavaScriptCore and Quick Switcher logic).
- Xcode 27.1 arm64 iOS Simulator app and test target: `build-for-testing` passed.
- Lint, copy catalog, bridge contract and audit inventory checks passed. Follow-up vector freshness and iOS bridge tests: six passed.

## Implementation decisions

- Keychain updates use update-or-add, rather than delete-then-add, so a rejected write does not first destroy the previous account's key.
- Sync state/data writes are atomic and immediate instead of debounced. Credential transitions and local edit clocks must be durable before reporting success.
- Retraction is best-effort when turning sync off or switching accounts, so offline service or a missing device-only key cannot trap the phone in its old sync. It never creates a missing tab store.
- Upload budgeting never replaces the full local tab cache. Missing clocks on untouched remote settings do not erase those wire values.
- The Swift models take raw device maps; the engine wraps them in the existing `devices` envelope at storage/network boundaries.

## Packaged pairing follow-up

The packaged pairing operator tested `3529b56` with one temporary local Settings-page gate. The unmodified page stopped initializing because the iOS bridge exposes `settings.blockingStatus` but rejects it as unsupported. This follow-up commits the `supports('blockingStatus')` gate and tests with that rejecting method present, preserving the real bridge shape.

With the temporary gate, the operator reported all three join paths, Keychain add/readback under normal simulator signing, tabs in both directions, read-only Favorites, theme changes both ways, device renaming without rewrite loops, turn-off retraction, and detection of server-side account deletion. Desktop remote tabs were verified through the data consumed by its UI rather than visual drawer inspection. The throwaway account, credential files, isolated profile, simulator and roughly 534 MB of build output were removed; the clipboard was restored.

The same follow-up also preserves recovery-code case in both join/switch fields, uses existing-credential labels on the join path, and refreshes native Settings controls from sync events without reloading the page or overwriting an actively edited device name. Small-screen Sync inputs use at least 16 px text to avoid input zoom. Ten real-page tests cover these states and retain the desktop creation flow.

These successful pairing results are conditional on the temporary gate; they are not an unqualified pass for the unmodified `3529b56` build. Recheck the committed follow-up and still complete physical-iPhone validation before merge.

## Pending release gates

- Native execution is complete for `2e6217c`: the follow-up operator reported the full 202-test suite passing on iPhone 17 Pro / iOS 27.0, including the native catalog and unchanged-blocking/no-reload tests. The ten review regression tests failed against the previous production code as a positive control. This supersedes the earlier local launch blocker; the disposable simulator and 204 MB build output were removed afterward. Subsequent test-only changes still require head-matched CI.
- Recheck the committed Settings follow-up against the packaged desktop and simulator flow. The earlier run covered all three joins and sync behavior with a temporary local gate; it does not by itself verify the new head.
- Repeat code pairing on a physical iPhone, including device-only Keychain persistence. No iPhone was available to the connected-device tooling.
- Hand-check compact and regular-width page/palette layouts and desktop Settings/Favorites after the shared-page change.

These items are pending, not waived or covered by the host-side tests. Keep the PR unmerged until the required review and affected-device validation are complete.
