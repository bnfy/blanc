# Blanc for Android A4: Sync — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Blanc for Android pairs with desktop Blanc and Blanc for iPhone and syncs Favorites, settings, open tabs, Shared Spaces, Recently closed and Send to device, in the background too, behind the iPhone's controls.

**Architecture:** Shipping desktop's sync JavaScript (`src/main/sync.js`, `sync-crypto.js` and their models), bundled and hash-pinned, runs in a jitless V8 isolate in a sandboxed utility process, the blocker's pattern. Native code supplies only crypto primitives, network, storage and keys (Android Keystore). The desktop fork's S4 hasn't started and no runner exists in the canonical tree, so per design §4 this lane builds it in `chromium/blanc/` for both lanes, not as an Android-only port. Java adapters connect the runner to Chromium's bookmarks, Android's tab store and Blanc's settings.

**Tech Stack:** Chromium 156 (Android lane), C++ and Mojo, the jitless V8 utility process, BoringSSL, Java (`org.chromium.blanc.*`), JNI, Android Keystore, WorkManager (`androidx_work_work_runtime_java`, already in Chromium), Robolectric, the emulator checks in `chromium/tests/android/`, and the shipping Worker under `test/desktop/support/sync-fixture.js`.

**Spec:** `docs/superpowers/specs/2026-11-03-android-port-design.md` (§4 Sync family and Pairing, §5 Background sync, §8.1 Wire compatibility, K2), `docs/superpowers/plans/2026-11-03-android-port.md` (A4 row, Review Focus 3 and 4), `spec/features.md` F27, F41, F55, F57, and Blanc for iPhone's sync (`ios/Blanc/Blanc/Sync/`, `PairWithBlancView.swift`, `PairScanner.swift`, `SyncSettingsView.swift`, `SharedSpacesSheet.swift`, `SpaceLibrary.swift`, `BackgroundRefresh.swift`) for every control and rule a person sees.

## Global Constraints

- Wire-compatible with the v1 sync Worker, desktop and iPhone. No Worker change and no Worker deploy in A4.
- The Worker sees only ciphertext. The derived key leaves the runner only wrapped by an Android Keystore key. The passphrase and pairing code are never stored or logged.
- Private tabs never reach sync, Recently closed or Send to device.
- Never synced: the desktop list in the root `CLAUDE.md` (Profile Sync), plus every device-local key. Sync is Personal-profile only.
- A closed tab is still open somewhere or is recoverable (design §2): sync never silently loses a page.
- The bundle is built from the `shippingTag` in `chromium/tracker.json` (v1.46.0 today), never from a working tree, and Blanc refuses other bytes. Editing bundled JavaScript for Android is forbidden: differences go in the shims.
- Android follows Blanc for iPhone wherever it can (owner, 2026-11-04): layout, wording, rules and order.
- No request to a Google service that desktop doesn't make. The Play services code scanner runs only when the person taps Scan (owner decision 9).
- Strings come from `copy/messages/`, reusing the iPhone's keys, in all six languages.
- The desktop lane's output doesn't change: nothing in it builds or starts the runner until desktop's S4 does. `check-patches.py` passes for both lanes, and shared code gets the syntax compile on the Mac Studio by overlay, never in its live tree.
- Android builds only on the Linux server. Its address, NDA details and secrets stay out of the repository.
- Marketing claims stay release-backed. Nothing about Android sync is announced from this plan.

## Review Focus

1. **Android ends the runner or the app mid-sync** (during a write, a merge or a pairing). Nothing is lost or doubled, and the next start finishes the work. Tasks 3 and 9.
2. **A phone restored to a new device, or a Keystore key that's gone.** The wrapped key can't be opened, so Sync turns off and asks for a new code, with no crash and no wiped data on other devices. Task 2.
3. **Background sync with no Activity.** WorkManager starts Blanc cold, with no tab model. It must not publish an empty tab list, which other devices would read as all tabs closed. Task 9.
4. **Two devices edit the same Favorite or settings key while one is offline.** The shipping clocks decide the same result on Android as on desktop, including when Chromium's bookmark model reorders or renames as it applies the change. Task 5.
5. **A synced setting Android doesn't have, or a value it can't show.** It survives untouched, and the phone doesn't republish a changed copy. Task 5, which also carries the ladder's Review Focus 4.

---

## Stages

A4 lands as three PRs, each merged at its own gate, so nothing stacks:

- **A4a (Tasks 1–6):** the runner, keys, pairing and Profile Sync. Gate: Task 6.
- **A4b (Tasks 7–9):** Tab Sync, Send to device, synced Recently closed and background sync. Gate: Task 9.
- **A4c (Tasks 10–12):** Spaces on Android, Shared Spaces, and A4's exit gate.

### Task 1: Spike — shipping sync in the runner on Android

**Files:**
- Create: `docs/android/a4-sync-spike.md`
- Throwaway: a scratch branch with a bundle, shims and a utility service, plus scanner libraries

Stop and take it to the owner if Step 2 or 3 fails in a way the shims can't fix: the design rules out an Android-only port without their decision.

- [ ] **Step 1: Bundle.** Build `sync.js` and its graph from v1.46.0 with esbuild, external `electron`, `crypto`, `fs`, `path`, `node:*`. Record the size and every Node or browser global it needs (`Buffer`, `URL`, timers, `TextEncoder`, `AbortController`). `test/unit/support/sync-device.js` shows the boundary: only Electron's edge and clocks are substituted. Decide whether real `settings.js` and `bookmarks.js` load behind shims or need a narrow stand-in, and name each stand-in's exported functions.
- [ ] **Step 2: Run it.** In the jitless isolate on the emulator: `init`, then one full pass against `createSyncFixture` over `adb reverse`, with crypto from a native binding. Record start time, resident memory and scrypt time (N=2^15, r=8, p=1) on the emulator.
- [ ] **Step 3: Background start.** A WorkManager worker starts Chromium from cold (`ChromeBrowserInitializer`), launches the utility and runs a pass, inside the worker's time limit. Record the time and what isn't available without an Activity.
- [ ] **Step 4: Scanner libraries.** Chromium's tree has none of these, so each is a new dependency: the Play services code scanner, CameraX and a QR decoder for phones without Play services (ZXing core, Apache-2.0, unless the spike finds better). Record how each enters the GN build, its APK size and its license, then compare with `camera2` plus the decoder alone.
- [ ] **Step 5: Read the iPhone's rules** and record each: what synced `adblockExceptions` do on the phone, which settings it applies, where Other devices, sent pages and Recently closed appear, and whether a sent page raises a notification (`UNUserNotification` isn't used today).
- [ ] **Step 6: Write the spike note** with a ruling per question, and record the rulings in the ledger. Revise Tasks 2–12 if a ruling changes them.

### Task 2: The sync runner and Keystore keys (shared code)

**Files:**
- Create: `chromium/blanc/services/sync_runner/` (`BUILD.gn`, `sync_runner.mojom`, `sync_runner_service.cc/.h`, `sync_runner_proxy.cc/.h`, `bundle_hash.h`, `shims/`)
- Create: `chromium/tools/build-sync-bundle.mjs`, `chromium/tools/sync-bundle.test.mjs`
- Create: `chromium/blanc/android/java/src/org/chromium/blanc/sync/BlancKeyStore.java`, `chromium/blanc/android/browser/sync_bridge.cc`, `.../sync/SyncBridge.java`
- Create: `chromium/patches/android/0107-android-sync.patch`; modify `chromium/lanes/android.json`
- Test: `chromium/tools/sync-bundle.test.mjs`, `BlancKeyStoreTest` (Robolectric), `chromium/tests/android/sync.mjs` (new)

**Interfaces:**
- Produces: `blanc.mojom.SyncRunner` (`Start(config)`, `Call(string method, string json_args) => (string json_result)`) and `blanc.mojom.SyncHost` (`Fetch(url, method, headers, body) => (status, headers, body)`, `ReadStore(name) => (bytes?)`, `WriteStore(name, bytes) => (bool)`, `Protect(bytes) => (bytes?)`, `Unprotect(bytes) => (bytes?)`, `Emit(event, json)`).
- Produces: `SyncBridge.call(String method, String jsonArgs, Callback<String>)` and `SyncBridge.addListener(String event, Callback<String>)`.
- Produces: `BlancKeyStore.protect(byte[]) -> byte[]` and `unprotect(byte[]) -> byte[]` (null when the key is gone). An AES-256-GCM Keystore key, alias `blanc-sync-v1`, no user authentication, excluded from backup.

- [ ] **Step 1: Write the failing tests:** the bundle test (`--check` fails when the committed bundle or hash differs from the tag's source); and `BlancKeyStoreTest.protectThenUnprotectRoundTrips`, `.aMissingKeyReturnsNull`.
- [ ] **Step 2: Build the bundle tool and the shims** (`electron`, `crypto`, `fs`, timers, `Buffer`). Commit the bundle under `services/sync_runner/generated/` with its SHA-256 in `bundle_hash.h`. It's small and reviewable, unlike the blocker's.
- [ ] **Step 3: Build the service and proxy** from the blocker's pattern. `blancCrypto` (scrypt, HKDF, AES-256-GCM, random) uses BoringSSL in the utility process. The proxy starts the utility lazily and only with Sync on, and restarts it after an unexpected end, with `Recover`'s limit (three within 10 minutes).
- [ ] **Step 4: Build the host:** `Fetch` through a `SimpleURLLoader` with no cookies, to the sync endpoint only; stores as atomic files under `app_blanc_sync/`; `Protect` through JNI to `BlancKeyStore`. A debug-only `--blanc-sync-endpoint` switch, compiled out of release, is the only way to change the endpoint.
- [ ] **Step 5: Add Review Focus 2's test.** `sync.mjs` case "a lost Keystore key turns Sync off and asks for a code": delete the key with a debug hook, restart, and assert Sync is off, the sheet asks for a code, and the fixture's account data is untouched.
- [ ] **Step 6: Run** the tests above, `check-patches.py` for both lanes, and the Mac Studio syntax compile. Expected: pass, with desktop's generated tree unchanged. Commit.

### Task 3: Vectors and crash safety

**Files:**
- Modify: `chromium/tests/android/sync.mjs`
- Create: `chromium/tests/android/support/sync-peer.mjs` (a Node device built on `test/unit/support/sync-device.js`, against `createSyncFixture`)
- Test: `chromium/tests/android/sync.mjs`

- [ ] **Step 1: Write the failing cases:** the runner's `deriveKeys`, `encrypt`, `decrypt` and pairing material match `ios/Blanc/BlancTests/Sync/Fixtures/sync-vectors.json`, proving native crypto equals Node's; "a killed runner resumes" kills the utility during a store write and during a merge (`kill -9`, as `blocking.mjs` does, failing unless the kill landed) and asserts the next pass converges with the peer, nothing lost or doubled.
- [ ] **Step 2:** Fix what they find, in shims and host code only. Expected: pass. Commit.

### Task 4: Pairing and the Sync sheet

**Files:**
- Create: `.../sync/PairLink.java`, `.../sync/PairScanner.java`, `.../sync/PlayCodeScanner.java`, `.../sync/CameraCodeScanner.java`, `.../sync/SyncSheet.java`, `.../sync/PairSheet.java`
- Modify: `.../tabs/SlashCommands.java` (`/sync`), `.../island/IslandMenu.java`, `IslandMenuPopup.java` (a Sync row, until A5's Settings takes it)
- Test: `PairLinkTest`, `PairScannerTest`, `SyncSheetTest` (Robolectric), `chromium/tests/android/sync.mjs`

**Interfaces:**
- Consumes: `SyncBridge` methods `status`, `enable`, `joinWithCode`, `switchWithCode`, `beginPairing`, `cancelPairing`, `pairingState`, `disable`.
- Produces: `PairLink.code(String) -> String` (null unless the exact `https://blanc.day/pair#CODE` shape), and `PairScanner.scan(Activity, Callback<String>)`, which picks Play services when present and CameraX otherwise.

- [ ] **Step 1: Write the failing tests:** `PairLinkTest` runs the shared `pairLinks` vectors, near misses included; `PairScannerTest.noPlayServicesUsesTheCamera`, `.aCancelledScanChangesNothing`, `.aNonBlancCodeIsRefused`; `SyncSheetTest` covers the off, on and error states against the iPhone's rows and wording, and that a typed code goes through `SyncPairing`'s normalization.
- [ ] **Step 2: Implement** the sheets from `SyncSettingsView.swift` and `PairWithBlancView.swift`: Enter code first, then Scan, then the passphrase account, Add a device with the code and timer, Disconnect and Switch account with their confirmations.
- [ ] **Step 3: Offline.** With no connection, pairing says it needs one and stops, with no endless spinner. Add a `sync.mjs` case.
- [ ] **Step 4: Run on the emulator** with a Google APIs image and one without Play services (Review Focus 3, pairing half): typed code, and QR through the emulator's camera scene, showing a code the peer generated. Expected: both join within the code's ten minutes. Commit.

### Task 5: Profile Sync

**Files:**
- Create: `.../sync/SyncedFavorites.java`, `.../sync/SyncedSettings.java`, `chromium/blanc/android/browser/synced_favorites.cc`
- Modify: `.../blocking/BlancBlocking.java` (applying synced `adblockEnabled` and `adblockExceptions`)
- Test: `SyncedSettingsTest`, `SyncedFavoritesTest` (Robolectric), `chromium/tests/android/sync.mjs`

**Interfaces:**
- Produces: the runner's stores stay the sync truth; `SyncedFavorites` mirrors them into Chromium's `BookmarkModel` and reports local edits back through `bookmarks.*`, tagging its own writes so they don't echo. `SyncedSettings` applies the keys Android has, as Task 1 lists, and writes local changes through the shipping clock path.

- [ ] **Step 1: Write the failing tests:** `SyncedFavoritesTest.aRemoteEditDoesNotEcho`, `.aLocalEditReachesTheStore`; `SyncedSettingsTest.anUnknownKeySurvivesALocalEdit`, `.anUnsupportedValueIsKeptNotApplied`. In `sync.mjs`: "a field a newer desktop added round-trips" (the peer writes an extra field in a Favorite, a setting and a tab, the phone edits each, and the peer reads the field back unchanged); "both edited offline" (Review Focus 4: both devices converge to what two desktop peers reach from the same edits).
- [ ] **Step 2: Implement.** The Start Page, the palette's Favorites and `/block-ads` read the same state as before.
- [ ] **Step 3: Synced exceptions.** `adblockExceptions` applies as on the iPhone. A site allowed in a private tab is in the shared list (A3's ruling), so it syncs, encrypted, as on desktop. Add `sync.mjs` case "an exception set elsewhere applies here".
- [ ] **Step 4: Run all.** Expected: pass. Commit.

### Task 6: A4a's gate

**Files:**
- Create: `chromium/tests/android/a4-gate.sh`, `chromium/tests/android/acceptance/steps/sync.mjs`
- Modify: `chromium/tests/android/acceptance/cucumber.mjs` (the F27 scenarios marked `@all` and those Task 1 maps to Android), `chromium/tests/android/outbound-gate.mjs` and its allowlist (the sync Worker, only with Sync on)
- Modify: `chromium/STATUS.md`, `chromium/tracker.json`
- Create: `docs/android/a4-rulings.md`

- [ ] **Step 1: Run** `a4-gate.sh`: A1–A3's gates, `sync.mjs`, acceptance, Robolectric, fork tests, `check-patches.py` for both lanes, and the outbound gate with Sync off (no request to the Worker) and on (the Worker only). Expected: pass.
- [ ] **Step 2: Run the final branch review**, fix its Critical and Important findings with a test that failed first, and record rulings and minors.
- [ ] **Step 3: Open a normal PR into `chromium/migration`,** and merge at green. Main-side records (`spec/parity-matrix.md`, `spec/divergence-register.md`) go in their own PR.

### Task 7: Tab Sync

**Files:**
- Create: `.../sync/SyncedTabs.java`, `.../sync/OtherDevices.java`
- Modify: `.../tabs/QuickSwitcher.java`, `.../palette/PaletteSheet.java`, `.../grid/` (Other devices as on the iPhone), `chromium/blanc/android/pages/` bridge (`start` data), `.../sync/SyncSheet.java` (Share open tabs)
- Test: `SyncedTabsTest` (Robolectric), `chromium/tests/android/sync.mjs`, acceptance F27-1, F27-2, F27-3

**Interfaces:**
- Consumes: `tabs` snapshot provider, `sync.setSnapshotProvider`, `noteTabsChanged`, `listRemoteDevices`, `setSyncTabs`, `renameRemoteDevice`.
- Produces: `SyncedTabs.snapshot() -> JSON` in `session-snapshot`'s shape, or `null` when the tab model isn't loaded.

- [ ] **Step 1: Write the failing tests:** `SyncedTabsTest.privateTabsNeverAppear`, `.inertAndInternalTabsFollowTheShippedRules`, `.noModelMeansNoSnapshot`, and F27-1 to F27-3 through the peer.
- [ ] **Step 2: Implement.** Sharing is off by default; a remote tab opens as a new ungrouped tab; turning sharing off retracts this device's tabs. Icons follow the iPhone's rule (`TabSnapshots.swift`), never fetching from a remote site.
- [ ] **Step 3: Run.** Expected: pass. Commit.

### Task 8: Send to device and Recently closed

**Files:**
- Create: `.../sync/SyncedSends.java`, `.../sync/SyncedClosed.java`
- Modify: `.../tabs/SlashCommands.java` (`/send`), `.../island/IslandMenu.java`, Android's Recently closed store, `.../palette/PaletteSheet.java`
- Test: `SyncedSendsTest`, `SyncedClosedTest` (Robolectric), `chromium/tests/android/sync.mjs`, acceptance F55 scenarios Task 1 maps

- [ ] **Step 1: Write the failing tests:** a sent page arrives once and opening it hides it on every device; `/send` with no other devices says so; an older Worker says sending isn't available; a private tab offers no `/send`; a tab closed here shows in the peer's Recently closed and reopens there, and the reverse; a private tab's close never leaves the phone.
- [ ] **Step 2: Implement** from `SyncSends.swift`, `SyncInbox.swift` and `SyncedClosed.swift`'s behavior, through the shipping JavaScript.
- [ ] **Step 3: Run.** Expected: pass. Commit.

### Task 9: Background sync and A4b's gate

**Files:**
- Create: `.../sync/BlancSyncWorker.java`, `.../sync/SyncSchedule.java`
- Modify: `chromium/tests/android/a4-gate.sh`, `chromium/STATUS.md`, `chromium/tracker.json`
- Test: `SyncScheduleTest` (Robolectric), `chromium/tests/android/sync.mjs`

**Interfaces:**
- Produces: unique periodic work `blanc-sync` every 15 minutes (the iPhone's `BackgroundRefresh.delay`, and WorkManager's floor), network required, enqueued only while Sync is on, cancelled when it turns off.
- Consumes: `sync.setForeground`, `checkVersions`, `syncNow`.

- [ ] **Step 1: Write the failing tests:** `SyncScheduleTest.syncOnEnqueues`, `.syncOffCancels`. In `sync.mjs`: "a background run with no window keeps the device's tabs" (Review Focus 3: force-stop, run the job with `adb shell cmd jobscheduler run`, and assert the peer still sees the last tab list and received Favorites are applied at next launch); "a killed run finishes next time" (Review Focus 1).
- [ ] **Step 2: Implement.** Foreground follows the iPhone and desktop: check every 15 seconds while Blanc is in front. In background, tabs aren't published without a model.
- [ ] **Step 3: Run the gate and review as in Task 6.** Open the A4b PR and merge at green.

### Task 10: Spaces on Android

Android has no Spaces yet (A2 didn't include them), and Shared Spaces needs somewhere to put them.

**Files:**
- Create: `.../spaces/BlancSpaces.java`, `SpaceIdentity.java` (generated from the same source as the iPhone's), `SpacesCard.java`, `SpaceEditor.java`
- Modify: `.../tabs/chromium/ChromiumTabStore.java`, `.../tabs/SlashCommands.java` (`/space`), `.../island/` (the space mark), session persistence
- Test: `BlancSpacesTest` (Robolectric), `chromium/tests/android/spaces.mjs` (new)

**Interfaces:**
- Produces: `BlancSpaces.list()`, `create(name, color, symbol)`, `switchTo(id)`, `delete(id)` with Undo; each Space owns an ordered set of tabs and groups, autosaved, swapped in place.

- [ ] **Step 1: Write the failing tests** from the iPhone's Spaces behavior (`SpaceLibrary.swift`, `SpacesCard.swift`, `SpaceEditor.swift`): swapping keeps each Space's tabs, groups and active tab; private tabs stay out; a Space survives process death.
- [ ] **Step 2: Implement** the iPhone's surfaces, nothing more.
- [ ] **Step 3: Run,** including A2's gate unchanged. Expected: pass. Commit.

### Task 11: Shared Spaces

**Files:**
- Create: `.../sync/SyncedSpaces.java`, `.../spaces/SharedSpacesSheet.java`, `BringSpaceSheet.java`
- Modify: `.../sync/SyncSheet.java`, `.../spaces/BlancSpaces.java`
- Test: `SyncedSpacesTest` (Robolectric), `chromium/tests/android/sync.mjs`, acceptance F57 rows Task 1 maps

**Interfaces:**
- Consumes: the shipping `shared-spaces` model and `shared-spaces-adapter` in the runner, `spaceStatus`, `setSyncSpaces`, `sharedStatus`, `sharedContext`.

- [ ] **Step 1: Write the failing tests:** a new remote tab stays quiet; a remote close keeps local recovery; a held change closes no tab on any device when the app is killed; an older Worker leaves the Spaces switch off while everything else syncs; a group shared with its Space follows renames, colors and new tabs both ways; deleting a Space frees the account.
- [ ] **Step 2: Implement** from `SharedSpacesAdapter.swift`'s rules and `SharedSpacesSheet.swift`'s controls. Decide each rule in the shipping JavaScript, not in Java.
- [ ] **Step 3: Run.** Expected: pass. Commit.

### Task 12: A4's exit gate

**Files:**
- Modify: `chromium/tests/android/a4-gate.sh`, `chromium/STATUS.md`, `chromium/tracker.json`, `docs/android/a4-rulings.md`
- Create: `chromium/tests/android/a4-iphone-fixture.mjs`

- [ ] **Step 1: Wire tests both ways.** The ladder names a staging Worker, but none exists, and deploying one needs the owner. `createSyncFixture` runs the real Worker code locally, so the gate uses that, and Step 4 covers production. Desktop: the Node peer (shipping code) against the emulator on the shipping Worker code. iPhone: the phone reads records the iPhone wrote, and writes records the iPhone's own decoders accept, through `sync-vectors.json` extended by `scripts/build-ios-sync-vectors.cjs` with an Android-written set checked by `SyncVectors.swift`'s tests. Expected: pass.
- [ ] **Step 2: Run the whole gate and the final review,** then the A4c PR and merge at green.
- [ ] **Step 3: Build arm64** with everything merged and install it on the Pixel.
- [ ] **Step 4: Owner's two-device check:** Pixel and desktop on the owner's account against the production Worker: pair by QR and typed code, a Favorite each way, a tab and a sent page each way, a closed tab, a Shared Space, and a background sync after the phone sits idle. Claude drives everything it can.
