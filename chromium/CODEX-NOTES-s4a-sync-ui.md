# S4a desktop Sync — native Settings bridge and UI handoff

Historical unbuilt handoff from `1da317df`. Integration, subsequent corrections,
current build and runtime evidence are recorded in `CODEX-NOTES-s4a-integration.md`.
In particular the staging tree has become patch 0042 and the passphrase-start
path has been restored without weakening the shipping setup assertions.

Implemented in `chromium/s4a-sync-ui`, November 9, 2026. Changes are uncommitted.
The Chromium 158 tree was read-only throughout. No native build, `apply.py`,
`build.mjs`, acceptance runner, browser launch, commit or push was performed.

## Files changed outside staging

- `chromium/blanc/browser/ui/chromium_settings_handler.inc`: default-profile Sync bridge, explicit method/argument allowlist, asynchronous replies, first-upload confirmation and service observation.
- `chromium/blanc/browser/ui/blanc_prototype_ui.cc`: includes the service header, starts it from `CreateIsland`, and maps the Island's Settings section `sync` to `chrome://settings/sync`.
- `chromium/tests/adapters/sync.mjs` (new): reads and operates the actual Sync shadow DOM in the separate Settings DevTools target.
- `chromium/tests/adapters/commands.mjs`: exports a read-only Settings-target evaluator. Assertions do not open or navigate Settings to make themselves pass.
- `chromium/tests/adapters/pages.mjs`: observes the native Settings sheet and its actual target URL/readiness; projects `/sync` to shipping's logical `blanc://settings/#group-sync` solely for the existing acceptance assertions.
- `chromium/tests/adapters/index.mjs`: registers the Sync adapters.
- `chromium/tests/fork-steps/sync.mjs` (new): ports the bounded Sync setup assertions; prepares a real local Worker fixture before browser launch for `@sync-server` cases.
- `chromium/tests/steps.mjs`: registers these fork steps without importing shipping's later-slice Sync steps or their Electron hooks.
- `chromium/tests/runner.mjs`: installs the local endpoint before a `@sync-server` browser launch and closes its Worker after the browser, including failure paths. This file was edited, not executed.
- `chromium/tools/sync-settings.test.mjs` (new): source-contract checks, isolated UI logic tests using the integration tree's TypeScript transpiler, and registration/adapter coverage for the three target scenarios. No network or browser is used by these tests.
- `chromium/CODEX-NOTES-s4a-sync-ui.md`: this handoff.

`//blanc/browser/sync` was already in `chromium/blanc/ui.gni`; no new GN native
dependency was needed. The core, sync bundle/shims/hash, upstream patches,
shipping `src/`, `spec/`, and `test/desktop/` were not edited. The existing
source-map was not regenerated: the integration agent must refresh canonical
hashes and patch inventory after integrating the staging files.

## Startup and profile eligibility

`blanc_prototype::CreateIsland(BrowserWindowInterface*)` calls
`blanc::DesktopSyncService::ForProfile(browser->GetProfile())` before loading
the first Island document. This is a fork-owned first-window hook: a saved
account resumes even if Settings is never opened. The factory is idempotent,
process-lived, and rejects OTR/private, guest, system and non-default regular
profiles. The browser profile is passed directly, never its original profile.
The core still owns the production endpoint default and the existing
`--blanc-sync-endpoint` override. No endpoint or bundle changes were made.

An important Settings-specific distinction: `ShowSettingsSheet` creates its
WebView with `GetOriginalProfile()` for Chromium's existing Settings controls.
Therefore the handler's `SyncProfile()` first checks `SettingsSheetOwner` and
uses that owner's **window** profile. Otherwise it uses `Profile::FromWebUI`.
This keeps a private window's Settings sheet from attaching to default Sync.
A direct secondary-profile Settings tab also receives `available:false`.

Observation attaches in `OnJavascriptAllowed`, removes in
`OnJavascriptDisallowed` and the destructor, and uses weak pointers for pending
RPC replies. Javascript disallow invalidates callbacks, so an old document
cannot receive replies after reload/closure. Only the primary
`chrome://settings` frame can use the three messages.

## Message contract

All messages use Chromium's `sendWithPromise`: the native argument list starts
with a string callback ID. Below, arguments exclude that generated ID. RPC
failure is represented in the result JSON, not by throwing a native exception.

| Message | Arguments | Resolved JSON |
| --- | --- | --- |
| `blancSyncState` | none | `{available:true,status:<sync.status object>,pendingFirstUpload:N}` |
| `blancSyncState` (ineligible profile) | none | `{available:false,status:null,pendingFirstUpload:0}` |
| `blancSyncState` (read failure) | none | `{available:true,status:null,pendingFirstUpload:N,error:"..."}`; never fabricates `enabled:false` |
| `blancSyncCall` | `method: string`, `argsJson: string` encoding the runner's argument **array** | `{ok:true,value:<parsed runner JSON>}` or `{ok:false,error:"..."}` |
| `blancSyncConfirmFirstUpload` | `accept: boolean` (actual boolean, not a string) | `{ok:true}` once passed to the service, or `{ok:false,error:"unavailable"/"invalid-arguments"}` |

`blancSyncCall`'s outer `ok` reports transport/parsing success. Its `value.ok`
is the runner's operation result and can be false even with outer `ok:true`.
The proxy unwraps the outer result, and the element checks the inner result.
A confirmation acknowledgement is **not** durable-commit completion: the UI
keeps the prompt pending until the next inventory event (or desktop error).

The entire allowlist (case-sensitive, exact names):

| Runner method | Allowed `argsJson` shape | UI use |
| --- | --- | --- |
| `sync.startNew` | `[{"handle":"My Blanc"}]` (only `handle`) | Turn on Sync, no name or passphrase form |
| `sync.joinWithCode` | `["code"]` | Join with a short code or pasted recovery code |
| `sync.preflight` | `[{"handle":"...","passphrase":"..."}]` (only those two fields) | Check sign-in without changing credentials |
| `sync.enable` | same credential object | Sign in after `outcome:"found"`; native also checks status is explicitly disabled |
| `sync.syncNow` | `[]` | Sync now |
| `sync.disable` | `[]` | Turn off, retaining local data and without remote wipe |
| `sync.status` | `[]` | Status only |

JSON text is bounded to 16,384 bytes; code to 8,192 bytes; handle to 256 bytes;
passphrase to 4,096 bytes. Extra object fields, wrong types/arity, non-array
JSON and all other methods are rejected before forwarding. In particular,
`switchWithCode`, `sharedContext`, store exports/mutations, pairing creation,
recovery-key export, device operations, tab operations, and Spaces operations
are not callable through this bridge. A malformed message envelope without the
expected callback ID/arity is ignored, like the existing handler. Credentials
are cleared from fields when an attempt completes or the element disconnects;
a disconnected preflight cannot proceed to enable.

Listener name: **`blanc-sync-changed`**. One object argument:

```json
{"event":"status","value":{"enabled":true,"handle":"My Blanc","lastSyncedAt":1794250000000},"pendingFirstUpload":3}
```

The `value` above is the full runner status (including its other existing
fields); it contains no account key. Other event shapes:

```json
{"event":"first-upload","value":{"count":3},"pendingFirstUpload":3}
{"event":"desktop-error","value":"runner-timeout","pendingFirstUpload":3}
```

Other service events are not forwarded to this WebUI. The element applies
events without triggering network mutations. A newer event is not replaced by
an older initial state read. Inline errors use friendly shipping copy and a
generic check-failed fallback, rather than exposing internal error codes.

## Staging tree

Paths below are relative to `chromium/blanc/settings_staging/`. Existing
upstream files are complete modified files, **not** patches or fragments.
The three new files are identified explicitly.

- `chrome/browser/resources/settings/BUILD.gn` — Lists the new Lit TS, HTML wrapper input and CSS wrapper input in the Settings build.
- `chrome/browser/resources/settings/blanc_settings_proxy.ts` — Adds typed state, RPC, confirmation and listener methods on the existing sendWithPromise transport.
- `chrome/browser/resources/settings/blanc_sync_page/blanc_sync_page.css` — New: Settings color/type tokens, accessible form focus, hidden-state styling; Lit CSS wrapper metadata.
- `chrome/browser/resources/settings/blanc_sync_page/blanc_sync_page.html` — New: the bounded Sync section, setup forms, status/error messages and first-upload consent.
- `chrome/browser/resources/settings/blanc_sync_page/blanc_sync_page.ts` — New: Lit SettingsPlugin, one-shot actions, validation, passphrase preflight and lifecycle-safe listeners.
- `chrome/browser/resources/settings/page_visibility.ts` — Adds blancSync visibility and hides the section for guests; distinguishes Blanc Sync from Google Sync in the existing comment.
- `chrome/browser/resources/settings/route.ts` — Adds /sync as BASIC section blancSync, named BLANC_SYNC; leaves existing Google routes unchanged.
- `chrome/browser/resources/settings/router.ts` — Adds BLANC_SYNC to SettingsRoutes for strict typing.
- `chrome/browser/resources/settings/settings_main/settings_main.html` — Renders the Sync plugin as a top-level Settings view, including Settings search.
- `chrome/browser/resources/settings/settings_main/settings_main.ts` — Eagerly imports/registers the new Sync element.
- `chrome/browser/resources/settings/settings_menu/settings_menu.html` — Adds the Sync menu item at /sync with the existing cr:sync icon.
- `chrome/browser/ui/webui/settings/settings_ui.cc` — Adds English Sync strings through the existing WebUIDataSource/loadTimeData string mechanism.

The new class is `BlancSyncPageElement` (matching the HTML wrapper generator's
filename-derived class name), registered as `settings-blanc-sync-page`.
It implements `SettingsPlugin.searchContents`; all field access uses `this.$`
for static IDs. CSS includes Lit wrapper metadata and has no duplicate selector
blocks. `BLANC_SYNC` is separate from Chromium's existing `SYNC`/`SYNC_ADVANCED`
Google account routes; none of those pages is reused as Blanc Sync.

## Copy inventory

Every added string is in the staged `settings_ui.cc` through `AddString`, read
via `$i18n{...}` or the existing `blancString` placeholder helper. This slice
uses **English fallback in every interface language**. No fabricated
translations or changes to the generated multilingual Settings catalog were
made. Shipping strings below are copied from `copy/messages/en.json`.

| loadTimeData name | Shipping key or source | Exact English value |
| --- | --- | --- |
| `blancSyncTitle` | `settings.sync.title` | Sync |
| `blancSyncOffTitle` | `settings.sync.off.title` | Sync your Blanc |
| `blancSyncTurnOn` | `settings.sync.off.turnOn` | Turn on Sync |
| `blancSyncHaveCode` | `settings.sync.off.haveCode` | Already sync on another device? |
| `blancSyncAddCode` | `settings.sync.off.addWithCode` | Add this device with a code |
| `blancSyncOtherWays` | `settings.sync.off.otherWays` | Other ways |
| `blancSyncUsePassphrase` | `settings.sync.off.usePassphrase` | Use a sync name and passphrase |
| `blancSyncCodeTitle` | `settings.sync.setup.codeTitle` | Enter the code from your other device |
| `blancSyncCodeHint` | `settings.sync.setup.codeHint` | It’s good for ten minutes. |
| `blancSyncUsePassphraseInstead` | `settings.sync.setup.usePassphrase` | Use my sync name and passphrase instead |
| `blancSyncConnect` | `settings.sync.setup.connect` | Connect |
| `blancSyncBack` | `settings.sync.syncBack` | Back |
| `blancSyncName` | `settings.sync.syncName` | Sync name |
| `blancSyncPassphrase` | `settings.sync.enterPassphrase` | Enter your passphrase |
| `blancSyncJoinIntro` | `settings.sync.setup.joinIntro` | Use the same sync name and passphrase as your other device. Blanc checks them before saving anything here. |
| `blancSyncHandleHint` | `settings.sync.setup.joinHandleHint` | Enter the exact sync name you used on your other device. |
| `blancSyncPassphraseHint` | `settings.sync.setup.joinPassphraseHint` | Enter the exact passphrase. Case matters. |
| `blancSyncNotFound` | `settings.sync.nothingWasFoundUnder` | Nothing was found under that name and passphrase. Check for typos, including capital letters, then try again. |
| `blancSyncNow` | `settings.sync.syncNow` | Sync now |
| `blancSyncDisable` | `settings.sync.syncDisable` | Turn off |
| `blancSyncTurnOffHint` | `settings.sync.turnOff.hint` | This device stops syncing. Its favorites and settings stay as they are. |
| `blancSyncChecking` | `settings.sync.checking` | Checking… |
| `blancSyncCheckFailed` | `settings.sync.checkFailed` | Could not check sync. Try again. |
| `blancSyncTurningOn` | `settings.sync.turningOn` | Turning on sync… |
| `blancSyncSyncing` | `settings.sync.syncing` | Syncing… |
| `blancSyncNotSynced` | `settings.sync.notSynced` | Not synced yet |
| `blancSyncLastSynced` | `settings.sync.lastSynced` | Last synced {when} |
| `blancSyncDefaultName` | `settings.sync.defaultName` | My Blanc |
| `blancSyncContinue` | `settings.sync.sheet.continue` | Continue |
| `blancSyncNotNow` | `settings.sync.recoveryPrompt.notNow` | Not now |
| `blancSyncRecoveryTitle` | `settings.sync.recoveryPrompt.title` | Keep a way back in |
| `blancSyncRecoveryBody` | `settings.sync.recoveryPrompt.body` | This sync has no passphrase. If you ever lose all your devices, its recovery code is the only way to reach your synced data. Save it in your password manager. |
| `blancSyncOff` | `sync.error.off` | Sync is off. |
| `blancSyncPairInvalid` | `sync.error.pairInvalid` | That doesn’t look like a code. Check it and try again. |
| `blancSyncPairNotFound` | `sync.error.pairNotFound` | That code isn’t valid any more. Make a new one on your other device. |
| `blancSyncPairUnavailable` | `sync.error.pairUnavailable` | Pairing isn’t available right now. You can still connect with your sync name and passphrase. |
| `blancSyncOffline` | `sync.error.offline` | Couldn’t reach sync — check your connection. |
| `blancSyncRateLimited` | `sync.error.rateLimited` | Too many sync attempts — try again in a minute. |
| `blancSyncBadPassphrase` | `sync.error.badPassphrase` | Passphrase doesn’t match this sync account. |
| `blancSyncNameTooShort` | `sync.error.nameTooShort` | Choose a sync name (at least 2 characters). |
| `blancSyncWeakPassphrase` | `sync.error.weakPassphrase` | Use a longer passphrase — 16+ characters, or 10+ with mixed characters. |
| `blancSyncKeyProtect` | `sync.error.keyProtect` | Could not protect the sync key. |
| `blancSyncCredentialsSave` | `sync.error.credentialsSave` | Could not save protected sync credentials. |
| `blancSyncLocalKeyUnlock` | `sync.error.localKeyUnlock` | Could not unlock the local sync key |
| `blancSyncServer` | `sync.error.server` | Sync sent an unexpected response — try again later. |
| `blancSyncTryAgain` | `settings.sync.tryAgain` | Try again |
| `blancSyncLastError` | `settings.sync.lastError` | Last error |
| `blancSyncScope` | New S4a copy | Sync your favorites and settings across your devices, end-to-end encrypted. |
| `blancSyncOn` | New S4a copy | Sync is on. |
| `blancSyncUnavailable` | New S4a copy | Sync is available only in the default profile. Open its regular window to set up Sync. |
| `blancSyncFirstUploadTitle` | New S4a copy | Add this Mac’s favorites to your sync? |
| `blancSyncFirstUploadBody` | New S4a copy | {count} favorites on this Mac would be added to your account. Choose Not now to keep these favorites only on this Mac. |
| `blancSyncRecoveryUnavailable` | New S4a copy | Recovery-code export is not available in this preview. |

`blancSyncScope` and `blancSyncOn` deliberately describe only this slice's
Favorites/settings support; shipping's longer introductions mention open tabs
and device names. First-upload title/body and availability copy are new because
this is a native desktop consent/profile boundary. The recovery-code reminder
is shown for `origin:"generated"` as the requested scenario expects, but this
slice has no key-export/copy action; the visible preview limitation says so.

## Acceptance mapping and scope differences

- `sync.feature:49` (`F27-6`): uses the real `/sync` command, then the existing
  utility-sheet assertions. The adapter reads the separate native
  `chrome://settings/sync` target and `[blanc-ready]`; it does not navigate the
  sheet while asserting where the command opened it.
- `sync.feature:73` (`F27-8`): selects code join, checks seven-symbol invalid
  input blocks Connect **and** shows the shipping invalid-code error, checks
  eight-symbol input enables Connect and clears that error, then switches to
  passphrase sign-in. This scenario itself never submits the valid-length
  code. Actual server rejection is handled and unit-tested with a mocked
  `pair-not-found` runner reply; native network rejection remains to verify.
- `sync.feature:150` (`F27-14`, `@sync-server`): the real local Worker is created
  before fixture launch, `--blanc-sync-endpoint=http://127.0.0.1:PORT` is passed
  from the first process start, and it is closed after the browser. The step
  refuses Turn on Sync without that fixture. Success requires rendered Sync
  on as `My Blanc`, an actual successful Worker PUT, and the recovery reminder.

The two setup-order step texts predate this bounded scope: they refer to
Start-with-passphrase and two passphrase paths. Their fork definitions explicitly
assert Turn on Sync first, code join available, and **only sign-in** under the
collapsed Other ways control. No fake Start button or fake order is returned.
This is based on this task's stated S4a scope, not a new numbered divergence or
a claim of complete shipping Sync UI parity. No pairing/QR/device list/open-tab/
Spaces feature or adapter was added.

## Verification performed

- `NODE_PATH=/Users/anthonyjloria/Projects/BlancChromium158/repo/node_modules /usr/local/bin/node --test chromium/tools/sync-settings.test.mjs`: **9 passed, 0 failed, 0 skipped**. `NODE_PATH` uses the sibling repo's already-installed Cucumber dependency; nothing was installed. UI logic is transpiled and exercised with a fake Lit host and fake RPC, not a browser. All steps in the three inventory scenarios resolve and their direct adapter references are present. Native bridge checks are source-contract checks, not executable C++ tests.
- Strict TypeScript: **passed**, using the existing Chromium 158 TypeScript compiler, original Settings tsconfig/strict options and generated dependency declarations. Copied the existing `out/BlancPrototype/gen/.../settings/preprocessed` tree into `/private/tmp/blanc-s4a-ui-check`, overlaid staging, generated HTML/CSS wrappers there with Chromium's tools, preprocessed the macOS conditions there, rebased config paths to the existing dependencies, and ran `tsc --noEmit`. No output or config was written in the upstream tree; no GN/Ninja/native build ran. The temporary scripts/config are under `/tmp/check-s4a-types.py` and `/private/tmp/blanc-s4a-ui-check/` for this session only.
- Chromium source ESLint (`tools/web_dev_style/eslint.config.mjs`): **passed** for staged TS sources.
- Chromium generated WebUI ESLint: **passed** for the new element/template/CSS wrapper and all changed TS/templates, using `defaultConfig`, `webComponentMissingDepsConfig` and `noExplicitAnyConfig`. The existing generated plugin was copied to the temporary tree with its root-relative import paths rebased; no rule was disabled. This caught and fixed the `on...Click_`/`on...Submit_` handler naming requirements.
- Chromium stylelint (`ui/webui/resources/tools/stylelint.config_base.mjs`): **passed** on the new CSS. This caught and fixed selector-list formatting; no rule was disabled.
- `git diff --check`: **passed**. Checked staged upstream deltas contain only the additions/visibility comment described above. Handler delimiters were checked; that is not C++ syntax/compilation evidence.

## What remains unverified

1. Native compile/link of the bridge/startup changes; callback template
   instantiation, include ownership and actual WebUI lifetime behavior.
2. Integration of the full staged files into the upstream patch set, canonical
   source-map refresh, GN/resource generation/optimization and the complete
   Settings build. The temporary strict/lint checks are source qualification,
   not a native browser build or visual acceptance.
3. The three scenarios have **not run** on Chromium. Native target discovery,
   focus/keyboard behavior, real invalid-code rejection, Keychain operation,
   runner asset discovery/sandboxing and local Worker uploads require the
   authorized integration agent's browser run.
4. First-upload networking with real Favorites: no outgoing local Favorites
   before consent; Continue versus Not now; restart/changed inventory; durable
   acknowledgement/error; other-account downloads while consent is pending.
5. Default/private/secondary/guest eligibility with actual windows, including
   the private sheet's original-profile WebView, plus Settings close/reopen
   with outstanding RPCs and service errors.
6. **Inherited core limitation remains:** the unchanged runner retains its own
   bookmarks cache across disable/account changes. A later enable/join can
   synchronize that cache before native reconciliation; the native consent
   gate covers Favorites not already in that cache. `switchWithCode` is not
   exposed and enabled-account passphrase enable is checked, but this does
   not prove cache isolation after turn-off/rejoin or atomic account exclusion
   across simultaneous Settings windows. Do not claim that release gate passed.
7. Recovery-code export/copy/dismiss is outside this bridge allowlist and is
   explicitly unavailable in the UI. Non-English Sync translations and the
   later pairing, devices, tabs and Spaces UI remain later work. Last-synced
   uses shipping's `Last synced {when}` text with a locale-formatted timestamp,
   rather than shipping's relative-time formatter.

## Upstream base hashes for integration

SHA-256 of the read-only upstream files compared with staging at handoff.
If a base changed, reconcile the full staged file rather than overwriting
concurrent changes.

| Existing upstream path | SHA-256 |
| --- | --- |
| `chrome/browser/resources/settings/BUILD.gn` | `4b03fbd9773ce5139d5ea7a532c51d7b57b97ec2f793f69a8b0e67e140569727` |
| `chrome/browser/resources/settings/blanc_settings_proxy.ts` | `7a068d5f736178cda60f89d9f415cf4e01666ba17fe844af0df8aedc0eb45ce7` |
| `chrome/browser/resources/settings/page_visibility.ts` | `e72d4ad02981bf693a98c34c1870e350deeffc21faccd42796425cd6deb0e3a7` |
| `chrome/browser/resources/settings/route.ts` | `5ea93bd5c4a0eb9fc405c388306cd4f0f9fc44bbe03d391f79038dc28b307335` |
| `chrome/browser/resources/settings/router.ts` | `ca1171a8591010b35a23c7c6ab221642892564a23257556eb0a1ae03902443d9` |
| `chrome/browser/resources/settings/settings_main/settings_main.html` | `49435f9a8dfe9daac47cbbb243b2a4b1de795c5d90d25471333634055ec4d400` |
| `chrome/browser/resources/settings/settings_main/settings_main.ts` | `8bc51aef13b160e6b68f0ff437adba7ce13b8c99f96245815a6d53fbc25364f0` |
| `chrome/browser/resources/settings/settings_menu/settings_menu.html` | `20253203b05f105d56bbab4a5c51c84df7532bf1ef2d3ad774f25ae8b7ed76da` |
| `chrome/browser/ui/webui/settings/settings_ui.cc` | `21ef59b107fd4a4e31444d6a29802ac69cdfd4cfa45c5847cf8314927eea4bbf` |
