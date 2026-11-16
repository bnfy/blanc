# Electron profile importer: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On request, read an Electron Blanc data folder without changing it and write its contents into the fork's Chromium profiles, all or nothing per profile, with a marker and a retry.

**Architecture:** Untrusted JSON is read by the browser process (bounded, read-only) and parsed in the sandboxed V8 service the fork already uses for Sync and tab import, running a new pinned "profile import" bundle that turns shipping's stores into one normalized plan. The browser process then applies that plan through the fork's existing stores (BookmarkModel, HistoryService, prefs, `BlancPrototypeSpaces.json`, the Sync store folder), one profile at a time, and records a marker in Local State.

**Tech stack:** C++ in `chromium/blanc/browser/ui/` (`.inc` files included by `blanc_prototype_ui.cc`), the `sync_runner` service and its generated bundles, `node --test` unit tests, native tests on the Mac Studio.

**Spec:** `docs/chromium-replacement/2026-10-30-desktop-replacement-spec.md` §7; plan tasks M.2 and M.3 in `docs/chromium-replacement/2026-10-30-desktop-replacement-plan.md`; fixtures and answer key in `chromium/tools/importer-fixtures.mjs`.

## Global constraints

- **Read-only source.** Nothing under the Electron folder is created, changed, renamed or deleted. Every native test hashes the fixture folder before and after and requires the two to match.
- **Source versions:** v1.40.0 or later. Anything else is refused with a message, importing nothing.
- **Owner decisions (2026-11-16):** site cookies and storage are not imported (O3); synced settings go to the first (Personal, `Default`) profile only (O4); Sync stays on, with the device identity kept and the key re-protected (O5).
- **All or nothing per profile.** A profile's writes are prepared in full and applied only if every part validated; a failure leaves that profile as it was and names the part that failed.
- **Limits come from the answer key:** 5,000 history entries; tombstones dropped; only promptable permission types; pending profile deletions finished before import.
- **Test launches never touch the real Electron folder or Keychain.** The source folder is always a fixture written by `writeFixture()` to a temporary directory; the Keychain read has a test stand-in.
- **Builds:** one at a time, only through `chromium/tools/build.mjs` on the Mac Studio; all browser tests run there (`~/Projects/Blanc/scratch/tests`).
- **Strings:** shipping's catalog where it has the words; otherwise `chromium/blanc/fork-strings.json`, in all six languages.
- No change to the Electron app.

## What the survey found (2026-11-16)

| Electron data | Fork destination today | Gap |
| --- | --- | --- |
| Favorites | `BookmarkModel` via `browser_import::Import` (`first_run.inc`) | None: reuse |
| History, site icons | `HistoryService`, `FaviconService` | Only test hooks write them; needs a production bulk path with real visit times |
| Start Page pins | pref `blanc.prototype.start_page_pins` (`{url,title}`, max 8) | Sync clock and tie-break have no home: dropped, recorded |
| Tab Archive | prefs `blanc.tabs.archive_entries`, `blanc.tabs.archive_notice` | Entries older than 30 days expire on read, as today |
| Spaces | `<profile>/BlancPrototypeSpaces.json` + pref `blanc.spaces.meta`, written by `SpaceDisk(…,"importSpaces")` | Shipping's columnar capture must be converted to tab rows; max 25 |
| Settings | 84 keys mapped in `chromium/settings-keys.json`; Start Page layout keys live in the page's own storage | The table is stale (old pin, no `reuseNewTab`); Start Page keys have no native write path |
| Open session | Quiet batch through `TabImporter::ApplyTabs` | None for one window; several windows need a loop |
| Named profiles | None: profiles are only listed | Programmatic profile creation is new (a draft exists in `experiments/…/drafts/native-sync/`) |
| Sync stores, device identity | `<Default>/BlancSync/*.json` | The same store names; needs the key (below) |
| Sync key | OSCrypt, the fork's own Keychain item | Electron's is a different Keychain item (`Blanc Safe Storage`); reading it prompts once. Drafts exist |
| Install id | Local State `blanc.telemetry.install` | None |
| Downloads list | None (the fork only reads Chromium's list) | New write path, or not imported |
| Site permissions | None (Chromium saves answers itself) | New `HostContentSettingsMap` writes |
| Wallpaper | The Start Page's IndexedDB | No native write path |
| Reader appearance | None (the fork uses Chromium's Reading Mode) | Not imported |
| Patron licence | No store in the fork | Not imported |

## Review focus

1. A crafted or damaged Electron file: every store is size-capped before it is read, parsed only in the sandbox, and one bad store fails its profile without touching the others.
2. Running twice: the marker makes a second run import only profiles not yet done, and never duplicates Favorites or history.
3. The Electron app running during import: refused before anything is read.
4. A source older than v1.40.0, or with no recognizable stores: refused, nothing written.
5. A Keychain prompt the person denies: Sync is left off with a clear message; everything else still imports.

## Tasks

Each task ends with its own passing tests and a push to `chromium/next`. Tasks 1 to 4 need no owner input.

### Task 1: The plan builder (no browser)

**Done 2026-11-16** (9 tests). The bundle has no prelude and no host call; embedding it in the service's `BUILD.gn` moves to Task 2, where the runner first uses it and a build can check it. The plan's stores keep shipping's shapes (`profiles.<id>.stores["bookmarks.json"]`, …), as the answer key does; Task 2 converts them as it applies them.

**Files:** create `chromium/blanc/services/sync_runner/shims/profile-import.js`, `chromium/tools/build-profile-import-bundle.mjs`, `chromium/tools/profile-import.test.mjs`; generated `generated/profile-import-bundle.js`, `profile_import_bundle_hash.h`.

**Produces:** `__call('profile.plan', [files])`, `files` mapping each path under the data folder to its text, returning `{ok: true, schema: 1, sourceVersion, profiles: {personal|<id>: {id, name, stores}}, device: {<store>: json} | null, notImported: [{source, reason}], errors: [{profile, store, reason}]}` or `{ok: false, error: 'no-source'|'unknown-version'|'unsupported-version', sourceVersion?}`. Store errors are `invalid-json`, `invalid-shape`, `too-large`.

- [x] Update the answer key: replace the two `undecided` entries in `importer-fixtures.mjs` with the owner's answers (settings: synced keys to Personal only; sync: all fields except the keys) and update its test.
- [x] Write `profile-import.test.mjs`: for the fixture, `profile.plan` equals `expected.profiles` and `expected.device` store for store; `notImported` equals the answer key's list; a store over its size cap, invalid JSON, and a v1.39 source each give the named error and no plan for that profile.
- [x] Run it; expect failure (no bundle).
- [x] Write the shim (pure functions over parsed JSON; no shipping module is needed for reading) and the bundle builder, modeled on `build-handoff-bundle.mjs`.
- [x] Run the test; expect pass. Commit.

### Task 2: Runner, marker, and the Personal profile's own data

**Done 2026-11-16** (candidate macos-0998ddd2080544a0, patch 0092, 7 checks). Splits inside a Space are not carried yet (the fixture's Space has none): they come with the session in Task 4. Site icons are applied to up to 500 imported pages per host and are counted, not yet checked on screen.

**Files:** create `chromium/blanc/browser/ui/profile_import.inc`, `chromium/tests/native-profile-import.mjs`, `chromium/tests/lib/profile-import-fixture.mjs`; patch `0092` (the marker's Local State registration); modify `blanc_prototype_ui.cc`, the service's `BUILD.gn`.

**Produces:** `ProfileImportRunner` (modeled on `HandoffRunner`: pinned bundle, 60-second limit, host refusing every capability); `ProfileImport::Start(base::FilePath source, callback)`; Local State dict `blanc.profile_import` `{sourceVersion, profiles: {<id>: {importedAt}}}`; test hooks `profileImportRun [dir]`, `profileImportState`.

- [x] Write the native test: import the fixture, then Favorites equal the answer key in order; history has 5,000 entries with the fixture's visit times and site icons; pins and archive match; each Space opens with its tabs, groups and splits; the fixture folder's hashes are unchanged; a second run changes nothing; a fixture with one damaged store leaves the profile untouched and reports the store.
- [x] Run on the current build; expect failure (unknown hook).
- [x] Implement reading (regular files only, no symlinks, capped sizes), the runner, the apply steps for Favorites, history, icons, pins, archive and Spaces, and the marker.
- [x] Build on the Mac Studio; run the test; expect pass. Commit and push.

### Task 3: Settings and install id

**Done 2026-11-16** (candidate macos-2fde2b7b2c1ae676, 8 native checks, 10 plan-builder tests). The table marks each importable key with an `import` field; the bundle builder turns those into the plan builder's rules, with each preference's registered type. 28 keys copy directly, 7 go through Sync's converter, and the rest are named in `settingsPrefs.notCarried` (the Start Page's own settings, link routes, mouse gesture mapping, WebRTC policy, secure DNS and the migration markers among them) for later tasks. Device settings land in the Personal profile; Task 5 applies them to named profiles too.

**Files:** modify `chromium/settings-keys.json`, `chromium/tools/settings-keys.mjs`, `profile_import.inc`; extend the native test.

- [x] Refresh `settings-keys.json` to v1.49.1 and add the keys built since (`reuseNewTab`, `tabSwitchOrder`, link routes, Glance frame, mouse gestures, Mini Window shortcut and the others the survey lists); each key is marked `profile`, `device`, `page` or `not-imported` with a reason.
- [x] Test: after import, each mapped pref equals the fixture's setting, synced keys only in Personal; the install id equals the fixture's; unmapped keys appear in the import report.
- [x] Implement, build, pass, commit and push.

### Task 4: The open session

- [ ] Test: after import the fixture's windows, tabs, groups, pins and splits are open, all quiet except each window's active tab; no private tab appears.
- [ ] Implement through `TabImporter::ApplyTabs`, one call per saved window.
- [ ] Build, pass, commit and push.

### Task 5: Named profiles

- [ ] Test: the fixture's named profile exists as a Chromium profile with its name and its own Favorites, history, pins, archive and Spaces; the profile pending deletion is not created; the marker lists both profiles.
- [ ] Implement profile creation (from the draft `native_local_profile_registry`), then Task 2's apply steps per profile.
- [ ] Build, pass, commit and push.

### Task 6: Permissions and downloads list

- [ ] Test: each promptable decision in the fixture answers the same way without a prompt; `clipboard-read` is absent; the downloads list shows the fixture's finished downloads, with files untouched and private ones absent.
- [ ] Implement `HostContentSettingsMap` writes and download-history rows.
- [ ] Build, pass, commit and push.

### Task 7: Sync stores and the key (M.3)

- [ ] Test (stand-in Keychain): the Sync stores land under `BlancSync/`, the device id is the fixture's, the key decrypts with the stand-in and is re-protected with the fork's own; a denied Keychain read leaves Sync off with the message and imports everything else.
- [ ] Implement from the drafts (`legacy_sync_record`, `legacy_recovery_broker`), reading Electron's Keychain item read-only.
- [ ] Build, pass, commit and push. The real-account check is the owner's, after a backup.

### Task 8: The person's side

Blocked on the owner decision below.

- [ ] Entry point, progress, the result summary (what came across, what did not and why), failure notice and Retry; refuse while the Electron app is running.
- [ ] Wallpaper and the Start Page's layout settings, written through the Start Page itself on its next load.

## Owner decisions this plan needs

| # | Decision | Needed before |
| --- | --- | --- |
| P1 | Where the import starts: automatically on the replacement build's first launch only, or also as a command in Blanc Beta's Settings so beta testers (and the owner's dogfood) can bring their data across | Task 8 |
| P2 | Downloads list: import it (new code) or leave it behind (files stay on disk either way) | Task 6 |

## Not imported, by design

Site cookies and storage (O3); reader appearance (the fork uses Chromium's Reading Mode); the Patron licence (no store yet); uBlock Origin and Widevine folders; blocker caches; `site-zoom.json`, `bang-icons.json`, `adblock-stats.json` and `crash-ledger.json` (not in the spec's table: listed in the import report as left behind).
