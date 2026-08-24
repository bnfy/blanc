# Bring Your Tabs (F39) — direct open-tab migration

**Date:** 2026-08-23
**Status:** Corrected implementation complete; packaged/platform verification in progress
**Supersedes:** `2026-08-23-ai-assisted-tab-migration-design.md`
**Related:** F30 Favorites import, F36 first-run onboarding, F37 Named Workspaces

## Correction record

The previous F39 design was wrong. It converted a bookmarks folder into tabs and therefore
required users to organize or bookmark tabs in their old browser before Blanc could help. That
contradicted the reason the feature was commissioned.

F39 is a direct migration of another browser's currently open/restorable tabs. Favorites are not
its source and are not written as a side effect. F30 remains the separate path for importing
Favorites.

## Product sentence

> Bring the tabs you already have open into Blanc, then turn the mess into Named Groups.

## Outcome

A user chooses an installed Chromium-family browser and profile. Blanc reads that profile's latest
restorable normal-browser session, shows every importable open tab, lets the user exclude anything
they do not want, preserves named source tab groups where possible, and opens the approved result
as quiet Blanc tabs. The review screen is where ungrouped tabs can be organized into Blanc Named
Groups. No preparation in the source browser is required.

## Locked decisions

- **Source is open-tab session state.** Installed-browser import reads the latest restorable
  `Session_*` file for the selected profile. It does not read the profile's `Bookmarks` file.
- **No Favorites side effect.** Applying F39 creates tabs/groups only. It never calls
  `bookmarks.importBookmarks()` and never adds imported tabs to Favorites automatically.
- **F30 stays separate.** Favorites/profile/HTML import behavior and copy remain unchanged.
- **No source-browser cleanup ritual.** Users do not need to close, bookmark, folder, or otherwise
  organize tabs before starting F39.
- **Normal windows only.** App/PWA, popup, devtools, internal, incognito/private, and unsupported
  scheme tabs are excluded. Private sessions are not expected to be present on disk.
- **Preserve reality.** Window order, tab order, duplicate tabs, pinned state metadata, current
  navigation, and named source tab groups are preserved in the review model. Exact-URL duplicates
  are not collapsed; a duplicate open tab can be intentional.
- **Source groups are suggestions.** A non-empty source group name with at least two selected tabs
  becomes an editable proposed Blanc Named Group. Blank/single-tab groups remain ungrouped.
- **No invented placeholder groups.** Ungrouped tabs stay ungrouped until the user creates or moves
  them into a Named Group on Review. Folder names are not available and are not fabricated.
- **Quiet apply.** Imported tabs are created quiet; the first selected source tab is the only tab
  that wakes and receives focus.
- **Named Workspace remains optional.** After a successful import, a Patron may save the result as
  a Named Workspace through a separate gesture. Migration and Named Groups remain free.
- **Local only.** Session bytes, URLs, titles, group names, and proposals never leave the device,
  never enter telemetry, never persist in an import log, and never cross ordinary tab IPC.
- **Explicit read.** Profile discovery may list installed profiles, but session-file bytes are read
  only after the user selects a profile.
- **Renderer gets opaque candidates.** Main retains full URLs. The utility renderer receives
  opaque candidate IDs plus bounded title, hostname, source-window label/order, source-group name,
  selected state, and pinned state.
- **No semantic-model promise in v1.** The previously benchmarked embedding payload remains
  deferred. F39 v1 preserves source groups and supplies complete manual Named Group editing.

## User experience

### Entry points

1. First-run onboarding: **Bring your open tabs…**
2. Favorites sheet: **Bring open tabs…** (adjacent to, but distinct from, Favorites import)
3. Slash command: `/bring-tabs`

All three open `blanc://tab-import/` in the invoking window's utility sheet.

### Step 1 — Source

Heading: **Where are your tabs now?**

Installed browsers appear as visual cards with official bundled logos. Choosing a browser reveals
its local profiles. A profile row may show a previously cached/discovered profile label, but Blanc
does not read session contents until that row is chosen.

The source screen does not offer a bookmarks HTML file. HTML is a Favorites format, not an
open-tab-session format, and remains available in F30's Favorites import.

### Step 2 — Tabs

Heading: **Choose the tabs to bring**

Blanc reads the selected profile's newest usable `Session_*` snapshot and renders tabs grouped by
source window, in source order. Each row shows:

- checkbox (selected by default)
- bounded title
- hostname
- source group name when one exists
- pinned indicator when pinned in the source browser

Controls: **Select all**, **Select none**, and a selected-count summary. Duplicate URLs remain
separate rows. Excluded or unsupported items are summarized without exposing their URLs.

### Step 3 — Organize

Heading: **Organize them for Blanc**

The initial board contains:

- one editable column for each eligible named source group
- an **Ungrouped** lane for every remaining selected tab

The user can rename a group, create a group, move tabs between groups, or leave tabs ungrouped.
No source folder picker exists. No button claims AI organization until a packaged on-device model
passes its separate release gate.

### Step 4 — Review

Heading: **Ready for a cleaner start**

The summary says exactly how many quiet tabs and Named Groups Blanc will create. The primary
button is **Open N tabs in Blanc**. It does not mention or create Favorites.

Successful apply closes the sheet, focuses the first selected imported tab, and may show the
separate Named Workspace CTA.

## Chromium session source

Chromium's session service records current windows and tabs as commands that rebuild
`SessionWindow`, `SessionTab`, and `SerializedNavigationEntry` objects. Current cleartext files use
an `SNSS` header, version 3, followed by framed commands. The implementation follows Chromium's
published formats:

- [Session service overview](https://chromium.googlesource.com/chromium/src/+/HEAD/chrome/browser/sessions/session_service.h)
- [Command storage framing](https://chromium.googlesource.com/chromium/src/+/HEAD/components/sessions/core/session_command.cc)
- [Session command IDs and reconstruction](https://chromium.googlesource.com/chromium/src/+/HEAD/components/sessions/core/session_service_commands.cc)
- [Serialized navigation pickle order](https://chromium.googlesource.com/chromium/src/+/HEAD/components/sessions/core/serialized_navigation_entry.cc)

### Supported sources

- Google Chrome
- Brave
- Microsoft Edge
- Vivaldi
- Chromium

Firefox and Safari are deferred because they do not share Chromium's session-command format.

### File selection

For the selected profile:

1. Enumerate `Sessions/Session_*` by the timestamp encoded in the filename.
2. Select the newest file with a valid `SNSS` header and completed initial-state marker (command
   ID 255).
3. Read through a single opened descriptor with a bounded size check. A partial final command is
   ignored only after a valid marker; earlier complete commands remain usable.
4. Do not read `Tabs_*`; those files belong to closed-tab restore rather than the currently
   restorable browser session.

The source files are read-only. Blanc never locks, renames, truncates, copies back, or otherwise
modifies another browser's profile.

### Supported format and encryption

v1 supports cleartext session format version 3. Chromium's 2026 session-encryption feature is
disabled by default upstream but defines encrypted version 5. Blanc does not retrieve another
browser's OS-crypt keys. If only an encrypted session is available, the profile is reported as
unsupported instead of prompting for Keychain/credential access or silently falling back to stale
data.

### Browser-running behavior

Quitting the source browser is conditional, never the default first step. Blanc first attempts a
read-only parse while the source browser remains open. If the newest session is complete and
usable, the flow continues without asking the user to quit.

If the newest session is locked, incomplete, or cannot be shown to represent the current
restorable state, Blanc may ask for a **normal user-initiated quit** only after a preflight confirms
that recoverable session data exists for the selected profile. Blanc never force-quits or
terminates the source browser.

The prompt must be specific and bounded:

> Quit Brave normally so it can finish saving your 47 tabs. They remain saved and restorable in
> Brave. Blanc only reads the saved session and never removes tabs from Brave.

The count uses only a successfully parsed preflight snapshot. Copy must say **saved/restorable**,
not promise that the browser will reopen those tabs automatically; automatic reopening depends on
the source browser's startup preference.

After the user confirms a normal quit, Blanc reopens the exact newest session file through one
descriptor and verifies that its size and modification time stay unchanged during the bounded
read. That exact newest snapshot must be complete and parseable before the Tabs step appears. Blanc
does not infer or terminate source-browser processes, and it never silently imports an older
snapshot. If post-quit verification fails, Blanc does not import and tells the user to reopen the
source browser. Source files remain read-only throughout.

If preflight cannot establish recoverable session data, Blanc does not ask the user to quit. The
source is reported as unavailable instead of making a safety claim Blanc cannot support.

### Parser boundaries

The pure parser accepts only a bounded `Buffer` and returns a sanitized reconstruction. It:

- validates `SNSS`, version, command sizes, marker presence, and total file size
- replays known commands in order and ignores unknown command IDs
- tracks tab-to-window membership, visual indices, selected navigation index, close commands,
  normal-window type, active window, pinned state, tab-group token, and group metadata
- reads only the current navigation's URL/title from navigation pickles
- bounds strings before allocation and output
- never materializes page-state blobs beyond advancing the bounded pickle cursor
- filters candidate URLs to `http:` and `https:`
- returns structured parse errors; malformed files never crash main

### Candidate order

Windows are ordered with the active source window first, then by recovered window order/ID. Tabs
remain in each window's `tab_visual_index` order. The flattened order remains authoritative through
selection, grouping, batch insertion, and first-tab focus.

## Data model

Main-only raw candidate:

```js
{
  sourceWindowId: '17',
  sourceWindowOrder: 0,
  sourceTabId: '42',
  sourceTabOrder: 3,
  url: 'https://example.com/path?private=query',
  title: 'Example',
  sourceGroupToken: '…' | null,
  sourceGroupName: 'research' | null,
  pinned: false,
  lastActiveAt: 0
}
```

Renderer projection:

```js
{
  candidateId: 'opaque-random-id',
  title: 'Example',
  hostname: 'example.com',
  sourceWindow: 1,
  sourceTabOrder: 3,
  sourceGroupName: 'research',
  pinned: false,
  selected: true,
  excluded: false
}
```

URLs remain only in the main-process import session. Import sessions have a 15-minute idle TTL and
are destroyed on cancel, utility-sheet dismissal, apply, native-window close, and quit.

## Apply semantics

`planTabImportApply()` validates the complete selected disposition and returns preview-ordered tab
specs plus group create/merge actions. It does not return `favoriteEntries`.

`createQuietTabsBatch()` remains the single mutation seam:

1. validate every URL and group name
2. resolve existing Named Group collisions by normalized name
3. create any new groups without per-item broadcasts
4. create every imported tab quiet and preserve preview order
5. roll back tabs, `tabOrder`, attachments, and newly created groups on the first fatal error
6. wake/focus the first selected imported tab with the utility sheet still attached
7. destroy the import session, emit the coalesced update, close the sheet
8. show the optional post-import Named Workspace CTA

There is no Favorites phase, partial Favorites success state, or Favorites retry path.

## Limits

- Maximum session file size: 64 MiB.
- Maximum command payload: the Chromium uint16 cleartext command bound.
- Maximum import candidates per run: 500 for the first corrected release.
- Maximum proposed Named Groups: 12.
- Title: 240 Unicode code points; group name: existing Blanc 40-character normalized rule.

If a session contains more than 500 importable tabs, v1 stops before candidate assignment and
explains that the session exceeds the current safety limit. It does not ask the user to bookmark or
reorganize those tabs. Raising or batching this limit is a follow-up product decision.

## Failure behavior

| Condition | User-visible result | State |
|---|---|---|
| No restorable normal tabs | “No open tabs were found in this profile.” | Source remains open |
| Profile permission blocked | Platform-specific Full Disk Access/file permission guidance | Source remains open |
| Newest session locked/incomplete with verified preflight | Normal-quit explanation + user-confirmed retry | No stale fallback |
| Newest session locked/incomplete without verified preflight | Safe unavailable/read error; no quit request | No candidates |
| Encrypted/unsupported version | “This browser's session format isn't supported yet.” | No keychain access |
| Malformed/incomplete before marker | “Blanc couldn't read this browser session safely.” | No candidates |
| More than 500 candidates | Safety-limit explanation | No partial import |
| Session expires/cancelled | Restart message | All candidate data destroyed |
| Invalid proposal | Review remains open with inline error | No tabs created |
| Batch apply failure | Apply error with retry | Full rollback |

## Security and privacy

- Session reads are explicit, bounded, read-only, and local.
- Full URLs are secrets and remain main-only.
- Renderer IPC ownership uses the existing runtime/profile/surface/main-frame checks.
- No copied source session file persists in temp or userData.
- No page-state, POST data, cookies, form state, referrers, history stack, or source session-storage
  namespace is imported.
- No source metadata enters sync, telemetry, logs, crash reports, or Named Workspaces unless the
  user later saves the resulting Blanc tabs through the existing Workspace gesture.
- Version-5 OS-crypt keys are explicitly out of scope.

## Acceptance floor

1. Browser cards list supported installed profiles without reading session bytes.
2. Selecting a synthetic Chrome profile reads its latest valid `Session_*` file.
3. Multiple normal source windows and their tab order appear correctly.
4. Current navigation URL/title wins over back-stack entries.
5. Closed tabs/windows, internal URLs, app windows, and malformed commands are excluded.
6. Duplicate open URLs remain separate candidates.
7. Named source tab groups become editable proposed Named Groups; blank groups stay ungrouped.
8. Selection and review edits survive renderer re-renders.
9. Apply creates quiet tabs in preview order, wakes one, and creates/merges Named Groups.
10. Apply does not change Favorites.
11. A fatal batch failure rolls back tabs, order, attachments, and newly created groups.
12. Cancel/TTL/window close removes all import-session URL data.
13. Locked, permission-blocked, encrypted, empty, oversized, and malformed sources show the
    specified non-destructive errors.
14. F30 Favorites import remains regression-green.
15. Packaged macOS, Windows, and Linux fixtures pass with no model/WASM payload.

## File impact

| Path | Change |
|---|---|
| `src/main/chromium-session.js` | New pure SNSS/pickle parser and session reconstruction |
| `src/main/browser-data-import.js` | Discover profiles independently of Bookmarks; add explicit open-tab read |
| `src/main/tab-import-session.js` | Store/project source window/group/pin metadata; remove Favorites retry state |
| `src/main/tab-import-organizer.js` | Preserve eligible source groups; manual ungrouped floor |
| `src/main/tab-import-apply.js` | Remove Favorites plan output |
| `src/main/main.js` | Remove Favorites phase/retry; keep atomic quiet-tab batch |
| `src/main/pages.js`, `tab-preload.js` | Replace folder IPC with open-session read and source-group proposal |
| `src/renderer/pages/tab-import.*` | Source → Tabs → Organize → Review flow |
| `spec/acceptance/tab-migration.feature` | Replace bookmark fixtures/scenarios with session fixtures |
| `test/support/chromium-session-fixture.js`, `test/desktop/support/hooks.js` | Synthetic version-3 session files; no user profile data |

`bookmark-tree.js`, F30 `readSource()`, and Netscape HTML parsing remain only for Favorites import
and are no longer part of F39.

## Rollout gate

F39 returns to **PLANNED** until the corrected direct-session acceptance floor passes. The previous
folder-backed acceptance evidence must not be used to call this feature shipped or to market it as
open-tab migration.
