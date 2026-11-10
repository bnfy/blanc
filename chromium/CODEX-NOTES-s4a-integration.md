# S4a desktop Sync integration — built, native proof blocked

2026-11-09, `chromium/s3-into-migration`, starting at `3a9ddb9f`.
**This is not an S4a acceptance pass or beta qualification.** Native candidate
`macos-dcd684aab336f2e7` compiled and linked, but the Mac session is locked.
Both the acceptance runner and the new end-to-end gate stopped at the existing
animation-frame guard, before executing assertions. The owner was asked to
unlock the display. No guard was bypassed. No build or test remains active.

Integration code commit: `768e66b2`. All commits are local; nothing was pushed.
The owner's `live/` tree was untouched. Shipping `src/`, `spec/` and
`test/desktop/`, the runner bundle, its shims and `bundle_hash.h` are unchanged.

## Integration and build

Applied `git cherry-pick -n 1da317df` without conflicts. Compared the staged
Settings files against the reconstructed current patch stack, rather than
replacing current upstream inputs wholesale. Patch
`0042-blanc-sync-settings.patch` now contains the Settings changes; the staging
tree was deleted. Newly needed pristine inputs came from upstream commit
`681cd621e82e606d7536eae8ea2576afb3c7d65c`. The manifest, lane fileCount (149),
output hashes and reconstruction-test pin agree. `refresh-source-map.py`
regenerated canonical hashes; source-map was not hand-merged.

The patch stack has 41 patches, 506 hunks and 149 distinct patched paths.
Reconstruction validates 153 desktop outputs and 552 canonical files. Android
reconstruction validates 35 outputs with the same canonical inventory.

Only the supplied `rebuild.sh` wrapper built the browser. Builds and tests
were serial; no cold build, clean, toolchain change or args.gn change occurred.
The wrapper regenerated GN with unchanged arguments for the new targets.
Corrections exposed by the actual build:

- Register the Sync Lit component in `web_component_files`, so its HTML
  wrapper is generated rather than requested as a nonexistent source.
- Move the now-complex Settings constructor/destructor and virtual observer
  definition out of the class body, satisfying Chromium's C++ style plugin.
- Restore the real passphrase-start choice under Other ways. The handoff had
  weakened two setup assertions to permit its absence; the integration keeps
  the shipping path ordering and both passphrase choices. Sign-in still
  preflights and refuses `notFound`; explicit Start enables directly, matching
  the shipping setup model. Turn on Sync remains first.

The WebUI TypeScript, generated ESLint and stylelint build stages passed as
part of the native build, followed by link. Final build receipt:
`../evidence/foundation/s4a-proof-build.txt`:

```text
{"mode": "apply", "changes": 1}
32.02s Build Succeeded: 6 steps - 0.19/s
candidate macos-dcd684aab336f2e7
```

Runtime config: `../evidence/foundation/s4a-proof-runtime-config.json`.
This was built from the native sources committed as `768e66b2`; subsequent
script/notes work does not alter the browser image.

## Lifecycle, resource and message contract

`blanc_prototype::CreateIsland` calls
`DesktopSyncService::ForProfile(browser->GetProfile())` before loading the
first Island. Thus startup does not depend on opening Settings. The factory
is idempotent and accepts only the exact default regular profile; private,
guest, system and secondary profiles cannot attach. Settings uses its owning
window's profile for eligibility, even though Chromium's Settings WebView
uses the original profile for ordinary preferences.

`//blanc/services/sync_runner:embed_bundle` uses the existing Island
`embed.py` generator, with its own `blanc::sync_resources` namespace and
resource target. The unchanged `generated/sync-bundle.js` becomes static
bytes linked into the application framework. Desktop `ReadBundle()` reads
those bytes unless `--blanc-sync-assets` explicitly selects a development
folder; either path must pass the existing SHA-256 pin. An invalid override
does not fall back. Android retains its APK loading branch and has no
resource-target dependency. The production endpoint remains the default;
all account tests select a loopback Worker before browser startup.

Settings uses Chromium `sendWithPromise` (callback ID precedes these args):

| Message | Arguments | Result |
| --- | --- | --- |
| `blancSyncState` | none | available, real status or null/error, pendingFirstUpload count |
| `blancSyncCall` | allowlisted method, JSON argument array string | `{ok,value}` or `{ok:false,error}` |
| `blancSyncConfirmFirstUpload` | boolean | acknowledgement of the queued answer; persistence completes asynchronously |

Allowlisted methods: `sync.startNew`, `joinWithCode`, `preflight`, `enable`,
`syncNow`, `disable`, `status` (all with the `sync.` prefix). `enable` first
requires an explicitly disabled status. Arbitrary stores, keys, account
switching and remote wipes are not exposed. Events arrive as
`blanc-sync-changed` with `{event,value,pendingFirstUpload}` for status,
first-upload and desktop-error. Unknown/error state is never rendered as off.
The first-upload prompt displays the count and Continue / Not now; it remains
pending until the service reports the persisted inventory change.

Preview-only native test dispatch can observe `settings.exportForSync`.
Pairing/status/sync-now/window-reset/bookmark-export test calls require an
explicit `http://127.0.0.1` endpoint and an exact method allowlist. The native
title-edit probe edits the actual BookmarkModel (no runner-cache injection).
All these probes remain inside the existing build/runtime-gated Island test
handler; they do not expand the Settings RPC allowlist.

## Vertical tabs

Added a real Settings Appearance dropdown backed by the unsynced profile
preference `blanc.vertical_tabs.text_size`. The native snapshot supplies
`verticalTabsTextSize`; its preference observer refreshes the Island in each
window. The existing rail implements the three sizes. The fork transport
selects the actual nested dropdown and reads back its persisted preference,
while retaining the shipping geometry, clipping, persistence and Sync
exclusion assertions. `settingsSyncValues` now reads the actual runner export
instead of throwing an undefined-adapter error. Cases `:58` and `:217` remain
unverified until the display is unlocked.

## Repeatable local proof and actual output

```sh
/usr/local/bin/node chromium/tests/desktop-sync.mjs \
  ../evidence/foundation/s4a-proof-runtime-config.json \
  ../evidence/foundation/s4a-proof-e2e
```

The script uses the actual `test/desktop/support/sync-fixture.js` Worker and
`chromium/tests/android/support/sync-peer.cjs` independent device. It launches
fresh isolated default profiles with embedded assets. Its intended checks:
Settings Turn on Sync; first-upload hold/Continue; Favorites added both ways;
native title edit plus folder move/rename and peer title/folder changes;
theme/blocking both ways; killing this fixture's exact Sync utility child;
Sync off retaining local data; a second fresh profile's Not now exclusion,
remote downloads and persistence across restart. The Mac title mutation uses
a preview BookmarkModel probe; folder edits use the real Favorites-page
bridge. This does not claim a new per-Favorite title editor UI.

Actual output (`s4a-proof-e2e.output.txt`):

```text
Error: Stopping: the test browser received no animation frame in 2000 ms (display asleep or locked). No result recorded.
```

`s4a-proof-e2e/result.json` binds the final candidate and records `checks: []`
and `result: fail` with that environment error. This is an environment stop,
not evidence of a Sync product failure. Its isolated browser exited cleanly,
its Worker closed, and the browser log was retained. The remaining script
paths have not executed and may still need repair; do not count them as proof.
The fixture uses `--use-mock-keychain`, so even a future pass will not qualify
real Keychain prompts, locked-Keychain recovery or production key storage.

## Acceptance and regression status

Actual supplied-wrapper attempt:

```sh
bash "$SP/run-cases.sh" s4a-ui2 s4a-targeted \
  'sync.feature:49:,sync.feature:73:,sync.feature:150:,vertical-tabs.feature:58:,vertical-tabs.feature:217:'
```

It stopped on the animation-frame guard on candidate
`macos-39ecf650681d77fc`, before any case result. The wrapper subsequently
reported `FileNotFoundError` for its absent `baseline.json`; there is no
three-scenario pass output. Raw receipts: `s4a-targeted.log` and
`s4a-targeted.output.txt`. The final candidate's independent gate reproduced
the same stop. `ioreg` confirmed `IOConsoleLocked = Yes` and
`CGSSessionScreenIsLocked = Yes`; waking the display did not unlock it.

The requested full-feature rerun was not started on the known locked display.
No regression conclusion is possible. The supplied morning baseline is:

| Feature | Pass | Fail | Undefined |
| --- | ---: | ---: | ---: |
| sync.feature | 0 | 10 | 8 |
| internal-pages.feature | 9 | 1 | 0 |
| island-and-commands.feature | 69 | 2 | 2 |
| vertical-tabs.feature | 0 | 7 | 13 |

Baseline: `../evidence/foundation/s3-full-merged-20261109/baseline.json`.
After unlock, run the final candidate serially (use fresh output names):

```sh
bash "$SP/run-cases.sh" s4a-proof s4a-proof-targeted \
  'sync.feature:49:,sync.feature:73:,sync.feature:150:,vertical-tabs.feature:58:,vertical-tabs.feature:217:'
bash "$SP/run-cases.sh" s4a-proof s4a-proof-features \
  'sync.feature:,internal-pages.feature:,island-and-commands.feature:'
```

`SP=/private/tmp/claude-502/-Users-anthonyjloria-Projects-BlancChromium158-repo/600bf6e0-4d53-4534-b112-7ab3638fd2e4/scratchpad`.

## Checks and remaining gates

Pre-integration-commit checks: 241 tool tests passed, zero failed/skipped;
desktop and Android patch reconstruction passed; `git diff --check` passed.
Receipts: `s4a-ready-tools.tap`, `s4a-ready-patches.txt`,
`s4a-ready-android-patches.txt` under `../evidence/foundation/`.
The script passes Node's syntax check. Script/notes commit checks are recorded
as `s4a-notes-tools.tap` and `s4a-notes-patches.txt` in the same directory.

Still unverified: every native end-to-end check above, all five requested
acceptance cases and the full regression run; real Keychain protection and
relaunch; private/secondary-profile runtime refusal; actual stalled-runner
and interrupted/refused-write fault injection; simultaneous/future-clock
merge stress, large/ambiguous/policy Favorites and all seven mapped settings;
Android 156 compilation/runtime (only reconstruction passed); production
service behavior, real device pairing and a real iPhone. No production
account was created or contacted by the tests. The core handoff's known
cross-account runner-cache limitation is not fixed or qualified here.
No Favorite deletion/consent/recovery safety gate may be called passed from
this compile or the pure merge tests alone.
