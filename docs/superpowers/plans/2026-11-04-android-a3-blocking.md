# Blanc for Android A3: Blocking — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Blanc Blocker on Android: the desktop fork's blocker (Ghostery's engine over the pinned EasyList and EasyPrivacy, network, cosmetic and scriptlet filtering) running on the Android lane, failing closed, with an exact per-tab count, per-site allow and re-block, the global switch, and private tabs protected, behind the iPhone's controls.

**Architecture:** The desktop fork's blocker (`chromium/blanc/services/blocker/`) runs the Ghostery engine as one hash-pinned script in a jitless V8 isolate in a sandboxed utility process. A browser-side proxy decides every request, navigation response, WebSocket and WebTransport, and document-start code in the renderer applies cosmetics and scriptlets. Its hooks are in code Android also compiles (`chrome_content_browser_client`, the content loader, the utility and renderer clients), but they reach Android only through the desktop lane's baseline patches. Its GN group also pulls in desktop views and `//extensions/browser`. A3 splits out a core target both lanes use, ports the hooks to an Android patch, ships the bundle inside the APK, and puts the iPhone's controls (the Sunrise menu's blocking row, `/block-ads`, `/allow-ads`) over a small JNI bridge.

**Tech Stack:** Chromium 156 (Android lane, Chrome stable `a21ce95c24`), C++ and Mojo, the jitless V8 utility process, Java (`org.chromium.blanc.*`), JNI, Robolectric, the emulator checks in `chromium/tests/android/`, and the Android acceptance harness (`chromium/tests/android/acceptance/`).

**Spec:** `docs/superpowers/plans/2026-11-03-android-port.md` (A3 row and exit gate 5), `spec/features.md` F12, `spec/divergence-register.md` D1, D2, D13, D14, `spec/blocking-backends.md`, and Blanc for iPhone's blocking (`ios/Blanc/Blanc/IslandMenu.swift`, `AdblockExceptions.swift`, `ContentBlocker.swift`) for the controls.

## Global Constraints

- The lists are the pinned, hash-verified `adblock/sources/` (`pinned.json`); no live filter-list request, ever.
- The engine bundle is byte-identical to the desktop fork's (`kBlancBlockerBundleSha256` in `chromium/blanc/services/blocker/bundle_hash.h`, Ghostery `@ghostery/adblocker` 2.18.2 with `ghostery-resources.json` 2.20.1). Android refuses any other bytes.
- Fail closed: if the engine can't start or dies, requests are blocked and the page says why. Nothing loads unfiltered while the blocker is on.
- uBlock Origin isn't on Android. The research hooks stay compiled out (`BLANC_RESEARCH_HOOKS 0`).
- Android follows Blanc for iPhone wherever it can (owner, 2026-11-04). Where Android can do more (an exact count, full cosmetics), it does, and the divergence register says so.
- The desktop lane's output must not change except by a reviewed shared patch. `check-patches.py` passes for both lanes.
- The build server's address and NDA details stay out of the repository. Secrets come from 1Password through `op run`.
- Marketing claims stay release-backed (`docs/marketing-claims.md`). Nothing about Android blocking is announced from this plan.

## Review Focus

1. **Cold launch with restored tabs.** Tabs that load before the engine is ready must wait, then be filtered. They must never load unfiltered or show an error page. Task 4 pins this with a restored-session emulator check.
2. **The utility process dies mid-session** (Android kills it under memory pressure). Every pending and later request blocks, the page says blocking is unavailable, and recovery restarts the engine. Task 4.
3. **Requests that aren't a tab's:** service workers, prefetch and prerender, downloads, and the Start Page's own requests. Each is decided or exempt by an explicit rule, never by default. Task 3.
4. **An exception set in a private tab.** It follows the iPhone's rule, whichever Task 1 finds it to be, and it never writes a private site into anything saved if the iPhone doesn't. Task 5.
5. **Memory and time on a phone:** the engine's start time and resident memory on the emulator and the Pixel. A3 reports both and must not stop Quiet Tabs from freeing renderers. Tasks 1 and 7.

---

### Task 1: Spike — the blocker on the Android lane

**Files:**
- Create: `docs/android/a3-blocker-spike.md`
- Throwaway: a scratch branch with the blocker hooks applied to the Android lane

- [ ] **Step 1: Build `services/blocker` for Android** with the hooks from `patches/baseline/0001` and `0002` applied by hand. Record each compile or link failure and what it needs: `//extensions/browser`, the views UI, the uBO includes at `blocker_proxy.cc:49-50`.
- [ ] **Step 2: Run it on the emulator.** Load the bundle from a debug-only path. Record that the utility process starts, the engine's start time, the utility's resident memory, and one block on `https://ads.example` through the fixture server.
- [ ] **Step 3: Decide how the bundle ships:** an APK asset or a `.pak` resource. Record the size, how it's read, and the hash check either way.
- [ ] **Step 4: Read the iPhone's rules:** what an exception made in a private tab does (`AdblockExceptions.swift`, `TabsManager`), where its blocked count shows (D13 says it has none), and what its menu shows with blocking off (`blockingSettings`).
- [ ] **Step 5: Write the spike note** with a ruling per question, and record the rulings in the ledger.

### Task 2: A blocker core both lanes build (shared change)

**Files:**
- Modify: `chromium/blanc/services/blocker/BUILD.gn` (a `:core` target with no `//extensions` or views deps; `:browser` keeps the desktop-only parts)
- Modify: `chromium/blanc/services/blocker/blocker_proxy.cc` (the uBO includes and `extensions::ProcessManager` use behind `BLANC_RESEARCH_HOOKS`)
- Modify: `chromium/blanc/BUILD.gn` (desktop's `//blanc` group unchanged in effect)
- Test: `python3 chromium/tools/check-patches.py` (both lanes), a desktop-lane build of `chrome`, and the fork's macOS F12 baseline rows unchanged

**Interfaces:**
- Produces: `//blanc/services/blocker:core` (the proxy, gates, policy, shield count and cosmetics service) and `blanc::BlockerAssets`, a source for the bundle bytes (`std::optional<std::string> Read()`): desktop's reads `--blanc-blocker-assets`, Android's reads the packaged bundle.

- [ ] **Step 1:** Write the failing check: `check-patches.py --lane android` with the Android lane depending on `:core` fails to resolve the target.
- [ ] **Step 2:** Split the targets and move the research-only includes. The desktop lane's generated tree must be byte-identical except for the moved includes.
- [ ] **Step 3:** Run both lanes' checks and a desktop build. Expected: pass, and the desktop smoke (`chromium/tests/smoke.mjs`) still blocks.
- [ ] **Step 4:** Commit on its own: it touches the desktop lane, so it needs desktop's confirmation before it merges (§7.3).

### Task 3: The hooks on Android (patch 0106) and the packaged bundle

**Files:**
- Create: `chromium/patches/android/0106-android-blocker.patch`: the blocker hunks of `0001` for `chrome_content_browser_client.cc`, its receiver bindings, `chrome/utility/services.cc`, `chrome/renderer/chrome_content_renderer_client.cc`, `prefs/browser_prefs.cc`, `content/browser/loader/url_loader_factory_utils.cc`, `websocket_connector_impl.cc` and `service_worker_update_checker.cc`
- Modify: `chromium/lanes/android.json`, `chromium/upstream-android/manifest.json`, `chromium/source-map-android.json`
- Create: the Android `BlockerAssets` (Task 1's choice) and its GN packaging of `engine.js` from `experiments/chromium-extension-spike/native/blocker/bundle.mjs`'s output
- Test: `chromium/tests/android/blocking.mjs` (new) and `chromium/tools/android-blocking.test.mjs`

**Interfaces:**
- Consumes: Task 2's `:core` and `BlockerAssets`.
- Produces: blocking on by default on Android; the prefs `blanc.blocking.enabled` and `blanc.blocking.exceptions`; `ShieldTabCount` per tab.

- [ ] **Step 1: Write `blocking.mjs`, which fails today.** On the fixture server, a page loads `https://ads.example/ad.js` (an EasyList rule) and an element an EasyList cosmetic rule hides. The script must not run and the element must be hidden. A request the lists allow still loads.
- [ ] **Step 2:** Write the patch and the packaging. Then rebuild both architectures.
- [ ] **Step 3:** Run `blocking.mjs`, A1's `outbound-gate.mjs` (the blocker adds no outbound host) and `check-patches.py` for both lanes. Expected: pass.
- [ ] **Step 4:** Add a case per Review Focus 3 rule (a service worker's fetch, a prefetch, a download) to `blocking.mjs`. Watch each fail before writing its rule.
- [ ] **Step 5:** Commit.

### Task 4: Failing closed on a phone

**Files:**
- Modify: `0106` (Android's recovery surface instead of desktop's views dialog)
- Create: `org.chromium.blanc.blocking.BlockerHealth` (Java) and its Island state
- Test: `blocking.mjs` cases and `BlockerHealthTest` (Robolectric)

**Interfaces:**
- Produces: `BlockerHealth.state()` (`STARTING`, `READY` or `UNAVAILABLE`) and the Island's "Blocking is unavailable" row, using desktop's strings from `copy/messages/`.

- [ ] **Step 1: Write the failing cases.**
  - A debug-only switch points the engine at bytes with the wrong hash. Pages are blocked, and the Sunrise menu says blocking is unavailable, with Try Again.
  - Killing the blocker's utility process mid-page does the same; Try Again recovers.
  - With four restored tabs, a cold launch filters every one of them (Review Focus 1).
- [ ] **Step 2:** Implement. Quiet Tabs pause while health isn't `READY`, as desktop's do.
- [ ] **Step 3:** Run the cases, then `quiet-tabs.mjs` and `session-restore.mjs`. Expected: pass.
- [ ] **Step 4:** Commit.

### Task 5: The iPhone's controls

**Files:**
- Create: `org.chromium.blanc.blocking.Blocking` (a JNI bridge: `enabled()`, `setEnabled(boolean)`, `isExcepted(String url)`, `allow(String url)`, `block(String url)`, `blockedCount(Tab)` and its observer)
- Modify: `IslandMenu.java`/`IslandMenuPopup.java` (show `BLOCKING`/`BLOCKING_SETTINGS`), `SlashCommands.java` (build `BLOCK_ADS` and `ALLOW_ADS`), `PaletteSheet.java`, patch `0104`
- Test: `IslandMenuTest`, `SlashCommandsTest`, `PaletteSheetTest` (Robolectric, with a fake `Blocking`), and the `blocking.mjs` cases

**Interfaces:**
- Consumes: Task 3's prefs and count; Task 4's health.
- Produces: the menu's blocking row and the two commands. Allow and re-block reload the page, as desktop's do. The count is readable by the acceptance steps.

- [ ] **Step 1: Write the failing tests.**
  - Robolectric: the row reads on or off for the site, the two commands run, the row is hidden on Blanc's pages, and `BLOCKING_SETTINGS` shows when blocking is off everywhere.
  - Emulator: allowing ads on a site loads its ad and drops the count to zero. Re-blocking blocks it again. Both stay the same after a relaunch.
- [ ] **Step 2:** Implement. Hosts are stored with `www.` stripped, as both other platforms do. Task 1's private-tab ruling decides what an exception made in a private tab does.
- [ ] **Step 3:** Run the tests. Expected: pass.
- [ ] **Step 4:** Commit.

### Task 6: The Start Page's count

**Files:**
- Modify: `chromium/blanc/android/browser/blanc_pages_ui.cc` (`blockedThisWeek` and `mobileAdblockEnabled` from the blocker, not 0 and false)
- Create: the weekly count's store (prefs, as desktop's `adblock-stats.json`; private tabs never count)
- Test: `pages-phone.mjs` gains a case: the Start Page's weekly count after blocking three requests

- [ ] **Step 1:** Write the failing case. **Step 2:** Implement. **Step 3:** Run `pages-phone.mjs` (37 cases plus the new one). **Step 4:** Commit.

### Task 7: Shared scenarios

**Files:**
- Modify: `chromium/tests/android/acceptance/` (F12 steps; `ad/tracker blocking is enabled`, which F6-1, F6-2 and F7-1's Background needs)
- Modify: `chromium/tests/android/acceptance/cucumber.mjs` (`RUNNABLE` gains F12-1–6, F12-8, F6-1, F6-2 and F7-1)
- Test: `chromium/tests/android/acceptance/run.sh` on the emulator

- [ ] **Step 1:** Add the ids and run. Every unbound step reports undefined.
- [ ] **Step 2:** Bind the steps until every scenario passes. F12-6's site popover is the Sunrise menu's blocking row on a phone (D2 and D13; Task 9 records it).
- [ ] **Step 3:** Run exit gate 5's blocking half: in airplane mode, a cold first launch still blocks from the bundled lists.
- [ ] **Step 4:** Record the engine's start time and memory on the emulator (Review Focus 5) and commit.

### Task 8: Pixel arm64 build

- [ ] Build `out/AndroidDebug` with A2 and A3, record its SHA-256, and stage it for the owner's hands-on. The run itself waits for the Pixel.

### Task 9: A3 gate and records

- [ ] **Step 1:** Write and run `tests/android/a3-gate.sh` (the A2 gate, `blocking.mjs`, the fail-closed cases, the outbound gate and the acceptance run), with evidence in `~/blanc-evidence/android/a3/`.
- [ ] **Step 2:** Records:
  - STATUS's Android section and the tracker's F12 Android stage.
  - Rewrite D1, D13 and D14's Android lines: they still describe a WebView's `shouldInterceptRequest`, and Android now runs the desktop fork's engine with full cosmetics and an exact count.
  - Then run `progress.mjs --check`.
- [ ] **Step 3:** Owner hands-on, on the Pixel: blocking on real sites, allowing and re-blocking from the menu, and the engine's start on a cold launch. This waits for the Pixel.
- [ ] **Step 4:** Write the A4 plan (sync) and hand it to the owner.

## Calls made here, for the owner to check

- **The engine is the desktop fork's, not a WebView's.** D1's Android line (`shouldInterceptRequest`) predates the fork. Android gets the same engine, lists and cosmetics as desktop, and D1, D13 and D14 are corrected in Task 9.
- **Where the exact count shows.** The iPhone has no count (D13). The plan puts Android's count in the Sunrise menu's blocking row and on the Start Page, and adds no Island chip. That keeps the Island the iPhone's.
- **Task 2 touches the desktop lane.** The split must leave desktop's output unchanged and needs desktop's confirmation before it merges. If desktop's blocker is rewritten first, Task 2 follows it instead (§7.3).
- **Exceptions from a private tab** follow the iPhone's rule (Task 1 reads it). Desktop's fork currently saves them to the normal profile.
