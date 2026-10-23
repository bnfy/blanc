# iOS M7a: Profile Sync Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The iPhone joins an existing desktop Profile Sync, follows the synced settings, shows synced Favorites read-only, reads every device's open tabs and (opt-in) publishes its own.

**Architecture:** A byte-compatible Swift client of the existing v1 sync protocol. Pure value types (crypto, pairing, merges) are `nonisolated` and tested against known-answer vectors generated from desktop's own modules. A `@MainActor @Observable SyncEngine` owned by `TabsManager` runs passes through a fake-able transport and Keychain, and the existing `PagesBridge` serves the desktop Settings → Sync page and the start page from it.

**Tech Stack:** Swift 5 (default `MainActor` isolation), SwiftUI, CryptoKit (HKDF, AES-GCM), CommonCrypto (PBKDF2), Security (Keychain), URLSession, XCTest; Node 22 for the vector generator.

**Spec:** `docs/superpowers/specs/2026-10-23-ios-m7-profile-sync-design.md` (M7a = spec §2 items 1–5; Send to device, §7, is M7b with its own plan).

## Global Constraints

- Base: the M6.5 branch `claude/ios-port-revisit` (#1030). Deployment target iOS 18.4; `objectVersion = 77` stays; no SPM packages.
- New Swift files go in `ios/Blanc/Blanc/Sync/` and `ios/Blanc/BlancTests/Sync/`; both trees are file-system synchronized groups, so no `project.pbxproj` edit is needed.
- No desktop, Worker or `src/` change in M7a. Endpoint `https://blanc-sync.bnfy-441.workers.dev`.
- Every byte rule in spec §3 is copied exactly: scrypt N=32768 r=8 p=1 dkLen=64; HKDF-SHA256 info `blanc-sync-id/v1`, `blanc-sync-enc/v1`, `blanc-pair-id/v1`, `blanc-pair-key/v1`; salts `blanc-sync:v1:<lowercased trimmed handle>` and `blanc-pair:v1`; envelope `{"v":1,"iv","ct","tag"}` standard padded base64, no AAD; recovery prefix `blanc-sync:1:`; code alphabet `ABCDEFGHJKMNPQRSTVWXYZ23456789`.
- String tie-breaks compare UTF-16 code units (`Array(s.utf16)` lexicographic), never Swift `String <`.
- The content key lives only in the Keychain (service `me.bnfy.blanc.sync`, account `content-key`, `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`, not synchronizable). Never log it, the passphrase or the code.
- User-visible strings come from the shared catalog (`blancI18n` on pages; desktop's existing `sync.*` keys). New copy, if any, lands in `copy/messages/*.json` for all six languages with `copy:ack`.
- iOS test command (run in the background; the first build takes 2–3 min):
  `cd ios/Blanc && xcodebuild test -project Blanc.xcodeproj -scheme Blanc -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -only-testing:BlancTests/<Class> CODE_SIGNING_ALLOWED=NO`
  Expected on pass: `** TEST SUCCEEDED **`.

## Review Focus

- **Non-ASCII handles and passphrases** (`İstanbul`, `Zoë`, an emoji passphrase): the phone must derive the same `accountId` as desktop, or it silently joins a different, empty sync. Pinned by vectors in Task 1 and `testDeriveKeysMatchesDesktopVectors` in Task 2.
- **Settings the phone doesn't understand** (`searchEngine: "custom"` with a template, `newtabClockFont`, a key added by a newer desktop): they must come back from the phone byte-identical, clocks included. Pinned in Task 5 (`testUnknownKeysRoundTripUnchanged`).
- **Equal clocks with non-BMP tie-breakers or values**: the winner must match desktop's, or two devices flip a setting forever. Pinned in Task 4 and Task 5's vector cases.
- **A pass interrupted by 429, 503 or no network**: nothing half-written, `lastError` set, the next foreground retries. Pinned in Task 9 (`testRateLimitedPassWritesNothing`).
- **Turning sync off while a tab publish is pending or a code is showing**: the retraction goes out, the pair entry is deleted, and no later PUT recreates data. Pinned in Task 9 (`testDisableCancelsPendingPublishAndPair`).

---

### Task 1: Known-answer vectors from desktop

**Files:**
- Create: `scripts/build-ios-sync-vectors.cjs`
- Create: `ios/Blanc/BlancTests/Sync/Fixtures/sync-vectors.json` (generated, committed)
- Create: `test/unit/ios-sync-vectors.test.js`
- Modify: `package.json` (scripts `ios:sync-vectors:build` = `node scripts/build-ios-sync-vectors.cjs --write`, `ios:sync-vectors:check` = `node scripts/build-ios-sync-vectors.cjs --check`)

**Interfaces:**
- Produces: `sync-vectors.json` with top-level arrays `deriveKeys`, `pairing`, `envelopes`, `recovery`, `settingsMerge`, `deviceNamesMerge`, `sessionMerge`, `favoritesMerge`, `canonical`. Each entry is `{name, input, expected}`; binary values are lowercase hex.

- [ ] **Step 1: Write the generator.** It requires desktop's modules directly: `src/main/sync-crypto.js` (`deriveKeys`, `decrypt`), `src/main/sync-pairing.js` (`normalizeCode`, `pairingMaterial`, `wrapSecret`, `unwrapSecret`, `encodeRecoveryCode`, `decodeRecoveryCode`), `src/main/tabsync-model.js` (`canonical`, `mergeDevices`, `buildOwnEntry`), `src/main/device-names.js`, `src/main/bookmarks.js` merge, and `src/main/settings.js` (`exportForSync`, `mergeFromSync`) with `electron` stubbed in `require.cache` and a temp `userData`, exactly as `test/unit/settings-device-names.test.js` does. Envelopes are sealed with Node `crypto` AES-256-GCM using fixed 12-byte IVs and then checked with desktop's `decrypt`. Inputs to include, at minimum:
  - `deriveKeys`: `("Anthony", "correct horse battery staple")`, `("  Zoë ", "Pässwörd-1234")`, `("İstanbul", "🦊🦊🦊🦊🦊 long enough")`, `("ab", "x")`.
  - `pairing`: codes `k7mr-4px2`, `K7MR 4PX2`, `ABCDEFGH` (normalize → material), and one wrap/unwrap with a fixed IV.
  - `settingsMerge`: remote-newer, local-newer, equal clock with tie-breakers `"a"`/`"b"`, equal clock and tie with values `"😀"` vs `"￿"` (UTF-16 order differs from scalar order), invalid remote clock `0`, an unknown key, `deviceNames` entry merge.
  - `sessionMerge`: own-wins tie, retraction-wins tie, 30-day prune; `buildOwnEntry` with 600 tabs (trim to budget) and a `ftp:` URL (dropped).
  - `favoritesMerge`: newer remote item, tombstone removing an older item, tombstone not removing a newer item.
- [ ] **Step 2: Run** `npm run ios:sync-vectors:build`. Expected: writes the fixture; a second run with `--check` exits 0.
- [ ] **Step 3: Write `test/unit/ios-sync-vectors.test.js`:** `test('ios sync vectors match desktop modules', ...)` spawns the script with `--check` and asserts exit code 0 and empty stderr.
- [ ] **Step 4: Run** `node --test test/unit/ios-sync-vectors.test.js`. Expected: 1 pass.
- [ ] **Step 5: Commit** `scripts/build-ios-sync-vectors.cjs`, the fixture, the test, `package.json`: `ios(m7a): generate sync known-answer vectors from desktop`.

### Task 2: scrypt, key derivation and the envelope

**Files:**
- Create: `ios/Blanc/Blanc/Sync/Scrypt.swift`, `ios/Blanc/Blanc/Sync/SyncCrypto.swift`
- Create: `ios/Blanc/BlancTests/Sync/SyncVectors.swift` (fixture loader shared by later tasks), `ios/Blanc/BlancTests/Sync/SyncCryptoTests.swift`

**Interfaces:**
- Produces:
  - `nonisolated enum Scrypt { static func derive(password: [UInt8], salt: [UInt8], n: Int, r: Int, p: Int, length: Int) throws -> [UInt8] }`
  - `nonisolated struct SyncKeys: Sendable { let accountId: String; let contentKey: SymmetricKey }`
  - `nonisolated struct SyncEnvelope: Codable, Equatable, Sendable { let v: Int; let iv: String; let ct: String; let tag: String }`
  - `nonisolated enum SyncCrypto { static func deriveKeys(handle: String, passphrase: String) throws -> SyncKeys; static func seal(_ plaintext: Data, key: SymmetricKey, nonce: AES.GCM.Nonce = AES.GCM.Nonce()) throws -> SyncEnvelope; static func open(_ envelope: SyncEnvelope, key: SymmetricKey) throws -> Data; static func hkdf(_ root: [UInt8], salt: [UInt8], info: String) -> [UInt8]; static func passphraseStrong(_ passphrase: String) -> Bool; static func validHandle(_ handle: String) -> Bool }`
  - Test helper: `enum SyncVectors { static func load() throws -> JSONValue }` (reads the bundled fixture via `Bundle(for:)`).

- [ ] **Step 1: Write the failing tests:** `testScryptRFC7914Vectors` (RFC 7914 §12: `("", "", N=16, r=1, p=1, 64)` and `("password", "NaCl", N=1024, r=8, p=16, 64)`, hex as published); `testDeriveKeysMatchesDesktopVectors` (every `deriveKeys` vector: `accountId` and hex of `contentKey`); `testOpenDesktopEnvelope` and `testSealWithFixedNonceMatchesVector`; `testOpenWithWrongKeyThrows`; `testPassphraseStrength` (`"aaaaaaaaaaaaaaaa"` true, `"Abcdefghij"` true, `"abcdefghij"` false, `"Ab1"` false); `testHandleRules` (`" a "` false, `"ab"` true).
- [ ] **Step 2: Run** `-only-testing:BlancTests/SyncCryptoTests`. Expected: build fails (types missing).
- [ ] **Step 3: Implement.** scrypt per RFC 7914: PBKDF2-HMAC-SHA256 via `CCKeyDerivationPBKDF` (1 iteration) around ROMix with Salsa20/8 BlockMix, little-endian words, `UInt32` wrapping arithmetic. `deriveKeys` trims the handle, lowercases it with `lowercased()` (the Unicode default mapping, as JavaScript's `toLowerCase`; the `İstanbul` vector proves they agree), builds the salt, and uses the passphrase's raw UTF-8 bytes. HKDF via CryptoKit `HKDF<SHA256>.deriveKey(inputKeyMaterial:salt:info:outputByteCount:)`. `seal`/`open` use `AES.GCM` with `ct` and `tag` as separate base64 fields.
- [ ] **Step 4: Run** the same command. Expected: `** TEST SUCCEEDED **`. Note the scrypt time of the real-parameter vector in the commit message; it must be under 2 s on the simulator in Release-like optimization (`-O` via `SWIFT_OPTIMIZATION_LEVEL` for the `Scrypt.swift` hot loop is acceptable if Debug is slower).
- [ ] **Step 5: Commit:** `ios(m7a): scrypt, sync key derivation and envelope`.

### Task 3: Pairing codes and recovery codes

**Files:**
- Create: `ios/Blanc/Blanc/Sync/SyncPairing.swift`, `ios/Blanc/BlancTests/Sync/SyncPairingTests.swift`

**Interfaces:**
- Consumes: `Scrypt`, `SyncCrypto`, `SyncEnvelope`.
- Produces: `nonisolated struct PairPayload: Codable, Equatable, Sendable { let v: Int; let handle: String; let accountId: String; let key: String }` and `nonisolated enum SyncPairing { static let alphabet: String; static func generateCode() -> String; static func normalize(_ input: String) -> String?; static func format(_ code: String) -> String; static func material(code: String) throws -> (pairId: String, wrapKey: SymmetricKey); static func wrap(_ payload: PairPayload, wrapKey: SymmetricKey, nonce: AES.GCM.Nonce = AES.GCM.Nonce()) throws -> SyncEnvelope; static func unwrap(_ envelope: SyncEnvelope, wrapKey: SymmetricKey) throws -> PairPayload; static func isRecoveryCode(_ s: String) -> Bool; static func encodeRecovery(_ payload: PairPayload) throws -> String; static func decodeRecovery(_ s: String) throws -> PairPayload }`

- [ ] **Step 1: Failing tests:** `testNormalize` (`"k7mr-4px2"` → `"K7MR4PX2"`, `"K7MR 4PX2"` → same, `"K7MR4PX"` → nil, `"K7MR4PX0"` → nil since `0` is not in the alphabet); `testMaterialMatchesVectors`; `testUnwrapDesktopBlob`; `testRecoveryRoundTripMatchesVector` (exact string equality with the vector); `testUnwrapRejectsExtraOrMissingFields` (a payload without `accountId`, and one with a 63-character `accountId`, both throw); `testGenerateCodeUsesAlphabet` (1000 codes, every character in the alphabet, length 8).
- [ ] **Step 2: Run** `-only-testing:BlancTests/SyncPairingTests`. Expected: build fails.
- [ ] **Step 3: Implement.** `generateCode` uses `SecRandomCopyBytes` with rejection sampling (no modulo bias). `decodeRecovery` trims, requires the `blanc-sync:1:` prefix, decodes unpadded base64url, and validates as `unwrap` does (`v == 1`, handle ≥2 characters, `accountId` 64 lowercase hex, `key` base64 of 32 bytes).
- [ ] **Step 4: Run.** Expected: `** TEST SUCCEEDED **`.
- [ ] **Step 5: Commit:** `ios(m7a): pairing and recovery codes`.

### Task 4: JSON as JavaScript sees it

**Files:**
- Modify: `ios/Blanc/Blanc/PagesBridge.swift` (move `JSONValue` out)
- Create: `ios/Blanc/Blanc/Sync/JSONValue.swift`, `ios/Blanc/BlancTests/Sync/JSONValueTests.swift`

**Interfaces:**
- Produces, on the existing `JSONValue`: `init(data: Data) throws` (preserving object key order), `func jsStringify() -> String` (`JSON.stringify` output: insertion order, integers without `.0`, JS string escaping), `func canonical() -> String` (sorted keys, otherwise as `jsStringify`, matching `tabsync-model.js` `canonical`), subscript `value["key"]`, and the free function `nonisolated func utf16Less(_ a: String, _ b: String) -> Bool`.

- [ ] **Step 1: Failing tests:** `testCanonicalMatchesVectors` (every `canonical` vector); `testJsStringifyKeepsInsertionOrder` (`{"b":1,"a":2}` round-trips as written); `testNumbersFormatLikeJavaScript` (`1`, `1.5`, `1e21`, `-0` → `"0"`); `testStringEscaping` (`"\u{2028}"`, `"\""`, `"\u{7f}"`); `testUTF16Less` (`utf16Less("😀", "\u{ffff}")` is true, though `"😀" < "\u{ffff}"` in Swift is false).
- [ ] **Step 2: Run** `-only-testing:BlancTests/JSONValueTests`. Expected: build fails.
- [ ] **Step 3: Implement.** Parse with `JSONSerialization` is not order-preserving, so write a small recursive-descent parser over UTF-8 bytes in `JSONValue.swift`. Keep `PagesBridge`'s existing uses compiling; `PagesBridgeTests` must still pass.
- [ ] **Step 4: Run** `-only-testing:BlancTests/JSONValueTests -only-testing:BlancTests/PagesBridgeTests` and `node --test test/unit/ios-pages-bridge.test.js`. Expected: all pass.
- [ ] **Step 5: Commit:** `ios(m7a): order-preserving JSON and JS-compatible comparisons`.

### Task 5: Synced settings and device names

**Files:**
- Create: `ios/Blanc/Blanc/Sync/SyncedSettings.swift`, `ios/Blanc/BlancTests/Sync/SyncedSettingsTests.swift`

**Interfaces:**
- Consumes: `JSONValue`, `utf16Less`.
- Produces: `nonisolated struct SyncedSettings: Equatable, Sendable { var values: JSONValue /* object, key order kept */; var meta: [String: Int64]; var tieBreakers: [String: String]; init(payload: JSONValue); func payload() -> JSONValue; mutating func merge(remote: SyncedSettings); mutating func stampLocal(key: String, value: JSONValue, now: Int64, tie: String); func equalsForSync(_ other: SyncedSettings) -> Bool }` and `static let maxClock: Int64 = 32503680000000` (`Date.UTC(3000,0,1)`). `deviceNames` is merged inside `merge` by its entry rule; `setDeviceName(id: String, name: String, now: Int64, tie: String)` stamps one entry.

- [ ] **Step 1: Failing tests:** `testMergeMatchesDesktopVectors` (every `settingsMerge` and `deviceNamesMerge` vector: merged `payload().jsStringify()` equals desktop's export string); `testUnknownKeysRoundTripUnchanged` (a payload with `searchEngine: "custom"`, `searchEngineTemplate`, `newtabClockFont` and an unknown `futureKey` survives `init` → `payload()` byte-identical); `testStampLocalAdvancesPastPrevious` (previous clock 5000, now 4000 → 5001); `testInvalidRemoteClockIgnored` (0, negative, ≥ `maxClock`).
- [ ] **Step 2: Run** `-only-testing:BlancTests/SyncedSettingsTests`. Expected: build fails.
- [ ] **Step 3: Implement** per spec §3.5. The phone validates only the three keys it applies (`theme`, `searchEngine`, `adblockEnabled`) and only when applying them to `SettingsStore`; merging never drops or rewrites a value.
- [ ] **Step 4: Run.** Expected: `** TEST SUCCEEDED **`.
- [ ] **Step 5: Commit:** `ios(m7a): synced settings merge compatible with desktop`.

### Task 6: Tab snapshots, icons and Favorites (read models)

**Files:**
- Create: `ios/Blanc/Blanc/Sync/TabSnapshots.swift`, `ios/Blanc/Blanc/Sync/SyncedFavorites.swift`
- Create: `ios/Blanc/BlancTests/Sync/TabSnapshotsTests.swift`, `ios/Blanc/BlancTests/Sync/SyncedFavoritesTests.swift`

**Interfaces:**
- Produces:
  - `nonisolated struct RemoteTab: Equatable, Sendable { let url: String; let title: String; let groupId: String?; let pinned: Bool }`
  - `nonisolated struct RemoteDevice: Equatable, Sendable, Identifiable { let id: String; let name: String; let platform: String; let updatedAt: Int64; let tabs: [RemoteTab] }`
  - `nonisolated enum TabSnapshots { static let pruneMs: Int64 = 2_592_000_000; static let heartbeatMs: Int64 = 86_400_000; static let budgetBytes = 327_680; static func merge(local: JSONValue, remote: JSONValue, ownId: String, now: Int64) -> JSONValue; static func ownEntry(tabs: [(url: String, title: String)], previous: JSONValue?, now: Int64) -> JSONValue; static func retraction(now: Int64) -> JSONValue; static func trimmedForUpload(_ devices: JSONValue, ownId: String) -> JSONValue; static func devices(_ devices: JSONValue, excluding ownId: String, names: [String: String]) -> [RemoteDevice] }`
  - `nonisolated enum SyncedIcons { static func merge(local: JSONValue, remote: JSONValue, now: Int64) -> JSONValue; static func icon(for url: String, in icons: JSONValue) -> String? }` (returns a validated `data:image/png;base64,` string)
  - `nonisolated struct Favorite: Equatable, Sendable { let id: String; let url: String; let title: String; let favicon: String?; let folder: String? }` and `nonisolated enum SyncedFavorites { static func merge(local: JSONValue, remote: JSONValue) -> JSONValue; static func list(_ store: JSONValue) -> [Favorite] }`

- [ ] **Step 1: Failing tests:** `testSessionMergeMatchesVectors`; `testOwnEntryMatchesDesktopBuild` (600 tabs and an `ftp:` URL vector: same canonical output); `testOwnEntryKeepsClockWithoutChange` (same tabs, 1 h later → same `updatedAt`; 25 h later → new); `testTrimmedForUploadFitsBudget` (≤ `budgetBytes` as UTF-8 canonical, own tabs trimmed first); `testDevicesUsesSyncedNamesAndSkipsRetracted`; `testIconRejectsInvalidPNG` (wrong prefix, 48 px, over 8192 characters); `testFavoritesMergeMatchesVectors`.
- [ ] **Step 2: Run** `-only-testing:BlancTests/TabSnapshotsTests -only-testing:BlancTests/SyncedFavoritesTests`. Expected: build fails.
- [ ] **Step 3: Implement** per spec §3.5–3.6 (`name: "iPhone"`, `platform: "ios"`, `groupId: null`, `pinned: false`, `groups: []`).
- [ ] **Step 4: Run.** Expected: `** TEST SUCCEEDED **`.
- [ ] **Step 5: Commit:** `ios(m7a): tab snapshot, icon and Favorites read models`.

### Task 7: Worker client

**Files:**
- Create: `ios/Blanc/Blanc/Sync/SyncWorkerClient.swift`, `ios/Blanc/BlancTests/Sync/SyncWorkerClientTests.swift`

**Interfaces:**
- Produces:
  - `nonisolated protocol SyncTransport: Sendable { func send(method: String, path: String, body: Data?) async throws -> (status: Int, body: Data) }` and `nonisolated struct URLSessionSyncTransport: SyncTransport` (base URL constant, `Content-Type: application/json`, 20 s timeout, ephemeral configuration, no cookies).
  - `enum SyncStore: String { case bookmarks, settings, session, icons }`
  - `nonisolated enum SyncError: Error, Equatable { case notFound, conflict(version: String?), rateLimited, busy, tooLarge, badPassphrase, pairNotFound, pairUnavailable, offline, server(Int) }`
  - `nonisolated struct SyncWorkerClient: Sendable { init(transport: SyncTransport); func get(_ accountId: String, _ store: SyncStore) async throws -> (version: String, blob: SyncEnvelope)?; func put(_ accountId: String, _ store: SyncStore, ifVersion: String?, blob: SyncEnvelope) async throws -> String; func deleteAccount(_ accountId: String) async throws; func postPair(_ pairId: String, blob: SyncEnvelope) async throws; func takePair(_ pairId: String) async throws -> SyncEnvelope; func deletePair(_ pairId: String) async throws }` (`get` returns nil on 404).

- [ ] **Step 1: Failing tests** with a `FakeTransport` recording requests: `testGetParsesVersionAndBlob`; `testGetNotFoundReturnsNil`; `testPutSendsIfVersionNullOnCreate` (body `{"ifVersion":null,"blob":{…}}`); `testStatusMapping` (409 → `.conflict("v2")`, 429 → `.rateLimited`, 503 → `.busy`, 413 → `.tooLarge`, `URLError.notConnectedToInternet` → `.offline`); `testTakePairDistinguishesJSONAndPlain404` (`{"error":"not-found"}` → `.pairNotFound`; `not found` → `.pairUnavailable`); `testPostPairConflict` (409 → `.conflict(nil)`).
- [ ] **Step 2: Run** `-only-testing:BlancTests/SyncWorkerClientTests`. Expected: build fails.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: `** TEST SUCCEEDED **`.
- [ ] **Step 5: Commit:** `ios(m7a): sync Worker client`.

### Task 8: Keychain and local sync state

**Files:**
- Create: `ios/Blanc/Blanc/Sync/SyncSecrets.swift`, `ios/Blanc/Blanc/Sync/SyncStateStore.swift`
- Create: `ios/Blanc/BlancTests/Sync/SyncStateStoreTests.swift`

**Interfaces:**
- Produces:
  - `protocol SyncSecretStore { func readKey() throws -> SymmetricKey?; func writeKey(_ key: SymmetricKey) throws; func deleteKey() throws }`, `struct KeychainSyncSecretStore: SyncSecretStore` (attributes from Global Constraints; `writeKey` deletes then adds), and `final class InMemorySyncSecretStore: SyncSecretStore` for tests.
  - `struct SyncState: Codable, Equatable { var enabled: Bool; var handle: String?; var accountId: String?; var deviceId: String; var syncTabs: Bool; var lastSyncedAt: Int64?; var lastError: String? }`
  - `@Observable final class SyncStateStore { init(directory: URL); private(set) var state: SyncState; func update(_ change: (inout SyncState) -> Void); func load(_ store: SyncStore) -> JSONValue?; func save(_ store: SyncStore, _ value: JSONValue); func clearData() }` writing `sync.json` and `sync-settings.json`, `sync-favorites.json`, `sync-session.json`, `sync-icons.json` (atomic, debounced 250 ms, flushed on `didEnterBackgroundNotification`, as `SettingsStore` does).

- [ ] **Step 1: Failing tests** (temp directory): `testDeviceIdMintedOnceAndKept` (lowercase UUID; survives `clearData()` and reload); `testRoundTrip`; `testCorruptFileFallsBackToDefaults`; `testClearDataRemovesStoreFilesOnly` (`sync.json` stays); `testKeyNeverWrittenToDisk` (after a full round trip, no file in the directory contains the key's base64 or hex).
- [ ] **Step 2: Run** `-only-testing:BlancTests/SyncStateStoreTests`. Expected: build fails.
- [ ] **Step 3: Implement.** The Keychain store is exercised by hand in Task 11 (the simulator test host has a Keychain, but CI's unsigned runs don't guarantee one).
- [ ] **Step 4: Run.** Expected: `** TEST SUCCEEDED **`.
- [ ] **Step 5: Commit:** `ios(m7a): sync state and Keychain key storage`.

### Task 9: The sync engine

**Files:**
- Create: `ios/Blanc/Blanc/Sync/SyncEngine.swift`, `ios/Blanc/BlancTests/Sync/SyncEngineTests.swift`
- Modify: `ios/Blanc/Blanc/TabsManager.swift` (own the engine; stamp settings; trigger publishes)

**Interfaces:**
- Consumes: Tasks 2–8.
- Produces: `@MainActor @Observable final class SyncEngine { init(state: SyncStateStore, secrets: SyncSecretStore, client: SyncWorkerClient, clock: @escaping () -> Int64 = { Int64(Date().timeIntervalSince1970 * 1000) }, settingsSink: @escaping (SyncedSettings) -> Void, tabsSource: @escaping () -> [(url: String, title: String)]); private(set) var remoteDevices: [RemoteDevice]; private(set) var favorites: [Favorite]; private(set) var pairing: PairingState?; var status: JSONValue { get } /* desktop syncGet shape */; func preflight(handle: String, passphrase: String) async -> JSONValue; func enable(handle: String, passphrase: String) async -> JSONValue; func joinWithCode(_ code: String) async -> JSONValue; func switchWithCode(_ code: String) async -> JSONValue; func beginPairing() async -> JSONValue; func cancelPairing() async; func recoveryCode() -> String?; func disable() async; func syncNow() async; func setShareTabs(_ on: Bool) async; func setDeviceName(_ name: String); func localSettingChanged(key: String, value: JSONValue); func tabsChanged(); func appDidBecomeActive() async }` with `struct PairingState: Equatable { let code: String; let expiresAt: Int64 }`. Result shapes (`ok`, `created`, `message`, `status`) copy desktop's `sync.js` handlers so `settings.js` needs no change.

- [ ] **Step 1: Failing tests** with `FakeTransport` (an in-memory Worker honoring `ifVersion`), `InMemorySyncSecretStore`, a fixed clock and temp directories:
  - `testJoinWithCodeAdoptsAccountAndPulls` (desktop-made pair blob from the vectors → state enabled, key in secrets, settings applied through `settingsSink`, favorites and remote devices populated, the pair entry consumed).
  - `testEnableCreatesWhenPreflightIsNew` and `testEnableJoinsWhenFound` (`created` true/false).
  - `testWrongPassphraseWritesNothing` (existing account, wrong key → `badPassphrase`, zero PUTs).
  - `testConflictRetriesThreeTimes` (409 ×3 then success → 4 PUT attempts; 409 ×4 → `lastError` set).
  - `testRateLimitedPassWritesNothing` (429 on the second GET → no PUT, `lastError == "rate-limited"`).
  - `testForegroundPullsAtMostOncePerMinute` (two `appDidBecomeActive` 30 s apart → one pass).
  - `testPublishDebounce` (`tabsChanged` at t=0, 10 s, 20 s → one publish at 35 s; continuous changes → a publish by 60 s).
  - `testShareOffPublishesRetraction` and `testNeverPublishesWhenShareNeverOn`.
  - `testDisableCancelsPendingPublishAndPair` (code showing and a publish pending → DELETE pair, retraction PUT, then no further request; secrets and store files cleared; `deviceId` kept).
  - `testBeginPairingRegeneratesOnConflict` (409, 409, 201 → third code shown; three 409s → `server` error).
  - `testLocalSettingStampsAndPushes` (`localSettingChanged("theme", "dark")` → next pass PUTs settings whose `meta.theme` is the stamped clock and every other key unchanged).
- [ ] **Step 2: Run** `-only-testing:BlancTests/SyncEngineTests`. Expected: build fails.
- [ ] **Step 3: Implement.** A pass: GET `settings`, `bookmarks`, `session`, `icons` in that order; decrypt; merge; apply; PUT `settings` and (if sharing or retracting) `session` only when the export differs; never PUT `bookmarks` or `icons`. Run scrypt off the main actor (`Task.detached`). In `TabsManager`, `applySettingsPatch` calls `syncEngine.localSettingChanged` for each changed key; tab create/close/navigation/title changes call `tabsChanged()`; a `settingsSink` applies `theme`, `searchEngine` (unknown engines → leave the local choice), `adblockEnabled` through `applySettingsPatch` without re-stamping.
- [ ] **Step 4: Run** `-only-testing:BlancTests/SyncEngineTests -only-testing:BlancTests/TabsManagerTests`. Expected: `** TEST SUCCEEDED **`.
- [ ] **Step 5: Commit:** `ios(m7a): sync engine`.

### Task 10: Pages and palette

**Files:**
- Modify: `ios/Blanc/Blanc/PagesBridge.swift`, `ios/Blanc/Blanc/PaletteSheet.swift`, `ios/Blanc/Blanc/QuickSwitcher.swift`, `ios/Blanc/Blanc/BlancApp.swift` (scene phase → `appDidBecomeActive`)
- Modify: `ios/Blanc/BlancTests/PagesBridgeTests.swift`, `ios/Blanc/BlancTests/QuickSwitcherTests.swift`
- Modify: `copy/messages/*.json` and the generated `strings.*.js` (one new key)
- Unchanged: `test/unit/ios-pages-bridge.test.js` (the shim template's literal shape must not change)

**Interfaces:**
- Consumes: `SyncEngine`.
- Produces: `PagesBridge` async replies (`Task { let result = await …; resolve(id, result) }` holding the web view weakly), `PagesBridge.emit(_ event: String, payload: JSONValue, host: String)` (calls `window.__blancEmit` in every live `blanc://<host>` web view), capability `"sync"` in `settingsBootstrap`, the 13 settings sync methods (spec §5) routed to the engine, `start.data` with `remoteDevices` (`[{name, tabs:[{url,title,favicon}]}]`, favicon from `SyncedIcons`), `start.onRemoteTabs` emitted when `remoteDevices` changes, `bookmarks.list` from `favorites`, and every Favorites edit method rejecting with the new catalog message `favorites.editOnComputer` ("Edit Favorites on your computer for now."). `QuickSwitcher.search(_:tabs:remote:favorites:)` ranks the phone's tabs above Favorites above remote tabs.

- [ ] **Step 1: Failing tests:** `testCapabilitiesIncludeSync`; `testSyncGetReturnsEngineStatus`; `testStartDataIncludesRemoteDevices`; `testBookmarksEditRejects` (each edit method → reject with the English catalog text); `testSyncMethodsOnlyAnswerSettingsHost` (a `syncNow` posted from `blanc://newtab` is rejected); `QuickSwitcherTests.testRemoteRankedBelowLocalAndFavorites`.
- [ ] **Step 2: Run** `-only-testing:BlancTests/PagesBridgeTests -only-testing:BlancTests/QuickSwitcherTests`. Expected: failures on the new tests only.
- [ ] **Step 3: Implement.** Update `testStructuredShapes` and `testSettingsGetCapabilities` to the new values. The palette's resting list gains an **Other devices** section after the phone's tabs: one folded row per device (its name and tab count); expanding lists its tabs; picking one calls `manager.createTab(url:)`. The section title is the existing key `footer.devices` ("Other devices"). Add `favorites.editOnComputer` to `copy/messages/en.json` and translate it in `de`, `es`, `fr`, `pt-BR` and `it`, then `npm run copy:ack -- <locale> favorites.editOnComputer` for each and `npm run copy:build`; the bridge reads the message from the bundled catalog for the resolved language.
- [ ] **Step 4: Run** the iOS tests above plus `node --test test/unit/ios-pages-bridge.test.js`, `npm run browser-api:check` and `npm run copy:check`. Expected: all pass.
- [ ] **Step 5: Commit:** `ios(m7a): Settings → Sync, start page Other devices, palette`.

### Task 11: By-hand check and records

**Files:**
- Modify: `spec/parity-matrix.md` (F27 iOS `PLANNED` → `PARTIAL`, note "unreleased; Send to device is M7b"), `docs/superpowers/specs/2026-10-21-ios-port-revisit.md` (M7 row status "M7a built, M7b next")

- [ ] **Step 1: Full suite.** Run the whole `BlancTests` scheme and `npm run test:unit`. Expected: `** TEST SUCCEEDED **` and no new Node failures.
- [ ] **Step 2: Pair by hand** with a packaged desktop build signed into a test sync account (never the owner's Personal account without asking): join with a code, with the recovery code and with name and passphrase on the simulator, and with a code on a real iPhone (Keychain). Check, with screenshots: Settings → Sync renders inside the phone width; the desktop's tabs appear in the palette and on the start page; turning on "Share this device's tabs" shows the phone in desktop's Other devices within one focus refresh; changing the theme on either side reaches the other after a sync; Favorites appear and an edit shows the refusal message; turning sync off removes the phone from desktop after its next sync.
- [ ] **Step 3: Record** results in the PR description (screenshots, what wasn't checked).
- [ ] **Step 4: Update** the parity matrix and the revisit's M7 row.
- [ ] **Step 5: Commit:** `ios(m7a): record M7a status`.
