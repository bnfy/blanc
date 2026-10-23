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
- Portable macOS XCTest of the actual engine and transport: 23 passed. Only the UI catalog adapter is substituted in this host harness; it does not claim iOS Keychain or WebKit validation.
- Portable UI checks: 14 passed (actual extracted native JavaScript guards in JavaScriptCore and Quick Switcher logic).
- Xcode 27.1 arm64 iOS Simulator app and test target: `build-for-testing` passed.
- Lint, copy catalog, bridge contract and audit inventory checks passed.

## Implementation decisions

- Keychain updates use update-or-add, rather than delete-then-add, so a rejected write does not first destroy the previous account's key.
- Sync state/data writes are atomic and immediate instead of debounced. Credential transitions and local edit clocks must be durable before reporting success.
- A failed retraction leaves sharing/sync enabled with an error rather than claiming the phone was removed remotely. The user can retry when connected.
- Upload budgeting never replaces the full local tab cache. Missing clocks on untouched remote settings do not erase those wire values.
- The Swift models take raw device maps; the engine wraps them in the existing `devices` envelope at storage/network boundaries.

## Pending release gates

- Run the entire native XCTest suite on an installed iOS simulator runtime. The machine initially had Xcode 27.1 and its SDK but no simulator runtime; a runtime download was started during implementation.
- Pair the simulator with an isolated test sync account using all three join paths against a packaged desktop build; check live tabs, theme, Favorites, renaming and retraction.
- Repeat code pairing on a physical iPhone, including device-only Keychain persistence. No iPhone was available to the connected-device tooling.
- Hand-check compact and regular-width page/palette layouts and desktop Settings/Favorites after the shared-page change.

These items are pending, not waived or covered by the host-side tests. Keep the PR unmerged until the required review and affected-device validation are complete.
