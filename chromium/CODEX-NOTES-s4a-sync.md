# S4a desktop Sync core — C++ implementation handoff

Implemented on `chromium/s4a-sync-core`. No Chromium build, browser, acceptance runner, `apply.py`, `build.mjs`, commit or push was run. Native compilation and integration acceptance are still required.

## Files

Added under `chromium/blanc/browser/sync/`:

- `desktop_sync_platform.{h,cc}`: profile store/network factory, computer name, endpoint override, Keychain encryption, runner events.
- `desktop_sync_service.{h,cc}`: default-profile lifecycle, serialized calls, observers, Favorites reconciliation, first-upload consent, settings reconciliation, asynchronous durable metadata and recovery journals.
- `desktop_sync_settings.{h,cc}`: native preference, ThemeService and TemplateURLService adapters and value validation.
- `sync_merge.{h,cc}`: standard-library-only merge decisions, interrupted-write recovery decision, shipping clock comparison and seven-key settings mapping.
- `favorite_helpers.h`: existing UI folder validation, case folding, folder lookup/creation and edit-policy helpers moved without changing their behavior.
- `BUILD.gn`: `:sync` (default target), `:logic`, `:favorite_helpers`, `:search_validation`.

Also added `chromium/blanc/services/sync_runner/sync_endpoint.h` and `chromium/tools/desktop-sync.test.mjs`.

Existing changes are limited to:

- Android `sync_bridge.cc`: include/use the shared endpoint constant; its test-hook guard is unchanged.
- Runner `BUILD.gn`: list that new shared header. No proxy/service implementation, shim, generated bundle or bundle hash changes.
- `blanc_prototype_ui.cc`: import the extracted Favorites helpers; stop text-including `custom_template.cc`.
- `ui.gni`: depend on the two shared helper targets. `custom_template.cc` now compiles once in `:search_validation`; `search_choice.h` belongs to that target too. There is no new UI behavior.
- `chromium/source-map.json`: refreshed canonical hashes. No upstream patch files changed.

## Exact service API

Namespace `blanc`, header `blanc/browser/sync/desktop_sync_service.h`:

```cpp
static DesktopSyncService* ForProfile(Profile* profile);
~DesktopSyncService() override;
DesktopSyncService(const DesktopSyncService&) = delete;
DesktopSyncService& operator=(const DesktopSyncService&) = delete;

void Call(std::string method, std::string args_json,
          blanc::SyncCallback callback);
void AddObserver(Observer* observer);
void RemoveObserver(Observer* observer);
void Reconcile();
size_t PendingFirstUploadCount() const;
void ConfirmFirstUpload(bool accept);

// Nested DesktopSyncService::Observer, derived from base::CheckedObserver:
virtual void OnSyncEvent(const std::string& event,
                         const std::string& json) = 0;
```

`blanc::SyncCallback` is the existing `base::OnceCallback<void(bool ok, const std::string& result)>`. Results are raw JSON on success, an error string on failure; there is no Android `{ok,value}` wrapper. Public calls preserve the runner reply, including successful account-changing calls. They wait for initialization and serialize with reconciliation. Calls require the UI sequence.

`ForProfile` compares the exact path to `ProfileManager::user_data_dir()/GetInitialProfileDir()`. It returns null for OTR, guest, system and other regular profiles; it does not redirect a private profile to its original profile. The service and platform are process-lived because the proxy posts unretained platform crypto work. Profile teardown unregisters observers, invalidates callbacks and fails outstanding calls. Recreating the default profile after destroying it in the same process returns null until restart; rebinding the existing global runner to a different profile is deliberately refused.

The constructor loads metadata asynchronously, obtains the computer's personalizable name off the UI thread and waits for OSCrypt initialization before starting the runner. It sends `sync.setForeground([true])` once. The app lifecycle caller should send `sync.setForeground([false/true])` on background/foreground transitions through `Call`. Native bookmark and mapped preference changes request reconciliation; a 30-second refresh also covers native search-engine changes. A stalled RPC reports failure after 30 seconds, retains metadata and pauses new calls until its late response arrives. Failure is never interpreted as Sync off.

Observer events include all runner events unchanged (some runner event payloads are empty strings), plus:

- `status`: the changed `sync.status` JSON object.
- `first-upload`: `{"count":N}`; call `PendingFirstUploadCount()` for the current inventory.
- `desktop-error`: a JSON string such as `"runner-store-not-durable"`, `"favorite-write-refused"`, `"settings-write-refused"`, `"desktop-state-write-failed"`, `"desktop-state-unreadable"`, `"keychain-unavailable"` or `"runner-timeout"`.

For the UI/build agent: depend on `//blanc/browser/sync`, obtain the service only from an eligible profile, attach an observer, and use `Call`. The new source set is not wired into startup or a Settings host here. Existing runner launch plumbing still needs the bundled assets / `--blanc-sync-assets` path, utility-service wiring and sandbox registration from the build integration work.

## Platform and Chromium 158 correction

`StoreDir()` is `<default-profile>/BlancSync`; reconciliation metadata is deliberately outside it, so the runner does not ingest the desktop journal as a JavaScript store. Config contains `platform: "darwin"` on macOS, Chromium's version, the computer name, and `keyStore: true`. `--blanc-sync-endpoint=<url>` changes both the host's permitted origin and the runner's `testEndpoint` / `BLANC_TEST_SYNC_ENDPOINT` configuration. Production uses the exact former Android constant, `https://blanc-sync.bnfy-441.workers.dev`.

The supplied Chromium 158 tree **does not contain `components/os_crypt/sync` or its header/target**. Using the requested old dependency would fail GN. This implementation instead uses `g_browser_process->os_crypt_async()->GetInstance(...)`, then the thread-safe `os_crypt_async::Encryptor::EncryptString` / `DecryptData`, depending on `//components/os_crypt/async/browser` and `//components/os_crypt/async/common`. The local `keychain_key_provider.h` explicitly documents compatibility with synchronous OSCrypt. No plaintext fallback exists.

This is the same Keychain-backed encryption mechanism used by Electron safeStorage, **not the same Keychain item identity**: existing fork channel branding deliberately separates the fork and Electron's `Blanc Safe Storage` item. That identity was preserved. Do not claim this directly imports/decrypts Electron's protected sync key.

## Runner calls and shapes

All arguments below are JSON arrays:

| Method | Arguments | Result used |
| --- | --- | --- |
| `sync.setForeground` | `[true]` initially; caller may pass `[false]` | ignored at startup |
| `sync.status` | `[]` | object with boolean `enabled`, numeric `lastSyncedAt`; other fields forwarded |
| `sync.sharedContext` | `[]` | object with `accountId`; binds metadata/consent to the account |
| `bookmarks.exportForSync` | `[]` | `{items:[{id,url,title,folder,favicon,addedAt,updatedAt}],tombstones:[{url,deletedAt}]}` |
| `bookmarks.mergeFromSync` | `[{items:[item],tombstones:[]}]` for an add/edit, or `[{items:[],tombstones:[{url,deletedAt}]}]` for a removal | successful completion; winner is read back |
| `runner.flush` | `[]` | successful completion, normally `null` |
| `sync.syncNow` | `[["bookmarks"]]` after an outgoing Favorite proposal | background completion requests a refresh; offline failure keeps local data |
| `settings.exportForSync` | `[]` | `{values:{...},meta:{...},tieBreakers:{...}}`; use `values`, including preserved newer-device values |
| `settings.setSettings` | `[{theme:"dark", ...}]` containing only changed supported keys | successful completion, followed by store verification |

The public `Call` passes any caller-selected runner method and argument array through. The service does not call `saveFavorite` for retitles: shipping's implementation is add-only. A local Favorite change produces a fixed-timestamp proposal via `mergeFromSync`; shipping itself adjudicates item clocks, legacy `addedAt`, delete clocks, and folder canonicalization. Equal item clocks retain the runner item; a tombstone at the same clock wins. A proposal beaten by the runner is recorded as submitted once, then the winner is applied locally; it is not resubmitted with an ever-newer clock. `mergeFromSync` is a pull API, so the explicit background `syncNow(["bookmarks"])` is necessary to publish it.

## Favorites and first upload

Only editable HTTP(S) Favorites beneath local `BookmarkModel::other_node()` participate. Other storage roots are not flattened into this service. New folders use the existing shipping-compatible JS whitespace trim, 100 UTF-16-unit limit and ICU root-locale case folding. The full local tree is read without the UI's 1,000-item display cap. Duplicate URL matches, managed nodes, invalid folder names and URLs already held only in another storage root are withheld without manufacturing a removal. Runner URLs are canonicalized through GURL; ambiguous aliases are withheld too.

Three-way reconciliation compares title and folder against the persisted baseline. Local edits/removals become shipping merge proposals; remote-only changes apply to BookmarkModel; the account wins a differing initial match. Local user edit times observed this session are captured before asynchronous reconciliation. A persisted outgoing proposal keeps its original clock through a retry/restart.

Before the first complete account pass (`lastSyncedAt > 0`), local absence is not interpreted as deletion and the consent inventory is not finalized. With no baseline, local-only URLs form the pending first-upload set. They remain outside the runner while awaiting confirmation. Downloading account Favorites continues. Acceptance permits uploads; decline persists the displayed URLs as local-only exclusions while downloading continues. Later new URLs sync normally. Exclusions are URL-scoped and persist for that consent/account session, even if a URL is removed and re-added locally. A changed inventory invalidates a queued answer instead of silently enlarging what was approved. Sync-off (only a valid explicit `enabled:false`) or a different account resets the desktop baseline/consent.

**Account-switch integration limitation:** shipping's unchanged runner retains its own bookmarks cache across disable/account switching, and its account methods can synchronize that cache before this bridge receives an account event. The new consent gate covers native Favorites not already in that cache; it cannot retract a runner-cache upload performed inside `sync.enable` / `switchWithCode`. Cross-account cache isolation and confirmation for previously cached Favorites must be resolved/tested before exposing account switching. No bundle change or hidden store deletion was made to bypass this limitation.

## Persisted format and safety

Path: `<default-profile>/BlancSyncDesktop/state.json`. Version 1, atomically replaced off the UI thread with `ImportantFileWriter`, on one sequenced BLOCK_SHUTDOWN task runner. A missing file creates an empty state; unreadable, malformed or unsupported state is refused rather than treated as an empty baseline. Example (illustrative, independent records):

```json
{
  "version": 1,
  "account": "opaque-account-id",
  "consent": "pending",
  "seen": {
    "https://example.com/": {"title": "Example", "folder": "Work"}
  },
  "incoming": {
    "https://example.com/": {
      "before": null,
      "after": {"title": "Example", "folder": "Work"}
    }
  },
  "excluded": {"https://local-only.example/": true},
  "settingsSeen": {"theme": "dark", "bangsEnabled": true},
  "settingsIncoming": {
    "theme": {"before": "light", "after": "dark"}
  },
  "outgoing": {
    "url": "https://changed.example/",
    "local": {"title": "Changed", "folder": null},
    "payload": {
      "items": [{"id": "uuid", "url": "https://changed.example/", "title": "Changed", "folder": null, "favicon": null, "addedAt": 1794250000000, "updatedAt": 1794250000000}],
      "tombstones": []
    }
  }
}
```

`folder:null` means ungrouped. `outgoing` is optional and holds one Favorite proposal; a local deletion has `local:null`, empty items and one tombstone. `seen` must be interpreted together with `incoming`: during a pending native apply it holds the intended result, while `incoming.before/after` protects that operation. An interrupted/refused add is retried, never uploaded as a deletion. Incoming guards survive Chromium's delayed bookmark save and are retired only after a later launch loads the expected node; an observed subsequent local user edit supersedes recovery. A refused write leaves its journal intact. Settings incoming journals likewise cover an interrupted native preference write.

The runner's existing `runner.flush` is **not a host disk-write acknowledgement**. Before advancing Favorites baselines or retiring an outgoing proposal, the desktop adapter verifies `BlancSync/bookmarks.json` against the runner export. Relevant settings fields are verified in `settings.json` before native applies / outgoing checkpoints. Mismatch, lagging writes or disk failure retain journals and retry later. No new runner API or changed Android persistence contract is assumed. The journals are device-local and contain no credentials; they do contain Favorite URLs/titles like the native bookmarks store.

## Settings mapping

| Shipping key | Native store |
| --- | --- |
| `theme` | ThemeService browser color scheme; observes `browser.theme.color_scheme2` |
| `adblockEnabled` | `blanc.blocking.enabled` |
| `adblockExceptions` | `blanc.blocking.exceptions` |
| `searchEngine` | TemplateURLService stock prepopulate IDs or `blanc-custom` |
| `searchEngineTemplate` | URL of `blanc-custom`, translating `%s` / `{searchTerms}` |
| `bangsEnabled` | `blanc.bangs.enabled` |
| `customBangs` | `blanc.bangs.custom` |

Remote changes win simultaneous settings edits, matching Android SyncedSettings. Purely local changes go through `settings.setSettings`, retaining shipping's per-key clock/tie rules. Engine/template apply as a validated pair. Policy/extension-controlled settings, unloaded search services, unrepresentable native engines and unsupported future values are omitted, not replaced with defaults. All later keys and unknown keys remain in the unchanged runner; C++ never sends a full settings replacement or synthesizes `_syncMeta` / `_syncTieBreakers`.

## API checks and remaining uncertainty

Read the actual sibling `BlancChromium158/src` headers; no native compiler was invoked. Checked:

- `profile.h`, `profile_manager.h/.cc`, `profile_observer.h`: `IsRegularProfile`, exact default path, `user_data_dir`, and `OnProfileWillBeDestroyed` before keyed-service shutdown.
- `bookmark_model.h`, `base_bookmark_model_observer.h`, `bookmark_client.h`: 158's `GetNodesByURL` raw-pointer wrappers, observer signatures without a model argument, `AddNewURL`, `SetTitle(...BookmarkEditSource)`, `Move`, `Remove(...FROM_HERE)`, and managed-node checks. Android's older signatures were not copied into desktop.
- `os_crypt/async/...` headers and BUILD files: `GetInstance(OnceCallback<void(scoped_refptr<Encryptor>)>)`, any-thread EncryptString/DecryptData and Keychain compatibility. The old sync target is absent, as described above.
- `template_url_service.h`, `template_url_data.h`, native search helper headers: `ResetTemplateURL`, `Add`, default-provider setters, stock IDs, keyword and pattern conversion. `theme_service.h` usage follows the existing Appearance adapter.
- `PrefService` user-modifiability and GetUserPrefValue/GetDefaultPrefValue/Set; `base::DictValue`/`ListValue`, JSONReader, and numeric `FindDouble` accepting JSON integers.
- `GetPersonalizableDeviceNameBlocking` and the profile storage-partition factory follow the local APIs.

Still unproven: GN include ownership/visibility/transitive link dependencies for the new source sets (especially browser/theme/profile factories), complete native template/callback instantiation, actual policy refusal/readback, ICU linkage, Keychain initialization and the profile factory's teardown behavior in the integrated browser. These require the permitted build integration's compile/link pass. There is no claim that header inspection or the pure harness qualifies Chromium 158 or Android 156 compilation.

## Verification and required native acceptance

Passed:

- `/usr/local/bin/node --test chromium/tools/desktop-sync.test.mjs`: 6 tests. Standard-library C++ harness covers title/folder three-way decisions, deletions, initial consent/local-only behavior, interrupted-write recovery, settings merge and exact key inventory. The clock matrix compares 54 cases to v1.46.0's pinned bookmarks module and its pinned helper dependency graph, including legacy clocks.
- Existing `search-settings.test.mjs` and `channel-identity.test.mjs`: 6 further passing tests.
- Source-map refresh and desktop patch reconstruction: 143 upstream files / 551 canonical files; Android patch reconstruction: 35 upstream files / the same 551 canonical files. No compilation/runtime credit.
- `git diff --check`.

After it compiles, test:

1. Fresh default profile and real Keychain protect/unprotect across restart; locked/unavailable Keychain; correct computer name. OTR, guest and secondary profiles must return null and start no runner. Test teardown with an outstanding RPC and worker-thread crypto operation.
2. Production endpoint origin restriction and an explicit local test endpoint; packaged bundle discovery and sandboxed service launch; startup enabled/off, offline, malformed reply, runner kill, 30-second timeout and late response. No failure may clear consent or seen state.
3. First upload with zero/some/many local-only Favorites; remote downloads while pending; accept/decline; restart while pending/after decline; same-count/different-URL inventory changes before answering. Verify network payloads contain none of the pending or excluded URLs.
4. Retitle and move in both directions; simultaneous title/move edits; future/equal clocks; local and remote delete versus edit; delete then re-add; folder case/Unicode/whitespace/nesting; duplicates across roots; managed nodes; unsupported URLs; >1,000 entries. Edit locally during every asynchronous phase.
5. Inject failure before/after each desktop state write, runner merge, runner disk save, native AddURL/SetTitle/Move/Remove and delayed Chromium save. Kill/restart at each boundary. Ensure interrupted additions never generate tombstones, rejected changes retain journals, and disk-full recovery converges without repeated fresh-clock proposals.
6. All seven settings both directions; custom search pair including clear/switch; HTTP intranet templates; invalid/unknown enum or bang rows; managed/extension search; unloaded TemplateURLService; unknown newer-device keys and all later keys retained byte/value-equivalently through another sync. Restart between settings journal write and native preference save; edit during a pending apply.
7. Disable/re-enable, account change, runner cached Favorites from an earlier account, and direct UI use of account-switch methods. The cached-account limitation above is an explicit unresolved integration gate.
8. Android 156 compile and a runner smoke for the shared endpoint include, plus unchanged bundle digest. No Android behavior change is intended or runtime-proven here.
